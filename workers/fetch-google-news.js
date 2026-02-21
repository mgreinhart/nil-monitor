// ═══════════════════════════════════════════════════════════════════
//  Google News RSS Fetcher
//  Self-governing cooldown:
//    6 AM–12 PM ET: every 15 min
//    12–5 PM ET:    every 15 min
//    5–10 PM ET:    every 30 min
//    10 PM–6 AM ET: skip
// ═══════════════════════════════════════════════════════════════════

import { parseRSS } from './rss-parser.js';
import { getETHour, shouldRun, recordRun, categorizeByKeyword } from './fetcher-utils.js';

const FETCHER = 'google-news';

const QUERIES = [
  '"NIL" college sports',
  'NCAA governance rules',
  '"college sports commission" OR "CSC enforcement"',
  '"transfer portal" college',
  'college athlete lawsuit OR "NCAA litigation"',
  'NIL legislation OR "college athlete" bill',
  'conference realignment college sports',
];

function getCooldown() {
  const h = getETHour();
  if (h >= 6 && h < 17) return 15;
  if (h >= 17 && h < 22) return 30;
  return null; // skip overnight
}

function buildGoogleNewsUrl(query) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

export async function fetchGoogleNews(env) {
  const cooldown = getCooldown();
  if (cooldown === null) {
    console.log('Google News: outside active hours, skipping');
    return;
  }
  if (!await shouldRun(env.DB, FETCHER, cooldown)) {
    console.log(`Google News: cooldown (${cooldown}m) not elapsed, skipping`);
    return;
  }

  console.log('Fetching Google News RSS...');
  let totalInserted = 0;

  for (const q of QUERIES) {
    try {
      const resp = await fetch(buildGoogleNewsUrl(q));
      if (!resp.ok) {
        console.error(`Google News fetch failed for "${q}": ${resp.status}`);
        continue;
      }

      const xml = await resp.text();
      const items = parseRSS(xml);

      for (const item of items.slice(0, 15)) {
        if (!item.title || !item.link) continue;

        const source = item.sourceName || 'Google News';
        const published = item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString();
        const category = categorizeByKeyword(item.title);

        try {
          await env.DB.prepare(
            `INSERT OR IGNORE INTO headlines (source, title, url, category, published_at)
             VALUES (?, ?, ?, ?, ?)`
          ).bind(source, item.title, item.link, category, published).run();
          totalInserted++;
        } catch (e) {
          // UNIQUE constraint on url — skip duplicates silently
        }
      }
    } catch (err) {
      console.error(`Google News error for "${q}":`, err.message);
    }
  }

  await recordRun(env.DB, FETCHER);
  console.log(`Google News: inserted ${totalInserted} headlines`);
}
