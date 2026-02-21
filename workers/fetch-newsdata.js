// ═══════════════════════════════════════════════════════════════════
//  NewsData.io Fetcher
//  Self-governing cooldown (~195 credits/day of 200):
//    6 AM–12 PM ET: every 30 min  (12 runs × 13 = 156 credits)
//    12–5 PM ET:    skip (budget consumed by morning runs)
//    5–10 PM ET:    every 180 min (1-2 runs × 13 = 16 credits)
//    10 PM–6 AM ET: once (~2 AM)  (1 run × 13 = 13 credits)
//  Requires secret: wrangler secret put NEWSDATA_KEY
// ═══════════════════════════════════════════════════════════════════

import { getETHour, shouldRun, recordRun, insertHeadline } from './fetcher-utils.js';

const FETCHER = 'newsdata';
const BASE_URL = 'https://newsdata.io/api/1/latest';

const QUERIES = [
  'NIL college sports',
  'NCAA governance OR NCAA rules',
  'college sports commission OR CSC enforcement',
  'college athlete lawsuit OR NCAA litigation',
  'NIL legislation OR college athlete bill',
  'transfer portal college',
  'College Sports Commission',
  'NIL enforcement',
  'NCAA antitrust',
  'conference realignment college',
  'college athlete union',
  'revenue sharing NCAA',
  'House v NCAA settlement',
];

function getCooldown() {
  const h = getETHour();
  if (h >= 6 && h < 12) return 30;    // 12 runs × 13 = 156 credits
  if (h >= 12 && h < 17) return null;  // skip — budget consumed by AM
  if (h >= 17 && h < 22) return 180;   // 1-2 runs × 13 = 16 credits
  return 480; // overnight: ~8 hours → runs once around 2 AM (13 credits)
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

        const inserted = await insertHeadline(env.DB, {
          source, title: article.title, url: article.link, published,
        });
        if (inserted) totalInserted++;
      }
    } catch (err) {
      console.error(`NewsData.io error for "${q}":`, err.message);
    }
  }

  await recordRun(env.DB, FETCHER);
  console.log(`NewsData.io: inserted ${totalInserted} headlines`);
}
