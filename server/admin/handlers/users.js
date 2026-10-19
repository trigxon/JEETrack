import { sbRosterQuery, sbQuery } from '../lib/supabase.js';
import { validate, schemas } from '../lib/validation.js';
import { classLabel, coachingLabel, sourceLabel } from '../lib/labels.js';
import { classifyUsers } from '../lib/user-quality.js';
import { cached } from '../lib/cache.js';

// Full-table lightweight fetch for the quality classifier (cached — the
// classification itself is deterministic on these rows).
async function fetchAllRosterLight() {
  const PAGE = 1000;
  let offset = 0;
  const all = [];
  for (let i = 0; i < 50; i++) {
    const rows = await sbQuery(
      `admin_user_roster?select=id,email,name,class_year,onboarding_done,created_at,last_active_at&order=created_at.desc&limit=${PAGE}&offset=${offset}`
    );
    all.push(...rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

export default async function users(req, res) {
  const v = validate(schemas.users, req.query);
  if (!v.ok) return res.status(400).json({ error: v.error });
  const { page, pageSize, search, class_year: classFilter, coaching: coachFilter, referral_source: sourceFilter, sort: sortBy, dir, quality } = v.data;
  const sortDir = dir === 'asc' ? 1 : -1;

  // report #16: real vs fake classification over the WHOLE table (5-min cache)
  const allRows = await cached('user_quality_rows', 300000, fetchAllRosterLight);
  const { map: qMap, counts: qCounts } = classifyUsers(allRows);

  // quality filter -> restrict to the matching ids
  let idFilter = null;
  if (quality === 'real' || quality === 'fake') {
    idFilter = allRows
      .filter(r => quality === 'fake' ? !!(qMap[r.id] && qMap[r.id].fake) : !!(qMap[r.id] && !qMap[r.id].fake))
      .map(r => r.id);
    if (idFilter.length === 0) {
      return res.status(200).json({ users: [], count: 0, page, pageSize, next: false, quality: qCounts, filter: quality });
    }
  }

  const offset = page * pageSize;
  const { rows, total } = await sbRosterQuery({
    search, classFilter, coachFilter, sourceFilter, sortBy, sortDir,
    offset, limit: pageSize, ids: idFilter,
  });

  const usersOut = rows.map(u => {
    const q = qMap[u.id] || { fake: false, reason: '' };
    return {
      id:            u.id,
      name:          u.name,
      email:         u.email,
      class:         classLabel(u.class_year),
      class_year:    u.class_year,
      target_year:   u.target_year,
      coaching:      coachingLabel(u.coaching),
      coaching_id:   u.coaching,
      source:        sourceLabel(u.referral_source),
      source_id:     u.referral_source,
      created_at:    u.created_at,
      last_active:   u.last_active_at,
      email_reports: u.email_reports,
      fake:          q.fake,
      fake_reason:   q.reason,
    };
  });

  return res.status(200).json({
    users: usersOut,
    count: total,
    page,
    pageSize,
    next: offset + pageSize < total,
    quality: qCounts,
    filter: quality || 'all',
  });
}
