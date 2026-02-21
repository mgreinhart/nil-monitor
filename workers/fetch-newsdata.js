// ═══════════════════════════════════════════════════════════════════
//  NewsData.io Fetcher
//  Self-governing cooldown (~105 credits/day of 200):
//    6 AM–12 PM ET: every 30 min  (12 runs × 5 = 60 credits)
//    12–5 PM ET:    every 60 min  (5 runs × 5 = 25 credits)
//    5–10 PM ET:    every 120 min (2-3 runs × 5 = 12 credits)
//    10 PM–6 AM ET: once (~2 AM)  (1 run × 5 = 5 credits)
//  Requires secret: wrangler secret put NEWSDATA_KEY
// ═══════════════════════════════════════════════════════════════════

import { getETHour, shouldRun, recordRun, categorizeByKeyword } from './fetcher-utils.js';

const FETCHER = 'newsdata';
const BASE_URL = 'https://newsdata.io/api/1/latest';

const QUERIES = [
  'NIL college sports',
  'NCAA governance OR NCAA rules',
  'college sports commission OR CSC enforcement',
  'college athlete lawsuit OR NCAA litigation',
  'NIL legislation OR college athlete bill',
];

function getCooldown() {
  const h = getETHour();
  if (h >= 6 && h < 12) return 30;
  if (h >= 12 && h < 17) return 60;
  if (h >= 17 && h < 22) return 120;
  return 300; // overnight: ~5 hours → runs once around 2 AM
}

function buildUrl(apiKey, query) {
  const params = new URLSearchParams({
    apikey: apiKey,
    q: query,
    language: 'en',
    country: 'us',
    category: 'sports',
    removeduplicate: '1',
    timeframe: '6',
    size: '10',
  });
  return `${BASE_URL}?${params}`;
}

export async function fetchNewsData(env) {
  const apiKey = env.NEWSDATA_KEY;
  if (!apiKey) {
    console.log('NewsData.io: no API key configured, skipping');
    return;
  }

  const cooldown = getCooldown();
  if (!await shouldRun(env.DB, FETCHER, cooldown)) {
    console.log(`NewsData.io: cooldown (${cooldown}m) not elapsed, skipping`);
    return;
  }

  console.log('Fetching NewsData.io headlines...');
  let totalInserted = 0;

  for (const q of QUERIES) {
    try {
      const resp = await fetch(buildUrl(apiKey, q));
      if (!resp.ok) {
        console.error(`NewsData.io fetch failed for "${q}": ${resp.status}`);
        continue;
      }

      const data = await resp.json();

      if (data.status !== 'success' || !data.results) {
        console.error(`NewsData.io error for "${q}": ${data.status}`);
        continue;
      }

      for (const article of data.results) {
        if (!article.title || !article.link) continue;

        const source = article.source_name || article.source_id || 'NewsData.io';
        const published = article.pubDate
          ? new Date(article.pubDate).toISOString()
          : new Date().toISOString();
        const category = categorizeByKeyword(article.title);

        try {
          await env.DB.prepare(
            `INSERT OR IGNORE INTO headlines (source, title, url, category, published_at)
             VALUES (?, ?, ?, ?, ?)`
          ).bind(source, article.title, article.link, category, published).run();
          totalInserted++;
        } catch (e) {
          // UNIQUE constraint on url — skip duplicates silently
        }
      }
    } catch (err) {
      console.error(`NewsData.io error for "${q}":`, err.message);
    }
  }

  await recordRun(env.DB, FETCHER);
  console.log(`NewsData.io: inserted ${totalInserted} headlines`);
}
