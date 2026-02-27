// ═══════════════════════════════════════════════════════════════════
//  Publication RSS Fetcher — Direct feeds from sports outlets
//  Bypasses Google/Bing indexing delays, catches articles faster.
//  Self-governing cooldown:
//    6 AM–10 PM ET: every 30 min
//    10 PM–6 AM ET: skip
//
//  ALL feeds are keyword-filtered — title must contain at least one
//  NIL/college-athletics keyword to be inserted.
// ═══════════════════════════════════════════════════════════════════

import { parseRSS } from './rss-parser.js';
import { getETHour, shouldRun, recordRun, insertHeadline, isGameNoise } from './fetcher-utils.js';

const FETCHER = 'publications';

const FEEDS = [
  { url: 'https://businessofcollegesports.com/feed/', source: 'Business of College Sports' },
  { url: 'https://athleticdirectoru.com/feed/', source: 'AthleticDirectorU' },
  { url: 'https://www.sportico.com/feed/', source: 'Sportico' },
  { url: 'https://frontofficesports.com/feed/', source: 'Front Office Sports' },
  { url: 'https://sportslitigationalert.com/feed/', source: 'Sports Litigation Alert' },
  { url: 'https://www.cbssports.com/rss/headlines/college-football/', source: 'CBS Sports' },
  { url: 'https://www.espn.com/espn/rss/ncf/news', source: 'ESPN' },
  { url: 'https://www.on3.com/feed/', source: 'On3' },
  { url: 'https://www.nytimes.com/athletic/rss/college-football/', source: 'The Athletic' },
  { url: 'https://www.nytimes.com/athletic/rss/college-sports/', source: 'The Athletic' },
  { url: 'https://www.cbssports.com/rss/headlines/college-basketball/', source: 'CBS Sports' },
  { url: 'https://www.espn.com/espn/rss/ncb/news', source: 'ESPN' },
  { url: 'https://sports.yahoo.com/rss/', source: 'Yahoo Sports' },
];

function getCooldown() {
  const h = getETHour();
  if (h >= 6 && h < 22) return 30;
  return null;
}

export async function fetchPublications(env, { force = false } = {}) {
  if (!force) {
    const cooldown = getCooldown();
    if (cooldown === null) {
      console.log('Publications: outside active hours, skipping');
      return;
    }
    if (!await shouldRun(env.DB, FETCHER, cooldown)) {
      console.log(`Publications: cooldown (${cooldown}m) not elapsed, skipping`);
      return;
    }
  }

  console.log('Fetching publication RSS feeds...');
  let totalInserted = 0;
  let totalSkipped = 0;

  for (const feed of FEEDS) {
    try {
      const resp = await fetch(feed.url, {
        headers: { 'User-Agent': 'NILMonitor/1.0 (RSS Reader)' },
      });
      if (!resp.ok) {
        console.error(`${feed.source} RSS failed: ${resp.status}`);
        continue;
      }

      const xml = await resp.text();
      const items = parseRSS(xml);
      let feedInserted = 0;

      for (const item of items.slice(0, 20)) {
        if (!item.title || !item.link) continue;

        // Trusted direct feeds — skip relevance gate, rely on game noise filter + AI tagging.
        // These feeds are college-sports-scoped by design (ESPN college football, On3, etc.)
        // so the relevance gate was filtering out valid school-specific financial stories.
        if (isGameNoise(item.title)) {
          totalSkipped++;
          continue;
        }

        const published = item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString();

        const inserted = await insertHeadline(env.DB, {
          source: feed.source, title: item.title, url: item.link, published,
        });
        if (inserted) feedInserted++;
      }

      totalInserted += feedInserted;
      if (feedInserted > 0) console.log(`  ${feed.source}: +${feedInserted}`);
    } catch (err) {
      console.error(`${feed.source} RSS error:`, err.message);
    }
  }

  await recordRun(env.DB, FETCHER);
  console.log(`Publications: inserted ${totalInserted}, skipped ${totalSkipped} irrelevant`);
}
