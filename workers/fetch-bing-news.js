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

// Trimmed from 62 to 50 (Mar 2026): removed queries that duplicate
// Google News coverage or overlap with other Bing queries.
const QUERIES = [
  // Core NIL / governance / legal
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
  // Private equity / investment
  '"private equity" college sports OR NCAA',
  '"college sports" investment OR ownership',
  '"donor fatigue" college sports OR NIL collective funding',
  // Legislation
  '"SCORE Act" OR "SAFE Act" college sports',
  'NCAA "tournament expansion"',
  '"Title IX" revenue sharing',
  // Organizations
  '"Athletes.org" college',
  '"Otro Capital" OR "Elevate Sports" college athletics',
  // Legal actions
  'university sues athlete OR "breach of contract" college',
  '"NIL buyout" OR "NIL exit fee" college',
  'NCAA eligibility injunction OR "restraining order"',
  '"college football" OR "college basketball" lawsuit OR sued',
  // Business / finance
  '"athletic department" budget OR deficit OR "operating expenses"',
  '"jersey patch" OR "jersey sponsorship" college OR university',
  '"above the cap" OR "above-cap" college athlete OR NCAA',
  '"student athletic fee" increase OR proposed university',
  '"sports media rights" deal OR merger OR acquisition',
  '"broadcast rights" college OR conference',
  // Personnel
  '"athletic director" hired OR named OR contract OR resigned',
  '"conference commissioner" resigned OR hired OR fired',
  // Institutional strategy
  '"college athletics" fundraising OR campaign',
  '"arena" OR "stadium" college OR university construction OR renovation',
  '"college sports" business OR industry',
  '"athletic department" "institutional support" OR "general fund" OR subsidy',
  '"university president" athletics OR "athletic department"',
  // Revenue operations / sponsorship
  '"athletic department" sponsorship revenue OR "naming rights"',
  '"college athletics" "premium seating" OR "ticket revenue" OR reseating',
  // Conference governance
  '"conference governance" OR "conference self-governance" college',
  '"SEC governance" OR "SEC self-governance" OR "SEC autonomy"',
  // AD contract extensions
  '"athletic director" "contract extension" OR "contract renewal"',
  // Executive orders / government
  '"executive order" college sports OR NCAA',
  '"board of regents" athletics OR "college sports"',
  // Damages / entity structures
  '"NCAA damages" OR "NIL damages" lawsuit',
  '"college athletics" LLC OR venture OR privatization',
  '"NIL fund" coach OR donation OR salary',
  // Coverage gaps
  '"multimedia rights" college OR conference extension',
  '"emerging sport" OR "new sport" NCAA university',
  // Federal legislation process
  '"SCORE Act" revision OR markup OR "floor vote"',
  '"college sports" Congress "floor vote" OR hearing OR committee',
  // NCAA governance bodies
  '"DI Council" OR "DI Board" OR "DI Cabinet" NCAA',
  '"DI Membership Committee" OR "autonomy subdivision" NCAA',
  // Paywalled sources
  '"Sports Business Journal" college OR NCAA OR NIL',
  // Revenue sharing cap mechanics
  '"revenue sharing" cap exception OR exceed OR "Bird rights"',
  // Senate hearings / SCORE Act details
  '"Senate hearing" college sports OR NCAA',
  '"SCORE Act" amendment OR provision OR "Lane Kiffin"',
  // White House / executive branch
  '"White House" OR "executive order" "college sports" OR NCAA',
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

export async function fetchBingNews(env, { force = false } = {}) {
  if (!force) {
    const cooldown = getCooldown();
    if (cooldown === null) {
      console.log('Bing News: outside active hours, skipping');
      return;
    }
    if (!await shouldRun(env.DB, FETCHER, cooldown)) {
      console.log(`Bing News: cooldown (${cooldown}m) not elapsed, skipping`);
      return;
    }
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
        // Bing News RSS includes the actual publisher as <News:Source>.
        // Fall back through sourceName (<source> — not present in Bing) then
        // the literal "Bing News" label as a last resort.
        const source = item.bingSource || item.sourceName || 'Bing News';
        const published = item.pubDate ? new Date(item.pubDate).toISOString() : null;

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
