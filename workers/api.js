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
      const { fetchGoogleNews } = await import('./fetch-google-news.js');
      const { fetchNCAANews } = await import('./fetch-ncaa-rss.js');
      const { fetchNewsData } = await import('./fetch-newsdata.js');
      const { fetchCongress } = await import('./fetch-congress.js');
      const { fetchCourtListener } = await import('./fetch-courtlistener.js');
      const { fetchNILRevolution } = await import('./fetch-nil-revolution.js');
      const { fetchCSLT, fetchCSLTKeyDates } = await import('./fetch-cslt.js');
      const { fetchPodcasts } = await import('./fetch-podcasts.js');
      const { fetchGDELT } = await import('./fetch-gdelt.js');
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
            fetchCSLTKeyDates(env, { force: true }).then(() => log.push('cslt-keydates: ok')).catch(e => log.push(`cslt-keydates: ${e.message}`)),
            fetchPodcasts(env, { force: true }).then(() => log.push('podcasts: ok')).catch(e => log.push(`podcasts: ${e.message}`)),
            fetchGDELT(env, { force: true }).then(() => log.push('gdelt: ok')).catch(e => log.push(`gdelt: ${e.message}`)),
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
