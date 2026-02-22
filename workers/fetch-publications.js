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
import { getETHour, shouldRun, recordRun, insertHeadline } from './fetcher-utils.js';

const FETCHER = 'publications';

// Curated: sports business focus — most content is relevant
// General: firehose feeds — only insert keyword-matched articles
const FEEDS = [
  // ── Curated (insert all — niche sports business focus) ──
  { url: 'https://businessofcollegesports.com/feed/', source: 'Business of College Sports', curated: true },
  { url: 'https://athleticdirectoru.com/feed/', source: 'AthleticDirectorU', curated: true },

  // ── Keyword-filtered (broad sports business — covers MLB, NFL, etc.) ──
  { url: 'https://www.sportico.com/feed/', source: 'Sportico', curated: false },
  { url: 'https://frontofficesports.com/feed/', source: 'Front Office Sports', curated: false },

  // ── Light filter (sports law — skip pure pro-sports articles) ──
  { url: 'https://sportslitigationalert.com/feed/', source: 'Sports Litigation Alert', curated: false,
    filter: /\bcollege|\bncaa|\bnil\b|\bathlet|\buniversit/i },

  // ── General (keyword-filter) ──
  { url: 'https://www.cbssports.com/rss/headlines/college-football/', source: 'CBS Sports', curated: false },
  { url: 'https://www.espn.com/espn/rss/ncf/news', source: 'ESPN', curated: false },
  { url: 'https://www.on3.com/feed/', source: 'On3', curated: false },
  { url: 'https://rss.nytimes.com/services/xml/rss/nyt/Sports.xml', source: 'NYT', curated: false },
];

// Broader relevance check for general feeds — matches titles that touch
// NIL, NCAA governance, college sports business, coaching contracts,
// AD concerns, Title IX, women's sports investment, etc.
const RELEVANCE_RE = /\bnil\b|name.image.likeness|ncaa|college\s*(?:sports?|athlet|football|basketball)|transfer\s*portal|revenue.shar|salary.cap|collective|realignment|conference.*(?:move|join|expan|media)|antitrust|lawsuit|settlement|house\s*v|court\s*lis|litigation|enforcement|compliance|csc\b|college\s*sports?\s*commission|waiver|eligibil|roster\s*limit|portal\s*window|title\s*ix|athlete\s*(?:pay|comp|union|employ)|dartmouth|nlrb|governance|restructur|rule\s*change|bylaw|sponsor|endorse|coach.*(?:contract|deal|extension|hire|fir)|women'?s\s*sports?|head\s*coach|athletic\s*director|power\s*(?:four|five|conference)|(?:big\s*(?:ten|12|east)|sec|acc|pac)\b.*(?:deal|rights|revenue|contract)/i;

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

        // Non-curated feeds: skip articles that don't match keywords
        if (!feed.curated) {
          const re = feed.filter || RELEVANCE_RE;
          if (!re.test(item.title)) {
            totalSkipped++;
            continue;
          }
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
