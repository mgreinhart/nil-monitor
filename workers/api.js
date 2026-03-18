// ═══════════════════════════════════════════════════════════════════
//  API Handler — Serves D1 data as JSON
// ═══════════════════════════════════════════════════════════════════

const PUBLIC_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Admin endpoints: no CORS (same-origin only)
const ADMIN_CORS = {
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200, cors = PUBLIC_CORS) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

/**
 * Derive a session token from the admin key using HMAC-SHA256.
 * Token is deterministic for a given key, so no server-side session state needed.
 */
async function deriveAdminToken(adminKey) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(adminKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode('nil-monitor-admin-session'));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Check admin authentication via cookie.
 * Returns true if authed, or false if not authed.
 * If ADMIN_KEY is not set, always returns true (dev mode).
 */
async function checkAdminAuth(request, env) {
  if (!env.ADMIN_KEY) return true;
  const cookies = request.headers.get('Cookie') || '';
  const match = cookies.match(/admin_token=([^;]+)/);
  if (!match) return false;
  const expected = await deriveAdminToken(env.ADMIN_KEY);
  return match[1] === expected;
}

function adminLoginPage() {
  return new Response(`<!DOCTYPE html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>NIL Monitor Admin</title>
<style>
  body { font-family: -apple-system, sans-serif; background: #0f1729; color: #e2e8f0;
    display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
  .box { background: #1a2237; border-radius: 12px; padding: 40px; max-width: 360px; width: 100%; }
  h1 { font-size: 20px; margin: 0 0 24px; }
  input { width: 100%; padding: 10px 12px; border: 1px solid #334155; border-radius: 6px;
    background: #0f1729; color: #e2e8f0; font-size: 15px; box-sizing: border-box; }
  button { width: 100%; padding: 10px; border: none; border-radius: 6px; background: #c4402a;
    color: #fff; font-size: 15px; font-weight: 600; cursor: pointer; margin-top: 12px; }
  button:hover { background: #a33623; }
  .err { color: #f87171; font-size: 13px; margin-top: 8px; display: none; }
</style>
</head><body>
<div class="box">
  <h1>NIL Monitor Admin</h1>
  <form method="POST" action="/api/admin-login">
    <input type="password" name="password" placeholder="Admin password" autofocus required>
    <button type="submit">Sign in</button>
  </form>
  <div class="err" id="err"></div>
</div>
<script>
  if (location.search.includes('error=1'))
    document.getElementById('err').style.display = 'block',
    document.getElementById('err').textContent = 'Incorrect password';
</script>
</body></html>`, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

// ── Admin Dashboard Helpers ───────────────────────────────────────

// Fetcher config: cooldown function returns current cooldown in minutes
// (null = sleeping). Mirrors each fetcher's actual getCooldown() logic.
const FETCHER_CONFIG = {
  'google-news':    { getCooldown: h => h >= 6 && h < 17 ? 15 : h >= 17 && h < 22 ? 30 : null },
  'bing-news':      { getCooldown: h => h >= 6 && h < 17 ? 15 : h >= 17 && h < 22 ? 30 : null },
  'ncaa-rss':       { getCooldown: h => h >= 6 && h < 17 ? 15 : h >= 17 && h < 22 ? 30 : null },
  'newsdata':       { getCooldown: h => h >= 6 && h < 10 ? 30 : h >= 10 && h < 16 ? 60 : h >= 19 && h < 20 ? 60 : null },
  'publications':   { getCooldown: h => h >= 6 && h < 22 ? 30 : null },
  'nil-revolution': { getCooldown: h => h >= 6 && h < 22 ? 120 : null },
  'courtlistener':  { getCooldown: h => h >= 6 && h < 17 ? 120 : h >= 17 && h < 22 ? 240 : null },
  'cslt':           { getCooldown: h => h >= 6 && h < 22 ? 360 : null },
  'cslt-keydates':  { getCooldown: h => h >= 6 && h < 22 ? 360 : null },
  'podcasts':       { getCooldown: h => h >= 6 && h < 22 ? 360 : null },
  'cfbd':           { getCooldown: () => {
    const now = new Date();
    const m = parseInt(now.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'numeric' }));
    const d = parseInt(now.toLocaleString('en-US', { timeZone: 'America/New_York', day: 'numeric' }));
    if (m === 1 && d >= 2 && d <= 24) return 360; // football portal window
    return 1440;
  }},
};

function adminTimestamp(ts) {
  if (!ts) return 'Never';
  const d = new Date(ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function adminCooldown(min) {
  return min >= 60 ? `${min / 60}h` : `${min}m`;
}

function getETHour() {
  return parseInt(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/New_York' }));
}

/**
 * Get ET date strings for SQL queries. D1/SQLite has no timezone support,
 * so we compute ET dates in JS and pass them as bind parameters.
 * Uses America/New_York (auto-adjusts for EST/EDT).
 */
function getETDates() {
  const now = new Date();
  const todayET = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const daysAgo = (n) => {
    const d = new Date(now.getTime() - n * 86400000);
    return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  };
  // ET offset in hours (negative for behind UTC): e.g. -5 for EST, -4 for EDT
  const etOffsetHours = (() => {
    const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC', hour12: false });
    const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false });
    return (new Date(etStr).getTime() - new Date(utcStr).getTime()) / 3600000;
  })();
  const offsetSql = `${etOffsetHours} hours`; // e.g. "-5 hours"
  return { todayET, daysAgo, offsetSql };
}

function getFetcherStatus(lastRunStr, cooldown, etHour) {
  if (!lastRunStr) return { status: 'red', label: 'Never' };
  const d = new Date(lastRunStr.includes('T') ? lastRunStr : lastRunStr.replace(' ', 'T') + 'Z');
  const elapsed = (Date.now() - d.getTime()) / 60000;

  // Sleeping — cooldown is null means the fetcher is off by design
  if (cooldown === null) {
    return { status: 'sleep', label: adminTimestamp(lastRunStr) };
  }

  if (elapsed > cooldown * 4) return { status: 'red', label: adminTimestamp(lastRunStr) };
  if (elapsed > cooldown * 2) return { status: 'amber', label: adminTimestamp(lastRunStr) };
  return { status: 'green', label: adminTimestamp(lastRunStr) };
}

async function buildAdminDashboard(env) {
  // ── ET date calculations for queries ──
  const { todayET, daysAgo, offsetSql } = getETDates();

  // ── Parallel D1 queries ──
  const [
    fetcherRows, headlineTotal, headlinesToday, headlinesWeek, headlines24h,
    activeCases, casesWithDates, latestBriefing, csltStats, latestPipeline,
    untaggedHeadlines,
  ] = await Promise.all([
    env.DB.prepare('SELECT fetcher_name, last_run, last_error, last_error_at FROM fetcher_runs').all()
      .catch(() => env.DB.prepare('SELECT fetcher_name, last_run FROM fetcher_runs').all()),
    env.DB.prepare('SELECT COUNT(*) as cnt FROM headlines').first(),
    env.DB.prepare("SELECT COUNT(*) as cnt FROM headlines WHERE date(published_at, ?) = ?").bind(offsetSql, todayET).first(),
    env.DB.prepare("SELECT COUNT(*) as cnt FROM headlines WHERE published_at >= ?").bind(daysAgo(7)).first(),
    env.DB.prepare("SELECT COUNT(*) as cnt FROM headlines WHERE fetched_at >= datetime('now', '-24 hours')").first(),
    env.DB.prepare('SELECT COUNT(*) as cnt FROM cases WHERE is_active = 1').first(),
    env.DB.prepare("SELECT COUNT(*) as cnt FROM cases WHERE is_active = 1 AND upcoming_dates IS NOT NULL AND upcoming_dates != '[]'").first(),
    env.DB.prepare('SELECT date, generated_at FROM briefings ORDER BY date DESC LIMIT 1').first(),
    env.DB.prepare('SELECT COUNT(*) as cnt, MAX(month) as latest_month FROM cslt_key_dates').first(),
    env.DB.prepare('SELECT * FROM pipeline_runs ORDER BY id DESC LIMIT 1').first(),
    env.DB.prepare("SELECT COUNT(*) as cnt FROM headlines WHERE category IS NULL OR severity IS NULL").first(),
  ]);

  // ── Fetcher status ──
  const fetcherMap = {};
  for (const row of (fetcherRows?.results || [])) {
    fetcherMap[row.fetcher_name] = {
      last_run: row.last_run,
      last_error: row.last_error,
      last_error_at: row.last_error_at,
    };
  }

  const etHour = getETHour();
  const fetchers = Object.entries(FETCHER_CONFIG).map(([name, cfg]) => {
    const info = fetcherMap[name] || {};
    const lastRun = info.last_run || null;
    const cooldown = cfg.getCooldown(etHour);
    const { status, label } = getFetcherStatus(lastRun, cooldown, etHour);
    const inSkip = cooldown === null;
    return { name, cooldown, lastRun, status, label, inSkip, lastError: info.last_error, lastErrorAt: info.last_error_at };
  });

  // ── Issue detection ──
  const issues = [];
  const now = new Date();
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

  for (const f of fetchers) {
    if (!f.lastRun) {
      issues.push({ level: 'red', text: `${f.name} has never run` });
    } else if (!f.inSkip) {
      // Only flag overdue issues when outside the skip window
      const d = new Date(f.lastRun.includes('T') ? f.lastRun : f.lastRun.replace(' ', 'T') + 'Z');
      const hrs = (now - d) / 3600000;
      const mins = Math.round((now - d) / 60000);
      const elapsed = mins > 60 ? Math.round(mins / 60) + 'h' : mins + 'm';
      if (hrs > 24) {
        issues.push({ level: 'red', text: `${f.name} hasn't run in ${Math.round(hrs)} hours (last: ${adminTimestamp(f.lastRun)})` });
      } else if (f.status === 'red') {
        issues.push({ level: 'red', text: `${f.name} is overdue — last ran ${elapsed} ago (expected every ${adminCooldown(f.cooldown)})` });
      } else if (f.status === 'amber') {
        issues.push({ level: 'amber', text: `${f.name} is overdue — last ran ${elapsed} ago (expected every ${adminCooldown(f.cooldown)})` });
      }
    }
  }

  if ((headlines24h?.cnt || 0) === 0) {
    issues.push({ level: 'red', text: '0 headlines fetched in the last 24 hours' });
  }

  if (etHour >= 7 && (!latestBriefing || latestBriefing.date !== todayStr)) {
    issues.push({ level: 'red', text: `No briefing generated today (last: ${latestBriefing?.date || 'none'})` });
  }

  const hasRed = issues.some(i => i.level === 'red');
  const hasAmber = issues.some(i => i.level === 'amber');
  const overallStatus = hasRed ? 'red' : hasAmber ? 'amber' : 'green';
  const overallIcon = hasRed ? '&#x1F534;' : hasAmber ? '&#x1F7E1;' : '&#x1F7E2;';
  const overallMsg = hasRed
    ? `PROBLEMS DETECTED — ${issues.filter(i => i.level === 'red').length} critical issue(s)`
    : hasAmber
    ? `DEGRADED — ${issues.filter(i => i.level === 'amber').length} warning(s)`
    : 'ALL SYSTEMS OPERATIONAL';

  // ── Pipeline stats ──
  const pipe = latestPipeline || {};

  // ── Build HTML ──
  const statusDot = (s) => `<span class="dot ${s}"></span>`;

  const issuesHtml = issues.length > 0
    ? `<div class="section"><h2>Issues</h2>${issues.map(i =>
        `<div class="issue">${statusDot(i.level)} ${escHtml(i.text)}</div>`
      ).join('')}</div>`
    : '';

  const fetcherRowsHtml = fetchers.map(f => {
    const freq = f.inSkip ? '<span style="color:#475569">sleeping</span>' : adminCooldown(f.cooldown);
    const errHtml = f.lastError
      ? `<br><span style="color:#ef4444;font-size:11px" title="${escHtml(f.lastError)}">err ${adminTimestamp(f.lastErrorAt)}: ${escHtml(f.lastError.slice(0, 60))}</span>`
      : '';
    return `<tr><td>${statusDot(f.status)}</td><td>${f.name}${errHtml}</td><td>${f.label}</td><td>${freq}</td></tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="60">
<title>NIL Monitor — Admin</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0f1729;color:#e2e8f0;font-family:'JetBrains Mono','SF Mono','Fira Code',monospace;font-size:13px;padding:20px 24px;max-width:960px;margin:0 auto}
h1{font-size:15px;font-weight:600;color:#64748b;margin-bottom:14px;letter-spacing:1px;text-transform:uppercase}
h2{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#475569;margin:0 0 8px;padding-bottom:4px;border-bottom:1px solid #1e293b}
.section{margin-bottom:20px}
.banner{padding:12px 16px;border-radius:6px;font-weight:700;font-size:14px;margin-bottom:18px;display:flex;align-items:center;gap:10px}
.banner.green{background:rgba(16,185,129,.12);border:1px solid #10b981;color:#10b981}
.banner.amber{background:rgba(245,158,11,.12);border:1px solid #f59e0b;color:#f59e0b}
.banner.red{background:rgba(239,68,68,.12);border:1px solid #ef4444;color:#ef4444}
.dot{width:8px;height:8px;border-radius:50%;display:inline-block;flex-shrink:0}
.dot.green{background:#10b981}
.dot.amber{background:#f59e0b}
.dot.red{background:#ef4444}
.dot.sleep{background:#475569}
.issue{padding:5px 0;display:flex;align-items:center;gap:8px;font-size:12px;color:#e2e8f0}
table{width:100%;border-collapse:collapse}
th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#475569;padding:4px 8px;border-bottom:1px solid #1e293b}
td{padding:5px 8px;border-bottom:1px solid rgba(30,41,59,.4);font-size:12px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}
.card{background:#1e293b;border-radius:6px;padding:10px 12px}
.card .label{font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:.5px}
.card .value{font-size:22px;font-weight:700;margin-top:2px}
.card .sub{font-size:11px;color:#64748b;margin-top:2px}
.triggers{display:flex;gap:8px;flex-wrap:wrap}
.btn{background:#1e293b;border:1px solid #334155;color:#e2e8f0;padding:8px 16px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:12px;transition:all .15s}
.btn:hover{border-color:#3b82f6;color:#3b82f6}
.btn:disabled{opacity:.4;cursor:wait}
#trigger-result{font-size:11px;color:#94a3b8;margin-top:8px;white-space:pre-wrap;max-height:200px;overflow-y:auto}
footer{font-size:11px;color:#334155;border-top:1px solid #1e293b;padding-top:10px;margin-top:20px}
</style>
</head>
<body>
<h1>NIL Monitor — Admin</h1>

<div class="banner ${overallStatus}">
  ${overallIcon} ${overallMsg}
</div>

${issuesHtml}

<div class="section">
<h2>Fetchers</h2>
<table>
<tr><th></th><th>Fetcher</th><th>Last Run (ET)</th><th>Freq</th></tr>
${fetcherRowsHtml}
</table>
</div>

<div class="section">
<h2>Content Pulse</h2>
<div class="grid">
  <div class="card">
    <div class="label">Headlines</div>
    <div class="value">${headlineTotal?.cnt || 0}</div>
    <div class="sub">${headlinesToday?.cnt || 0} today &middot; ${headlinesWeek?.cnt || 0} this week</div>
  </div>
  <div class="card">
    <div class="label">Active Cases</div>
    <div class="value">${activeCases?.cnt || 0}</div>
    <div class="sub">${casesWithDates?.cnt || 0} with upcoming dates</div>
  </div>
  <div class="card">
    <div class="label">Latest Briefing</div>
    <div class="value">${latestBriefing?.date || 'None'}</div>
    <div class="sub">${latestBriefing?.generated_at ? adminTimestamp(latestBriefing.generated_at) : 'No briefings yet'}</div>
  </div>
  <div class="card">
    <div class="label">Key Dates</div>
    <div class="value">${csltStats?.cnt || 0}</div>
    <div class="sub">${csltStats?.latest_month || 'None'}</div>
  </div>
</div>
</div>

<div class="section">
<h2>AI Pipeline (Last Run)</h2>
${latestPipeline ? `<div class="grid">
  <div class="card"><div class="label">Ran At</div><div class="value" style="font-size:14px">${adminTimestamp(pipe.ran_at)}</div></div>
  <div class="card"><div class="label">AI Tagged (Last Run)</div><div class="value">${pipe.headlines_tagged}</div><div class="sub">${untaggedHeadlines?.cnt || 0} awaiting tagging</div></div>
  <div class="card"><div class="label">CSC Items</div><div class="value">${pipe.csc_items_created}</div></div>
  <div class="card"><div class="label">Briefing</div><div class="value">${pipe.briefing_generated ? 'Yes' : 'No'}</div></div>
</div>` : '<div style="color:#475569">No pipeline runs recorded.</div>'}
</div>

<div class="section">
<h2>Manual Triggers</h2>
<div class="triggers">
  <button class="btn" onclick="trigger('fetch')">Run Fetchers</button>
  <button class="btn" onclick="trigger('tag')">Tag Headlines</button>
  <button class="btn" onclick="trigger('ai')">Run AI Pipeline</button>
  <button class="btn" onclick="trigger('all')">Run All</button>
</div>
<div id="trigger-result"></div>
</div>

<footer>
  Page generated: ${adminTimestamp(now.toISOString())} ET &middot; Auto-refreshes every 60s &middot; nil-monitor-db (D1)
</footer>

<script>
async function trigger(phase) {
  const btns = document.querySelectorAll('.btn');
  btns.forEach(b => b.disabled = true);
  const el = document.getElementById('trigger-result');
  el.textContent = 'Running ' + phase + '...';
  try {
    const r = await fetch('/api/trigger?phase=' + phase);
    const d = await r.json();
    el.textContent = d.log ? d.log.join('\\n') : JSON.stringify(d, null, 2);
  } catch (e) {
    el.textContent = 'Error: ' + e.message;
  } finally {
    btns.forEach(b => b.disabled = false);
  }
}
</script>
</body>
</html>`;
}

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function getEarliestUpcoming(upcomingJson) {
  if (!upcomingJson) return null;
  try {
    const dates = JSON.parse(upcomingJson);
    const now = new Date();
    const future = dates
      .filter(d => d.date && new Date(d.date) >= now)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    return future.length > 0 ? future[0].date : null;
  } catch {
    return null;
  }
}

export async function handleApi(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: PUBLIC_CORS });
  }

  const url = new URL(request.url);
  const path = url.pathname;

  try {
    // Cases
    if (path === '/api/cases') {
      const group = url.searchParams.get('group');
      const active = url.searchParams.get('active');
      let query = 'SELECT * FROM cases';
      const conditions = [];
      const params = [];
      if (group && group !== 'All') {
        conditions.push('case_group = ?');
        params.push(group);
      }
      if (active !== '0') {
        conditions.push('is_active = 1');
      }
      if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
      const { results } = await env.DB.prepare(query).bind(...params).all();
      // Sort: soonest upcoming date first, then last_event_date DESC
      results.sort((a, b) => {
        const aNext = getEarliestUpcoming(a.upcoming_dates);
        const bNext = getEarliestUpcoming(b.upcoming_dates);
        if (aNext && bNext) return new Date(aNext) - new Date(bNext);
        if (aNext) return -1;
        if (bNext) return 1;
        const aLast = a.last_event_date ? new Date(a.last_event_date) : null;
        const bLast = b.last_event_date ? new Date(b.last_event_date) : null;
        if (aLast && bLast) return bLast - aLast;
        if (aLast) return -1;
        if (bLast) return 1;
        return 0;
      });
      return json(results);
    }

    if (path.match(/^\/api\/cases\/\d+$/)) {
      const id = path.split('/').pop();
      const row = await env.DB.prepare('SELECT * FROM cases WHERE id = ?').bind(id).first();
      if (!row) return json({ error: 'Not found' }, 404);
      return json(row);
    }

    // Case Updates (latest 15)
    if (path === '/api/cases/updates') {
      const { results } = await env.DB.prepare(
        'SELECT * FROM case_updates ORDER BY fetched_at DESC LIMIT 15'
      ).all();
      return json(results);
    }

    // Case Updates (legacy, 50 items)
    if (path === '/api/case-updates') {
      const { results } = await env.DB.prepare(
        'SELECT * FROM case_updates ORDER BY fetched_at DESC LIMIT 50'
      ).all();
      return json(results);
    }

    // Headlines
    if (path === '/api/headlines') {
      const cat = url.searchParams.get('cat');
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '50') || 50, 200);
      let query = "SELECT * FROM headlines WHERE (category IS NULL OR category != 'Off-Topic') ORDER BY published_at DESC LIMIT ?";
      const params = [limit];
      if (cat && cat !== 'All') {
        query = "SELECT * FROM headlines WHERE category = ? ORDER BY published_at DESC LIMIT ?";
        params.unshift(cat);
      }
      const { results } = await env.DB.prepare(query).bind(...params).all();
      return json(results);
    }

    // Deadlines
    if (path === '/api/deadlines') {
      const { todayET } = getETDates();
      const { results } = await env.DB.prepare(
        "SELECT * FROM deadlines WHERE date >= ? ORDER BY date ASC"
      ).bind(todayET).all();
      return json(results);
    }

    // House Settlement
    if (path === '/api/house') {
      const { results } = await env.DB.prepare('SELECT key, value FROM house_settlement').all();
      const obj = {};
      for (const row of results) obj[row.key] = row.value;
      return json(obj);
    }

    // Briefing
    if (path === '/api/briefing') {
      const row = await env.DB.prepare(
        'SELECT * FROM briefings ORDER BY date DESC LIMIT 1'
      ).first();
      // Safety net: fix missing spaces from stored briefings with stripped Unicode
      if (row?.content) {
        try {
          const sections = JSON.parse(row.content).map(s => {
            const cleaned = {};
            for (const [k, v] of Object.entries(s)) {
              if (k === 'url') {
                cleaned[k] = typeof v === 'string' ? v.replace(/\s/g, '') : v;
              } else {
                cleaned[k] = typeof v === 'string'
                  ? v.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\s{2,}/g, ' ')
                  : v;
              }
            }
            return cleaned;
          });
          row.content = JSON.stringify(sections);
        } catch {}
      }
      return json(row || { date: null, content: null });
    }

    // Headline counts per day (for news volume chart)
    if (path === '/api/headline-counts') {
      const { daysAgo, offsetSql } = getETDates();
      const { results } = await env.DB.prepare(
        `SELECT date(published_at, ?) as day, COUNT(*) as count
         FROM headlines
         WHERE published_at >= ?
         GROUP BY date(published_at, ?)
         ORDER BY day ASC`
      ).bind(offsetSql, daysAgo(30), offsetSql).all();
      return json(results);
    }

    // Last pipeline run time
    if (path === '/api/last-run') {
      const row = await env.DB.prepare(
        'SELECT ran_at FROM pipeline_runs ORDER BY id DESC LIMIT 1'
      ).first();
      return json({ ran_at: row?.ran_at || null });
    }

    // CSLT Key Dates (curated monthly litigation dates)
    if (path === '/api/cslt-key-dates') {
      const { results } = await env.DB.prepare(
        'SELECT * FROM cslt_key_dates ORDER BY date ASC'
      ).all();
      return json(results);
    }

    // CSC Activity
    if (path === '/api/csc') {
      const { results } = await env.DB.prepare(
        'SELECT * FROM csc_activity ORDER BY activity_time DESC LIMIT 20'
      ).all();
      return json(results);
    }


    // Podcast freshness (for NEW badges on sidebar)
    if (path === '/api/podcasts') {
      const { results } = await env.DB.prepare(
        'SELECT spotify_id, latest_date FROM podcast_episodes'
      ).all();
      return json(results);
    }

    // Portal Pulse (CFBD transfer portal aggregate)
    // NOTE: CFBD is football-only. Basketball portal data would require a different source.
    if (path === '/api/portal-pulse') {
      const now = new Date();
      const month = parseInt(now.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'numeric' }));
      const day = parseInt(now.toLocaleString('en-US', { timeZone: 'America/New_York', day: 'numeric' }));

      const snapshot = await env.DB.prepare(
        'SELECT * FROM portal_snapshot ORDER BY snapshot_date DESC LIMIT 1'
      ).first();

      const preseasonRow = await env.DB.prepare(
        `SELECT * FROM preseason_intel WHERE year = ? ORDER BY updated_at DESC LIMIT 1`
      ).bind(now.getFullYear()).first();

      if (!snapshot) {
        return json({ mode: 'summary', snapshot: null, preseason: null });
      }

      // Parse JSON fields
      const parsed = { ...snapshot };
      try { parsed.top_gainers = JSON.parse(snapshot.top_gainers || '[]'); } catch { parsed.top_gainers = []; }
      try { parsed.top_losers = JSON.parse(snapshot.top_losers || '[]'); } catch { parsed.top_losers = []; }
      try { parsed.most_active = JSON.parse(snapshot.most_active || '[]'); } catch { parsed.most_active = []; }
      try { parsed.position_availability = JSON.parse(snapshot.position_availability || '[]'); } catch { parsed.position_availability = []; }
      // Legacy fields — no longer written, return null
      parsed.coaching_fallout = null;
      parsed.prior_year_total = null;

      // Mode determination
      // Football portal window: Jan 2–16 main + Jan 20–24 CFP grace period
      const isPortalWindow = (month === 1 && day >= 2 && day <= 24);
      const mode = (isPortalWindow || (parsed.entries_7d || 0) > 20)
        ? 'live'
        : (month >= 8 && (month <= 11 || (month === 12 && day <= 7)) && preseasonRow)
          ? 'preseason'
          : 'summary';

      let preseason = null;
      if (mode === 'preseason' && preseasonRow) {
        preseason = { year: preseasonRow.year };
        try { preseason.returning_production = JSON.parse(preseasonRow.returning_production || '{}'); } catch { preseason.returning_production = {}; }
        try { preseason.recruiting_rankings = JSON.parse(preseasonRow.recruiting_rankings || '[]'); } catch { preseason.recruiting_rankings = []; }
      }

      return json({ mode, snapshot: parsed, preseason });
    }

    // Preseason Intel (direct access)
    if (path === '/api/preseason-intel') {
      const row = await env.DB.prepare(
        'SELECT * FROM preseason_intel ORDER BY updated_at DESC LIMIT 1'
      ).first();
      if (!row) return json(null);
      const result = { year: row.year };
      try { result.returning_production = JSON.parse(row.returning_production || '{}'); } catch { result.returning_production = {}; }
      try { result.recruiting_rankings = JSON.parse(row.recruiting_rankings || '[]'); } catch { result.recruiting_rankings = []; }
      return json(result);
    }

    // Private equity tracker
    if (path === '/api/pe-tracker') {
      const { results } = await env.DB.prepare(
        'SELECT * FROM pe_deals ORDER BY announced_date DESC'
      ).all();
      return json(results);
    }

    // Admin login handler
    if (path === '/api/admin-login' && request.method === 'POST') {
      const form = await request.formData();
      const password = form.get('password');
      if (env.ADMIN_KEY && password === env.ADMIN_KEY) {
        const token = await deriveAdminToken(env.ADMIN_KEY);
        return new Response(null, {
          status: 302,
          headers: {
            'Location': '/api/admin',
            'Set-Cookie': `admin_token=${token}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`,
          },
        });
      }
      return new Response(null, {
        status: 302,
        headers: { 'Location': '/api/admin?error=1' },
      });
    }

    // Manual trigger for scheduled tasks (dev/admin use)
    if (path === '/api/trigger') {
      const triggerAuth = await checkAdminAuth(request, env);
      if (!triggerAuth) return json({ error: 'Unauthorized' }, 401, ADMIN_CORS);
      const { loadDedupCache, clearDedupCache } = await import('./fetcher-utils.js');
      const { fetchGoogleNews } = await import('./fetch-google-news.js');
      const { fetchBingNews } = await import('./fetch-bing-news.js');
      const { fetchNCAANews } = await import('./fetch-ncaa-rss.js');
      const { fetchNewsData } = await import('./fetch-newsdata.js');
      const { fetchCourtListener } = await import('./fetch-courtlistener.js');
      const { fetchNILRevolution } = await import('./fetch-nil-revolution.js');
      const { fetchPublications } = await import('./fetch-publications.js');
      const { fetchCSLT, fetchCSLTKeyDates } = await import('./fetch-cslt.js');
      const { fetchPodcasts } = await import('./fetch-podcasts.js');
      const { fetchCFBD } = await import('./fetch-cfbd.js');
      const { runAIPipeline } = await import('./ai-pipeline.js');

      const phase = url.searchParams.get('phase') || 'fetch';

      const log = [];
      try {
        if (phase === 'fetch' || phase === 'all') {
          await loadDedupCache(env.DB);
          await Promise.all([
            fetchGoogleNews(env, { force: true }).then(() => log.push('google-news: ok')).catch(e => log.push(`google-news: ${e.message}`)),
            fetchBingNews(env, { force: true }).then(() => log.push('bing-news: ok')).catch(e => log.push(`bing-news: ${e.message}`)),
            fetchNCAANews(env).then(() => log.push('ncaa-rss: ok')).catch(e => log.push(`ncaa-rss: ${e.message}`)),
            fetchNewsData(env).then(() => log.push('newsdata: ok')).catch(e => log.push(`newsdata: ${e.message}`)),
            fetchCourtListener(env).then(() => log.push('courtlistener: ok')).catch(e => log.push(`courtlistener: ${e.message}`)),
            fetchNILRevolution(env).then(() => log.push('nil-revolution: ok')).catch(e => log.push(`nil-revolution: ${e.message}`)),
            fetchPublications(env, { force: true }).then(() => log.push('publications: ok')).catch(e => log.push(`publications: ${e.message}`)),
            fetchCSLT(env, { force: true }).then(() => log.push('cslt: ok')).catch(e => log.push(`cslt: ${e.message}`)),
            fetchCSLTKeyDates(env, { force: true }).then(() => log.push('cslt-keydates: ok')).catch(e => log.push(`cslt-keydates: ${e.message}`)),
            fetchPodcasts(env, { force: true }).then(() => log.push('podcasts: ok')).catch(e => log.push(`podcasts: ${e.message}`)),
            fetchCFBD(env, { force: true }).then(() => log.push('cfbd: ok')).catch(e => log.push(`cfbd: ${e.message}`)),
          ]);
          clearDedupCache();
        }
        if (phase === 'tag') {
          const { tagHeadlines } = await import('./ai-pipeline.js');
          log.push(`anthropic-key: ${env.ANTHROPIC_KEY ? 'set' : 'missing'}`);
          const tagged = await tagHeadlines(env, env.DB);
          await env.DB.prepare(
            `INSERT INTO pipeline_runs (items_processed, headlines_tagged, deadlines_created, csc_items_created, briefing_generated)
             VALUES (0, ?, 0, 0, 0)`
          ).bind(tagged).run();
          log.push(`tagged: ${tagged} headlines`);
        }
        if (phase === 'ai' || phase === 'all') {
          log.push(`anthropic-key: ${env.ANTHROPIC_KEY ? 'set' : 'missing'}`);
          const etH = parseInt(new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }), 10);
          const isAfternoon = etH >= 12;
          await runAIPipeline(env, { includeBriefing: true, isAfternoon });
          log.push('ai-pipeline: ok');
        }
        if (phase === 'fix-briefing-date') {
          // One-time: delete briefings with future dates (UTC/ET mismatch artifact)
          const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
          const del = await env.DB.prepare('DELETE FROM briefings WHERE date > ?').bind(todayET).run();
          log.push(`deleted ${del.meta?.changes || 0} future-dated briefings (today ET: ${todayET})`);
        }
        if (phase === 'seed-pe') {
          await env.DB.prepare(`CREATE TABLE IF NOT EXISTS pe_deals (
            id INTEGER PRIMARY KEY AUTOINCREMENT, investor TEXT NOT NULL, target TEXT NOT NULL,
            conference TEXT, amount TEXT, announced_date TEXT, status TEXT DEFAULT 'closed',
            terms_summary TEXT, source_url TEXT,
            created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
          )`).run();
          const deals = [
            ['Otro Capital','University of Utah','Big 12','~$500M','2025-12','announced','Minority equity stake in new "Utah Brands & Entertainment LLC." University retains majority ownership. Exit clause after 5-7 years. First-ever PE deal with a college athletic department.','https://www.espn.com/college-sports/story/_/id/47267088/utah-private-equity-college-sports-otro-capital'],
            ['CAS (RedBird + Weatherford)','Big 12 Conference','Big 12','Up to $500M','2025-12','pending','No equity stake sold. $25M into "Big 12 Properties" entity. Each of 16 schools gets optional ~$30M credit line. Schools retain 100% ownership.','https://www.sportico.com/business/finance/2025/big-12-cas-redbird-private-equity-deal-500-million-1234879052/'],
            ['CVC Capital Partners','Big 12 Conference','Big 12','$800M-$1B proposed','2024-06','dead','Proposed 15-20% equity stake in the conference. Commissioner Yormark said Big 12 "not ready." Talks ended May 2025.','https://www.cbssports.com/college-football/news/big-12-considering-private-equity-investment-of-up-to-1-billion-for-as-much-as-20-of-conference/'],
            ['UC Investments','Big Ten Conference','Big Ten','$2.4B for 10% stake','2025-10','on_hold','10% equity in new "Big Ten Enterprises" spinoff. Grant of rights extended to 2046. Paused after Michigan and USC boards opposed.','https://www.espn.com/college-sports/story/_/id/47003108/opposition-michigan-usc-pauses-24b-big-ten-deal'],
            ['Sixth Street','Florida State','ACC','~$250M proposed','2022-01','dead','"Project Osceola" — NewCo for Seminoles commercial rights. Fell apart late 2023 due to ACC exit lawsuit and House v. NCAA uncertainty.','https://www.sportico.com/business/finance/2024/florida-state-sixth-street-private-equity-talks-over-1234819808/'],
            ['Arctos Partners','Florida State','ACC','~$75M proposed','2022-06','dead','Reviewed term sheets during Project Osceola alongside Sixth Street. $75M initial purchase. Did not advance.','https://www.sportico.com/leagues/college-sports/2024/fsu-project-osceola-private-equity-jp-morgan-1234764861/'],
            ['Elevate / Velocity / Texas PSF','Multiple schools','Multi','$500M fund','2025-06','announced','Private credit (not equity). No ownership stake. Schools borrow upfront, repay over time. Claims 2 undisclosed Power 4 deals closed.','https://www.cnbc.com/2025/06/09/elevate-launches-500-million-college-sports-investment.html'],
            ['TBD (BAGS Initiative)','Boise State','Pac-12','Not disclosed','2025-06','exploring','"Bronco Athletics Growth Solutions" — exploring private credit, mixed-use development, stadium expansion. No PE firm announced.','https://frontofficesports.com/boise-state-expects-private-equity-investment-within-the-next-six-months/'],
            ['Clearlake / Charlesbank / Fortress','Learfield (~200 schools)','Multi','$150M equity + $600M debt reduction','2023-09','closed','Became majority owners of Learfield via equity injection and debt forgiveness. Learfield manages multimedia rights for ~200 schools.','https://www.learfield.com/2023/09/learfield-announces-closing-of-recapitalization-transaction-and-equity-investment-positioning-the-company-for-continued-growth/'],
            ['KKR','Arctos Partners (acquisition)','N/A','$1.4B + up to $550M','2026-01','announced','KKR acquiring Arctos ($15B AUM, pro sports stakes). Not in college athletics yet but Arctos reviewed FSU term sheets. Positions KKR/Arctos as potential entrant.','https://www.sportico.com/business/finance/2026/kkr-buys-arctos-price-sports-secondaries-1234883498/'],
          ];
          let inserted = 0;
          for (const d of deals) {
            try {
              await env.DB.prepare('INSERT OR IGNORE INTO pe_deals (investor,target,conference,amount,announced_date,status,terms_summary,source_url) VALUES (?,?,?,?,?,?,?,?)').bind(...d).run();
              inserted++;
            } catch {}
          }
          log.push(`pe-deals: inserted ${inserted} deals`);
        }
        if (phase === 'test-feeds') {
          const testUrls = [
            'https://www.nytimes.com/athletic/rss/college-football/',
            'https://www.nytimes.com/athletic/rss/college-sports/',
            'https://www.cbssports.com/rss/headlines/college-football/',
            'https://www.espn.com/espn/rss/ncf/news',
            'https://www.on3.com/feed/',
          ];
          for (const u of testUrls) {
            try {
              const r = await fetch(u, { headers: { 'User-Agent': 'NILMonitor/1.0 (RSS Reader)' } });
              const body = await r.text();
              const itemCount = (body.match(/<item>/g) || []).length;
              log.push(`${new URL(u).hostname}: ${r.status} (${itemCount} items, ${body.length} bytes)`);
            } catch (e) {
              log.push(`${new URL(u).hostname}: ERROR ${e.message}`);
            }
          }
        }
        if (phase === 'delete-stale-deadline') {
          const del = await env.DB.prepare("DELETE FROM deadlines WHERE text LIKE '%Spring transfer portal window closes%'").run();
          log.push(`deleted ${del.meta?.changes || 0} stale deadline rows`);
        }
        if (phase === 'fix-tags') {
          const fixes = [
            [92586, 'Business / Finance', 'important'],
            [91548, 'Business / Finance', 'routine'],
            [91861, 'Business / Finance', 'routine'],
            [90605, 'Business / Finance', 'routine'],
            [89666, 'Business / Finance', 'routine'],
            [89504, 'Business / Finance', 'routine'],
          ];
          for (const [id, cat, sev] of fixes) {
            await env.DB.prepare('UPDATE headlines SET category = ?, severity = ? WHERE id = ?').bind(cat, sev, id).run();
            log.push(`fixed id ${id} → ${cat}`);
          }
        }
        if (phase === 'retag') {
          const cleared = await env.DB.prepare('UPDATE headlines SET category = NULL, severity = NULL, sub_category = NULL').run();
          log.push(`cleared tags: ${cleared.meta?.changes || '?'} rows`);
          log.push(`anthropic-key: ${env.ANTHROPIC_KEY ? 'set' : 'missing'}`);
          await runAIPipeline(env, { includeBriefing: false, isAfternoon: false });
          log.push('retag-pass-1: ok (200 headlines)');
        }
      } catch (e) {
        log.push(`error: ${e.message}`);
      }

      return json({ ok: true, phase, log }, 200, ADMIN_CORS);
    }

    // Admin status dashboard (HTML)
    if (path === '/api/admin') {
      const auth = await checkAdminAuth(request, env);
      if (!auth) return adminLoginPage();
      const html = await buildAdminDashboard(env);
      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', ...ADMIN_CORS } });
    }

    // ── SEO Pages ─────────────────────────────────────────────────

    // News pages: /news, /news/:category, /briefing, /briefing/:date, /feed.xml, /sitemap.xml
    if (path === '/news' || path.startsWith('/news/') || path === '/briefing' || path.startsWith('/briefing/') || path === '/feed.xml' || path === '/sitemap.xml') {
      return handleSeoPages(path, url, env);
    }

    return json({ error: 'Not found' }, 404);
  } catch (err) {
    console.error('API error:', err);
    return json({ error: err.message }, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════
//  SEO Pages — Server-rendered HTML for crawlers
// ═══════════════════════════════════════════════════════════════════

const CATEGORY_PAGES = {
  legislation:     { dbCat: 'Legislation',        h1: 'NIL Legislation News',          title: 'NIL Legislation Tracker — State & Federal College Athlete Bills | NIL Monitor', description: 'Track every state and federal NIL bill affecting college athletics. Live updates from 50 state legislatures and Congress.', footer: 'NIL Monitor tracks state and federal NIL legislation affecting college athletics, including bill introductions, committee hearings, floor votes, and governor actions across all 50 states.' },
  litigation:      { dbCat: 'Litigation',          h1: 'NCAA Litigation News',           title: 'NCAA Litigation Tracker — Active College Sports Lawsuits | NIL Monitor', description: 'Track active NCAA lawsuits, eligibility injunctions, and college athletics litigation. Court dates, filings, and case summaries updated daily.', footer: 'NIL Monitor tracks active NCAA litigation including antitrust cases, eligibility injunctions, House v NCAA settlement proceedings, and college athletics lawsuits with court dates and filing summaries.' },
  governance:      { dbCat: 'NCAA Governance',     h1: 'NCAA Governance News',           title: 'NCAA Governance News — Rule Changes & Board Decisions | NIL Monitor', description: 'Track NCAA governance decisions, rule changes, board actions, and Division I policy updates affecting college athletics.', footer: 'NIL Monitor tracks NCAA governance decisions, Division I board actions, rule changes, convention votes, and policy updates affecting college athletics administration.' },
  csc:             { dbCat: 'CSC / Enforcement',   h1: 'College Sports Commission News', title: 'College Sports Commission News — CSC Enforcement & NIL Go | NIL Monitor', description: 'Track College Sports Commission enforcement actions, NIL Go clearinghouse updates, investigations, and compliance guidance.', footer: 'NIL Monitor tracks College Sports Commission enforcement actions, NIL Go clearinghouse operations, compliance investigations, guidance documents, and personnel updates.' },
  'revenue-sharing': { dbCat: 'Revenue Sharing',   h1: 'Revenue Sharing News',           title: 'College Athletics Revenue Sharing News — House Settlement & NIL | NIL Monitor', description: 'Track revenue sharing implementation, House v NCAA settlement updates, participation agreements, and athlete compensation developments.', footer: 'NIL Monitor tracks revenue sharing implementation in college athletics including House v NCAA settlement updates, participation agreements, institutional budgets, and athlete compensation developments.' },
  portal:          { dbCat: 'Roster / Portal',     h1: 'Transfer Portal News',           title: 'Transfer Portal Rules & Policy News | NIL Monitor', description: 'Track NCAA transfer portal policy changes, window dates, tampering enforcement, and eligibility rules affecting college athletes.', footer: 'NIL Monitor tracks NCAA transfer portal policy changes, window dates, tampering investigations, eligibility rules, and roster management developments in college athletics.' },
  business:        { dbCat: 'Business / Finance',  h1: 'College Athletics Business News', title: 'College Athletics Business News — AD Hires, Budgets & Deals | NIL Monitor', description: 'Track athletic department business news including AD hires, facility deals, sponsorships, fundraising, coaching contracts, and budget developments.', footer: 'NIL Monitor tracks college athletics business developments including AD hires, facility investments, media rights, sponsorship deals, fundraising, coaching contracts, and departmental budgets.' },
  realignment:     { dbCat: 'Realignment',         h1: 'Conference Realignment News',    title: 'Conference Realignment News — Media Rights & Expansion | NIL Monitor', description: 'Track conference realignment, media rights deals, expansion negotiations, and membership changes in college athletics.', footer: 'NIL Monitor tracks conference realignment in college athletics including media rights negotiations, expansion and contraction, membership changes, and scheduling implications.' },
};

const ALL_CAT_SLUGS = Object.keys(CATEGORY_PAGES);

// ── Shared CSS ──────────────────────────────────────────────────
const SEO_CSS = `*{margin:0;padding:0;box-sizing:border-box}
body{background:#f1f3f7;color:#0f1729;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.6;padding:0}
header{background:#0f1729;color:#e2e8f0;padding:16px 24px}
header .top{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}
header .logo{display:flex;align-items:center;gap:10px;text-decoration:none;color:#e2e8f0;font-weight:700;font-size:15px;font-family:'JetBrains Mono','SF Mono',monospace}
header .pill{background:#DC4A2D;color:#fff;padding:3px 10px;border-radius:5px;font-size:13px;font-weight:700;letter-spacing:.5px}
header a.dash{color:#94a3b8;font-size:13px;text-decoration:none}
header a.dash:hover{color:#e2e8f0}
nav{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:10px;padding-top:10px;border-top:1px solid #1e293b}
nav a{color:#64748b;font-size:12px;text-decoration:none;white-space:nowrap}
nav a:hover,nav a.active{color:#e2e8f0}
nav a.active{font-weight:600;border-bottom:2px solid #DC4A2D;padding-bottom:1px}
main{max-width:800px;margin:0 auto;padding:24px 20px}
h1{font-size:28px;font-weight:700;margin-bottom:4px}
h2{font-size:16px;font-weight:400;color:#3d4a5c;margin-bottom:20px}
.updated{font-size:12px;color:#7c8698;margin-bottom:20px}
ul{list-style:none}
li{padding:12px 0;border-bottom:1px solid #edf0f4;line-height:1.5}
li a{color:#0f1729;text-decoration:none;font-weight:500}
li a:hover{color:#DC4A2D}
.src{display:inline-block;background:#e8ebf0;color:#3d4a5c;font-size:11px;font-weight:600;padding:2px 6px;border-radius:3px;margin-right:6px;text-transform:uppercase;letter-spacing:.3px}
.cat{display:inline-block;background:#DC4A2D18;color:#DC4A2D;font-size:11px;font-weight:600;padding:2px 6px;border-radius:3px;margin-left:6px}
time{display:block;font-size:12px;color:#7c8698;margin-top:2px}
footer{max-width:800px;margin:32px auto 0;padding:20px 20px 40px;font-size:13px;color:#7c8698;line-height:1.7;border-top:1px solid #edf0f4}
footer a{color:#DC4A2D;text-decoration:none}
footer a:hover{text-decoration:underline}
.rss{font-size:13px;color:#DC4A2D;text-decoration:none;display:inline-flex;align-items:center;gap:4px}
.rss:hover{text-decoration:underline}
.briefing-section{padding:20px 0;border-bottom:1px solid #edf0f4}
.briefing-section:last-child{border-bottom:none}
.briefing-section h3{font-size:20px;font-weight:700;line-height:1.4;margin-bottom:8px}
.briefing-section h3 a{color:#0f1729;text-decoration:none}
.briefing-section h3 a:hover{color:#DC4A2D;text-decoration:underline}
.briefing-section p{font-size:15px;line-height:1.6;color:#3d4a5c}
.briefing-nav{display:flex;justify-content:space-between;margin-top:24px;padding-top:16px;border-top:1px solid #edf0f4;font-size:13px}
.briefing-nav a{color:#DC4A2D;text-decoration:none}
.briefing-nav a:hover{text-decoration:underline}
.msg-box{background:#fff;border:1px solid #edf0f4;border-radius:8px;padding:32px;text-align:center;margin:40px 0}
.msg-box h3{font-size:18px;margin-bottom:8px}
.msg-box p{color:#3d4a5c;margin-bottom:16px}
.msg-box a{color:#DC4A2D;text-decoration:none;font-weight:600}
.msg-box a:hover{text-decoration:underline}
.generated{font-size:12px;color:#7c8698;margin-top:16px}`;

// ── Shared nav bar ──────────────────────────────────────────────
function seoNav(activePath) {
  const links = [
    { href: 'https://nilmonitor.com', label: 'Dashboard' },
    { href: '/news', label: 'All News' },
    { href: '/news/legislation', label: 'Legislation' },
    { href: '/news/litigation', label: 'Litigation' },
    { href: '/news/governance', label: 'Governance' },
    { href: '/news/csc', label: 'CSC' },
    { href: '/news/revenue-sharing', label: 'Revenue Sharing' },
    { href: '/news/portal', label: 'Portal' },
    { href: '/news/business', label: 'Business' },
    { href: '/news/realignment', label: 'Realignment' },
    { href: '/briefing', label: 'Briefing' },
  ];
  return links.map(l =>
    `<a href="${l.href}"${l.href === activePath ? ' class="active"' : ''}>${l.label}</a>`
  ).join('');
}

// ── Shared page shell ───────────────────────────────────────────
function seoPage({ title, description, canonical, ogTitle, ogDesc, twitterDesc, structuredData, activePath, rssHref, headExtra, bodyContent, footerText }) {
  const rssLink = rssHref ? `<link rel="alternate" type="application/rss+xml" title="NIL Monitor Headlines" href="${rssHref}">` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(title)}</title>
<meta name="description" content="${escHtml(description)}">
<meta name="robots" content="index, follow">
<meta name="author" content="Matt Reinhart">
<meta name="theme-color" content="#0f1729">
<link rel="canonical" href="${escHtml(canonical)}">
${rssLink}
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<meta property="og:title" content="${escHtml(ogTitle || title)}">
<meta property="og:description" content="${escHtml(ogDesc || description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${escHtml(canonical)}">
<meta property="og:site_name" content="NIL Monitor">
<meta property="og:image" content="https://nilmonitor.com/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escHtml(ogTitle || title)}">
<meta name="twitter:description" content="${escHtml(twitterDesc || description)}">
<meta name="twitter:image" content="https://nilmonitor.com/og-image.png">
${structuredData ? `<script type="application/ld+json">\n${JSON.stringify(structuredData, null, 2)}\n</script>` : ''}
${headExtra || ''}
<style>${SEO_CSS}</style>
</head>
<body>
<header>
  <div class="top">
    <a href="https://nilmonitor.com" class="logo"><span class="pill">NIL</span> MONITOR</a>
    <a href="https://nilmonitor.com" class="dash">Full Dashboard &rarr;</a>
  </div>
  <nav>${seoNav(activePath)}</nav>
</header>
${bodyContent}
<footer>
  <p>${footerText} For the full regulatory intelligence dashboard including AI-generated briefings, litigation tracking, and state legislation maps, visit <a href="https://nilmonitor.com">nilmonitor.com</a>.</p>
</footer>
</body>
</html>`;
}

// ── Headline list HTML ──────────────────────────────────────────
function renderHeadlineList(results) {
  return results.map(h => {
    const ts = h.published_at ? new Date(h.published_at.includes('T') ? h.published_at : h.published_at.replace(' ', 'T') + 'Z') : null;
    const timeStr = ts && !isNaN(ts) ? ts.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : '';
    const cat = h.category ? `<span class="cat">${escHtml(h.category)}</span>` : '';
    const src = h.source ? `<span class="src">${escHtml(h.source)}</span>` : '';
    return `<li>${src} <a href="${escHtml(h.url || '#')}" rel="noopener">${escHtml(h.title)}</a> ${cat}<time>${timeStr}</time></li>`;
  }).join('\n');
}

function htmlResponse(html, status = 200) {
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function getETDateStr() {
  return new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'long', day: 'numeric' });
}

function getETDateISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

// ── SEO Route Handler ───────────────────────────────────────────
async function handleSeoPages(path, url, env) {
  const todayStr = getETDateStr();
  const todayISO = getETDateISO();

  // ── /news (all headlines) ──
  if (path === '/news') {
    const { results } = await env.DB.prepare(
      "SELECT title, url, source, category, published_at FROM headlines WHERE (category IS NULL OR category != 'Off-Topic') ORDER BY published_at DESC LIMIT 50"
    ).all();
    return htmlResponse(seoPage({
      title: 'NIL News — College Athletics NIL Headlines Today | NIL Monitor',
      description: 'Today\'s college athletics NIL headlines. Live-updated news on NIL legislation, NCAA litigation, revenue sharing, transfer portal, and college sports governance from 20+ sources.',
      canonical: 'https://nilmonitor.com/news',
      activePath: '/news',
      rssHref: '/feed.xml',
      structuredData: {
        '@context': 'https://schema.org', '@type': 'CollectionPage',
        name: 'NIL News — College Athletics Headlines', url: 'https://nilmonitor.com/news',
        description: 'Live-updated college athletics NIL headlines aggregated from 20+ sources including ESPN, The Athletic, Sportico, Yahoo Sports, CBS Sports, and Front Office Sports.',
        isPartOf: { '@type': 'WebSite', name: 'NIL Monitor', url: 'https://nilmonitor.com' },
        provider: { '@type': 'Person', name: 'Matt Reinhart' },
        about: { '@type': 'Thing', name: 'Name, Image, and Likeness (NIL) in College Athletics' },
      },
      bodyContent: `<main>
  <h1>NIL News</h1>
  <h2>Today's College Athletics Headlines</h2>
  <p class="updated">Updated ${escHtml(todayStr)} &middot; <a href="/feed.xml" class="rss">RSS Feed</a></p>
  <ul>\n${renderHeadlineList(results)}\n  </ul>
</main>`,
      footerText: 'NIL Monitor aggregates NIL news from 20+ sources including ESPN, The Athletic, Sportico, Yahoo Sports, CBS Sports, Front Office Sports, and more. Headlines are updated every 15 minutes.',
    }));
  }

  // ── /news/:category ──
  const catMatch = path.match(/^\/news\/([a-z-]+)$/);
  if (catMatch && CATEGORY_PAGES[catMatch[1]]) {
    const slug = catMatch[1];
    const cat = CATEGORY_PAGES[slug];
    const { results } = await env.DB.prepare(
      "SELECT title, url, source, category, published_at FROM headlines WHERE category = ? ORDER BY published_at DESC LIMIT 50"
    ).bind(cat.dbCat).all();
    const rssHref = `/feed.xml?category=${encodeURIComponent(cat.dbCat)}`;
    return htmlResponse(seoPage({
      title: cat.title,
      description: cat.description,
      canonical: `https://nilmonitor.com/news/${slug}`,
      activePath: `/news/${slug}`,
      rssHref,
      structuredData: {
        '@context': 'https://schema.org', '@type': 'CollectionPage',
        name: cat.h1, url: `https://nilmonitor.com/news/${slug}`,
        description: cat.description,
        isPartOf: { '@type': 'WebSite', name: 'NIL Monitor', url: 'https://nilmonitor.com' },
        provider: { '@type': 'Person', name: 'Matt Reinhart' },
      },
      bodyContent: `<main>
  <h1>${escHtml(cat.h1)}</h1>
  <h2>${escHtml(todayStr)}</h2>
  <p class="updated"><a href="/feed.xml?category=${encodeURIComponent(cat.dbCat)}" class="rss">RSS Feed</a></p>
  <ul>\n${renderHeadlineList(results)}\n  </ul>
${results.length === 0 ? '  <p style="color:#7c8698;padding:20px 0">No headlines in this category yet. Check back soon.</p>' : ''}
</main>`,
      footerText: cat.footer,
    }));
  }

  // ── /briefing (redirect to latest) ──
  if (path === '/briefing') {
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const row = await env.DB.prepare(
      'SELECT date FROM briefings WHERE date <= ? ORDER BY date DESC LIMIT 1'
    ).bind(yesterday).first();
    if (row?.date) {
      return Response.redirect(`https://nilmonitor.com/briefing/${row.date}`, 302);
    }
    return htmlResponse(seoPage({
      title: 'NIL Monitor Daily Briefing | College Athletics Intelligence',
      description: 'AI-generated daily briefings for college athletics decision-makers covering NIL, NCAA governance, litigation, and revenue sharing.',
      canonical: 'https://nilmonitor.com/briefing',
      activePath: '/briefing',
      structuredData: null,
      bodyContent: `<main>
  <h1>NIL Monitor Daily Briefing</h1>
  <div class="msg-box">
    <h3>No archived briefings available yet</h3>
    <p>Today's briefing is available on the live dashboard.</p>
    <a href="https://nilmonitor.com">Open Dashboard &rarr;</a>
  </div>
</main>`,
      footerText: 'NIL Monitor generates AI-powered daily briefings for athletic directors, compliance officers, and sports lawyers.',
    }));
  }

  // ── /briefing/:date ──
  const briefingMatch = path.match(/^\/briefing\/(\d{4}-\d{2}-\d{2})$/);
  if (briefingMatch) {
    const reqDate = briefingMatch[1];
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    // 24-hour delay: don't serve today's briefing
    if (reqDate > yesterday) {
      return htmlResponse(seoPage({
        title: 'NIL Monitor Daily Briefing | College Athletics Intelligence',
        description: 'AI-generated daily briefings for college athletics decision-makers covering NIL, NCAA governance, litigation, and revenue sharing.',
        canonical: 'https://nilmonitor.com/briefing',
        activePath: '/briefing',
        structuredData: null,
        bodyContent: `<main>
  <h1>NIL Monitor Daily Briefing</h1>
  <div class="msg-box">
    <h3>Today's briefing is available on the live dashboard</h3>
    <p>Archived briefings are available 24 hours after publication.</p>
    <a href="https://nilmonitor.com">Open Dashboard &rarr;</a>
  </div>
</main>`,
        footerText: 'NIL Monitor generates AI-powered daily briefings for athletic directors, compliance officers, and sports lawyers.',
      }));
    }

    const row = await env.DB.prepare(
      'SELECT date, content, generated_at FROM briefings WHERE date = ?'
    ).bind(reqDate).first();

    if (!row || !row.content) {
      // 404 — find latest available
      const latest = await env.DB.prepare(
        'SELECT date FROM briefings WHERE date <= ? ORDER BY date DESC LIMIT 1'
      ).bind(yesterday).first();
      const latestLink = latest?.date ? `<p style="margin-top:8px"><a href="/briefing/${latest.date}">Latest available: ${latest.date} &rarr;</a></p>` : '';
      return htmlResponse(seoPage({
        title: 'Briefing Not Found | NIL Monitor',
        description: 'No briefing found for this date.',
        canonical: 'https://nilmonitor.com/briefing',
        activePath: '/briefing',
        structuredData: null,
        bodyContent: `<main>
  <h1>NIL Monitor Daily Briefing</h1>
  <div class="msg-box">
    <h3>No briefing available for ${escHtml(reqDate)}</h3>
    <p>This date may not have a generated briefing.</p>
    ${latestLink}
  </div>
</main>`,
        footerText: 'NIL Monitor generates AI-powered daily briefings for athletic directors, compliance officers, and sports lawyers.',
      }), 404);
    }

    // Parse briefing content
    let sections = [];
    try { sections = JSON.parse(row.content); } catch {}
    const dateFormatted = new Date(reqDate + 'T12:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const genAt = row.generated_at ? new Date(row.generated_at.includes('T') ? row.generated_at : row.generated_at.replace(' ', 'T') + 'Z') : null;
    const genHour = genAt && !isNaN(genAt) ? parseInt(genAt.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false })) : null;
    const ampm = genHour !== null && genHour >= 12 ? 'PM News Brief' : 'AM News Brief';
    const genTimeStr = genAt && !isNaN(genAt) ? genAt.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : '';

    const firstHeadline = sections.length > 0 ? (sections[0].headline || '') : '';

    const sectionsHtml = sections.map(s => {
      const headlineTag = s.url
        ? `<h3><a href="${escHtml(s.url)}" rel="noopener">${escHtml(s.headline || '')}</a></h3>`
        : `<h3>${escHtml(s.headline || '')}</h3>`;
      return `<div class="briefing-section">${headlineTag}<p>${escHtml(s.body || '')}</p></div>`;
    }).join('\n');

    // Previous briefing link
    const prevRow = await env.DB.prepare(
      'SELECT date FROM briefings WHERE date < ? AND date <= ? ORDER BY date DESC LIMIT 1'
    ).bind(reqDate, yesterday).first();
    const prevLink = prevRow?.date ? `<a href="/briefing/${prevRow.date}">&larr; ${prevRow.date}</a>` : '<span></span>';
    // Next briefing link
    const nextRow = await env.DB.prepare(
      'SELECT date FROM briefings WHERE date > ? AND date <= ? ORDER BY date ASC LIMIT 1'
    ).bind(reqDate, yesterday).first();
    const nextLink = nextRow?.date ? `<a href="/briefing/${nextRow.date}">${nextRow.date} &rarr;</a>` : '<span></span>';

    return htmlResponse(seoPage({
      title: `NIL Monitor Briefing — ${dateFormatted} | College Athletics Daily Brief`,
      description: firstHeadline ? `${firstHeadline}. Daily AI-generated briefing for college athletics decision-makers covering NIL, NCAA governance, litigation, and revenue sharing.` : `Daily AI-generated briefing for college athletics decision-makers covering NIL, NCAA governance, litigation, and revenue sharing.`,
      canonical: `https://nilmonitor.com/briefing/${reqDate}`,
      ogTitle: firstHeadline ? `${firstHeadline} — NIL Monitor Briefing` : `NIL Monitor Briefing — ${dateFormatted}`,
      activePath: '/briefing',
      structuredData: {
        '@context': 'https://schema.org', '@type': 'Article',
        headline: `NIL Monitor Daily Briefing — ${dateFormatted}`,
        datePublished: reqDate,
        author: { '@type': 'Person', name: 'Matt Reinhart' },
        publisher: { '@type': 'Organization', name: 'NIL Monitor', url: 'https://nilmonitor.com' },
        description: `AI-generated college athletics briefing for ${dateFormatted} covering NIL legislation, NCAA litigation, governance, and revenue sharing.`,
        mainEntityOfPage: `https://nilmonitor.com/briefing/${reqDate}`,
      },
      bodyContent: `<main>
  <h1>NIL Monitor Daily Briefing</h1>
  <h2>${escHtml(dateFormatted)} &middot; ${ampm}</h2>
${sectionsHtml}
${genTimeStr ? `  <p class="generated">Generated ${escHtml(genTimeStr)} ET</p>` : ''}
  <div class="briefing-nav">${prevLink} <a href="/news">All News</a> ${nextLink}</div>
</main>`,
      footerText: 'NIL Monitor generates AI-powered daily briefings for athletic directors, compliance officers, and sports lawyers. Briefings are archived 24 hours after publication.',
    }));
  }

  // ── /feed.xml (RSS, optionally filtered by category) ──
  if (path === '/feed.xml') {
    const catFilter = url.searchParams.get('category');
    let query, params;
    if (catFilter) {
      query = "SELECT title, url, source, category, published_at FROM headlines WHERE category = ? ORDER BY published_at DESC LIMIT 50";
      params = [catFilter];
    } else {
      query = "SELECT title, url, source, category, published_at FROM headlines WHERE (category IS NULL OR category != 'Off-Topic') ORDER BY published_at DESC LIMIT 50";
      params = [];
    }
    const { results } = await env.DB.prepare(query).bind(...params).all();

    const feedTitle = catFilter ? `NIL Monitor — ${catFilter} Headlines` : 'NIL Monitor — College Athletics Headlines';
    const feedLink = catFilter ? `https://nilmonitor.com/feed.xml?category=${encodeURIComponent(catFilter)}` : 'https://nilmonitor.com/feed.xml';

    const rssItems = results.map(h => {
      const ts = h.published_at ? new Date(h.published_at.includes('T') ? h.published_at : h.published_at.replace(' ', 'T') + 'Z') : null;
      const pubDate = ts && !isNaN(ts) ? ts.toUTCString() : '';
      return `    <item>
      <title>${escXml(h.title)}</title>
      <link>${escXml(h.url || 'https://nilmonitor.com/news')}</link>
      <guid isPermaLink="false">${escXml(h.url || h.title)}</guid>
      <pubDate>${pubDate}</pubDate>
      <source url="https://nilmonitor.com/feed.xml">${escXml(h.source || 'NIL Monitor')}</source>${h.category ? `\n      <category>${escXml(h.category)}</category>` : ''}
    </item>`;
    }).join('\n');

    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escXml(feedTitle)}</title>
    <link>https://nilmonitor.com/news</link>
    <description>Live-updated college athletics headlines covering NIL legislation, NCAA litigation, College Sports Commission enforcement, revenue sharing, and governance from 20+ sources.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${escXml(feedLink)}" rel="self" type="application/rss+xml"/>
${rssItems}
  </channel>
</rss>`;
    return new Response(rss, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
  }

  // ── /sitemap.xml (dynamic) ──
  if (path === '/sitemap.xml') {
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const { results: briefingDates } = await env.DB.prepare(
      'SELECT date FROM briefings WHERE date <= ? ORDER BY date DESC LIMIT 30'
    ).bind(yesterday).all();

    let urls = `  <url><loc>https://nilmonitor.com</loc><changefreq>hourly</changefreq><priority>1.0</priority></url>
  <url><loc>https://nilmonitor.com/news</loc><changefreq>hourly</changefreq><priority>0.9</priority></url>`;
    for (const slug of ALL_CAT_SLUGS) {
      urls += `\n  <url><loc>https://nilmonitor.com/news/${slug}</loc><changefreq>hourly</changefreq><priority>0.8</priority></url>`;
    }
    for (const row of briefingDates) {
      urls += `\n  <url><loc>https://nilmonitor.com/briefing/${row.date}</loc><changefreq>daily</changefreq><priority>0.6</priority></url>`;
    }
    urls += `\n  <url><loc>https://nilmonitor.com/feed.xml</loc><changefreq>hourly</changefreq><priority>0.5</priority></url>`;

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
    return new Response(sitemap, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
  }

  return json({ error: 'Not found' }, 404);
}
