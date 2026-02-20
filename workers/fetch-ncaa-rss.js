// ═══════════════════════════════════════════════════════════════════
//  NCAA.com RSS Fetcher
//  NCAA.org doesn't have governance RSS. NCAA.com has sport feeds.
//  We pull from the sport feeds most relevant to NIL Monitor.
// ═══════════════════════════════════════════════════════════════════

import { parseRSS } from './rss-parser.js';

const FEEDS = [
  { url: 'https://www.ncaa.com/news/ncaa/d1/rss.xml', fallbackSource: 'NCAA.com' },
  { url: 'https://www.ncaa.com/news/basketball-men/d1/rss.xml', fallbackSource: 'NCAA.com' },
  { url: 'https://www.ncaa.com/news/football/fbs/rss.xml', fallbackSource: 'NCAA.com' },
];

export async function fetchNCAANews(env) {
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

        try {
          await env.DB.prepare(
            `INSERT OR IGNORE INTO headlines (source, title, url, category, published_at)
             VALUES (?, ?, ?, ?, ?)`
          ).bind(source, item.title, item.link, 'NCAA Governance', published).run();
          totalInserted++;
        } catch (e) {
          // Skip duplicates
        }
      }
    } catch (err) {
      console.error(`NCAA RSS error for ${feed.url}:`, err.message);
    }
  }

  console.log(`NCAA RSS: inserted ${totalInserted} headlines`);
}
