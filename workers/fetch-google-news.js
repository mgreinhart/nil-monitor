// ═══════════════════════════════════════════════════════════════════
//  Google News RSS Fetcher
//  Self-governing cooldown:
//    6 AM–12 PM ET: every 15 min
//    12–5 PM ET:    every 15 min
//    5–10 PM ET:    every 30 min
//    10 PM–6 AM ET: skip
// ═══════════════════════════════════════════════════════════════════

import { parseRSS } from './rss-parser.js';
import { getETHour, shouldRun, recordRun, insertHeadline } from './fetcher-utils.js';

const FETCHER = 'google-news';

// 19 diverse queries — each targets a distinct topic to minimize overlap.
// Bing News covers the same space with its own index, so no need to
// duplicate every permutation here.
const QUERIES = [
  '"NIL" college sports',
  '"House v NCAA" OR "House settlement"',
  '"NCAA governance" OR "NCAA rule change"',
  '"College Sports Commission" OR "CSC enforcement"',
  '"revenue sharing" college athlete',
  '"transfer portal" NCAA',
  '"conference realignment" OR "media rights" college',
  'NIL legislation OR "college athlete bill"',
  '"NCAA antitrust" OR "college athlete lawsuit"',
  '"NIL collective" OR "NIL deal"',
  '"college athlete union" OR "NLRB" college',
  '"NIL compliance" OR "NIL enforcement"',
  '"college sports" reform OR restructuring',
  '"athletic director" NIL OR "revenue sharing"',
  '"Sports Business Journal" college OR NCAA',
  '"College Sports Commission" enforcement',
  '"NCAA revenue sharing" compliance',
  '"college athlete" employment classification',
  '"House v NCAA" settlement implementation',
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

        const inserted = await insertHeadline(env.DB, {
          source, title: item.title, url: item.link, published,
        });
        if (inserted) totalInserted++;
      }
    } catch (err) {
      console.error(`Google News error for "${q}":`, err.message);
    }
  }

  await recordRun(env.DB, FETCHER);
  console.log(`Google News: inserted ${totalInserted} headlines`);
}
