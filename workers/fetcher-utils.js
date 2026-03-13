// ═══════════════════════════════════════════════════════════════════
//  Shared Fetcher Utilities
//  Self-governing cooldowns, keyword tagging, run tracking,
//  entity decoding, URL normalization, noise filtering.
// ═══════════════════════════════════════════════════════════════════

// ── Dedup Helpers ─────────────────────────────────────────────────────

/**
 * Strip trailing source suffix that aggregators append to titles.
 * "NCAA eyes penalties for transfer violations - ESPN" → "NCAA eyes penalties for transfer violations"
 * Only strips if the remaining title is still substantial (>20 chars).
 */
function stripSourceSuffix(title) {
  const m = title.match(/^(.{20,})\s+[-–—]\s+\S.{1,50}$/);
  if (m) return m[1];
  const p = title.match(/^(.{20,})\s+\|\s+\S.{1,50}$/);
  if (p) return p[1];
  return title;
}

/**
 * Normalize a title for dedup comparison: strip source suffix,
 * lowercase, remove non-alphanumeric, compress whitespace.
 */
function normalizeForDedup(title) {
  return stripSourceSuffix(title).toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Extract significant words (>3 chars) for Jaccard similarity.
 */
function getSignificantWords(normalizedTitle) {
  return new Set(normalizedTitle.split(' ').filter(w => w.length > 3));
}

/**
 * Extract distinctive proper nouns from a title — capitalized words
 * that aren't common/stop words or known entity names.
 */
const COMMON_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'has', 'have',
  'had', 'be', 'been', 'being', 'will', 'would', 'could', 'should', 'may',
  'might', 'new', 'says', 'said', 'after', 'over', 'into', 'about', 'its',
  'not', 'all', 'can', 'more', 'this', 'that', 'than', 'how', 'why', 'what',
  // Domain entities too common to be distinctive
  'NCAA', 'College', 'Sports', 'NIL', 'Football', 'Basketball', 'Athletic',
  'University', 'Conference', 'Report', 'News', 'Update', 'Power', 'State',
  'National', 'Commission', 'Court', 'Federal', 'House', 'Senate', 'Big',
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
]);

function extractProperNouns(title) {
  // Match capitalized words (2+ chars) that aren't at sentence start after ": " or "— "
  const words = title.match(/\b[A-Z][a-zA-Z]{1,}\b/g) || [];
  return words.filter(w => !COMMON_WORDS.has(w));
}

const ACTION_CONTEXT_RE = /appeal|ruling|injunction|eligib|sued|su(?:es?|ing)|settlement|lawsuit|investigation|enforce|compliance|inquiry|sanction|penalt|decision|challenge|block|overturn|dismiss|denied|grant|filed|motion|cleared/i;

/**
 * Returns true if two titles share a distinctive proper noun AND
 * both contain an action-context word — strong signal of same story.
 */
function sharesEntityAndAction(titleA, titleB) {
  const nounsA = extractProperNouns(titleA);
  const nounsB = new Set(extractProperNouns(titleB));
  const sharedNouns = nounsA.filter(n => nounsB.has(n));
  if (sharedNouns.length === 0) return false;
  return ACTION_CONTEXT_RE.test(titleA) && ACTION_CONTEXT_RE.test(titleB);
}

/**
 * Jaccard similarity between two word sets: |A∩B| / |A∪B|.
 */
function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection++;
  return intersection / (setA.size + setB.size - intersection);
}

// ── Dedup Cache ─────────────────────────────────────────────────────
// Pre-loaded once per cron invocation to avoid per-headline DB queries.
// Without this, every insertHeadline() call does a full 7-day table scan,
// causing hundreds of concurrent D1 queries when fetchers run in parallel.
let _dedupCache = null;

export async function loadDedupCache(db) {
  const { results } = await db.prepare(
    `SELECT title FROM headlines WHERE published_at >= date('now', '-7 days')`
  ).all();

  const exactTitles = new Set();
  const entries = [];

  for (const r of results) {
    exactTitles.add(r.title);
    const norm = normalizeForDedup(r.title);
    if (norm.length >= 20) {
      entries.push({ norm, words: getSignificantWords(norm), origTitle: r.title });
    }
  }

  _dedupCache = { exactTitles, entries };
  console.log(`Dedup cache loaded: ${results.length} titles`);
}

export function clearDedupCache() {
  _dedupCache = null;
}

/**
 * Get current hour in America/New_York (handles DST automatically).
 */
export function getETHour() {
  return parseInt(
    new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/New_York' })
  );
}

/**
 * Check if a fetcher should run based on its cooldown.
 * Returns true if enough time has elapsed since last run.
 * 2-minute grace period prevents timing drift: fetchers take 1-2 min
 * to process all queries, so recordRun writes at :01 or :02 instead
 * of :00. Without grace, a 30-min cooldown recorded at :01 would skip
 * the :30 cron (29 min elapsed) and not run until :45 (44-min gap).
 */
export async function shouldRun(db, fetcherName, cooldownMinutes) {
  if (cooldownMinutes === null) return false;

  const row = await db.prepare(
    'SELECT last_run FROM fetcher_runs WHERE fetcher_name = ?'
  ).bind(fetcherName).first();

  if (!row?.last_run) return true; // Never run before

  const lastRun = new Date(row.last_run.includes('T') ? row.last_run : row.last_run + 'Z');
  const elapsed = (Date.now() - lastRun.getTime()) / 60000;
  return elapsed >= cooldownMinutes - 2;
}

/**
 * Record that a fetcher just ran.
 */
export async function recordRun(db, fetcherName) {
  await db.prepare(
    `INSERT INTO fetcher_runs (fetcher_name, last_run) VALUES (?, datetime('now'))
     ON CONFLICT(fetcher_name) DO UPDATE SET last_run = datetime('now')`
  ).bind(fetcherName).run();
}

/**
 * Record that a fetcher errored.
 */
export async function recordError(db, fetcherName, error) {
  const msg = error?.message || String(error);
  await db.prepare(
    `INSERT INTO fetcher_runs (fetcher_name, last_error, last_error_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(fetcher_name) DO UPDATE SET last_error = ?, last_error_at = datetime('now')`
  ).bind(fetcherName, msg, msg).run();
}

// ── HTML Entity Decoding ────────────────────────────────────────────

const NAMED_ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
  '&nbsp;': ' ', '&ndash;': '\u2013', '&mdash;': '\u2014',
  '&lsquo;': '\u2018', '&rsquo;': '\u2019', '&ldquo;': '\u201C', '&rdquo;': '\u201D',
  '&hellip;': '\u2026', '&bull;': '\u2022', '&middot;': '\u00B7',
};

/**
 * Decode HTML entities — named (&amp;), decimal (&#8217;), hex (&#x2019;).
 */
export function decodeEntities(text) {
  if (!text) return text;
  return text
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|ndash|mdash|lsquo|rsquo|ldquo|rdquo|hellip|bull|middot);/gi,
      m => NAMED_ENTITIES[m.toLowerCase()] || m)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

// ── URL Normalization ───────────────────────────────────────────────

const STRIP_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'msclkid', 'ref', 'ncid', 'cid', 'mc_cid', 'mc_eid',
  '_ga', '_gid', 'ns_mchannel', 'ns_source', 'ns_campaign',
]);

/**
 * Normalize a URL for better deduplication.
 * Strips tracking params, fragments, trailing slashes, www prefix.
 */
export function normalizeUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    for (const p of [...u.searchParams.keys()]) {
      if (STRIP_PARAMS.has(p)) u.searchParams.delete(p);
    }
    u.hash = '';
    u.hostname = u.hostname.replace(/^www\./, '');
    const path = u.pathname.replace(/\/+$/, '') || '/';
    const search = u.search || '';
    return u.origin.replace('://www.', '://') + path + search;
  } catch {
    return rawUrl;
  }
}

// ── Pro Sports Noise Filter ──────────────────────────────────────

const COLLEGE_CONTEXT_RE = /college|ncaa|nil\b|university|athletic director|conference commissioner|college sports|student.athlete|transfer portal|revenue.shar|eligibility|\bcsc\b|college football|college basketball/i;

const PRO_SPORTS_NOISE_RE = new RegExp([
  // NFL teams and NFL-specific business
  '\\b(?:cowboys?|eagles?|chiefs?|packers?|bears?|49ers|broncos?|patriots?|steelers?|ravens?|dolphins?|jets?|commanders?|saints|texans|falcons|bengals|chargers|colts|jaguars|titans|browns|giants|seahawks|rams|lions|panthers|buccaneers|cardinals|vikings|bills)\\b',
  '\\bnfl\\b.*(?:free agen|tv|disabilit|contract|trade|roster|staff|franchise tag|combine|draft|schedule|season|preseason|regular season)',
  '\\bnfl free agent\\b', '\\bfranchise tag\\b.*(?:nfl|\\b(?:cowboys?|eagles?|chiefs?|packers?)\\b)',
  '\\bnflpa\\b',
  // NBA teams and NBA-specific
  '\\b(?:nets|knicks|lakers|celtics|warriors|heat|bucks|nuggets|76ers|suns|clippers|cavaliers|hawks|raptors|grizzlies|pelicans|spurs|mavericks|rockets|timberwolves|blazers|magic|thunder|pistons|wizards|hornets|pacers)\\b',
  '\\bnba\\b.*(?:trade|contract|free agen|roster|draft|playoff|all.star)',
  // NHL teams and NHL-specific
  '\\b(?:bruins|blackhawks|maple leafs|canadiens|penguins|red wings|flyers|oilers|avalanche|lightning|hurricanes|islanders|blue jackets|predators|kraken|wild|flames|canucks|ducks|coyotes|sharks|blues|capitals|devils|sabres)\\b',
  '\\bnhl\\b(?!.*(?:college|ncaa|nil|university))',
  // MLB teams and MLB-specific
  '\\b(?:yankees|red sox|dodgers|astros|braves|phillies|cubs|mets|cardinals|padres|mariners|orioles|twins|guardians|royals|rays|rangers|marlins|brewers|diamondbacks|reds|rockies|pirates|white sox|athletics|blue jays|nationals|tigers|angels)\\b',
  '\\bmlb\\b(?!.*(?:college|ncaa|nil|university))',
  // NWSL, WNBA, MLS without college context
  '\\bnwsl\\b.*(?:franchise|valuation|sale|expansion|draft|trade|roster)',
  '\\bwnba\\b(?!.*(?:college|ncaa|nil|university|parallel))',
  '\\bwnbpa\\b',
  '\\bmls\\b(?!.*(?:college|ncaa|nil|university))',
  // International / other pro sports
  '\\bpremier league\\b', '\\bla liga\\b', '\\bbundesliga\\b', '\\bserie a\\b',
  '\\bfa cup\\b', '\\bchampions league\\b',
  '\\bformula.(?:1|one)\\b', '\\bf1\\b.*(?:race|grand prix|qualifying|driver)',
  '\\bufc\\b(?!.*(?:college|ncaa|nil|university))',
  '\\bwrexham\\b',
  // Figure skating, Olympics without college context
  '\\bfigure skating\\b', '\\bolympics?\\b(?!.*(?:college|ncaa|nil|university|student.athlete))',
  '\\bolympic\\b(?!.*(?:college|ncaa|nil|university|student.athlete))',
  // FIFA, World Cup, international soccer without college context
  '\\bfifa\\b(?!.*(?:college|ncaa|nil|university))',
  '\\bworld cup\\b(?!.*(?:college|ncaa|nil|university))',
  '\\bcopa america\\b',
  // World Baseball Classic
  '\\bworld baseball classic\\b', '\\bwbc\\b(?!.*(?:college|ncaa|nil|university))',
  // MLB spring training without college context
  '\\bspring training\\b(?!.*(?:college|ncaa|nil|university))',
  '\\bmlb spring\\b',
  // Pro sports hospitality / experience economy
  '\\bexperience economy\\b.*(?:sports?|hospitality)',
  '\\bhospitality\\b.*(?:fifa|world cup|super bowl|nfl|nba|mlb|nhl|mls|olympics?)',
  // General sports psychology / body language without college context
  '\\b(?:sports? psychology|body language)\\b(?!.*(?:college|ncaa|nil|university|athlete))',
  // PGA / golf without college context
  '\\bpga\\s+tour\\b(?!.*(?:college|ncaa|nil|university))',
  '\\bpga\\s+championship\\b', '\\bmasters\\s+tournament\\b',
  '\\blpga\\b(?!.*(?:college|ncaa|nil|university))',
  // NFL-specific business / media
  '\\bnfl\\s+network\\b', '\\bnfl\\s+schedule\\b', '\\bnfl\\s+owners?\\b',
  '\\bnfl\\s+offseason\\b', '\\bnfl\\s+(?:broadcast|ratings|viewership)\\b',
  '\\bnfl.*(?:free\\s+agenc|salary\\s+cap|franchise\\s+tag|trade\\s+deadline)\\b',
  // NBA-specific business
  '\\bnba\\b.*(?:scoring|record|trade deadline|free agenc|salary cap|playoff race|all.star game)',
  '\\bnba\\s+(?:broadcast|ratings|viewership|schedule)\\b',
  // Memorabilia / collector / trading cards (pro sports context)
  '\\bcollector\\s+frenzy\\b', '\\btrading\\s+card\\b', '\\bcard\\s+market\\b',
  '\\bmemorabilia\\b(?!.*(?:college|ncaa|nil|university))',
  // Pro sports upfront / TV business without college context
  '\\bupfront\\s+season\\b(?!.*(?:college|ncaa|nil|university))',
  // Sports TV business headlines without college context
  '\\bsports\\s+tv\\b(?!.*(?:college|ncaa|nil|university|conference|march madness))',
].join('|'), 'i');

/**
 * Returns true (reject) if the headline is clearly about professional sports
 * with NO college athletics context.
 *
 * Logic: If a headline matches pro sports noise AND a business signal but has
 * no college context, the pro sports filter wins. Business signals only rescue
 * headlines that also contain college/NCAA/university context.
 */
export function isProSportsNoise(title) {
  if (!title) return false;
  if (COLLEGE_CONTEXT_RE.test(title)) return false;
  if (!PRO_SPORTS_NOISE_RE.test(title)) return false;
  // Pro sports noise matched. Business signal alone doesn't save it —
  // "NFL Network revenue" is still pro sports noise without college context.
  return true;
}

// ── Spam Title Filter ───────────────────────────────────────────

const BLOCKED_DOMAINS = ['padelspain', 'clearancefind', 'dealsfind'];

const SPAM_TITLE_RE = new RegExp([
  'clearance.*(?:sale|best|deal|shop)',
  '(?:best sale|hot deal|limited offer).*(?:football|basketball|sports)',
].join('|'), 'i');

/**
 * Returns true if the title looks like spam/shopping content.
 */
export function isSpamTitle(title) {
  if (!title) return false;
  return SPAM_TITLE_RE.test(title);
}

/**
 * Returns true if the URL is from a known spam domain.
 */
export function isBlockedDomain(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  return BLOCKED_DOMAINS.some(d => lower.includes(d));
}

// ── Game Noise Filter ───────────────────────────────────────────────

const GAME_NOISE_RE = new RegExp([
  // Tournament / bracket content
  'bracket', 'march madness', 'final four', 'elite eight', 'sweet sixteen',
  'round of \\d+', 'first round', 'second round',
  'ncaa tournament(?!.*(?:revenue|nil|lawsuit|settlement|reform))',
  'ncaa championships?(?!.*(?:revenue|nil|lawsuit|settlement|reform))',
  'tournament (?:seed|bubble|bid|hopes|action|update)',
  'top.(?:16|4|8)\\s+seed', '\\d-seed\\b', 'seed line',
  'selection committee(?!.*(?:reform|governance|restructur))',
  'punch(?:ed|es|ing)?\\s+(?:ticket|bid).*(?:big dance|march madness|ncaa tournament)',
  'punch(?:ed|es|ing)?\\s+(?:ticket|bid)\\s+to\\b',
  // Game coverage
  'game recap', 'game preview', 'game day', 'gameday', 'tipoff', 'tip-off',
  'kickoff', 'kick-off', 'halftime', 'overtime', 'final score',
  'box score', 'highlights', 'full replay', 'live updates?:? track',
  'buzzer.beater', 'miraculous (?:turnaround|comeback|win)',
  // Scores / results
  '\\d{1,3}-\\d{1,3}\\s+(?:win|loss|victory|defeat|record)',
  '\\d+-\\d+\\s+(?:team|hoops|basketball|football)',
  // Predictions / betting / odds
  'picks? (?:and|&) predictions?', 'betting odds', 'point spread',
  'over.under', 'moneyline', 'parlay', 'prop bet',
  'fantasy (?:football|basketball)',
  'odds.*prediction', 'from (?:proven|computer|best) model',
  // Draft / NFL Combine
  'mock draft', 'nfl draft', 'nba draft', 'draft pick',
  'draft (?:riser|faller|sleeper|stock|prospect|grade|choice)',
  'nfl combine', '\\bat the combine\\b', 'combine (?:results?|workouts?|grades?|measurements?|testing|day|week)',
  '(?:risers?|speedsters?|prospects?).*\\bcombine\\b',
  '\\b(?:40.yard|bench press|vertical jump|broad jump|shuttle|cone drill)\\b',
  // NFL / pro team content
  'franchise tag',
  '\\bnfl\\b.*(?:free agenc|contract|trade|roster|staff)',
  '\\b(?:cowboys?|eagles?|chiefs?|packers?|bears?|49ers|broncos?|patriots?|steelers?|ravens?|dolphins?|jets?|commanders?|saints|texans|falcons|bengals|chargers|colts|jaguars|titans|browns|giants|seahawks|rams|lions|panthers|buccaneers|cardinals|vikings|bills)\\b.*(?:sign|trade|hire|staff|contract|roster|tag|release)',
  // Non-college pro sports (no college context)
  '\\bwnba\\b(?!.*(?:college|ncaa|nil|university|parallel))',
  '\\b(?:mlb|nhl|mls|nascar|ufc)\\b(?!.*(?:college|ncaa|nil|university))',
  '\\bpremier league\\b', '\\bla liga\\b', '\\bbundesliga\\b', '\\bserie a\\b',
  '\\bformula.(?:1|one)\\b', '\\bf1\\b.*(?:race|grand prix|stream|bet)',
  // Sportsbook / gambling companies
  '\\b(?:fanduel|draftkings|betmgm|bet365|caesars sportsbook)\\b(?!.*(?:college|ncaa|nil|university|athlete))',
  // Recruiting / commitments (game context, not policy)
  '(?:4|5)-star (?:recruit|prospect|edge|quarterback|receiver|lineman)',
  '\\d-star (?:recruit|prospect)', 'national signing day',
  'recruiting (?:class|rank)', 'commitment tracker',
  'landed a commitment', 'commits? to\\b', 'decommit',
  'players? still available',
  'official visit(?:s)?\\s+(?:tracker|plans?|set|add)',
  'schedules.*official visit', 'announces where.*(?:play|commit)',
  '^Next:\\s+\\d{4}\\s+',
  // Coaching carousel (not governance)
  'coaching (?:search|carousel|hire[ds]?|fired)',
  "couldn't pass.*(?:opportunity|chance).*(?:coach|staff)",
  // Player / game specifics
  'injury (?:report|update)', 'depth chart',
  'projected (?:starter|lineup)', 'stat line',
  'all-american team', 'player of the (?:year|week)',
  'heisman (?:watch|odds|winner|race|trophy|contender)',
  'out of (?:boot|brace|cast|drills?)',
  'putting up (?:big|huge|impressive) numbers',
  // How-to-watch
  'how to watch', 'where to watch', 'what channel', 'live stream',
  'watch (?:list|party)',
  // Practice / camp
  'spring (?:game|practice)', 'fall camp', 'preseason (?:poll|rank)',
  // Poll rankings / media ballots / predictions
  'ap poll', 'coaches poll', '(?:moved|moves) up.*(?:poll|rank)',
  'dropped out.*(?:poll|rank)',
  'media\\s+ballot', 'all.(?:conference|big\\s+ten|sec|acc|pac|big\\s+12)\\s+(?:ballot|vote|pick|prediction)',
  // Bowl / playoff matchup content
  'bowl (?:game|matchup)', 'playoff (?:game|matchup|bracket|picture|seeding)',
  // Schedule / scores roundups
  'championship (?:game|schedule)', 'schedule release', 'scores? (?:from|of|recap)',
  'when does the \\d+ (?:college|ncaa)',
  'most important games.*season',
  // Rankings / power rankings (not governance)
  'power rankings', '\\btop 25\\b', 'college (?:baseball|basketball|softball|football).*rank',
  // Game analysis / results phrases
  '(?:straight|consecutive) (?:loss|win|defeat)', 'signature (?:victory|win)',
  '(?:OT|overtime) thriller', '(?:late.season|midseason) swoon',
  'takes? (?:blame|responsibility) for.*(?:loss|performance)',
  'rout of\\b', 'can win it all',
  'postseason implications', 'home (?:loss|win|defeat)',
  '\\bwin over\\b', 'glimpse into the future',
  // Recap / review articles
  'week in review', 'weekly (?:recap|roundup|rundown)',
  // Listicle / takes format (not policy analysis)
  'top\\s+(?:five|5|ten|10)\\s+takes?:?',
  // Player features / nostalgia (not policy)
  'I played with', 'changed my life', 'sports trivia',
  // Coaching hot seat / firings (broader)
  '\\bhot seat\\b',
  '\\bfires?\\b.*(?:head coach|coach|coordinator)',
  '\\boverhaul\\b.*(?:basketball|football)\\s+programs?',
  // NBA teams (pro basketball, not college)
  '\\b(?:nets|knicks|lakers|celtics|warriors|heat|bucks|nuggets|76ers|suns|clippers|cavaliers|hawks|raptors|grizzlies|pelicans|spurs|mavericks|rockets|timberwolves|blazers|magic|thunder|pistons|wizards|hornets|pacers)\\b.*(?:sign|trade|contract|10.day|roster)',
  '\\b(?:10|ten).day contract\\b',
  // Non-college sports
  'gold medal(?!.*(?:college|ncaa|nil|university))',
  'team usa(?!.*(?:college|ncaa|nil|university))',
  // Districts / high school
  'districts? preview', 'high school',
  // Podcast / radio show content
  '\\bshow\\b.*live from', 'live from (?:lovely|beautiful|downtown)',
  // Odds / best bets roundups
  'best bets.*odds', 'top games to watch.*(?:odds|bets)',
  // Game predictions/picks/odds (tighter patterns)
  'prediction.*picks?.*odds', 'picks?.*odds.*today',
  'predictions?.*today.s.*game',
  // Individual player transfer portal scouting (not portal policy)
  'transfer portal scouting report', 'portal (?:target|commitment|tracker|rankings?)',
  'best fits? for (?:transfer portal|portal)',
  '\\btransfer portal\\b.*(?:scouting|ranking|top\\s+\\d|best\\s+fits?|targets?)',
  // Individual player eligibility cases (not policy)
  'granted extra (?:year|season|eligibility)',
  'pursuing eligibility case',
  'granted.*(?:year|season).*eligibility',
  'done pursuing.*eligibility',
  // Individual NIL deal announcements (single athlete, no policy angle)
  'signs? (?:nil|NIL) deal with',
  'lands? (?:nil|NIL) deal',
  '(?:olympian|quarterback|guard|forward|receiver|lineman).*signs?.*(?:nil|NIL).*deal',
  // NFLPA / pro league union stories (unless college context present)
  '\\bnflpa\\b(?!.*(?:college|ncaa|nil|university|conference commissioner|athletic director))',
  // Team-specific portal grading/haul reviews (not broad overviews)
  'grading the.*transfer portal (?:haul|class|additions)',
  'transfer portal (?:haul|class).*(?:grade|review|breakdown)',
  // Pre-spring/spring roster content (not policy)
  'pre.spring (?:ball|practice|depth|roster)',
  'eligibility chart',
  // Non-college pro sports leagues that slip through Tier 1 feeds
  '\\bnwsl\\b(?!.*(?:college|ncaa|nil|university))',
  '\\bwnba\\b(?!.*(?:college|ncaa|nil|university))',
  '\\bmls\\b(?!.*(?:college|ncaa|nil|university))',
].join('|'), 'i');

/**
 * Business/regulatory signals — if present, never filter the headline.
 */
const BUSINESS_SIGNAL_RE = /\bnil\b|name.image.likeness|ncaa\s*(?:governance|rule|board|enforce|investigat|reform|restructur|commission|settlement|antitrust)|college sports commission|\bcsc\b|revenue.shar|salary.cap|legislation|congress|senate|house bill|\bbill\b.*(?:athlete|sport|college)|compliance|collective|waiver|title ix.*(?:nil|revenue|athlete)|transfer portal.*(?:rule|window|policy)|realignment|media rights|athlete.*(?:pay|compensat|employ|union|rights)|lawsuit|settlement|litigation|antitrust|private equity|conference.*(?:deal|revenue|expansion)|athletic\s+(?:department|budget|deficit)|intercollegiate|\bsu(?:es?|ed|ing)\b|\btrademark\b|\beligibility\b|\bbuyout\b|\binjunction\b|\brestraining.order\b|jersey\s+patch|above.cap|athletic\s+fee|apparel|operating\s+(?:expense|revenue|budget)|\$\d+[mb].*(?:arena|stadium|facility|venue)|(?:arena|stadium|facility)\s+(?:vote|bond|fund|approv|construct|renovati)|athletic\s+director|conference\s+commissioner|\bfundraising\b|\bphilanthropy\b|\bcapital campaign\b|\bcampaign\b.*(?:college|university|athletic)|\b(?:arena|stadium)\b.*(?:vote|bond|approv|construct|renovat|fund)|\bsponsorship\b|\bnaming rights\b|\bpremium seating\b|\breseating\b|\bticket sales\b|\bseason tickets\b|\bfan rewards\b|\bloyalty program\b/i;

/**
 * Returns true if the title is game/tournament noise (not business/regulatory).
 * Headlines with business signals always pass through.
 */
export function isGameNoise(title) {
  if (!title) return false;
  if (BUSINESS_SIGNAL_RE.test(title)) return false;
  return GAME_NOISE_RE.test(title);
}

// ── Keyword Categorization ──────────────────────────────────────────

/**
 * Instant keyword tagging — assign a category based on title keywords.
 * Returns null if no keywords match (AI pipeline will tag later).
 */
export function categorizeByKeyword(title) {
  const t = title.toLowerCase();

  // Order matters: more specific patterns first
  if (/\bcsc\b|college sports commission|tip line/.test(t)) return 'CSC / Enforcement';
  if (/\bncaa\s+governance\b|ncaa\s+board|d-i council|\brule change\b|\bbylaw\b|\bwaiver\b/.test(t)) return 'NCAA Governance';
  if (/\bbill\b|legislation|committee hearing|senate|house bill|\blaw\b|statute|governor sign/.test(t)) return 'Legislation';
  if (/lawsuit|court|settlement|ruling|\bjudge\b|\bfiled\b|\bv\.\s|plaintiff|defendant/.test(t)) return 'Litigation';
  if (/revenue.sharing|salary cap|compensation cap|\bnil deal\b|\bcollective\b/.test(t)) return 'Revenue Sharing';
  if (/transfer portal|\broster\s+limit\b|scholarship limit|eligibility\s+(?:rule|waiver|transfer)|\bportal\s+(?:window|rule|policy)\b/.test(t)) return 'Roster / Portal';
  if (/realignment|\bconference\b.*\b(?:move|join|leav|add|expan)\b|media rights/.test(t)) return 'Realignment';

  // Broader enforcement/investigation patterns (after CSC check)
  if (/\benforcement\b|\binvestigation\b|\bcompliance\b/.test(t)) return 'CSC / Enforcement';

  // Business / Finance — personnel, fundraising, facilities, PE, ownership, revenue ops
  if (/\bathletic director\b|\bconference commissioner\b|\bfundraising\b|\bphilanthropy\b|\bcapital campaign\b|\bdonor\b.*(?:college|university|athlet)|\bcampaign\b.*(?:athlet|universit)|\barena\b.*(?:\$|million|bond|vote)|\bstadium\b.*(?:\$|million|bond|vote)|private equity|\bownership\b.*(?:college|university|athlet)|\bsponsorship\b|\bnaming rights\b|\bpremium seating\b|\breseating\b|\bticket sales\b|\bseason tickets\b|\bfan rewards\b|\bloyalty program\b|\bdiscontinue\b|\beliminate\b.*(?:sport|program|team)/.test(t)) return 'Business / Finance';

  return null;
}

// ── Title Relevance Gate ─────────────────────────────────────────

/**
 * Strict title relevance check — at least one keyword related to
 * NIL, college athletics regulation, or governance must appear.
 * Used by all headline fetchers as a universal quality gate.
 */
const TITLE_RELEVANCE_RE = new RegExp([
  // Core NIL / governance
  '\\bnil\\b', 'name.image.likeness', '\\bncaa\\b',
  'college\\s+athlete', 'student.athlete', 'transfer\\s+portal',
  'revenue.shar', 'title\\s+ix',
  'college\\s+(?:sports?|athletics|football|basketball)',
  'athletic[s]?\\s+(?:directors?|departments?|budgets?|deficits?|fees?|salary|salaries)',
  '\\bathletics\\b.*(?:private|equity|revenue|invest|budget|deficit)',
  'intercollegiate', '\\bcompliance\\b', '\\bcollective\\b',
  'house\\s+v\\.?', '\\bcsc\\b', 'college\\s+sports?\\s+commission',
  // University + business context
  '\\buniversit(?:y|ies)\\b.*(?:athlet|nil|revenue|private equity|invest|su(?:es?|ed|ing))',
  // Conferences — Power + Group of 5
  '\\bpower\\s+(?:4|5|four|five)\\b', 'conference\\s+realignment',
  '\\b(?:big\\s+ten|big\\s+12|big\\s+east|pac.12|mountain\\s+west|sun\\s+belt|mac\\b|\\baac\\b|conference\\s+usa)\\b.*(?:deal|rights|equity|revenue|expansion|realign|transition|media|governance|self.governance|enforcement|autonomy)',
  '\\b(?:big\\s+ten|big\\s+12|big\\s+east|pac.12|sec)\\b.*(?:deal|rights|equity|revenue|expansion|realign|governance|self.governance|enforcement|autonomy)',
  // Eligibility / legal
  '\\beligibility\\b',
  '\\bbuyout\\b.*(?:college|athlete|transfer|nil|ncaa)',
  '\\b(?:lawsuit|injunction|restraining.order)\\b.*(?:college|ncaa|athlete|transfer|eligib|athletic)',
  '(?:college|ncaa|athlete|transfer|eligib|athletic).*\\b(?:lawsuit|injunction|restraining.order)\\b',
  '\\bsu(?:es?|ed|ing)\\b.*(?:\\bncaa\\b|college|athlete|quarterback|transfer|eligib)',
  '(?:\\bncaa\\b|university|college).*\\bsu(?:es?|ed|ing)\\b',
  // Business / finance (require college context)
  'jersey\\s+patch.*(?:college|university|athletic|ncaa|nil|revenue)',
  '(?:college|university|athletic|ncaa).*jersey\\s+patch',
  'above.the.cap.*(?:college|ncaa|nil|athlete)',
  '(?:college|ncaa|nil|athlete).*above.the.cap',
  'above.cap.*(?:college|ncaa|nil|athlete)',
  '(?:college|ncaa|nil|athlete).*above.cap',
  'athletic\\s+fee.*(?:college|university|increase)',
  '(?:college|university).*athletic\\s+fee',
  'apparel\\s+(?:deal|contract).*(?:college|ncaa|nil)',
  'operating\\s+(?:expenses?|revenue|budget).*(?:college|university|athletic)',
  '(?:college|university|athletic).*operating\\s+(?:expenses?|revenue|budget)',
  'private\\s+equity.*(?:college|university|athletic)',
  // Sports media / broadcast — require college/conference context
  '(?:tnt\\s+sports|cbs\\s+sports|espn|fox\\s+sports).*(?:media\\s+rights|rights\\s+deal|rights\\s+fee)',
  '(?:tnt\\s+sports|cbs\\s+sports).*(?:college|conference|merger|portfolio|ncaa)',
  '(?:media\\s+rights|broadcast\\s+rights|tv\\s+deal).*(?:college|conference|ncaa|\\bsec\\b|big\\s+ten)',
  '(?:college|conference|ncaa).*(?:media\\s+rights|broadcast\\s+rights|tv\\s+deal)',
  // Personnel — AD hires/fires, conference commissioners, senior staff
  'athletic\\s+director.*(?:hired|named|fired|resigned|contract|extension|new|search)',
  '(?:hired|named|fired|resigned|extension).*athletic\\s+director',
  '\\b(?:ad|a\\.d\\.)\\b.*(?:hired|named|fired|resigned|contract\\s+extension|new\\s+ad|ad\\s+search).*(?:college|university|athletic|ncaa)',
  '(?:college|university|athletic|ncaa|a&m).*\\b(?:ad|a\\.d\\.)\\b.*(?:hired|named|fired|resigned|contract|extension)',
  'conference\\s+commissioner',
  'conference\\s+(?:governance|self.governance|autonomy|enforcement)',
  '\\bsenior\\s+associate\\s+ad\\b|\\bdeputy\\s+(?:ad|athletic\\s+director)\\b',
  '\\bgeneral\\s+manager\\b.*(?:college|university|athletic)',
  // Facilities — require college context + financial signal
  '(?:college|university).*(?:arena|stadium).*(?:\\$\\d|million|bond|vote|approv|construction|renovation)',
  '(?:arena|stadium).*(?:college|university).*(?:\\$\\d|million|bond|vote|approv|construction|renovation)',
  // Governance bodies — regents, trustees with athletic context
  '\\b(?:board\\s+of\\s+regents|regents)\\b.*(?:athlet|college|universit|nil|revenue|private\\s+equity|oversight|autonom)',
  '(?:athlet|college|universit).*\\b(?:board\\s+of\\s+regents|regents)\\b',
  // Athletic entity structures — LLCs, ventures, privatization
  '(?:athlet|college|university).*(?:\\bllc\\b|\\bventure[s]?\\b|privatiz)',
  '(?:\\bllc\\b|\\bventure[s]?\\b|privatiz).*(?:athlet|college|university)',
  // Athlete advocacy organizations
  '\\bathletes\\.org\\b',
  // Executive orders on college sports
  'executive\\s+order.*(?:college|ncaa|nil|athlete)',
  '(?:college|ncaa|nil|athlete).*executive\\s+order',
  // Industry association
  '\\bnacda\\b',
  // Revenue operations — sponsorship, naming rights, premium seating, fundraising
  '(?:naming rights|premium seating|reseating|suite|loge|club seats).*(?:college|university|athletic)',
  '(?:college|university|athletic).*(?:naming rights|premium seating|reseating|suite|loge|club seats)',
  '(?:sponsorship|partnership|corporate sponsor).*(?:college|university|athletic)',
  '(?:college|university|athletic).*(?:sponsorship|partnership|corporate sponsor)',
  '(?:fundraising|philanthropy|capital campaign|donor|giving).*(?:college|university|athletic)',
  '(?:college|university|athletic).*(?:fundraising|philanthropy|capital campaign|donor|giving)',
  '(?:ticket sales|season tickets|sellout streak|attendance record).*(?:college|university|athletic)',
  'fan rewards|loyalty program|card.linked.*(?:college|university|athletic)',
  // Antitrust / labor / unionization (require college context)
  'antitrust.*(?:college|ncaa|athlete|university|intercollegiate)',
  '(?:college|ncaa|athlete|university|intercollegiate).*antitrust',
  'employee classification.*(?:college|ncaa|athlete)',
  '(?:college|ncaa|athlete).*employee classification',
  '\\bunioniz(?:e|ation|ing)\\b.*(?:college|ncaa|athlete)',
  '(?:college|ncaa|athlete).*\\bunioniz(?:e|ation|ing)\\b',
  '\\bnlrb\\b.*(?:college|ncaa|athlete|student)',
  'collective bargain.*(?:college|ncaa|athlete)',
  // Program discontinuation / emerging sports
  '(?:discontinue|eliminate|cut).*(?:sport|program|team).*(?:college|university|athletic)',
  '(?:college|university|athletic).*(?:discontinue|eliminate|cut).*(?:sport|program|team)',
  // Endowments
  'endow(?:ed|ment).*(?:college|university|athletic)',
  '(?:college|university|athletic).*endow(?:ed|ment)',
].join('|'), 'i');

export function isTitleRelevant(title) {
  if (!title) return false;
  return TITLE_RELEVANCE_RE.test(title);
}

// ── Shared Headline Insert ──────────────────────────────────────────

/**
 * Insert a headline with entity decoding, URL normalization,
 * noise filtering, and title-based deduplication.
 * Returns true if inserted, false if skipped/duplicate.
 */
export async function insertHeadline(db, { source, title, url, category, published }) {
  const cleanTitle = decodeEntities(title);
  if (!cleanTitle || !url) return false;

  // Filter chain: game noise → pro sports noise → spam → blocked domains
  if (isGameNoise(cleanTitle)) return false;
  if (isProSportsNoise(cleanTitle)) return false;
  if (isSpamTitle(cleanTitle)) return false;
  if (isBlockedDomain(url)) return false;

  // Normalize URL for better dedup
  const cleanUrl = normalizeUrl(url);

  // Categorize with cleaned title
  const cat = category || categorizeByKeyword(cleanTitle);

  // Title dedup — use pre-loaded cache if available, otherwise query DB
  let exactTitles, entries;
  if (_dedupCache) {
    exactTitles = _dedupCache.exactTitles;
    entries = _dedupCache.entries;
  } else {
    const { results: recent } = await db.prepare(
      `SELECT title FROM headlines WHERE published_at >= date('now', '-7 days')`
    ).all();
    exactTitles = new Set(recent.map(r => r.title));
    entries = [];
    for (const r of recent) {
      const rn = normalizeForDedup(r.title);
      if (rn.length >= 20) entries.push({ norm: rn, words: getSignificantWords(rn), origTitle: r.title });
    }
  }

  // Exact title match
  if (exactTitles.has(cleanTitle)) return false;

  // Fuzzy dedup: suffix-stripped normalization + substring + Jaccard similarity
  const norm = normalizeForDedup(cleanTitle);
  if (norm.length >= 20) {
    const incomingWords = getSignificantWords(norm);

    for (const entry of entries) {
      // Normalized exact match (now with source suffixes stripped)
      if (entry.norm === norm) return false;

      // Substring containment
      if (entry.norm.length >= 30 && norm.length >= 30 &&
          (entry.norm.includes(norm) || norm.includes(entry.norm))) return false;

      // Jaccard word similarity — catches moderate rewordings of the same headline
      if (incomingWords.size >= 3 && entry.words.size >= 3 &&
          jaccardSimilarity(incomingWords, entry.words) >= 0.65) return false;

      // Entity-based dedup: shared proper noun + action context → lower threshold
      if (incomingWords.size >= 3 && entry.words.size >= 3 &&
          jaccardSimilarity(incomingWords, entry.words) >= 0.45) {
        if (sharesEntityAndAction(cleanTitle, entry.origTitle || '')) return false;
      }
    }
  }

  // Insert (URL UNIQUE constraint still catches remaining dupes)
  try {
    await db.prepare(
      `INSERT OR IGNORE INTO headlines (source, title, url, category, published_at)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(source, cleanTitle, cleanUrl, cat, published).run();
    // Update cache so parallel fetchers see this insert
    if (_dedupCache) {
      _dedupCache.exactTitles.add(cleanTitle);
      if (norm.length >= 20) {
        _dedupCache.entries.push({ norm, words: getSignificantWords(norm), origTitle: cleanTitle });
      }
    }
    return true;
  } catch {
    return false;
  }
}
