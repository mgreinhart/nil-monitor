// ═══════════════════════════════════════════════════════════════════
//  Publication RSS Fetcher — Three-tier filtering model
//  Self-governing cooldown:
//    6 AM–10 PM ET: every 30 min
//    10 PM–6 AM ET: skip
//
//  Tier 1 (niche business/regulatory feeds): noise filter only
//  Tier 2 (broad college sports feeds):      relevance gate + noise filter
// ═══════════════════════════════════════════════════════════════════

import { parseRSS } from './rss-parser.js';
import { getETHour, shouldRun, recordRun, insertHeadline, isGameNoise, isProSportsNoise, isTitleRelevant } from './fetcher-utils.js';

const FETCHER = 'publications';

// Government feeds are in Tier 1 but publish across ALL topics.
// Apply relevance gate to these sources even though they're Tier 1.
const GOV_SOURCES = new Set(['NLRB', 'NCAA.org']);

// Tier 1 — Business/regulatory scoped. No relevance gate needed.
// These outlets focus on college sports business, law, or governance by design.
const TIER1_FEEDS = [
  { url: 'https://businessofcollegesports.com/feed/', source: 'Business of College Sports' },
  { url: 'https://athleticdirectoru.com/feed/', source: 'AthleticDirectorU' },
  { url: 'https://www.sportico.com/feed/', source: 'Sportico' },
  { url: 'https://frontofficesports.com/feed/', source: 'Front Office Sports' },
  { url: 'https://www.nytimes.com/athletic/rss/college-sports/', source: 'The Athletic' },
  // CollegeAD feed removed — RSS returns 2020-era content only, site stopped publishing to it
  { url: 'https://www.lexblog.com/site/collegiate-professional-sports-law-blog/feed/', source: 'LexBlog College Sports' },
  { url: 'https://biz.opendorse.com/blog/category/ncaa/feed/', source: 'Opendorse' },
  { url: 'https://biz.opendorse.com/blog/category/nil/feed/', source: 'Opendorse' },
  // Government / institutional feeds — general topics, source-specific relevance check applied below
  { url: 'https://www.nlrb.gov/rss/rssPressReleases.xml', source: 'NLRB' },
  { url: 'https://www.nlrb.gov/rss/rssWeeklySummaries.xml', source: 'NLRB' },
  { url: 'https://www.ncaa.org/rss', source: 'NCAA.org' },
];

// Tier 2 — Broad college sports feeds. Relevance gate required.
// These produce mostly game/recruiting content alongside business stories.
const TIER2_FEEDS = [
  { url: 'https://sportslitigationalert.com/feed/', source: 'Sports Litigation Alert' },
  { url: 'https://www.on3.com/feed/', source: 'On3' },
  { url: 'https://www.cbssports.com/rss/headlines/college-football/', source: 'CBS Sports' },
  { url: 'https://www.cbssports.com/rss/headlines/college-basketball/', source: 'CBS Sports' },
  { url: 'https://www.espn.com/espn/rss/ncf/news', source: 'ESPN' },
  { url: 'https://www.espn.com/espn/rss/ncb/news', source: 'ESPN' },
  { url: 'https://sports.yahoo.com/rss/', source: 'Yahoo Sports' },
  { url: 'https://www.nytimes.com/athletic/rss/college-football/', source: 'The Athletic' },
  // Global sports law — relevance gate filters non-college content
  { url: 'https://www.nortonrosefulbright.com/en/inside-sports-law/blog/rss', source: 'Norton Rose Fulbright' },
  // Conference feeds — mostly sports results, relevance gate catches the rare business story
  { url: 'https://horizonleague.org/rss.aspx', source: 'Horizon League' },
  { url: 'https://theacc.com/rss.aspx', source: 'ACC' },
  { url: 'https://big12sports.com/rss.aspx', source: 'Big 12' },
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

  const allFeeds = [
    ...TIER1_FEEDS.map(f => ({ ...f, tier: 1 })),
    ...TIER2_FEEDS.map(f => ({ ...f, tier: 2 })),
  ];

  for (const feed of allFeeds) {
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

        // Tier 1 (niche business feeds): game noise + pro sports noise filter
        // Tier 2 (broad sports feeds): relevance gate + game noise + pro sports noise filter
        // Government feeds (Tier 1 but general topics): relevance gate required
        if (GOV_SOURCES.has(feed.source) && !isTitleRelevant(item.title)) {
          totalSkipped++;
          continue;
        }
        if (feed.tier === 2 && !isTitleRelevant(item.title)) {
          totalSkipped++;
          continue;
        }
        if (isGameNoise(item.title)) {
          totalSkipped++;
          continue;
        }
        if (isProSportsNoise(item.title)) {
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
