import { sbQuery, sbCount, sbSum } from '../lib/supabase.js';
import { cached } from '../lib/cache.js';

// IST (Asia/Kolkata) calendar helpers — the whole product buckets days by IST.
function istDateKey(d = new Date()) {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
}

// PostgREST timestamp filter with an explicit +05:30 offset so "today" is the
// IST day, not UTC (a signup at 23:00 IST would otherwise fall on the wrong
// UTC day). The '+' must be URL-encoded.
const istMidnight = () => `${istDateKey()}T00:00:00%2B05:30`;
const minsAgoIso = (m) => new Date(Date.now() - m * 60000).toISOString();
const daysAgoIso = (d) => new Date(Date.now() - d * 86400000).toISOString();

async function countSince(table, col, iso, extra = '') {
  const rows = await sbQuery(
    `${table}?select=${col}&${col}=gte.${iso}${extra}`
  ).catch(() => []);
  return rows.length;
}

export default async function live(req, res) {
  const data = await cached('live_realtime', 30000, async () => {
    const nowIso = () => new Date().toISOString();
    const t5 = minsAgoIso(5), t15 = minsAgoIso(15), t60 = minsAgoIso(60),
          t6h = minsAgoIso(360), t24h = minsAgoIso(1440);
    const d7 = daysAgoIso(7), d14 = daysAgoIso(14);
    const todayMid = istMidnight();

    const [
      // live windows (user_preferences.last_active_at)
      live5, live15, live60, live6h, live24h, live7d,
      // today pulse
      signupsToday, testsToday, todosToday, feedbacksToday,
      hoursRowsToday, questionsToday,
      // growth: signups + actives this week vs last week
      signups7d, signupsPrev7d, actives7d, activesPrev7d,
      // totals / structure
      totalUsers, onboarded, testsAll, todosAll, hoursAll, questionsAll, syncs24h,
      // online users list (roster, ordered by last_active)
      onlineRows, newestRows,
      // donations
      donPaidRows, donLatest,
      // splits
      repRows, streakRows,
    ] = await Promise.all([
      countSince('user_preferences', 'last_active_at', t5),
      countSince('user_preferences', 'last_active_at', t15),
      countSince('user_preferences', 'last_active_at', t60),
      countSince('user_preferences', 'last_active_at', t6h),
      countSince('user_preferences', 'last_active_at', t24h),
      countSince('user_preferences', 'last_active_at', d7),

      countSince('user_preferences', 'created_at', todayMid),
      countSince('tests', 'created_at', todayMid),
      countSince('todos', 'created_at', todayMid),
      countSince('feedback', 'created_at', todayMid),
      sbQuery(`hours?select=total&created_at=gte.${todayMid}`).catch(() => []),
      sbQuery(`practice_logs?select=questions&logged_at=gte.${todayMid}`).catch(() => []),

      countSince('user_preferences', 'created_at', d7),
      countSince('user_preferences', 'created_at', d14).then((n) => n - 0), // 7..14d computed below
      countSince('user_preferences', 'last_active_at', d7),
      countSince('user_preferences', 'last_active_at', d14),

      sbCount('user_preferences').catch(() => 0),
      sbCount('user_preferences', 'onboarding_done=eq.true').catch(() => 0),
      sbCount('tests').catch(() => 0),
      sbCount('todos').catch(() => 0),
      sbCount('hours').catch(() => 0),
      sbSum('practice_logs', 'questions').catch(() => 0),
      countSince('sync_state', 'updated_at', t24h),

      sbQuery(`admin_user_roster?select=name,email,last_active_at&last_active_at=gte.${t15}&order=last_active_at.desc&limit=10`).catch(() => []),
      sbQuery(`admin_user_roster?select=name,email,created_at&order=created_at.desc&limit=5`).catch(() => []),

      sbQuery(`donations?select=amount,display_name,note,created_at&status=eq.paid&order=created_at.desc`).catch(() => []),
      sbQuery(`donations?select=amount,display_name,note,created_at&status=eq.paid&order=created_at.desc&limit=1`).catch(() => []),

      sbQuery(`user_preferences?select=email_reports`).catch(() => []),
      sbQuery(`streaks?select=user_id,best_streak,backlog_streak&order=best_streak.desc&limit=5`).catch(() => []),
    ]);

    // prev-7d signups = created in [14d, 7d) — PostgREST range filter
    const prevRange = await sbQuery(
      `user_preferences?select=created_at&created_at=gte.${daysAgoIso(14)}&created_at=lt.${d7}`
    ).catch(() => []);
    const signupsPrev7 = prevRange.length;

    const hoursToday = hoursRowsToday.reduce((s, r) => s + (Number(r.total) || 0), 0);
    const questionsT = questionsToday.reduce((s, r) => s + (r.questions || 0), 0);

    const repSplit = { monthly: 0, off: 0, other: 0 };
    repRows.forEach((r) => {
      const v = (r.email_reports || '').toLowerCase();
      if (v === 'monthly') repSplit.monthly++;
      else if (v === 'off') repSplit.off++;
      else repSplit.other++;
    });

    // name streaks with usernames
    let streakLeaders = [];
    if (streakRows.length) {
      const ids = streakRows.map((s) => `user_id.eq.${s.user_id}`).join(',');
      const profs = await sbQuery(`user_preferences?select=user_id,username&or=(${ids})`).catch(() => []);
      const nameMap = {};
      profs.forEach((p) => { nameMap[p.user_id] = p.username || 'Unknown'; });
      streakLeaders = streakRows.map((s) => ({
        name: nameMap[s.user_id] || 'Unknown',
        best: s.best_streak || 0,
        current: s.backlog_streak || 0,
      }));
    }

    const pct = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : (a > 0 ? 100 : 0));
    const donTotal = donPaidRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

    const maskEmail = (e) => (e ? e.replace(/^(.{2}).*(@.*)$/, '$1•••$2') : '—');

    return {
      ts: nowIso(),
      liveNow: live5,
      windows: { m5: live5, m15: live15, h1: live60, h6: live6h, h24: live24h, d7: live7d },
      onlineUsers: onlineRows.map((r) => ({
        name: r.name || maskEmail(r.email),
        agoSec: Math.max(0, Math.round((Date.now() - new Date(r.last_active_at).getTime()) / 1000)),
      })),
      today: {
        signups: signupsToday,
        tests: testsToday,
        todos: todosToday,
        hours: Math.round(hoursToday * 10) / 10,
        questions: questionsT,
        feedbacks: feedbacksToday,
      },
      growth: {
        signups7d, signupsPrev7d: signupsPrev7,
        signupsDeltaPct: pct(signups7d, signupsPrev7),
        actives7d, activesPrev7d,
        activesDeltaPct: pct(actives7d, activesPrev7d),
      },
      donations: {
        total: donTotal,
        count: donPaidRows.length,
        latest: donLatest[0] ? {
          name: donLatest[0].display_name || 'Anonymous',
          amount: Number(donLatest[0].amount) || 0,
          note: donLatest[0].note || '',
        } : null,
      },
      reports: repSplit,
      onboarding: { done: onboarded, total: totalUsers, rate: totalUsers ? Math.round((onboarded / totalUsers) * 100) : 0 },
      streakLeaders,
      newest: newestRows.map((r) => ({
        name: r.name || maskEmail(r.email),
        agoH: Math.max(0, Math.round((Date.now() - new Date(r.created_at).getTime()) / 3600000)),
      })),
      syncs24h,
      totals: {
        users: totalUsers,
        tests: testsAll,
        todos: todosAll,
        hours: hoursAll,
        questions: questionsAll,
      },
    };
  });

  return res.status(200).json(data);
}
