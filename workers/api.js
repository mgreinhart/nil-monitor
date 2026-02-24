// ═══════════════════════════════════════════════════════════════════
//  API Handler — Serves D1 data as JSON
// ═══════════════════════════════════════════════════════════════════

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

// ── Admin Dashboard Helpers ───────────────────────────────────────

// Fetcher config: cooldown in minutes, active window in ET hours [start, end)
// Note: some fetchers have variable cooldowns by time of day. Values here
// represent the most common cooldown for status dot calculation.
const FETCHER_CONFIG = {
  'google-news':    { cooldown: 15,  activeStart: 6, activeEnd: 22 },
  'bing-news':      { cooldown: 15,  activeStart: 6, activeEnd: 22 },
  'ncaa-rss':       { cooldown: 15,  activeStart: 6, activeEnd: 22 },
  'newsdata':       { cooldown: 60,  activeStart: 6, activeEnd: 20 },  // complex: 30m morning, 60m midday, skip 4-7 PM, 1 run 7-8 PM, skip 8 PM+
  'publications':   { cooldown: 30,  activeStart: 6, activeEnd: 22 },
  'nil-revolution': { cooldown: 120, activeStart: 6, activeEnd: 22 },
  'courtlistener':  { cooldown: 120, activeStart: 6, activeEnd: 22 },
  'cslt':           { cooldown: 360, activeStart: 6, activeEnd: 22 },
  'cslt-keydates':  { cooldown: 360, activeStart: 6, activeEnd: 22 },
  'gdelt':          { cooldown: 360, activeStart: 6, activeEnd: 22 },
  'podcasts':       { cooldown: 360, activeStart: 6, activeEnd: 22 },
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

function isInSkipWindow(etHour, activeStart, activeEnd) {
  return etHour < activeStart || etHour >= activeEnd;
}

// Minutes since the skip window started (10 PM ET = hour 22)
function minutesSinceSkipStart(etHour) {
  if (etHour >= 22) return (etHour - 22) * 60;
  if (etHour < 6) return (etHour + 2) * 60; // hours past 22
  return 0;
}

function getFetcherStatus(lastRunStr, cfg, etHour) {
  if (!lastRunStr) return { status: 'red', label: 'Never' };
  const d = new Date(lastRunStr.includes('T') ? lastRunStr : lastRunStr.replace(' ', 'T') + 'Z');
  const elapsed = (Date.now() - d.getTime()) / 60000;

  // Sleeping — the fetcher is off by design, so it's healthy
  if (isInSkipWindow(etHour, cfg.activeStart, cfg.activeEnd)) {
    return { status: 'sleep', label: adminTimestamp(lastRunStr) };
  }

  if (elapsed > cfg.cooldown * 4) return { status: 'red', label: adminTimestamp(lastRunStr) };
  if (elapsed > cfg.cooldown * 2) return { status: 'amber', label: adminTimestamp(lastRunStr) };
  return { status: 'green', label: adminTimestamp(lastRunStr) };
}

async function buildAdminDashboard(env) {
  // ── Parallel D1 queries ──
  const [
    fetcherRows, headlineTotal, headlinesToday, headlinesWeek, headlines24h,
    activeCases, casesWithDates, latestBriefing, gdeltStats, csltStats, latestPipeline,
    untaggedHeadlines,
  ] = await Promise.all([
    env.DB.prepare('SELECT fetcher_name, last_run FROM fetcher_runs').all(),
    env.DB.prepare('SELECT COUNT(*) as cnt FROM headlines').first(),
    env.DB.prepare("SELECT COUNT(*) as cnt FROM headlines WHERE date(published_at) = date('now')").first(),
    env.DB.prepare("SELECT COUNT(*) as cnt FROM headlines WHERE published_at >= date('now', '-7 days')").first(),
    env.DB.prepare("SELECT COUNT(*) as cnt FROM headlines WHERE fetched_at >= datetime('now', '-24 hours')").first(),
    env.DB.prepare('SELECT COUNT(*) as cnt FROM cases WHERE is_active = 1').first(),
    env.DB.prepare("SELECT COUNT(*) as cnt FROM cases WHERE is_active = 1 AND upcoming_dates IS NOT NULL AND upcoming_dates != '[]'").first(),
    env.DB.prepare('SELECT date, generated_at FROM briefings ORDER BY date DESC LIMIT 1').first(),
    env.DB.prepare('SELECT COUNT(DISTINCT date) as days, MAX(fetched_at) as latest FROM gdelt_volume').first(),
    env.DB.prepare('SELECT COUNT(*) as cnt, MAX(month) as latest_month FROM cslt_key_dates').first(),
    env.DB.prepare('SELECT * FROM pipeline_runs ORDER BY id DESC LIMIT 1').first(),
    env.DB.prepare("SELECT COUNT(*) as cnt FROM headlines WHERE category IS NULL OR severity IS NULL").first(),
  ]);

  // ── Fetcher status ──
  const fetcherMap = {};
  for (const row of (fetcherRows?.results || [])) fetcherMap[row.fetcher_name] = row.last_run;

  const etHour = getETHour();
  const fetchers = Object.entries(FETCHER_CONFIG).map(([name, cfg]) => {
    const lastRun = fetcherMap[name] || null;
    const { status, label } = getFetcherStatus(lastRun, cfg, etHour);
    const inSkip = isInSkipWindow(etHour, cfg.activeStart, cfg.activeEnd);
    return { name, cooldown: cfg.cooldown, lastRun, status, label, inSkip };
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

  if ((gdeltStats?.days || 0) === 0) {
    issues.push({ level: 'amber', text: 'GDELT table has no data' });
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
    return `<tr><td>${statusDot(f.status)}</td><td>${f.name}</td><td>${f.label}</td><td>${freq}</td></tr>`;
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
    <div class="label">GDELT Volume</div>
    <div class="value">${gdeltStats?.days || 0} days</div>
    <div class="sub">${gdeltStats?.latest ? 'Updated ' + adminTimestamp(gdeltStats.latest) : 'No data'}</div>
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
  <div class="card"><div class="label">Deadlines</div><div class="value">${pipe.deadlines_created}</div></div>
  <div class="card"><div class="label">CSC Items</div><div class="value">${pipe.csc_items_created}</div></div>
  <div class="card"><div class="label">Briefing</div><div class="value">${pipe.briefing_generated ? 'Yes' : 'No'}</div></div>
</div>` : '<div style="color:#475569">No pipeline runs recorded.</div>'}
</div>

<div class="section">
<h2>Manual Triggers</h2>
<div class="triggers">
  <button class="btn" onclick="trigger('fetch')">Run Fetchers</button>
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
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
    return new Response(null, { headers: CORS });
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
      const limit = parseInt(url.searchParams.get('limit') || '50');
      let query = 'SELECT * FROM headlines ORDER BY published_at DESC LIMIT ?';
      const params = [limit];
      if (cat && cat !== 'All') {
        query = 'SELECT * FROM headlines WHERE category = ? ORDER BY published_at DESC LIMIT ?';
        params.unshift(cat);
      }
      const { results } = await env.DB.prepare(query).bind(...params).all();
      return json(results);
    }

    // Deadlines
    if (path === '/api/deadlines') {
      const { results } = await env.DB.prepare(
        "SELECT * FROM deadlines WHERE date >= date('now') ORDER BY date ASC"
      ).all();
      return json(results);
    }

    // House Settlement
    if (path === '/api/house') {
      const { results } = await env.DB.prepare('SELECT key, value FROM house_settlement').all();
      const obj = {};
      for (const row of results) obj[row.key] = row.value;
      return json(obj);
    }

    // Briefing (Phase 3 — empty for now)
    if (path === '/api/briefing') {
      const row = await env.DB.prepare(
        'SELECT * FROM briefings ORDER BY date DESC LIMIT 1'
      ).first();
      return json(row || { date: null, content: null });
    }

    // Headline counts per day (for news volume chart)
    if (path === '/api/headline-counts') {
      const { results } = await env.DB.prepare(
        `SELECT date(published_at) as day, COUNT(*) as count
         FROM headlines
         WHERE published_at >= date('now', '-30 days')
         GROUP BY date(published_at)
         ORDER BY day ASC`
      ).all();
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

    // GDELT news volume (30-day chart)
    if (path === '/api/gdelt-volume') {
      const { results } = await env.DB.prepare(
        `SELECT date, article_count as count FROM gdelt_volume
         WHERE date >= date('now', '-30 days')
         ORDER BY date ASC`
      ).all();
      const total = results.reduce((s, r) => s + r.count, 0);
      const avg = results.length > 0 ? Math.round(total / results.length) : 0;
      const lastRow = await env.DB.prepare(
        'SELECT fetched_at FROM gdelt_volume ORDER BY fetched_at DESC LIMIT 1'
      ).first();
      return json({
        data: results,
        total,
        avg,
        last_updated: lastRow?.fetched_at || null,
      });
    }

    // Podcast freshness (for NEW badges on sidebar)
    if (path === '/api/podcasts') {
      const { results } = await env.DB.prepare(
        'SELECT spotify_id, latest_date FROM podcast_episodes'
      ).all();
      return json(results);
    }

    // Manual trigger for scheduled tasks (dev/admin use)
    if (path === '/api/trigger') {
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
      const { fetchGDELT } = await import('./fetch-gdelt.js');
      const { runAIPipeline } = await import('./ai-pipeline.js');

      const phase = url.searchParams.get('phase') || 'all';

      const log = [];
      try {
        if (phase === 'fetch' || phase === 'all') {
          await loadDedupCache(env.DB);
          await Promise.all([
            fetchGoogleNews(env).then(() => log.push('google-news: ok')).catch(e => log.push(`google-news: ${e.message}`)),
            fetchBingNews(env).then(() => log.push('bing-news: ok')).catch(e => log.push(`bing-news: ${e.message}`)),
            fetchNCAANews(env).then(() => log.push('ncaa-rss: ok')).catch(e => log.push(`ncaa-rss: ${e.message}`)),
            fetchNewsData(env).then(() => log.push('newsdata: ok')).catch(e => log.push(`newsdata: ${e.message}`)),
            fetchCourtListener(env).then(() => log.push('courtlistener: ok')).catch(e => log.push(`courtlistener: ${e.message}`)),
            fetchNILRevolution(env).then(() => log.push('nil-revolution: ok')).catch(e => log.push(`nil-revolution: ${e.message}`)),
            fetchPublications(env).then(() => log.push('publications: ok')).catch(e => log.push(`publications: ${e.message}`)),
            fetchCSLT(env, { force: true }).then(() => log.push('cslt: ok')).catch(e => log.push(`cslt: ${e.message}`)),
            fetchCSLTKeyDates(env, { force: true }).then(() => log.push('cslt-keydates: ok')).catch(e => log.push(`cslt-keydates: ${e.message}`)),
            fetchPodcasts(env, { force: true }).then(() => log.push('podcasts: ok')).catch(e => log.push(`podcasts: ${e.message}`)),
            fetchGDELT(env, { force: true }).then(() => log.push('gdelt: ok')).catch(e => log.push(`gdelt: ${e.message}`)),
          ]);
          clearDedupCache();
        }
        if (phase === 'ai' || phase === 'all') {
          log.push(`anthropic-key: ${env.ANTHROPIC_KEY ? 'set' : 'missing'}`);
          await runAIPipeline(env);
          log.push('ai-pipeline: ok');
        }
      } catch (e) {
        log.push(`error: ${e.message}`);
      }

      return json({ ok: true, phase, log });
    }

    // Admin status dashboard (HTML)
    if (path === '/api/admin') {
      const html = await buildAdminDashboard(env);
      return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8', ...CORS },
      });
    }

    return json({ error: 'Not found' }, 404);
  } catch (err) {
    console.error('API error:', err);
    return json({ error: err.message }, 500);
  }
}
