// ═══════════════════════════════════════════════════════════════════
//  Publication RSS Fetcher — Direct feeds from sports outlets
//  Bypasses Google/Bing indexing delays, catches articles faster.
//  Self-governing cooldown:
//    6 AM–10 PM ET: every 30 min
//    10 PM–6 AM ET: skip
//
//  Two tiers:
//    Curated (sports business): insert all articles
//    General (college sports): only insert if title matches keywords
// ═══════════════════════════════════════════════════════════════════

import { parseRSS } from './rss-parser.js';
import { getETHour, shouldRun, recordRun, categorizeByKeyword } from './fetcher-utils.js';

const FETCHER = 'publications';

// Curated: sports business focus — most content is relevant
// General: firehose feeds — only insert keyword-matched articles
const FEEDS = [
  // ── Curated (insert all) ──
  { url: 'https://www.sportico.com/feed/', source: 'Sportico', curated: true },
  { url: 'https://frontofficesports.com/feed/', source: 'Front Office Sports', curated: true },

  // ── General (keyword-filter) ──
  { url: 'https://www.cbssports.com/rss/headlines/college-football/', source: 'CBS Sports', curated: false },
  { url: 'https://www.espn.com/espn/rss/ncf/news', source: 'ESPN', curated: false },
  { url: 'https://www.on3.com/feed/', source: 'On3', curated: false },
  { url: 'https://rss.nytimes.com/services/xml/rss/nyt/Sports.xml', source: 'NYT', curated: false },
];

// Broader relevance check for general feeds — matches titles that touch
// NIL, NCAA governance, college sports business, litigation, etc.
const RELEVANCE_RE = /\bnil\b|name.image.likeness|ncaa|college\s*(?:sports?|athlet)|transfer\s*portal|revenue.shar|salary.cap|collective|realignment|conference.*(?:move|join|expan|media)|antitrust|lawsuit|settlement|house\s*v|court\s*lis|litigation|enforcement|compliance|csc\b|college\s*sports?\s*commission|waiver|eligibil|roster\s*limit|portal\s*window|title\s*ix|athlete\s*(?:pay|comp|union|employ)|dartmouth|nlrb|governance|restructur|rule\s*change|bylaw|sponsor|endorse/i;

function getCooldown() {
  const h = getETHour();
  if (h >= 6 && h < 22) return 30;
  return null;
}

export async function fetchPublications(env) {
  const cooldown = getCooldown();
  if (cooldown === null) {
    console.log('Publications: outside active hours, skipping');
    return;
  }
  if (!await shouldRun(env.DB, FETCHER, cooldown)) {
    console.log(`Publications: cooldown (${cooldown}m) not elapsed, skipping`);
    return;
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

        // General feeds: skip articles that don't match college sports keywords
        if (!feed.curated && !RELEVANCE_RE.test(item.title)) {
          totalSkipped++;
          continue;
        }

        const published = item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString();
        const category = categorizeByKeyword(item.title);

        try {
          await env.DB.prepare(
            `INSERT OR IGNORE INTO headlines (source, title, url, category, published_at)
             VALUES (?, ?, ?, ?, ?)`
          ).bind(feed.source, item.title, item.link, category, published).run();
          feedInserted++;
        } catch (e) {
          // UNIQUE constraint on url — skip duplicates
        }
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
