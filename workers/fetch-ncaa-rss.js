// ═══════════════════════════════════════════════════════════════════
//  NCAA.com RSS Fetcher
//  Self-governing cooldown:
//    6 AM–12 PM ET: every 15 min
//    12–5 PM ET:    every 15 min
//    5–10 PM ET:    every 30 min
//    10 PM–6 AM ET: skip
// ═══════════════════════════════════════════════════════════════════

import { parseRSS } from './rss-parser.js';
import { getETHour, shouldRun, recordRun, insertHeadline } from './fetcher-utils.js';

const FETCHER = 'ncaa-rss';

const FEEDS = [
  { url: 'https://www.ncaa.com/news/ncaa/d1/rss.xml', fallbackSource: 'NCAA.com' },
  { url: 'https://www.ncaa.com/news/basketball-men/d1/rss.xml', fallbackSource: 'NCAA.com' },
  { url: 'https://www.ncaa.com/news/football/fbs/rss.xml', fallbackSource: 'NCAA.com' },
];

function getCooldown() {
  const h = getETHour();
  if (h >= 6 && h < 17) return 15;
  if (h >= 17 && h < 22) return 30;
  return null;
}

export async function fetchNCAANews(env) {
  const cooldown = getCooldown();
  if (cooldown === null) {
    console.log('NCAA RSS: outside active hours, skipping');
    return;
  }
  if (!await shouldRun(env.DB, FETCHER, cooldown)) {
    console.log(`NCAA RSS: cooldown (${cooldown}m) not elapsed, skipping`);
    return;
  }

  console.log('Fetching NCAA RSS...');
  let totalInserted = 0;

  for (const feed of FEEDS) {
    try {
      const resp = await fetch(feed.url, {
        headers: { 'User-Agent': 'NILMonitor/1.0 (RSS Reader)' },
      });
      if (!resp.ok) {
        console.error(`NCAA RSS failed for ${feed.url}: ${resp.status}`);
        continue;
      }

      const xml = await resp.text();
      const items = parseRSS(xml);

      for (const item of items.slice(0, 15)) {
        if (!item.title || !item.link) continue;

        const source = item.sourceName || feed.fallbackSource;
        const published = item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString();

        const inserted = await insertHeadline(env.DB, {
          source, title: item.title, url: item.link, published,
        });
        if (inserted) totalInserted++;
      }
    } catch (err) {
      console.error(`NCAA RSS error for ${feed.url}:`, err.message);
    }
  }

  await recordRun(env.DB, FETCHER);
  console.log(`NCAA RSS: inserted ${totalInserted} headlines`);
}
