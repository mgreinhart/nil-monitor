// ═══════════════════════════════════════════════════════════════════
//  NewsData.io Fetcher
//  Self-governing cooldown (~195 credits/day of 200):
//    6–10 AM ET:    every 30 min  (8 runs × 13 = 104 credits)
//    10 AM–4 PM ET: every 60 min  (6 runs × 13 = 78 credits)
//    4–7 PM ET:     skip (budget spent, briefing done)
//    7–8 PM ET:     once           (1 run × 13 = 13 credits)
//    8 PM–6 AM ET:  skip overnight
//  Requires secret: wrangler secret put NEWSDATA_KEY
// ═══════════════════════════════════════════════════════════════════

import { getETHour, shouldRun, recordRun, insertHeadline, isTitleRelevant } from './fetcher-utils.js';

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
  'private equity college sports',
  // College sports business & personnel
  'athletic director hired OR fired college',
  'college athletics fundraising OR stadium',
];

function getCooldown() {
  const h = getETHour();
  if (h >= 6 && h < 10) return 30;    // 8 runs × 13 = 104 credits
  if (h >= 10 && h < 16) return 60;   // 6 runs × 13 = 78 credits
  if (h >= 19 && h < 20) return 60;   // 1 run  × 13 = 13 credits (evening catch-up)
  return null;                         // skip 4–7 PM + overnight
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

        // Targeted queries can still return tangential results
        if (!isTitleRelevant(article.title)) continue;

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
