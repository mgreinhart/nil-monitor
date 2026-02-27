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
      entries.push({ norm, words: getSignificantWords(norm) });
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
  'franchise tag', '\\bnflpa\\b',
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
  'announces where.*(?:play|commit)',
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
  // Poll rankings
  'ap poll', 'coaches poll', '(?:moved|moves) up.*(?:poll|rank)',
  'dropped out.*(?:poll|rank)',
  // Bowl / playoff matchup content
  'bowl (?:game|matchup)', 'playoff (?:game|matchup|bracket|picture|seeding)',
  // Schedule / scores roundups
  'championship (?:game|schedule)', 'schedule release', 'scores? (?:from|of|recap)',
  'when does the \\d+ (?:college|ncaa)',
  'most important games.*season',
  // Districts / high school
  'districts? preview', 'high school',
  // Podcast / radio show content
  '\\bshow\\b.*live from', 'live from (?:lovely|beautiful|downtown)',
].join('|'), 'i');

/**
 * Business/regulatory signals — if present, never filter the headline.
 */
const BUSINESS_SIGNAL_RE = /\bnil\b|name.image.likeness|ncaa\s*(?:governance|rule|board|enforce|investigat|reform|restructur|commission|settlement|antitrust)|college sports commission|\bcsc\b|revenue.shar|salary.cap|legislation|congress|senate|house bill|\bbill\b.*(?:athlete|sport|college)|compliance|collective|waiver|title ix.*(?:nil|revenue|athlete)|transfer portal.*(?:rule|window|policy)|realignment|media rights|athlete.*(?:pay|compensat|employ|union|rights)|lawsuit|settlement|litigation|antitrust|private equity|conference.*(?:deal|revenue|expansion)|athletic\s+(?:department|budget|deficit)|intercollegiate|\bsu(?:es?|ed|ing)\b|\btrademark\b|\beligibility\b|\bbuyout\b|\binjunction\b|\brestraining.order\b|jersey\s+patch|above.cap|athletic\s+fee|apparel|operating\s+(?:expense|revenue|budget)|\$\d+[mb].*(?:arena|stadium|facility|venue)|(?:arena|stadium|facility)\s+(?:vote|bond|fund|approv|construct|renovati)/i;

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
  '\\b(?:big\\s+ten|big\\s+12|big\\s+east|pac.12|mountain\\s+west|sun\\s+belt|mac\\b|\\baac\\b|conference\\s+usa)\\b.*(?:deal|rights|equity|revenue|expansion|realign|transition|media)',
  '\\b(?:big\\s+ten|big\\s+12|big\\s+east|pac.12|sec)\\b.*(?:deal|rights|equity|revenue|expansion|realign)',
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

  // Filter game/tournament noise
  if (isGameNoise(cleanTitle)) return false;

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
      if (rn.length >= 20) entries.push({ norm: rn, words: getSignificantWords(rn) });
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
        _dedupCache.entries.push({ norm, words: getSignificantWords(norm) });
      }
    }
    return true;
  } catch {
    return false;
  }
}
