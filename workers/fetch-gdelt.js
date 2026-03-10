// ═══════════════════════════════════════════════════════════════════
//  GDELT News Volume Fetcher
//  Calls GDELT DOC 2.0 API (free, no auth) to get daily article
//  counts for college athletics keywords over the last 30 days.
//  Self-governing cooldown: every 6 hours, 6 AM–10 PM ET
// ═══════════════════════════════════════════════════════════════════

import { getETHour, shouldRun, recordRun, recordError } from './fetcher-utils.js';

const FETCHER = 'gdelt';
const BASE_COOLDOWN = 720; // 12 hours — GDELT rate-limits aggressively

// Simplified query — shorter URL is less likely to trigger 429
const GDELT_URL = 'https://api.gdeltproject.org/api/v2/doc/doc'
  + '?query=(NIL+OR+NCAA+OR+%22transfer+portal%22+OR+%22college+athlete%22+OR+%22revenue+sharing%22)'
  + '&mode=TimelineVolRaw&TIMESPAN=1m&format=json';

/**
 * Exponential backoff: check fetcher_runs for recent errors.
 * If last run was an error, double the cooldown (up to 48h).
 */
async function getEffectiveCooldown(db) {
  const h = getETHour();
  if (h < 6 || h >= 22) return null; // skip overnight

  const row = await db.prepare(
    'SELECT last_run, last_error_at FROM fetcher_runs WHERE fetcher_name = ?'
  ).bind(FETCHER).first();

  if (!row?.last_error_at) return BASE_COOLDOWN;

  // If last error is more recent than last successful run, backoff
  const lastRun = row.last_run ? new Date(row.last_run.includes('T') ? row.last_run : row.last_run + 'Z').getTime() : 0;
  const lastErr = new Date(row.last_error_at.includes('T') ? row.last_error_at : row.last_error_at + 'Z').getTime();

  if (lastErr > lastRun) {
    // How many hours since the error? Double cooldown for each consecutive failure
    const hoursSinceErr = (Date.now() - lastErr) / 3600000;
    if (hoursSinceErr < 12) return BASE_COOLDOWN * 2;  // 24h
    if (hoursSinceErr < 24) return BASE_COOLDOWN * 4;  // 48h
  }

  return BASE_COOLDOWN;
}

/**
 * Parse GDELT date string: "20260124T000000Z" → Date
 */
function parseGdeltDate(str) {
  if (!str) return null;
  // Handle compact format: "20260124T000000Z"
  if (/^\d{8}T/.test(str)) {
    const iso = `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}T${str.slice(9, 11)}:${str.slice(11, 13)}:${str.slice(13, 15)}Z`;
    return new Date(iso);
  }
  return new Date(str);
}

/**
 * Parse GDELT TimelineVolRaw response.
 * Response format: { timeline: [{ series: "Article Count", data: [{ date, value }] }] }
 * Returns array of { date: "YYYY-MM-DD", count: number }.
 */
function parseTimeline(json) {
  const results = [];

  const timeline = json?.timeline;
  if (!Array.isArray(timeline)) return results;

  for (const tl of timeline) {
    const data = tl?.data;
    if (!Array.isArray(data)) continue;

    for (const point of data) {
      if (point.date && point.value !== undefined) {
        const d = parseGdeltDate(point.date);
        if (d && !isNaN(d.getTime())) {
          results.push({
            date: d.toISOString().split('T')[0],
            count: Math.round(Number(point.value) || 0),
          });
        }
      }
    }
  }

  // Deduplicate by date (sum counts if multiple entries per day)
  const byDate = {};
  for (const r of results) {
    byDate[r.date] = (byDate[r.date] || 0) + r.count;
  }
  return Object.entries(byDate)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchGDELT(env, { force = false } = {}) {
  if (!force) {
    const cooldown = await getEffectiveCooldown(env.DB);
    if (cooldown === null) {
      console.log('GDELT: outside active hours, skipping');
      return;
    }
    if (!await shouldRun(env.DB, FETCHER, cooldown)) {
      console.log(`GDELT: cooldown (${cooldown}m) not elapsed, skipping`);
      return;
    }
  }

  console.log('Fetching GDELT news volume...');

  let data;
  const resp = await fetch(GDELT_URL, {
    headers: { 'User-Agent': 'NILMonitor/1.0 (College Athletics Dashboard)' },
  });
  if (!resp.ok) {
    await recordError(env.DB, FETCHER, new Error(`API returned ${resp.status}`));
    if (resp.status === 429) {
      console.warn('GDELT: rate limited (429), backing off');
      return; // don't throw — just skip gracefully
    }
    throw new Error(`API returned ${resp.status}`);
  }
  const text = await resp.text();
  if (!text.startsWith('{')) {
    await recordError(env.DB, FETCHER, new Error('Non-JSON response'));
    throw new Error(`API returned non-JSON: ${text.slice(0, 200)}`);
  }
  data = JSON.parse(text);

  const points = parseTimeline(data);
  if (points.length === 0) {
    throw new Error(`No data points parsed. Keys: ${Object.keys(data).join(',')}`);
  }

  let upserted = 0;
  for (const p of points) {
    try {
      await env.DB.prepare(
        `INSERT INTO gdelt_volume (date, article_count, fetched_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(date, query_terms) DO UPDATE SET
           article_count = excluded.article_count,
           fetched_at = datetime('now')`
      ).bind(p.date, p.count).run();
      upserted++;
    } catch (err) {
      console.error(`GDELT: error upserting ${p.date}:`, err.message);
    }
  }

  await recordRun(env.DB, FETCHER);
  console.log(`GDELT: ${upserted} days upserted (${points.length} data points)`);
}
