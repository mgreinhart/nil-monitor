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

export async function handleApi(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }

  const url = new URL(request.url);
  const path = url.pathname;

  try {
    // Cases
    if (path === '/api/cases') {
      const cat = url.searchParams.get('cat');
      let query = 'SELECT * FROM cases ORDER BY last_filing_date DESC';
      const params = [];
      if (cat && cat !== 'All') {
        query = 'SELECT * FROM cases WHERE category = ? ORDER BY last_filing_date DESC';
        params.push(cat);
      }
      const { results } = await env.DB.prepare(query).bind(...params).all();
      return json(results);
    }

    if (path.match(/^\/api\/cases\/\d+$/)) {
      const id = path.split('/').pop();
      const row = await env.DB.prepare('SELECT * FROM cases WHERE id = ?').bind(id).first();
      if (!row) return json({ error: 'Not found' }, 404);
      return json(row);
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

    // Events (Phase 3 — empty for now)
    if (path === '/api/events') {
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const cat = url.searchParams.get('cat');
      let query = 'SELECT * FROM events ORDER BY event_time DESC LIMIT ?';
      const params = [limit];
      if (cat && cat !== 'All') {
        query = 'SELECT * FROM events WHERE category = ? ORDER BY event_time DESC LIMIT ?';
        params.unshift(cat);
      }
      const { results } = await env.DB.prepare(query).bind(...params).all();
      return json(results);
    }

    // CSC Activity (Phase 3 — empty for now)
    if (path === '/api/csc') {
      const { results } = await env.DB.prepare(
        'SELECT * FROM csc_activity ORDER BY activity_time DESC LIMIT 20'
      ).all();
      return json(results);
    }

    // Manual trigger for scheduled tasks (dev/admin use)
    if (path === '/api/trigger') {
      const { fetchGoogleNews } = await import('./fetch-google-news.js');
      const { fetchNCAANews } = await import('./fetch-ncaa-rss.js');
      const { fetchNewsData } = await import('./fetch-newsdata.js');
      const { fetchCongress } = await import('./fetch-congress.js');
      const { fetchCourtListener } = await import('./fetch-courtlistener.js');
      const { runAIPipeline } = await import('./ai-pipeline.js');

      const phase = url.searchParams.get('phase') || 'all';

      if (phase === 'fetch' || phase === 'all') {
        await Promise.all([
          fetchGoogleNews(env),
          fetchNCAANews(env),
          fetchNewsData(env),
          fetchCongress(env),
          fetchCourtListener(env),
        ]);
      }
      if (phase === 'ai' || phase === 'all') {
        await runAIPipeline(env);
      }

      return json({ ok: true, phase });
    }

    return json({ error: 'Not found' }, 404);
  } catch (err) {
    console.error('API error:', err);
    return json({ error: err.message }, 500);
  }
}
