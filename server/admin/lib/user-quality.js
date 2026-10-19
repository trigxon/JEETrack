// report #16 — Real vs fake account classification for the admin panel.
//
// The owner asked to "differentiate the actual real users and the fake
// users that signup with same accounts" with all/real/fake counts. The
// live data has no exact duplicate emails — the fake signal is a SET of
// patterns, all visible in real production data:
//   test        — our own automation accounts (jt.mob.*, jt.e2e.*, …)
//   disposable  — throwaway-mail domains
//   typo domain — gmial.com & friends (junk that will never receive mail)
//   gibberish   — keyboard-mash local part (ffdhfdh)
//   incomplete  — no name, never onboarded, signed up and vanished <10 min
//   duplicate   — same-person re-signup: normalized local-part collision
//                 (janishreddy09@gmail + janishreddy09@icloud,
//                  satyampgaud + satyampgaud11). The MOST ENGAGED account
//                 of a cluster stays real; the rest are duplicates.
// The classifier only LABELS — it never deletes or blocks anything, and
// every row shows its reason so the owner can judge edge cases himself.

const TEST_PREFIX = /^jt\.(mob|e2e|adm|hb|test|ui|smoke|probe|photo|perf)\./i;

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'yopmail.com', 'guerrillamail.com', 'sharklasers.com',
  '10minutemail.com', 'tempmail.com', 'temp-mail.org', 'trashmail.com',
  'getnada.com', 'dispostable.com', 'fakeinbox.com', 'maildrop.cc',
  'throwawaymail.com', 'mailnesia.com', 'tempmailo.com',
]);

const TYPO_DOMAINS = new Set([
  'gmial.com', 'gmai.com', 'gnail.com', 'gamil.com', 'gmail.co', 'gmail.con',
  'gmails.com', 'gmaill.com', 'hotmial.com', 'hotmali.com', 'outlok.com',
  'yahooo.com', 'yaho.com', 'iclod.com',
]);

function lettersOnly(s) { return (s || '').replace(/[^a-z]/gi, ''); }
function vowelRatio(s) {
  if (!s) return 0;
  const m = s.match(/[aeiou]/gi);
  return (m ? m.length : 0) / s.length;
}
// duplicate-signup normalization: satyampgaud11 == satyampgaud,
// janishreddy09 (gmail) == janishreddy09 (icloud)
function normLocal(email) {
  return email.split('@')[0].toLowerCase().replace(/[._-]/g, '').replace(/\d+$/, '');
}

export function classifyUsers(rows) {
  const info = rows.map(r => {
    const email = (r.email || '').trim().toLowerCase();
    const created = r.created_at ? new Date(r.created_at).getTime() : 0;
    const last = r.last_active_at ? new Date(r.last_active_at).getTime() : created;
    const activeMinutes = created && last > created ? (last - created) / 60000 : 0;
    return {
      id: r.id,
      email,
      local: email.split('@')[0],
      domain: email.split('@')[1] || '',
      name: r.name || '',
      onboarded: !!r.class_year || r.onboarding_done === true,
      activeMinutes,
      created,
    };
  });

  // duplicate clusters (normalized local-part)
  const clusters = {};
  info.forEach(u => {
    const k = normLocal(u.email);
    if (!k || k.length < 4) return;
    (clusters[k] = clusters[k] || []).push(u);
  });
  const dupIds = new Set();
  Object.values(clusters).forEach(group => {
    if (group.length < 2) return;
    const score = u => (u.name ? 2 : 0) + (u.onboarded ? 1 : 0);
    const sorted = [...group].sort((a, b) => {
      const d = score(b) - score(a);
      return d !== 0 ? d : a.created - b.created; // most engaged first, oldest wins ties
    });
    sorted.slice(1).forEach(u => dupIds.add(u.id));
  });

  const map = {};
  let fake = 0;
  info.forEach(u => {
    let reason = '';
    if (TEST_PREFIX.test(u.local)) reason = 'test';
    else if (DISPOSABLE_DOMAINS.has(u.domain)) reason = 'disposable';
    else if (TYPO_DOMAINS.has(u.domain)) reason = 'typo domain';
    else {
      const letters = lettersOnly(u.local);
      if (letters.length >= 5 && vowelRatio(letters) < 0.15) reason = 'gibberish';
      else if (!u.name && !u.onboarded && u.activeMinutes < 10) reason = 'incomplete';
      else if (dupIds.has(u.id)) reason = 'duplicate';
    }
    if (reason) { fake += 1; map[u.id] = { fake: true, reason }; }
    else map[u.id] = { fake: false, reason: '' };
  });

  return { map, counts: { all: rows.length, real: rows.length - fake, fake } };
}
