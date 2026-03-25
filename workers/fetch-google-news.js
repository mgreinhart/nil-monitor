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

// Diverse queries — each targets a distinct topic to minimize overlap.
// Bing News covers the same space with its own index, so no need to
// duplicate every permutation here.
//
// Trimmed from 105 to 76 (Mar 2026): removed duplicate/overlapping
// queries and low-yield site: searches for law firms.
const QUERIES = [
  // Core NIL / governance / legal
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
  // Private equity / investment
  '"private equity" college sports OR NCAA',
  '"college sports" investment OR ownership stake',
  // Labor / employment
  '"collective bargaining" college athletes',
  '"employee status" college athletes',
  // Eligibility / legal actions
  'NCAA eligibility lawsuit',
  'university sues athlete OR "breach of contract" college',
  '"NIL buyout" OR "NIL exit fee" OR "NIL contract" lawsuit',
  'NCAA eligibility injunction OR "restraining order"',
  '"college football" OR "college basketball" lawsuit OR sued',
  'NCAA trademark OR "March Madness" trademark',
  // Business / finance
  '"athletic department" budget OR deficit OR "operating expenses"',
  '"jersey patch" OR "jersey sponsorship" college OR university',
  '"above the cap" OR "above-cap" college athlete OR NCAA',
  'Nike OR Adidas college "NIL" OR "above-cap" OR "revenue sharing"',
  '"student athletic fee" increase OR proposed university',
  '"state legislature" OR "state lawmaker" NIL OR "college athlete" OR "revenue sharing"',
  // Media rights / broadcast
  '"TNT Sports" OR "CBS Sports" media rights',
  '"Warner Bros Discovery" sports',
  '"Paramount" sports broadcast',
  '"ESPN" media deal OR rights deal',
  // Facilities / naming rights / partnerships
  '"naming rights" college OR university',
  '"partnership" college athletics OR "athletic department"',
  '"facility" college athletics OR "stadium construction"',
  // Personnel
  '"athletic director" hired OR named OR fired OR resigned',
  '"conference commissioner" college OR NCAA',
  '"deputy athletic director" OR "senior associate AD" OR "associate athletic director"',
  '"general manager" college athletics OR "collegiate GM"',
  // Industry-specific sources
  'Teamworks college sports',
  'Opendorse NIL',
  'Learfield college athletics',
  // Institutional strategy
  '"college athletics" fundraising OR "fundraising campaign"',
  '"arena" OR "stadium" college OR university vote OR bond OR approved OR construction',
  '"college sports" business OR industry',
  '"athletic department" layoffs OR restructuring OR "budget cuts"',
  'NACDA OR "National Association of Collegiate Directors of Athletics"',
  '"athletic department" "institutional support" OR "general fund" OR subsidy',
  '"college athletics" "financial plan" OR "budget crisis" OR "fundraising campaign"',
  // Coaching contracts / NIL ops / tech
  '"coaching contract" extension college OR university',
  '"head coach" contract OR salary college OR university',
  '"in-house NIL" OR "NIL operations" college athletics',
  '"multimedia rights" college OR university OR conference',
  '"athletic department" technology OR "tech partnership" OR vendor',
  '"ticket revenue" OR "ticket sales" college OR university athletics',
  '"women\'s wrestling" OR "emerging sport" NCAA',
  '"university president" hired OR named OR "board of trustees" athletics',
  'NCAA tournament format OR expansion OR "player availability"',
  // Conference governance / self-governance
  '"conference governance" OR "conference self-governance" OR "conference autonomy" college',
  '"SEC governance" OR "SEC self-governance" OR "SEC autonomy"',
  // AD contract extensions
  '"athletic director" "contract extension" OR "contract renewal"',
  // 247Sports (no RSS)
  'site:247sports.com NIL OR "revenue sharing" OR "transfer portal" OR "athletic director"',
  // Executive orders / government
  '"executive order" college sports OR NCAA',
  '"board of regents" athletics OR "college sports" OR "private equity"',
  // Damages / entity structures / advocacy
  '"NCAA damages" OR "NIL damages" lawsuit',
  '"college athletics" LLC OR venture OR "private entity"',
  '"athlete survey" OR "player survey" college OR NCAA',
  '"NIL fund" coach OR donation OR salary',
  // Program cuts / endowments / apparel
  '"endowed" OR "endowment" college OR university athletics OR "athletic department"',
  '"discontinue" OR "eliminate" OR "cut" sport college OR university athletics',
  '"apparel" deal OR extension OR provider college OR university OR conference',
  // Industry sources without RSS
  'site:extrapointsmb.com',
  'site:sportslawinsider.com',
  // Federal legislation process (SCORE Act, floor votes, Congress)
  '"SCORE Act" college sports',
  '"college sports" legislation Congress',
  '"college athletics" "federal legislation" OR "floor vote" OR "markup"',
  // NCAA governance bodies (DI Council, DI Board, committees)
  '"NCAA governance" OR "DI Council" OR "DI Board"',
  'NCAA "transfer portal" circumvention OR tampering penalties',
  '"DI Cabinet" OR "DI Membership Committee" OR "NCAA subdivision"',
  // Paywalled sources that appear in Google News index
  'site:sportsbusinessjournal.com college OR NCAA OR NIL',
  // Revenue sharing cap mechanics
  '"revenue sharing" cap exception OR exceed OR retention college',
  // Senate hearings on college sports
  '"Senate hearing" "college sports" OR "college athletics" OR NCAA',
  // SCORE Act specific angles (Lane Kiffin Rule, amendments)
  '"SCORE Act" revision OR amendment OR "Lane Kiffin" OR provision',
  // White House / executive branch actions on college sports
  '"White House" "college sports" OR "college athletics"',
  'Trump "college sports" committee OR council OR commission OR "executive order"',
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
