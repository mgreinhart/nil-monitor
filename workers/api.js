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
      query += ' ORDER BY last_event_date DESC';
      const { results } = await env.DB.prepare(query).bind(...params).all();
      return json(results);
    }

    if (path.match(/^\/api\/cases\/\d+$/)) {
      const id = path.split('/').pop();
      const row = await env.DB.prepare('SELECT * FROM cases WHERE id = ?').bind(id).first();
      if (!row) return json({ error: 'Not found' }, 404);
      return json(row);
    }

    // Case Updates
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

    // Bills
    if (path === '/api/bills') {
      const state = url.searchParams.get('state');
      let query = 'SELECT * FROM bills ORDER BY last_action_date DESC';
      const params = [];
      if (state) {
        query = 'SELECT * FROM bills WHERE state = ? ORDER BY last_action_date DESC';
        params.push(state);
      }
      const { results } = await env.DB.prepare(query).bind(...params).all();
      return json(results);
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

    // CSC Activity
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
      const { fetchNILRevolution } = await import('./fetch-nil-revolution.js');
      const { fetchCSLT } = await import('./fetch-cslt.js');
      const { runAIPipeline } = await import('./ai-pipeline.js');

      const phase = url.searchParams.get('phase') || 'all';

      const log = [];
      try {
        if (phase === 'fetch' || phase === 'all') {
          await Promise.all([
            fetchGoogleNews(env).then(() => log.push('google-news: ok')).catch(e => log.push(`google-news: ${e.message}`)),
            fetchNCAANews(env).then(() => log.push('ncaa-rss: ok')).catch(e => log.push(`ncaa-rss: ${e.message}`)),
            fetchNewsData(env).then(() => log.push('newsdata: ok')).catch(e => log.push(`newsdata: ${e.message}`)),
            fetchCongress(env).then(() => log.push('congress: ok')).catch(e => log.push(`congress: ${e.message}`)),
            fetchCourtListener(env).then(() => log.push('courtlistener: ok')).catch(e => log.push(`courtlistener: ${e.message}`)),
            fetchNILRevolution(env).then(() => log.push('nil-revolution: ok')).catch(e => log.push(`nil-revolution: ${e.message}`)),
            fetchCSLT(env, { force: true }).then(() => log.push('cslt: ok')).catch(e => log.push(`cslt: ${e.message}`)),
          ]);
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

    return json({ error: 'Not found' }, 404);
  } catch (err) {
    console.error('API error:', err);
    return json({ error: err.message }, 500);
  }
}
