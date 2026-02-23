// ═══════════════════════════════════════════════════════════════════
//  Bing News RSS Fetcher
//  Different index than Google News — surfaces different articles.
//  Self-governing cooldown:
//    6 AM–5 PM ET:  every 15 min
//    5–10 PM ET:    every 30 min
//    10 PM–6 AM ET: skip
// ═══════════════════════════════════════════════════════════════════

import { parseRSS } from './rss-parser.js';
import { getETHour, shouldRun, recordRun, insertHeadline, isTitleRelevant } from './fetcher-utils.js';

const FETCHER = 'bing-news';

const QUERIES = [
  '"NIL" college sports',
  '"NCAA governance"',
  '"House v NCAA" OR "House settlement"',
  '"college athlete" lawsuit OR antitrust',
  '"College Sports Commission"',
  '"revenue sharing" college sports',
  '"transfer portal" NCAA',
  '"conference realignment" college OR NCAA',
  '"NIL legislation" OR "NIL bill"',
  '"NIL collective" OR "NIL deal"',
  '"college athlete" union OR employment',
  '"NCAA enforcement" OR "NCAA investigation"',
  '"College Sports Commission" enforcement',
  '"NCAA revenue sharing" compliance',
  '"college athlete" employment classification',
  '"private equity" college sports OR NCAA',
  '"college sports" investment OR ownership',
];

function getCooldown() {
  const h = getETHour();
  if (h >= 6 && h < 17) return 15;
  if (h >= 17 && h < 22) return 30;
  return null;
}

function buildBingNewsUrl(query) {
  return `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss`;
}

export async function fetchBingNews(env) {
  const cooldown = getCooldown();
  if (cooldown === null) {
    console.log('Bing News: outside active hours, skipping');
    return;
  }
  if (!await shouldRun(env.DB, FETCHER, cooldown)) {
    console.log(`Bing News: cooldown (${cooldown}m) not elapsed, skipping`);
    return;
  }

  console.log('Fetching Bing News RSS...');
  let totalInserted = 0;

  for (const q of QUERIES) {
    try {
      const resp = await fetch(buildBingNewsUrl(q), {
        headers: { 'User-Agent': 'NILMonitor/1.0 (RSS Reader)' },
      });
      if (!resp.ok) {
        console.error(`Bing News fetch failed for "${q}": ${resp.status}`);
        continue;
      }

      const xml = await resp.text();
      const items = parseRSS(xml);

      for (const item of items.slice(0, 15)) {
        if (!item.title || !item.link) continue;

        // Safety net: even targeted queries can return tangential results
        if (!isTitleRelevant(item.title)) continue;

        // Bing wraps links in a redirect — extract the actual URL
        const url = extractBingUrl(item.link) || item.link;
        const source = item.sourceName || 'Bing News';
        const published = item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString();

        const inserted = await insertHeadline(env.DB, {
          source, title: item.title, url, published,
        });
        if (inserted) totalInserted++;
      }
    } catch (err) {
      console.error(`Bing News error for "${q}":`, err.message);
    }
  }

  await recordRun(env.DB, FETCHER);
  console.log(`Bing News: processed ${QUERIES.length} queries, inserted ${totalInserted} headlines`);
}

/**
 * Bing News RSS wraps article links in redirect URLs like:
 * https://www.bing.com/news/apiclick.aspx?...&url=https%3A%2F%2Fwww.sportico.com%2F...
 * Extract the actual destination URL for proper deduplication.
 */
function extractBingUrl(link) {
  try {
    const u = new URL(link);
    const dest = u.searchParams.get('url');
    if (dest) return dest;
  } catch {}
  return null;
}
