// ═══════════════════════════════════════════════════════════════════
//  Google News RSS Fetcher
//  Self-governing cooldown:
//    6 AM–12 PM ET: every 15 min
//    12–5 PM ET:    every 15 min
//    5–10 PM ET:    every 30 min
//    10 PM–6 AM ET: skip
// ═══════════════════════════════════════════════════════════════════

import { parseRSS } from './rss-parser.js';
import { getETHour, shouldRun, recordRun, insertHeadline, isTitleRelevant } from './fetcher-utils.js';

const FETCHER = 'google-news';

// 29 diverse queries — each targets a distinct topic to minimize overlap.
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
  '"roster limit" OR "scholarship limit" NCAA',
  '"College Sports Commission" enforcement',
  '"NCAA revenue sharing" compliance',
  '"college athlete" employment classification',
  '"House v NCAA" settlement implementation',
  '"private equity" college sports OR NCAA',
  '"college sports" investment OR ownership stake',
  '"collective bargaining" college athletes',
  '"employee status" college athletes',
  'NCAA eligibility lawsuit',
  '"roster cap" college sports',
  'college sports "media rights"',
  'Teamworks college sports',
  'Opendorse NIL',
  'Learfield college athletics',
  'university sues athlete OR "breach of contract" college',
  '"NIL buyout" OR "NIL exit fee" OR "NIL contract" lawsuit',
  'NCAA eligibility injunction OR "restraining order"',
  '"college football" OR "college basketball" lawsuit OR sued',
  'NCAA trademark OR "March Madness" trademark',
  '"athletic department" budget OR deficit OR "operating expenses"',
  '"jersey patch" OR "jersey sponsorship" college OR university',
  '"above the cap" OR "above-cap" college athlete OR NCAA',
  'Nike OR Adidas college "NIL" OR "above-cap" OR "revenue sharing"',
  '"student athletic fee" increase OR proposed university',
  '"state legislature" OR "state lawmaker" NIL OR "college athlete" OR "revenue sharing"',
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

export async function fetchGoogleNews(env, { force = false } = {}) {
  if (!force) {
    const cooldown = getCooldown();
    if (cooldown === null) {
      console.log('Google News: outside active hours, skipping');
      return;
    }
    if (!await shouldRun(env.DB, FETCHER, cooldown)) {
      console.log(`Google News: cooldown (${cooldown}m) not elapsed, skipping`);
      return;
    }
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

        // Safety net: even targeted queries can return tangential results
        if (!isTitleRelevant(item.title)) continue;

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
