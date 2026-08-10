
const API_BASE = '/api/dashboard';
let _token = null;
let _days = 7;
let _currentPage = 'overview';
let _modalUserId = null;
let _modalData = null;

const _pagination = { users: 0, feedback: 0 };
let _userPage = 0;   
let _fbPage   = 0;   
let _userSort = { by: 'created_at', dir: 'desc' };
let _userSearchTimer = null;
const COACHING_OPTIONS = [
  ['pw_online','PW Online'],['allen_online','Allen Online'],['unacademy','Unacademy'],
  ['vedantu','Vedantu'],['aakash_online','Aakash Digital'],['motion_online','Motion Online'],
  ['other_online','Other (Online)'],['pw_vidyapeeth','PW Vidyapeeth'],['allen','Allen'],
  ['aakash','Aakash'],['fiitjee','FIITJEE'],['resonance','Resonance'],['vibrant','Vibrant Academy'],
  ['motion','Motion'],['narayana','Narayana'],['sri_chaitanya','Sri Chaitanya'],
  ['other_offline','Other (Offline)'],['self','Self Study'],
];
const SUBJECT_COLORS = { physics:'#60a5fa', chemistry:'#34d399', maths:'#fbbf24' };
const SUBJECT_ICONS  = { physics:'⚛️', chemistry:'🧪', maths:'📐' };
document.addEventListener('DOMContentLoaded', () => {
  const sel = document.getElementById('filter-coaching');
  if (sel) {
    COACHING_OPTIONS.forEach(([id, label]) => {
      const opt = document.createElement('option');
      opt.value = id; opt.textContent = label;
      sel.appendChild(opt);
    });
  }
});

async function doLogin() {
  const pwd = document.getElementById('pwd-input').value;
  const errEl = document.getElementById('login-err');
  errEl.style.display = 'none';
  try {
    const res = await fetch(`${API_BASE}?action=login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Wrong password');
    _token = data.token;
    sessionStorage.setItem('jt_admin_token', _token);
    enterDashboard();
  } catch(e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
  }
}
function enterDashboard() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('sidebar').style.display = 'flex';
  document.getElementById('main').style.display = 'flex';
  loadAll();
}
function doLogout() {
  sessionStorage.removeItem('jt_admin_token');
  _token = null;
  location.reload();
}

function toggleSidebar(open) {
  document.getElementById('sidebar').classList.toggle('open', open);
  document.getElementById('sb-overlay').classList.toggle('show', open);
}


async function api(action, extra = '') {
    return new Promise((resolve, reject) => {
      let isDone = false;
      const timeoutId = setTimeout(() => {
        if (isDone) return;
        isDone = true;
        document.querySelectorAll('.loading').forEach(el => {
           el.innerHTML = '<div style="color:red;padding:20px;font-weight:bold;">API HUNG FOREVER</div>';
        });
        const errBox = document.createElement('div');
        errBox.style = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:red;color:white;padding:30px;z-index:999999;border-radius:12px;font-size:24px;box-shadow:0 10px 30px rgba(255,0,0,0.5);text-align:center;';
        errBox.innerHTML = '<b>API HUNG FOREVER:</b><br>' + action;
        document.body.appendChild(errBox);
        reject(new Error("Timeout Hang"));
      }, 5000);

      fetch(${API_BASE}?action= + action + extra, {
        headers: { 'Authorization': Bearer  + _token }
      }).then(async res => {
        if (isDone) return;
        isDone = true;
        clearTimeout(timeoutId);
        if (res.status === 401) { doLogout(); throw new Error('Session expired'); }
        if (!res.ok) {
          const text = await res.text().catch(()=>'');
          throw new Error(API error  + res.status +   + text);
        }
        resolve(await res.json());
      }).catch(e => {
        if (isDone) return;
        isDone = true;
        clearTimeout(timeoutId);
        document.querySelectorAll('.loading').forEach(el => {
           el.innerHTML = '<div style="color:red;padding:20px;font-weight:bold;">API CRASH: ' + String(e.message||e) + '</div>';
        });
        const errBox = document.createElement('div');
        errBox.style = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:red;color:white;padding:30px;z-index:999999;border-radius:12px;font-size:24px;box-shadow:0 10px 30px rgba(255,0,0,0.5);text-align:center;';
        errBox.innerHTML = '<b>API CRASH:</b><br>' + String(e.message || e);
        document.body.appendChild(errBox);
        reject(e);
      });
    });
}
} 
async function apiPost(action, body = {}) {
  const res = await fetch(`${API_BASE}?action=${action}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (res.status === 401) { doLogout(); throw new Error('Session expired'); }
  return res.json();
}

const PAGE_META = {
  overview:      { title: 'Overview',          sub: 'Platform-wide snapshot' },
  features:      { title: 'Feature Analytics', sub: 'Usage across every feature' },
  funnel:        { title: 'User Funnel',        sub: 'Signup to engagement conversion' },
  dau:           { title: 'DAU Trend',          sub: 'Daily active users over time' },
  new_users:     { title: 'New User Signups',   sub: 'Day-wise signup tracking, peak day & daily average' },
  users:         { title: 'All Users',          sub: 'Complete profile & performance data per student' },
  demographics:  { title: 'Segmentation',       sub: 'Class, coaching institute & referral source distribution' },
  db:            { title: 'DB Stats',           sub: 'Raw Supabase table counts' },
  actions:       { title: 'Admin Actions',      sub: 'Manual triggers & session info' },
  email:         { title: 'Email Composer',     sub: 'Send custom emails to your users' },
  feedback:      { title: 'Feedback Analytics',  sub: 'User feedback and reviews' },
};
function showPage(page, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  if (el) el.classList.add('active');
  _currentPage = page;
  const meta = PAGE_META[page] || { title: page, sub: '' };
  document.getElementById('page-title').textContent = meta.title;
  document.getElementById('page-sub').textContent = meta.sub;
  document.getElementById('range-btns').style.display =
    ['overview','funnel','new_users'].includes(page) ? 'flex' : 'none';
  toggleSidebar(false);
  loadCurrentPage();
}
function loadCurrentPage() {
  const loaders = {
    overview:     loadOverview,
    features:     loadFeatures,
    funnel:        loadFunnel,
    dau:           loadDAU,
    new_users:     loadNewUsers,
    users:         () => loadUsers(0),
    demographics:  loadDemographics,
    db:            loadDBStats,
    actions:       loadActionsPage,
    email:         () => { loadEmailUsers(); updateRecipientCount(); },
    feedback:      () => { loadFeedbackStats(); loadFeedbacks(0); },
  };
  const loader = loaders[_currentPage];
  if (!loader) return;
  const btn = document.querySelector('.icon-btn[title="Refresh"] svg');
  if (btn) btn.style.animation = 'avOrbRing 1s linear infinite';
  document.getElementById('page-loading-overlay').style.display = 'flex';
  Promise.resolve(loader()).finally(() => {
    document.getElementById('page-loading-overlay').style.display = 'none';
    if (btn) btn.style.animation = 'none';
  });
}
function setRange(days, btn) {
  _days = days;
  document.querySelectorAll('.rbtn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadCurrentPage();
}
function loadAll() { loadCurrentPage(); }

async function loadOverview() {
  loadStats();
  loadSubjectChart();
  loadExamChart();
}
async function loadStats() {
  const el = document.getElementById('stats-grid');
  el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const d = await api('overview_data');
    el.innerHTML = [
      { label:'Total Users',       value: fmt(d.totalUsers),          sub:'All time',           icon:'👥', bg:'rgba(124,106,247,.16)' },
      { label:'Mock Tests',        value: fmt(d.mockTests),           sub:'All time',           icon:'📝', bg:'rgba(96,165,250,.14)'  },
      { label:'Study Hours',       value: fmt(d.studyHours),          sub:'All time',           icon:'⏱️', bg:'rgba(251,191,36,.13)'  },
      { label:'Questions Practiced', value: fmt(d.questionsPracticed), sub:'All time',          icon:'🧠', bg:'rgba(52,211,153,.13)'  },
      { label:'AI Insights Users', value: fmt(d.aiInsights),          sub:'Ever used',          icon:'🤖', bg:'rgba(244,114,182,.14)' },
      { label:'Backlogs Added',    value: fmt(d.backlogs),            sub:'All time',           icon:'🔴', bg:'rgba(248,113,113,.13)' },
      { label:'Todos Added',       value: fmt(d.todos),               sub:'All time',           icon:'✅', bg:'rgba(52,211,153,.14)'  },
      { label:'Feedbacks',         value: fmt(d.feedbacks),           sub:'All time',           icon:'💬', bg:'rgba(45,212,191,.14)'  },
    ].map(s => `
      <div class="stat" style="--stat-bg:${s.bg};--stat-glow:${s.bg}">
        <div class="stat-icon-wrap">${s.icon}</div>
        <div class="stat-label">${s.label}</div>
        <div class="stat-value">${s.value}</div>
        <div class="stat-sub">${s.sub}</div>
      </div>
    `).join('');
  } catch(e) {
    el.innerHTML = `<div class="no-data">Error: ${esc(e.message)}</div>`;
  }
}
// NOTE: loadPagesChart() removed — that data is now the PostHog
// "Feature Usage Comparison" insight (Activation & Engagement dashboard).
async function loadSubjectChart() {
  const el = document.getElementById('subject-chart');
  el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const data = await api('subjects_data');
    const max = Math.max(...data.map(d => d.count), 1);
    el.innerHTML = data.map(d => `
      <div class="bar-row">
        <div class="bar-label">${SUBJECT_ICONS[d.subject]||''} ${d.subject[0].toUpperCase()+d.subject.slice(1)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(d.count/max*100).toFixed(1)}%;background:${SUBJECT_COLORS[d.subject]||'#7c6af7'}"></div></div>
        <div class="bar-count">${fmt(d.count)}</div>
      </div>
    `).join('');
  } catch(e) { el.innerHTML = `<div class="no-data">${esc(e.message)}</div>`; }
}
async function loadExamChart() {
  const el = document.getElementById('exam-chart');
  el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const data = await api('exams_data');
    const max = Math.max(...data.map(d => d.count), 1);
    const cfg = { mains:{color:'#7c6af7',label:'📋 JEE Mains'}, advanced:{color:'#fbbf24',label:'🏆 JEE Advanced'} };
    el.innerHTML = data.map(d => `
      <div class="bar-row">
        <div class="bar-label">${cfg[d.exam]?.label || d.exam}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(d.count/max*100).toFixed(1)}%;background:${cfg[d.exam]?.color||'#7c6af7'}"></div></div>
        <div class="bar-count">${fmt(d.count)}</div>
      </div>
    `).join('');
  } catch(e) { el.innerHTML = `<div class="no-data">${esc(e.message)}</div>`; }
}
// NOTE: loadDAUMini() and the Overview mini-DAU element were removed —
// that card is now a static PostHog link (see page-overview HTML).
// NOTE: Feature Analytics page is now a static PostHog link — no API call needed.
async function loadFeatures() {}

// NOTE: the Signup->Engagement funnel steps are now a static PostHog link
// (see page-funnel HTML) — this just loads the still-unique Retention data.
async function loadFunnel() {
  loadRetention();
}
async function loadRetention() {
  try {
    const d = await api('retention');
    document.getElementById('ret-d1').textContent  = d.d1  != null ? `${d.d1}%`  : '—';
    document.getElementById('ret-d7').textContent  = d.d7  != null ? `${d.d7}%`  : '—';
    document.getElementById('ret-d30').textContent = d.d30 != null ? `${d.d30}%` : '—';
    if (d.d1Eligible != null) {
      document.getElementById('ret-note').textContent =
        `Eligible users — D1: ${d.d1Eligible} · D7: ${d.d7Eligible} · D30: ${d.d30Eligible}`;
    }
  } catch(e) {
    ['ret-d1','ret-d7','ret-d30'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = 'err';
    });
  }
}

// NOTE: DAU Trend page is now a static PostHog link — no API call needed.
async function loadDAU() {}

async function loadNewUsers() {
  const chartWrap = document.getElementById('nu-chart-wrap');
  const table     = document.getElementById('nu-table');
  chartWrap.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  table.innerHTML     = '<tr><td colspan="5"><div class="loading"><div class="spinner"></div></div></td></tr>';
  try {
    const d = await api('nu_data');
    const { labels = [], values = [], total = 0, avg = 0, peak = 0, peakDay } = d;
    
    document.getElementById('nu-total').textContent     = fmt(total);
    document.getElementById('nu-total-sub').textContent = _days === 9999 ? 'All time' : `in last ${_days} days`;
    document.getElementById('nu-avg').textContent       = avg % 1 === 0 ? avg : avg.toFixed(1);
    document.getElementById('nu-peak').textContent      = fmt(peak);
    document.getElementById('nu-peak-date').textContent = peakDay ? fmtDate(peakDay) : '—';
    
    chartWrap.innerHTML = renderLineChart(values, labels, 220);
    
    const days_arr = labels.map((l, i) => ({ label: l, count: values[i] })).reverse();
    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const avgVal = avg || 0;
    table.innerHTML = days_arr.map(row => {
      const date = new Date(row.label);
      const dayName = dayNames[date.getDay()];
      const isPeak = row.label === peakDay;
      const diff = row.count - avgVal;
      const diffStr = diff === 0 ? '—'
        : diff > 0 ? `<span style="color:var(--gn)">+${diff.toFixed(1)}</span>`
        : `<span style="color:var(--rd)">${diff.toFixed(1)}</span>`;
      const barPct = peak > 0 ? Math.round((row.count / peak) * 100) : 0;
      return `<tr ${isPeak ? 'style="background:rgba(251,191,36,.07)"' : ''}>
        <td style="font-size:.78rem;font-weight:${isPeak?'700':'400'};white-space:nowrap;">
          ${isPeak ? '🏆 ' : ''}${row.label}
        </td>
        <td style="font-size:.75rem;color:var(--mu);">${dayName}</td>
        <td style="font-size:.85rem;font-weight:700;color:${row.count > 0 ? 'var(--ac2)' : 'var(--mu)'};">${row.count}</td>
        <td style="font-size:.75rem;">${diffStr}</td>
        <td style="min-width:80px;">
          <div style="height:6px;border-radius:99px;background:var(--sf3);overflow:hidden;">
            <div style="height:100%;width:${barPct}%;background:linear-gradient(90deg,var(--ac),var(--ac2));border-radius:99px;transition:width .4s"></div>
          </div>
        </td>
      </tr>`;
    }).join('');
  } catch(e) {
    chartWrap.innerHTML = `<div class="no-data">${esc(e.message)}</div>`;
    table.innerHTML     = `<tr><td colspan="5"><div class="no-data">${esc(e.message)}</div></td></tr>`;
  }
}

function debounceUserSearch() {
  clearTimeout(_userSearchTimer);
  _userSearchTimer = setTimeout(() => loadUsers(0), 350);
}
function clearUserFilters() {
  document.getElementById('user-search').value = '';
  document.getElementById('filter-class').value = '';
  document.getElementById('filter-coaching').value = '';
  document.getElementById('filter-source').value = '';
  loadUsers(0);
}
function setUserSort(by) {
  if (_userSort.by === by) {
    _userSort.dir = _userSort.dir === 'desc' ? 'asc' : 'desc';
  } else {
    _userSort = { by, dir: 'desc' };
  }
  updateSortHeaders();
  loadUsers(0);
}
function updateSortHeaders() {
  document.querySelectorAll('#page-users th.sortable').forEach(th => {
    const isActive = th.dataset.sort === _userSort.by;
    th.classList.toggle('sorted', isActive);
    const arrow = th.querySelector('.arrow');
    if (arrow) arrow.textContent = isActive ? (_userSort.dir === 'desc' ? '↓' : '↑') : '↕';
  });
}
async function loadUsers(page = 0) {
  _userPage = page;
  _pagination.users = page;
  const tbody = document.getElementById('users-table');
  tbody.innerHTML = '<tr><td colspan="9"><div class="loading"><div class="spinner"></div></div></td></tr>';
  try {
    const search = encodeURIComponent(document.getElementById('user-search')?.value || '');
    const cls = document.getElementById('filter-class')?.value || '';
    const coaching = document.getElementById('filter-coaching')?.value || '';
    const source = document.getElementById('filter-source')?.value || '';
    const extra = `&page=${page}&pageSize=20&search=${search}&class_year=${cls}&coaching=${coaching}&referral_source=${source}&sort=${_userSort.by}&dir=${_userSort.dir}`;
    const d = await api('usr_list', extra);
    const users = d.users || [];
    if (!users.length) {
      tbody.innerHTML = `<tr><td colspan="9">${emptyState('No users match these filters')}</td></tr>`;
      document.getElementById('page-info').textContent = '';
      document.getElementById('prev-btn').disabled = true;
      document.getElementById('next-btn').disabled = true;
      return;
    }
    tbody.innerHTML = users.map(u => `
      <tr class="row-click user-row" data-uid="${esc(u.id)}" data-uname="${esc(u.name)}">
        <td>
          <div class="user-cell">
            <div class="avatar">${initials(u.name)}</div>
            <div style="min-width:0">
              <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px">${esc(u.name)}</div>
              <div style="font-size:.7rem;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px">${esc(u.email)}</div>
            </div>
          </div>
        </td>
        <td>${u.class_year ? `<span class="pill pill-blue">${esc(u.class)}</span>` : '<span style="color:var(--mu2)">—</span>'}</td>
        <td style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--mu)">${esc(u.coaching)}</td>
        <td style="color:var(--mu)">${u.source_id ? esc(u.source) : '<span style="color:var(--mu2)">—</span>'}</td>
        <td style="color:var(--mu)">${esc(u.target_year) || '—'}</td>
        <td style="color:var(--mu);white-space:nowrap">${fmtDate(u.created_at)}</td>
        <td style="color:var(--mu);white-space:nowrap">${fmtDate(u.last_active)}</td>
        <td>${u.email_reports === 'monthly'
          ? '<span class="pill pill-green">Monthly ✓</span>'
          : '<span class="pill pill-red">Off</span>'}</td>
        <td>
          <button class="action-btn btn-ghost btn-sm user-row-btn" data-uid="${esc(u.id)}" data-uname="${esc(u.name)}">
            View Full Profile
          </button>
        </td>
      </tr>
    `).join('');
    document.getElementById('prev-btn').disabled = page === 0;
    document.getElementById('next-btn').disabled = !d.next;
    const startN = page*20+1, endN = Math.min(page*20+users.length, d.count||0);
    document.getElementById('page-info').textContent = `${startN}–${endN} of ${d.count || 0} students`;
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="no-data">Error: ${esc(e.message)}</div></td></tr>`;
  }
}

async function viewUser(id, name) {
  _modalUserId = id;
  document.getElementById('modal-title').textContent = name || 'Loading…';
  document.getElementById('modal-subtitle').textContent = '—';
  document.getElementById('modal-avatar').textContent = initials(name);
  document.getElementById('user-modal').style.display = 'flex';
  switchModalTab('summary', true);
  document.getElementById('modal-body-content').innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const d = await api(`user_detail&distinct_id=${encodeURIComponent(id)}`);
    _modalData = d;
    const p = d.profile || {};
    document.getElementById('modal-title').textContent = p.name || name || 'Unknown';
    document.getElementById('modal-subtitle').textContent = `${p.email || 'No email'} · ${p.class || 'Class not set'} · ${p.coaching || 'No coaching'} · via ${p.source || 'Not Set'}`;
    document.getElementById('modal-avatar').textContent = initials(p.name || name);
    renderModalTab('summary');
  } catch(e) {
    document.getElementById('modal-body-content').innerHTML = `<div class="no-data">Error: ${esc(e.message)}</div>`;
  }
}
function switchModalTab(tab, skipRender) {
  document.querySelectorAll('.modal-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  if (!skipRender && _modalData) renderModalTab(tab);
}
function renderModalTab(tab) {
  const el = document.getElementById('modal-body-content');
  if (!_modalData) { el.innerHTML = '<div class="loading"><div class="spinner"></div></div>'; return; }
  const d = _modalData;
  if (tab === 'summary') el.innerHTML = renderSummaryTab(d);
  else if (tab === 'tests') el.innerHTML = renderTestsTab(d);
  else if (tab === 'activity') el.innerHTML = renderActivityTab(d);
}
function renderSummaryTab(d) {
  const t = d.tests || {}, h = d.hours || {}, c = d.consistency || {}, pl = d.practiceLog || {};
  return `
    <div class="mini-stat-grid">
      <div class="mini-stat"><div class="mini-stat-label">Tests Attempted</div><div class="mini-stat-value">${fmt(t.total)}</div></div>
      <div class="mini-stat"><div class="mini-stat-label">Avg Score</div><div class="mini-stat-value">${fmt(t.avgScore)}${t.avgScorePct?` <span style="font-size:.65rem;color:var(--mu)">(${t.avgScorePct}%)</span>`:''}</div></div>
      <div class="mini-stat"><div class="mini-stat-label">Best Score</div><div class="mini-stat-value">${fmt(t.bestScore)}</div></div>
      <div class="mini-stat"><div class="mini-stat-label">Study Hours</div><div class="mini-stat-value">${fmt(h.totalTime)}h</div></div>
      <div class="mini-stat"><div class="mini-stat-label">Questions Practiced</div><div class="mini-stat-value">${fmt(pl.totalQuestions)}</div></div>
      <div class="mini-stat"><div class="mini-stat-label">AI Insights Used</div><div class="mini-stat-value">${fmt(d.aiInsights)}</div></div>
      <div class="mini-stat"><div class="mini-stat-label">Active Days (30d)</div><div class="mini-stat-value">${fmt(c.activeDaysLast30)}</div></div>
      <div class="mini-stat"><div class="mini-stat-label">Longest Streak</div><div class="mini-stat-value">🔥 ${fmt(c.longestStreak)}d</div></div>
    </div>
    <div class="grid-3" style="margin-bottom:0">
      <div class="card" style="padding:1rem 1.1rem">
        <h3 style="margin-bottom:.7rem;font-size:.78rem">Subject-wise Avg Score</h3>
        ${subjectMiniBar('Physics', t.avgPhysics, Math.max(t.avgPhysics,t.avgChem,t.avgMaths,1), '#60a5fa')}
        ${subjectMiniBar('Chemistry', t.avgChem, Math.max(t.avgPhysics,t.avgChem,t.avgMaths,1), '#34d399')}
        ${subjectMiniBar('Maths', t.avgMaths, Math.max(t.avgPhysics,t.avgChem,t.avgMaths,1), '#fbbf24')}
      </div>
      <div class="card" style="padding:1rem 1.1rem">
        <h3 style="margin-bottom:.7rem;font-size:.78rem">Study Hours by Subject</h3>
        ${subjectMiniBar('Physics', h.physics, Math.max(h.physics,h.chemistry,h.maths,1), '#60a5fa', 'h')}
        ${subjectMiniBar('Chemistry', h.chemistry, Math.max(h.physics,h.chemistry,h.maths,1), '#34d399', 'h')}
        ${subjectMiniBar('Maths', h.maths, Math.max(h.physics,h.chemistry,h.maths,1), '#fbbf24', 'h')}
      </div>
      <div class="card" style="padding:1rem 1.1rem">
        <h3 style="margin-bottom:.7rem;font-size:.78rem">Questions Practiced by Subject</h3>
        ${subjectMiniBar('Physics', pl.physics, Math.max(pl.physics,pl.chemistry,pl.maths,1), '#60a5fa')}
        ${subjectMiniBar('Chemistry', pl.chemistry, Math.max(pl.physics,pl.chemistry,pl.maths,1), '#34d399')}
        ${subjectMiniBar('Maths', pl.maths, Math.max(pl.physics,pl.chemistry,pl.maths,1), '#fbbf24')}
      </div>
    </div>
    <div class="card-foot" style="border-top:none;padding-top:.9rem;display:flex;flex-wrap:wrap;gap:1.2rem">
      <span>📋 Backlogs: <strong style="color:var(--tx)">${fmt(d.backlogs)}</strong></span>
      <span>✅ Todos: <strong style="color:var(--tx)">${fmt(d.todos)}</strong></span>
      <span>💬 Feedback: <strong style="color:var(--tx)">${(d.feedback||[]).length}</strong></span>
      <span>📧 Reports: <strong style="color:var(--tx)">${d.profile?.email_reports === 'monthly' ? 'On' : 'Off'}</strong></span>
    </div>
  `;
}
function subjectMiniBar(label, val, max, color, unit) {
  val = val || 0;
  const pct = max ? Math.round(val/max*100) : 0;
  return `
    <div class="subject-bar-mini">
      <div class="subject-dot" style="background:${color}"></div>
      <div class="lbl">${label}</div>
      <div class="trk"><div class="fil" style="width:${pct}%;background:${color}"></div></div>
      <div class="pctval">${val}${unit||''}</div>
    </div>
  `;
}
function renderTestsTab(d) {
  const t = d.tests || {};
  const recent = t.recent || [];
  return `
    <div class="mini-stat-grid">
      <div class="mini-stat"><div class="mini-stat-label">Mains Attempted</div><div class="mini-stat-value">${fmt(t.mains)}</div></div>
      <div class="mini-stat"><div class="mini-stat-label">Advanced Attempted</div><div class="mini-stat-value">${fmt(t.advanced)}</div></div>
      <div class="mini-stat"><div class="mini-stat-label">Avg Score</div><div class="mini-stat-value">${fmt(t.avgScore)}</div></div>
      <div class="mini-stat"><div class="mini-stat-label">Best Score</div><div class="mini-stat-value">${fmt(t.bestScore)}</div></div>
    </div>
    <h3 style="font-size:.78rem;margin-bottom:.6rem">Recent Test History</h3>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Exam</th><th>Date</th><th>Score</th><th>Physics</th><th>Chemistry</th><th>Maths</th></tr></thead>
        <tbody>
          ${recent.length ? recent.map(r => `
            <tr>
              <td><span class="pill ${r.exam==='advanced'?'pill-yellow':'pill-purple'}">${esc(r.exam||'—')}</span></td>
              <td style="color:var(--mu)">${fmtDate(r.date)}</td>
              <td><strong>${fmt(r.total)}</strong>${r.max?` / ${fmt(r.max)}`:''}</td>
              <td>${fmt(r.physics)}</td><td>${fmt(r.chemistry)}</td><td>${fmt(r.maths)}</td>
            </tr>
          `).join('') : `<tr><td colspan="6">${emptyState('No tests logged yet')}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}
function renderActivityTab(d) {
  const c = d.consistency || {};
  const streak = d.streak || {};
  return `
    <div class="mini-stat-grid">
      <div class="mini-stat"><div class="mini-stat-label">Active Days (30d)</div><div class="mini-stat-value">${fmt(c.activeDaysLast30)}</div></div>
      <div class="mini-stat"><div class="mini-stat-label">Longest Active Streak</div><div class="mini-stat-value">🔥 ${fmt(c.longestStreak)}d</div></div>
      <div class="mini-stat"><div class="mini-stat-label">Total Active Days</div><div class="mini-stat-value">${fmt(c.totalActiveDays)}</div></div>
      <div class="mini-stat"><div class="mini-stat-label">Backlog Clear Streak</div><div class="mini-stat-value">${fmt(streak.backlog_streak)}</div></div>
    </div>
    <h3 style="font-size:.78rem;margin-bottom:.6rem">Recent Feedback</h3>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Date</th><th>Rating</th><th>Message</th></tr></thead>
        <tbody>
          ${(d.feedback||[]).length ? d.feedback.slice(0,8).map(f => `
            <tr>
              <td style="color:var(--mu);white-space:nowrap">${fmtDate(f.created_at)}</td>
              <td>${f.rating ? '⭐'.repeat(f.rating) : '—'}</td>
              <td style="max-width:280px;overflow:hidden;text-overflow:ellipsis">${esc(f.message||f.subject||'—')}</td>
            </tr>
          `).join('') : `<tr><td colspan="3">${emptyState('No feedback submitted')}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}
function closeModal() {
  document.getElementById('user-modal').style.display = 'none';
  _modalData = null;
}


async function loadDemographics() {
  const classEl = document.getElementById('class-dist');
  const coachEl = document.getElementById('coaching-dist');
  const yearEl = document.getElementById('year-dist');
  const sourceEl = document.getElementById('source-dist');
  classEl.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  coachEl.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  yearEl.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  sourceEl.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const d = await api('demo_data');
    const colors = ['#7c6af7','#34d399','#fbbf24','#f472b6','#2dd4bf','#f87171','#60a5fa','#a695ff','#fb923c','#8b8aa0'];
    classEl.innerHTML = renderDistribution(d.classes, colors) + `<div class="card-foot">Based on ${fmt(d.total)} total registered users</div>`;
    coachEl.innerHTML = renderDistribution(d.coachings, colors) + `<div class="card-foot">Based on ${fmt(d.total)} total registered users</div>`;
    yearEl.innerHTML = renderDistribution(d.years, colors);
    sourceEl.innerHTML = renderDistribution(d.sources, colors) + `<div class="card-foot">Based on ${fmt(d.total)} total registered users</div>`;
  } catch(e) {
    classEl.innerHTML = coachEl.innerHTML = yearEl.innerHTML = sourceEl.innerHTML = `<div class="no-data">Error: ${esc(e.message)}</div>`;
  }
}
function renderDistribution(list, colors) {
  if (!list || !list.length) return emptyState('No data yet');
  return list.map((d, i) => `
    <div class="dist-row">
      <div class="dist-swatch" style="background:${colors[i%colors.length]}"></div>
      <div class="dist-label">${esc(d.label)}</div>
      <div class="dist-track"><div class="dist-fill" style="width:${d.pct}%;background:${colors[i%colors.length]}"></div></div>
      <div class="dist-pct">${d.pct}%</div>
    </div>
  `).join('');
}

async function loadDBStats() {
  const el = document.getElementById('db-stats-grid');
  el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const d = await api('db_stats_data');
    el.innerHTML = [
      { label:'Total Tests Rows',    value: fmt(d.totalTests),     icon:'📝', sub:'In DB', bg:'rgba(96,165,250,.14)' },
      { label:'Total Hours Rows',    value: fmt(d.totalHours),     icon:'⏱️', sub:'In DB', bg:'rgba(251,191,36,.13)' },
      { label:'Total Backlogs',      value: fmt(d.totalBacklogs),  icon:'🔴', sub:'In DB', bg:'rgba(248,113,113,.13)' },
      { label:'Total Todos',         value: fmt(d.totalTodos),     icon:'✅', sub:'In DB', bg:'rgba(52,211,153,.14)' },
      { label:'Email Reports ON',    value: fmt(d.emailReportsOn), icon:'📧', sub:'Users subscribed', bg:'rgba(244,114,182,.14)' },
      { label:'Active (7d)',         value: fmt(d.activeUsers7d),  icon:'🟢', sub:'Last 7 days', bg:'rgba(52,211,153,.14)' },
      { label:'Total in Prefs',      value: fmt(d.totalPrefs),     icon:'👥', sub:'Users with prefs', bg:'rgba(124,106,247,.16)' },
    ].map(s => `
      <div class="stat" style="--stat-bg:${s.bg};--stat-glow:${s.bg}">
        <div class="stat-icon-wrap">${s.icon}</div>
        <div class="stat-label">${s.label}</div>
        <div class="stat-value">${s.value}</div>
        <div class="stat-sub">${s.sub}</div>
      </div>
    `).join('');
  } catch(e) { el.innerHTML = `<div class="no-data">Error: ${esc(e.message)}</div>`; }
  loadInfraCost();
}
async function loadInfraCost() {
  try {
    const d = await api('get_site_config');
    const input = document.getElementById('infra-cost-input');
    if (input) input.value = d.monthly_infra_cost || '';
  } catch(e) {}
}
async function saveInfraCost() {
  const input = document.getElementById('infra-cost-input');
  const savedEl = document.getElementById('infra-cost-saved');
  const val = input.value;
  if (val === '' || isNaN(parseFloat(val))) { showToast('Enter a valid number'); return; }
  try {
    await apiPost('save_site_config', { monthly_infra_cost: val });
    savedEl.textContent = 'Saved ✓';
    setTimeout(() => { savedEl.textContent = ''; }, 2000);
  } catch(e) { showToast('Failed to save'); }
}

async function triggerAction(action, resultId) {
  const resultEl = document.getElementById(resultId);
  resultEl.style.display = 'none';
  showToast('Triggering… please wait');
  try {
    const d = await apiPost(action);
    resultEl.className = 'action-result result-ok';
    resultEl.textContent = `✓ Success: ${JSON.stringify(d.result || d)}`;
    resultEl.style.display = 'block';
    showToast('Done ✓');
  } catch(e) {
    resultEl.className = 'action-result result-err';
    resultEl.textContent = `✗ Error: ${e.message}`;
    resultEl.style.display = 'block';
    showToast('Error: ' + e.message);
  }
}

function renderLineChart(values, labels, height) {
  if (!values || !values.length) return emptyState('No data');
  const w = 600; const h = height - 20;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => {
    const x = values.length > 1 ? (i / (values.length - 1)) * w : 0;
    const y = h - (v / max) * h;
    return `${x},${y}`;
  });
  const area = `M ${pts.join(' L ')} L ${w},${h} L 0,${h} Z`;
  const gid = 'g' + Math.random().toString(36).slice(2,8);
  return `
    <svg viewBox="0 0 ${w} ${height}" preserveAspectRatio="none">
      <defs>
        <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#7c6af7" stop-opacity=".35"/>
          <stop offset="100%" stop-color="#7c6af7" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${area}" fill="url(#${gid})"/>
      <polyline points="${pts.join(' ')}" fill="none" stroke="#a695ff" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>
  `;
}

function fmt(n) {
  if (!n) return '0';
  if (n >= 1000) return (n/1000).toFixed(1) + 'k';
  return String(Math.round(n*10)/10);
}
function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'2-digit' }); }
  catch { return d; }
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function initials(name) {
  if (!name || name === 'Unknown') return '?';
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0,2).toUpperCase();
  return (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
}
function emptyState(msg) {
  return `<div class="no-data"><span class="emoji">🗒️</span>${esc(msg)}</div>`;
}
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

async function loadActionsPage() {
  
  try {
    const d = await api('feedback_stats');
    const el = document.getElementById('action-unread-count');
    if (el) el.textContent = d.total || 0;
    const lc = document.getElementById('action-last-checked');
    if (lc) lc.textContent = new Date().toLocaleTimeString('en-IN');
  } catch(e) {}
  loadSiteConfig();
}
async function loadSiteConfig() {
  const resultEl = document.getElementById('result-config');
  if (resultEl) resultEl.style.display = 'none';
  try {
    const d = await api('get_site_config');
    document.getElementById('cfg-mock-tests').value   = d.mock_tests_count  ?? '';
    document.getElementById('cfg-study-hours').value  = d.study_hours_count ?? '';
    document.getElementById('cfg-backlogs').value     = d.backlogs_count    ?? '';
    document.getElementById('cfg-questions-practiced').value = d.questions_practiced_count ?? '';
    document.getElementById('cfg-reviews').value      = d.reviews_count     ?? '';
    document.getElementById('cfg-rating').value       = d.avg_rating        ?? '';
    document.getElementById('cfg-version').value      = d.app_version       ?? '';
    const saved = document.getElementById('cfg-last-saved');
    if (saved) saved.textContent = d.updated_at ? `Last updated ${new Date(d.updated_at).toLocaleString('en-IN')}` : '';
  } catch(e) {
    if (resultEl) {
      resultEl.className = 'action-result result-err';
      resultEl.textContent = '✗ Could not load current values: ' + e.message;
      resultEl.style.display = 'block';
    }
  }
}
async function saveSiteConfig() {
  const resultEl = document.getElementById('result-config');
  resultEl.style.display = 'none';
  const body = {
    mock_tests_count:  document.getElementById('cfg-mock-tests').value,
    study_hours_count: document.getElementById('cfg-study-hours').value,
    backlogs_count:    document.getElementById('cfg-backlogs').value,
    questions_practiced_count: document.getElementById('cfg-questions-practiced').value,
    reviews_count:     document.getElementById('cfg-reviews').value,
    avg_rating:        document.getElementById('cfg-rating').value,
    app_version:       document.getElementById('cfg-version').value,
  };
  showToast('Saving…');
  try {
    const d = await apiPost('save_site_config', body);
    if (d.error) throw new Error(d.error);
    resultEl.className = 'action-result result-ok';
    resultEl.textContent = '✓ Saved. Landing page and app Settings will show the new values on next load.';
    resultEl.style.display = 'block';
    const saved = document.getElementById('cfg-last-saved');
    if (saved && d.config?.updated_at) saved.textContent = `Last updated ${new Date(d.config.updated_at).toLocaleString('en-IN')}`;
    showToast('Saved ✓');
  } catch(e) {
    resultEl.className = 'action-result result-err';
    resultEl.textContent = '✗ Error: ' + e.message;
    resultEl.style.display = 'block';
    showToast('Error: ' + e.message);
  }
}
async function exportUsersCSV() {
  const resultEl = document.getElementById('result-export');
  resultEl.style.display = 'none';
  showToast('Building CSV…');
  try {
    const d = await api('usr_list&page=0&pageSize=9999');
    const users = d.users || [];
    if (!users.length) { showToast('No users found'); return; }
    const header = ['Name','Email','Class','Coaching','Source','Target Year','Joined','Last Active','Email Reports'];
    const rows = users.map(u => [
      u.name, u.email, u.class, u.coaching, u.source_id ? u.source : '—',
      u.target_year || '—',
      u.created_at ? new Date(u.created_at).toLocaleDateString('en-IN') : '—',
      u.last_active ? new Date(u.last_active).toLocaleDateString('en-IN') : '—',
      u.email_reports,
    ].map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(','));
    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `JEE ADV OSINT-users-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    resultEl.className = 'action-result result-ok';
    resultEl.textContent = `✓ ${users.length} users exported`;
    resultEl.style.display = 'block';
    showToast(`✓ ${users.length} users exported`);
  } catch(e) {
    resultEl.className = 'action-result result-err';
    resultEl.textContent = `✗ ${e.message}`;
    resultEl.style.display = 'block';
  }
}

const saved = sessionStorage.getItem('jt_admin_token');
if (saved) {
  _token = saved;
  enterDashboard();
}
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('login-screen').style.display !== 'none') doLogin();
  if (e.key === 'Escape') closeModal();
});
document.getElementById('user-modal').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});


document.addEventListener('click', (e) => {
  const btn = e.target.closest('.user-row-btn');
  if (btn) {
    e.stopPropagation();
    viewUser(btn.dataset.uid, btn.dataset.uname);
    return;
  }
  const row = e.target.closest('.user-row');
  if (row) {
    viewUser(row.dataset.uid, row.dataset.uname);
  }
});

let _recipientTab = 'select';
let _emailUsers   = [];
let _emailMode    = 'compose';
let _supabaseUrl  = '';
async function loadSupabaseConfig() {
  if (_supabaseUrl) return;
  try {
    const r = await fetch('/api/config');
    const d = await r.json();
    _supabaseUrl = d.url || '';
  } catch(e) {}
}

let _customSubMode = 'plain';
function setEmailMode(mode, btn) {
  _emailMode = mode;
  document.querySelectorAll('#mode-compose,#mode-custom').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('em-compose-mode').style.display = mode === 'compose' ? 'block' : 'none';
  document.getElementById('em-custom-mode').style.display  = mode === 'custom'  ? 'block' : 'none';
  document.getElementById('ce-preview-card').style.display = 'none';
  updateRecipientCount();
}
function setCustomSubMode(sub, btn) {
  _customSubMode = sub;
  document.querySelectorAll('#custom-sub-plain,#custom-sub-html').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('em-custom-plain').style.display = sub === 'plain' ? 'block' : 'none';
  document.getElementById('em-custom-html').style.display  = sub === 'html'  ? 'block' : 'none';
}
function toggleCTA() {
  const en = document.getElementById('ce-cta-enabled').checked;
  document.getElementById('ce-cta-fields').style.opacity = en ? '1' : '.35';
  document.getElementById('ce-cta-fields').style.pointerEvents = en ? 'auto' : 'none';
}

async function loadEmailUsers() {
  const el = document.getElementById('user-check-list');
  if (_emailUsers.length) { renderEmailUsers(_emailUsers); return; }
  el.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--mu);font-size:.8rem;">Loading...</div>';
  try {
    const d = await api('usr_list&page=0');
    _emailUsers = d.users || [];
    renderEmailUsers(_emailUsers);
  } catch(e) {
    el.innerHTML = `<div style="text-align:center;padding:1rem;color:var(--rd);font-size:.8rem;">Error: ${e.message}</div>`;
  }
}
function filterEmailUsers(q) {
  const filtered = q.trim()
    ? _emailUsers.filter(u =>
        (u.name||'').toLowerCase().includes(q.toLowerCase()) ||
        (u.email||'').toLowerCase().includes(q.toLowerCase())
      )
    : _emailUsers;
  renderEmailUsers(filtered);
}
function renderEmailUsers(users) {
  const el = document.getElementById('user-check-list');
  if (!users.length) {
    el.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--mu);font-size:.8rem;">No users found</div>';
    return;
  }
  
  const checked = new Set([...document.querySelectorAll('.user-email-cb:checked')].map(c => c.value));
  el.innerHTML = users.map(u => `
    <label class="user-check-item">
      <input type="checkbox" class="user-email-cb" value="${u.id}" ${checked.has(u.id)?'checked':''} onchange="updateSelectedCount()"/>
      <div class="user-check-info">
        <div class="user-check-name">${esc(u.name||'Unknown')}</div>
        <div class="user-check-email">${esc(u.email||'')}</div>
      </div>
      ${u.class?`<span style="font-size:.62rem;color:var(--ac2);background:rgba(124,106,247,.1);padding:.1rem .35rem;border-radius:99px;flex-shrink:0">${u.class}</span>`:''}
    </label>
  `).join('');
  updateSelectedCount();
}
function toggleSelectAll(cb) {
  document.querySelectorAll('.user-email-cb').forEach(c => c.checked = cb.checked);
  updateSelectedCount();
}
function updateSelectedCount() {
  const n = document.querySelectorAll('.user-email-cb:checked').length;
  const el = document.getElementById('selected-count');
  if (el) el.textContent = `${n} selected`;
  updateRecipientCount();
}
function setRecipientTab(tab, btn) {
  _recipientTab = tab;
  
  document.querySelectorAll('.recipient-tabs .rtab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.recipient-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById(`rp-${tab}`);
  if (panel) panel.classList.add('active');
  if (tab === 'select') loadEmailUsers();
  updateRecipientCount();
}
function updateRecipientCount() {
  ['ce-count','ce-count-custom'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (_recipientTab === 'select') {
      const n = document.querySelectorAll('.user-email-cb:checked').length;
      el.innerHTML = `<strong style="color:var(--ac2)">${n}</strong> user${n!==1?'s':''} selected`;
    } else if (_recipientTab === 'all_active') {
      el.innerHTML = `<strong style="color:var(--ac2)">All active</strong> users (30d)`;
    } else if (_recipientTab === 'all') {
      el.innerHTML = `<strong style="color:var(--rd)">All users</strong>`;
    } else {
      const n = getCustomEmails().length;
      el.innerHTML = `<strong style="color:var(--ac2)">${n}</strong> custom email${n!==1?'s':''}`;
    }
  });
}
function getCustomEmails() {
  const raw = document.getElementById('ce-custom-emails')?.value || '';
  return raw.split(/[\n,]/).map(e => e.trim()).filter(e => e.includes('@'));
}

function insertTag(open, close) {
  const ta = document.getElementById(_emailMode === 'html' ? 'ce-html-body' : 'ce-body');
  if (!ta) return;
  const s = ta.selectionStart, e = ta.selectionEnd;
  const sel = ta.value.substring(s, e);
  ta.value = ta.value.substring(0, s) + open + sel + close + ta.value.substring(e);
  ta.selectionStart = s + open.length;
  ta.selectionEnd   = s + open.length + sel.length;
  ta.focus();
}
function insertSnippet(type) {
  const ta = document.getElementById('ce-body');
  if (!ta) return;
  
  
  const snippets = {
    greeting: `Dear <strong>{{name}}</strong>,<br><br>Hope your JEE prep is going strong! 🚀<br><br>`,
    review:   `Dear <strong>{{name}}</strong>,<br><br>You've been using JEE ADV OSINT for a while — I'd love your feedback! 🙏<br><br>Could you spare 2 minutes to share what you think? It really helps us improve.<br><br>`,
    tips:     `Here are some quick tips to get the most out of JEE ADV OSINT:<br><br><ul style="padding-left:20px;line-height:2;color:#B4BCD0"><li>Log every mock test — even the bad ones</li><li>Use AI Insights weekly for honest feedback</li><li>Clear your backlog daily — zero tolerance!</li></ul><br>`,
    closing:  `<br>If you have any questions or suggestions, feel free to reach out at <a href="https://mail.google.com/mail/?view=cm&fs=1&to=5073340abdulrehmankhandurrani@gmail.com" style="color:#D8B4FE;text-decoration:none;font-weight:600;">5073340abdulrehmankhandurrani@gmail.com</a>.<br><br>Best of luck with your prep! 💪`,
  };
  const pos = ta.selectionStart;
  ta.value = ta.value.substring(0, pos) + (snippets[type]||'') + ta.value.substring(pos);
  ta.selectionStart = ta.selectionEnd = pos + (snippets[type]||'').length;
  ta.focus();
}

function buildEmailHTML(name, bodyHtml, ctaText, ctaUrl, includeCTA) {
  const cta = (includeCTA && ctaText && ctaText.trim()) ? `
      <tr>
        <td align="center" style="padding:0 40px 40px;">
          <a href="${ctaUrl||'https://jee-adv-osint.vercel.app'}"
            style="display:inline-block;background:linear-gradient(135deg,#A855F7,#EC4899);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:15px;font-weight:600;">
            ${ctaText.trim()}
          </a>
        </td>
      </tr>` : '';
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:40px 20px;background:#050816;font-family:Inter,Segoe UI,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center">
<table width="620" cellpadding="0" cellspacing="0" border="0"
  style="max-width:620px;background:#0B1020;border:1px solid #1A2035;border-radius:20px;overflow:hidden;">
  
  <tr>
    <td align="center" style="padding:40px 30px 20px;">
      <img src="https://jee-adv-osint.vercel.app/JEE ADV OSINT-logo-email.png" alt="JEE ADV OSINT" width="260"
        style="display:block;border:0;max-width:260px;height:auto;">
    </td>
  </tr>
  
  <tr>
    <td>
      <div style="height:1px;background:linear-gradient(90deg,transparent,#A855F7,#EC4899,transparent);"></div>
    </td>
  </tr>
  
  <tr>
    <td style="padding:40px;color:#B4BCD0;font-size:16px;line-height:1.9;">
      ${bodyHtml.replace(/\{\{name\}\}/g, name).replace(/\n/g, '<br>')}
    </td>
  </tr>
  
  <tr>
    <td style="padding:0 40px 40px;">
      <table width="100%" cellpadding="0" cellspacing="0"
        style="background:linear-gradient(135deg,rgba(168,85,247,0.08),rgba(236,72,153,0.08));border:1px solid rgba(168,85,247,0.25);border-radius:14px;">
        <tr>
          <td style="padding:22px;">
            <p style="margin:0;color:#B4BCD0;font-size:14px;">Best Regards,</p>
            <p style="margin:12px 0 4px;color:#ffffff;font-size:22px;font-weight:700;">Abdul Rehman Khan Durrani</p>
            <p style="margin:0;color:#D8B4FE;font-size:15px;">Founder, JEE ADV OSINT</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  ${cta}
  
  <tr>
    <td align="center" style="padding:24px;border-top:1px solid #1A2035;">
      <p style="margin:0;color:#6B7280;font-size:13px;">© 2026 JEE ADV OSINT • Built for JEE Aspirants</p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
function getFromAddress() {
  const isCustom = _emailMode === 'custom';
  const name = isCustom ? 'ce-from-addr-custom' : 'ce-from-addr';
  const checked = document.querySelector(`input[name="${name}"]:checked`);
  return checked ? checked.value : '5073340abdulrehmankhandurrani@gmail.com';
}
function updateFromPreview() {
  const addr = getFromAddress();
  
  const tipEl = document.getElementById('tips-from-addr');
  if (tipEl) tipEl.textContent = addr;
  
  const prevFrom = document.getElementById('prev-from');
  if (prevFrom && document.getElementById('ce-preview-card').style.display !== 'none') {
    const fromName = document.getElementById(_emailMode === 'custom' ? 'ce-from-name-custom' : 'ce-from-name')?.value || 'JEE ADV OSINT';
    prevFrom.textContent = `${fromName} <${addr}>`;
  }
}

function previewEmail() {
  const body = document.getElementById('ce-body')?.value || '';
  const subject = document.getElementById('ce-subject')?.value || '';
  const fromName = document.getElementById('ce-from-name')?.value || 'JEE ADV OSINT';
  const ctaEnabled = document.getElementById('ce-cta-enabled')?.checked;
  const ctaText = document.getElementById('ce-cta-text')?.value || '';
  const ctaUrl  = document.getElementById('ce-cta-url')?.value  || '';
  if (!body.trim()) { showToast('Write body first!'); return; }
  _renderPreview(buildEmailHTML('ARK DURRANI', body, ctaText, ctaUrl, ctaEnabled), subject, fromName);
}
function previewCustom() {
  const fromName = (document.getElementById('ce-from-name-custom')?.value || 'JEE ADV OSINT');
  const subject  = (document.getElementById('ce-subject-custom')?.value  || '');
  if (_customSubMode === 'plain') {
    const body = document.getElementById('ce-plain-body')?.value || '';
    if (!body.trim()) { showToast('Write your message first!'); return; }
    
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:40px 20px;font-family:Inter,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.9;color:#B4BCD0;background:#050816;white-space:pre-wrap;word-wrap:break-word}a{color:#D8B4FE}</style></head><body>${body.replace(/\{\{name\}\}/g,'ARK DURRANI').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}</body></html>`;
    _renderPreview(html, subject, fromName);
  } else {
    const body = document.getElementById('ce-html-body')?.value || '';
    if (!body.trim()) { showToast('Write HTML first!'); return; }
    _renderPreview(body.replace(/\{\{name\}\}/g,'ARK DURRANI'), subject, fromName);
  }
}
function _renderPreview(html, subject, fromName) {
  const card  = document.getElementById('ce-preview-card');
  const frame = document.getElementById('ce-preview-frame');
  const fromAddr = getFromAddress();
  document.getElementById('prev-subject').textContent = subject.replace(/\{\{name\}\}/g,'ARK DURRANI') || '(no subject)';
  document.getElementById('prev-from').textContent    = `${fromName} <${fromAddr}>`;
  card.style.display = 'block';
  const doc = frame.contentDocument || frame.contentWindow.document;
  doc.open(); doc.write(html); doc.close();
  card.scrollIntoView({ behavior:'smooth', block:'start' });
}

async function sendCustomEmail() {
  const isCustom  = _emailMode === 'custom';
  const subject   = (document.getElementById(isCustom?'ce-subject-custom':'ce-subject')?.value||'').trim();
  const fromName  = (document.getElementById(isCustom?'ce-from-name-custom':'ce-from-name')?.value||'JEE ADV OSINT').trim();
  const resultEl  = document.getElementById(isCustom?'ce-result-custom':'ce-result');
  const sendBtn   = document.getElementById(isCustom?'ce-send-btn-custom':'ce-send-btn');
  let htmlBody = '';
  let isRawHtml = false;
  if (isCustom) {
    if (_customSubMode === 'plain') {
      const body = (document.getElementById('ce-plain-body')?.value||'').trim();
      if (!body) { showToast('Write your message first!'); return; }
      
      htmlBody = body.replace(/\{\{name\}\}/g, '{{name}}');
      isRawHtml = false;
    } else {
      htmlBody = (document.getElementById('ce-html-body')?.value||'').trim();
      if (!htmlBody) { showToast('HTML body required!'); return; }
      isRawHtml = true;
    }
  } else {
    const body = (document.getElementById('ce-body')?.value||'').trim();
    const ctaEnabled = document.getElementById('ce-cta-enabled')?.checked || false;
    const ctaText = ctaEnabled ? (document.getElementById('ce-cta-text')?.value||'').trim() : '';
    const ctaUrl  = ctaEnabled ? (document.getElementById('ce-cta-url')?.value||'https://jee-adv-osint.vercel.app').trim() : '';
    if (!body) { showToast('Email body required!'); return; }
    htmlBody = buildEmailHTML('{{name}}', body, ctaText, ctaUrl, ctaEnabled);
    isRawHtml = true;
  }
  if (!subject) { showToast('Subject required!'); return; }
  if (!htmlBody) { showToast('Email body required!'); return; }
  const payload = {
    subject,
    from_name: fromName,
    from_address: getFromAddress(),
    is_raw_html: isRawHtml,
    ...(isCustom && _customSubMode === 'plain' ? { text: htmlBody } : { html: htmlBody }),
  };
  if (_recipientTab === 'select') {
    const ids = [...document.querySelectorAll('.user-email-cb:checked')].map(c => c.value);
    if (!ids.length) { showToast('Select at least one user!'); return; }
    payload.to_user_ids = ids;
  } else if (_recipientTab === 'custom') {
    const emails = getCustomEmails();
    if (!emails.length) { showToast('Enter valid emails!'); return; }
    payload.to_emails = emails;
  } else {
    payload.type = _recipientTab;
  }
  const recipLabel = _recipientTab==='select' ? `${payload.to_user_ids?.length} users`
    : _recipientTab==='custom' ? `${payload.to_emails?.length} emails`
    : _recipientTab==='all_active' ? 'all active users' : 'ALL users';
  if (!confirm(`Send to ${recipLabel}?\n\nSubject: ${subject}\n\nCannot be undone!`)) return;
  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending...';
  resultEl.style.display = 'none';
  showToast('Sending emails...');
  try {
    await loadSupabaseConfig();
    if (!_supabaseUrl) throw new Error('Supabase URL not configured');
    const res = await fetch(`/api/admin?action=send_custom_email`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
    resultEl.className = 'compose-result compose-ok';
    resultEl.innerHTML = `✓ <strong>${d.sent}</strong> sent!${d.failed?` <span style="color:#f87171">${d.failed} failed</span>`:''}`;
    resultEl.style.display = 'block';
    showToast(`✓ ${d.sent} emails sent!`);
  } catch(e) {
    resultEl.className = 'compose-result compose-err';
    resultEl.textContent = `✗ ${e.message}`;
    resultEl.style.display = 'block';
    showToast('Error: ' + e.message);
  } finally {
    sendBtn.disabled = false;
    sendBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Send Email`;
    sendBtn.disabled = false;
  }
}

window.openEmailComposerWith = function(subject, toUserIds) {
  showPage('email', document.querySelector('.nav-item[onclick*="email"]'));
  setTimeout(() => {
    document.getElementById('ce-subject').value = subject || '';
    if (toUserIds?.length) {
      setRecipientTab('select', document.querySelector('.rtab'));
      loadEmailUsers().then(() => {
        document.querySelectorAll('.user-email-cb').forEach(cb => {
          cb.checked = toUserIds.includes(cb.value);
        });
        updateSelectedCount();
      });
    }
  }, 300);
};
document.addEventListener('input', e => {
  if (e.target.id === 'ce-custom-emails') updateRecipientCount();
});

let _allFeedbacks = [];
let _filteredFeedbacks = [];
async function loadFeedbackStats() {
  try {
    const d = await api('feedback_stats');
    document.getElementById('fb-total').textContent = fmt(d.total || 0);
    const thisMonth = new Date().toISOString().slice(0,7);
    document.getElementById('fb-this-month').textContent = fmt(d.byMonth?.[thisMonth] || 0);
    document.getElementById('fb-avg-rating').textContent = d.avgRating ? `${d.avgRating} ⭐` : '—';
    if (d.categories) {
      const top = Object.entries(d.categories).sort((a,b) => b[1]-a[1])[0];
      document.getElementById('fb-top-cat').textContent = top ? top[0] : '—';
    }
    
    const catEl = document.getElementById('fb-cat-chart');
    if (d.categories) {
      const sorted = Object.entries(d.categories).sort((a,b) => b[1]-a[1]);
      const max = Math.max(...sorted.map(e => e[1]), 1);
      const colors = ['#7c6dff','#22c55e','#f59e0b','#ec4899','#06b6d4','#ef4444','#8b5cf6','#f97316','#14b8a6'];
      catEl.innerHTML = sorted.map(([cat, count], i) => `
        <div class="bar-row">
          <div class="bar-label">${cat}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${(count/max*100).toFixed(1)}%;background:${colors[i%colors.length]}"></div></div>
          <div class="bar-count">${count}</div>
        </div>`).join('') || '<div class="no-data">No data yet</div>';
    }
    
    const ratingEl = document.getElementById('fb-rating-chart');
    if (d.ratingDist && d.ratedCount > 0) {
      const maxR = Math.max(...Object.values(d.ratingDist), 1);
      const starColors = ['#ef4444','#f97316','#f59e0b','#84cc16','#22c55e'];
      ratingEl.innerHTML = [5,4,3,2,1].map((star, i) => {
        const count = d.ratingDist[star] || 0;
        return `
        <div class="bar-row">
          <div class="bar-label">${'⭐'.repeat(star)}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${(count/maxR*100).toFixed(1)}%;background:${starColors[5-star]}"></div></div>
          <div class="bar-count">${count}</div>
        </div>`;
      }).join('') + `<p style="font-size:.72rem;color:var(--mu);margin-top:.5rem;">${d.ratedCount} rated out of ${d.total} total</p>`;
    } else {
      ratingEl.innerHTML = '<div class="no-data">No ratings yet</div>';
    }
    
    const monthEl = document.getElementById('fb-month-chart');
    if (d.byMonth) {
      const sorted = Object.entries(d.byMonth).sort((a,b) => a[0].localeCompare(b[0])).slice(-6);
      const max = Math.max(...sorted.map(e => e[1]), 1);
      monthEl.innerHTML = sorted.map(([month, count]) => `
        <div class="bar-row">
          <div class="bar-label">${month}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${(count/max*100).toFixed(1)}%;background:#7c6dff"></div></div>
          <div class="bar-count">${count}</div>
        </div>`).join('') || '<div class="no-data">No data yet</div>';
    }
  } catch(e) {
    console.error('Feedback stats:', e);
    
    ['fb-total','fb-this-month','fb-avg-rating','fb-top-cat'].forEach(id => {
      const el = document.getElementById(id);
      if (el && el.textContent === '—') el.textContent = 'err';
    });
  }
}
let _fbRatingFilter = '';
let _fbFeaturedOnly = false;
async function loadFeedbacks(page = 0) {
  _fbPage = page;
  _pagination.feedback = page;
  const tbody = document.getElementById('fb-table');
  tbody.innerHTML = '<tr><td colspan="8"><div class="loading"><div class="spinner"></div></div></td></tr>';
  try {
    const hasText = document.getElementById('fb-filter-hastext')?.checked ? '1' : '';
    const params = `&limit=20&offset=${page*20}${hasText ? '&hasText=1' : ''}${_fbRatingFilter ? '&rating='+_fbRatingFilter : ''}${_fbFeaturedOnly ? '&featuredOnly=1' : ''}`;
    const d = await api(`feedback_list${params}`);
    _allFeedbacks = d.feedbacks || [];
    _filteredFeedbacks = _allFeedbacks;
    renderFeedbackTable(_filteredFeedbacks);
    document.getElementById('fb-prev').disabled = page === 0;
    document.getElementById('fb-next').disabled = _allFeedbacks.length < 20;
    document.getElementById('fb-page-info').textContent = `Page ${page+1} · ${d.total||''} total`;
    const banner = document.getElementById('fb-warning-banner');
    if (d.warning) {
      banner.textContent = '⚠️ ' + d.warning;
      banner.style.display = 'block';
    } else {
      banner.style.display = 'none';
    }
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="no-data">Error loading feedbacks: ${e.message}</div></td></tr>`;
  }
}
function setFbRatingFilter(val, btn) {
  _fbRatingFilter = val;
  document.querySelectorAll('.fb-rtab').forEach(b => { b.classList.remove('active','btn-primary'); b.classList.add('btn-ghost'); });
  btn.classList.remove('btn-ghost');
  btn.classList.add('active','btn-primary');
  loadFeedbacks(0);
}
function viewAllFeatured(btn) {
  _fbFeaturedOnly = !_fbFeaturedOnly;
  btn.classList.toggle('btn-primary', _fbFeaturedOnly);
  btn.classList.toggle('btn-ghost', !_fbFeaturedOnly);
  btn.textContent = _fbFeaturedOnly ? '✕ Showing Featured Only' : '★ View All Featured';
  loadFeedbacks(0);
}
function filterFeedbacks(q) {
  _filteredFeedbacks = q.trim()
    ? _allFeedbacks.filter(f =>
        (f.subject||'').toLowerCase().includes(q.toLowerCase()) ||
        (f.message||'').toLowerCase().includes(q.toLowerCase()) ||
        (f.email||'').toLowerCase().includes(q.toLowerCase()) ||
        (f.account_name||'').toLowerCase().includes(q.toLowerCase()))
    : _allFeedbacks;
  renderFeedbackTable(_filteredFeedbacks);
}
function renderFeedbackTable(feedbacks) {
  const tbody = document.getElementById('fb-table');
  if (!feedbacks.length) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="no-data">No feedbacks found</div></td></tr>';
    return;
  }
  tbody.innerHTML = feedbacks.map((f, i) => {
    const stars = f.rating != null ? '⭐'.repeat(Math.min(5, Math.max(1, Math.round(Number(f.rating))))) : '—';
    const msg = f.message || '';
    const preview = msg.length > 40 ? msg.slice(0, 40) + '…' : (msg || '—');
    const hasMore = msg.length > 40;
    const isFeatured = !!f.featured;
    const canFeature = !!(f.message && f.message.trim());
    return `
    <tr id="fb-row-${i}">
      <td style="font-size:.75rem;font-weight:600;">${esc(f.account_name||f.email?.split('@')[0]||'Anonymous')}</td>
      <td style="font-size:.72rem;color:var(--mu);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(f.email||'—')}</td>
      <td style="font-size:.8rem;white-space:nowrap;" title="${f.rating != null ? f.rating+'/5' : 'No rating'}">${stars}</td>
      <td style="font-weight:600;font-size:.78rem;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(f.subject||'')}">${esc(f.subject||'—')}</td>
      <td class="fb-msg-cell" onclick="toggleFeedbackExpand(${i}, this)" title="${hasMore ? 'Click to expand' : ''}">
        <div class="fb-msg-preview">${esc(preview)}${hasMore ? ' <span style="color:var(--ac2);font-size:.68rem;">▼</span>' : ''}</div>
      </td>
      <td style="font-size:.72rem;color:var(--mu);white-space:nowrap;">${fmtDate(f.created_at)}</td>
      <td>
        <button class="action-btn ${isFeatured ? 'btn-primary' : 'btn-ghost'}" style="padding:.25rem .55rem;font-size:.68rem;white-space:nowrap;${canFeature ? '' : 'opacity:.4;cursor:not-allowed;'}"
          onclick="${canFeature ? `toggleFeatured(${i})` : ''}" title="${!canFeature ? 'No written comment to feature' : (isFeatured ? 'Remove from landing page' : 'Feature as testimonial')}">
          ${isFeatured ? '★ Featured' : '☆ Feature'}
        </button>
      </td>
      <td>
        <button class="action-btn btn-primary" style="padding:.25rem .55rem;font-size:.68rem;white-space:nowrap;"
          onclick="replyToFeedback('${esc(f.user_id||'')}','${esc(f.email||'')}','${esc(f.subject||'')}')">
          ✉️ Reply
        </button>
      </td>
    </tr>`;
  }).join('');
  
  tbody._feedbacks = feedbacks;
}
async function toggleFeatured(i) {
  const tbody = document.getElementById('fb-table');
  const feedbacks = tbody._feedbacks || _filteredFeedbacks;
  const f = feedbacks[i];
  if (!f) return;
  const nextState = !f.featured;
  const name = f.account_name || f.email?.split('@')[0] || 'this user';
  const confirmMsg = nextState
    ? `Feature ${name}'s review on the landing page?\n\n"${f.message}"\n\nTheir account name will be shown publicly.`
    : `Remove ${name}'s review from the landing page?`;
  if (!confirm(confirmMsg)) return;
  try {
    const result = await apiPost('feedback_feature', { id: f.id, featured: nextState });
    if (result && result.error) throw new Error(result.error);
    f.featured = nextState;
    if (result?.feedback?.display_name) f.display_name = result.feedback.display_name;
    renderFeedbackTable(feedbacks);
    showToast(nextState ? 'Featured on landing page ✓' : 'Removed from landing page');
  } catch (e) {
    showToast('Failed to save: ' + e.message);
  }
}
function toggleFeedbackExpand(i, cell) {
  const tbody = document.getElementById('fb-table');
  const feedbacks = tbody._feedbacks || _filteredFeedbacks;
  const f = feedbacks[i];
  if (!f) return;
  const existingRow = document.getElementById(`fb-expand-${i}`);
  if (existingRow) {
    
    existingRow.remove();
    const arrow = cell.querySelector('span');
    if (arrow) arrow.textContent = '▼';
    return;
  }
  
  const mainRow = document.getElementById(`fb-row-${i}`);
  if (!mainRow) return;
  const arrow = cell.querySelector('span');
  if (arrow) arrow.textContent = '▲';
  const expandRow = document.createElement('tr');
  expandRow.id = `fb-expand-${i}`;
  expandRow.className = 'fb-expand-row';
  expandRow.innerHTML = `<td colspan="8">
    <div class="fb-expand-box">
      <div class="fb-expand-label">Full Message</div>
      ${esc(f.message || '(no message)')}
    </div>
  </td>`;
  mainRow.insertAdjacentElement('afterend', expandRow);
}
function replyToFeedback(userId, email, subject) {
  
  const navEl = document.querySelector('.nav-item[onclick*=\'email\']');
  if (navEl) showPage('email', navEl);
  setTimeout(() => {
    
    const replySubject = subject ? `Re: ${subject}` : 'Thank You for Your Feedback!';
    document.getElementById('ce-subject').value = replySubject;
    
    document.getElementById('ce-body').value =
      `Dear <strong>{{name}}</strong>,\n\nThank you for your valuable feedback and kind words about JEE ADV OSINT.\n\n${subject ? `Regarding: "<em>${subject}</em>"\n\n` : ''}[Write your reply here...]\n\nIf you have any further questions or suggestions, feel free to reach out at <a href="https://mail.google.com/mail/?view=cm&fs=1&to=5073340abdulrehmankhandurrani@gmail.com" style="color:#D8B4FE;text-decoration:none;font-weight:600;">5073340abdulrehmankhandurrani@gmail.com</a>.`;
    
    const customBtn = [...document.querySelectorAll('#page-email .recipient-tabs .rtab')]
      .find(b => b.textContent.trim().toLowerCase() === 'custom');
    if (customBtn) setRecipientTab('custom', customBtn);
    const ta = document.getElementById('ce-custom-emails');
    if (ta && email) { ta.value = email; updateRecipientCount(); }
    showToast('Reply ready in Email Composer ✓');
  }, 350);
}


