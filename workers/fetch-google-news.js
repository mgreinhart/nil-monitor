// ═══════════════════════════════════════════════════════════════════
//  Google News RSS Fetcher
//  Searches multiple queries, parses RSS, upserts into headlines.
// ═══════════════════════════════════════════════════════════════════

import { parseRSS } from './rss-parser.js';

const QUERIES = [
  '"NIL" college sports',
  'NCAA governance rules',
  '"college sports commission" OR "CSC enforcement"',
  '"transfer portal" college',
  'college athlete lawsuit OR "NCAA litigation"',
  'NIL legislation OR "college athlete" bill',
  'conference realignment college sports',
];

function buildGoogleNewsUrl(query) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

export async function fetchGoogleNews(env) {
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

        try {
          await env.DB.prepare(
            `INSERT OR IGNORE INTO headlines (source, title, url, published_at)
             VALUES (?, ?, ?, ?)`
          ).bind(source, item.title, item.link, published).run();
          totalInserted++;
        } catch (e) {
          // UNIQUE constraint on url — skip duplicates silently
        }
      }
    } catch (err) {
      console.error(`Google News error for "${q}":`, err.message);
    }
  }

  console.log(`Google News: inserted ${totalInserted} headlines`);
}
