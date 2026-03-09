// ═══════════════════════════════════════════════════════════════════
//  CFBD Transfer Portal Fetcher
//  Fetches aggregate portal data from CollegeFootballData.com API.
//  Two tasks: Portal Snapshot (year-round) + Preseason Intel (Aug–Nov).
//  Self-governing cooldown: 6h during portal window, 24h otherwise.
//
//  NOTE: CFBD is football-only. The football transfer window is
//  Jan 2–16 with a Jan 20–24 grace period for CFP championship teams.
//  Basketball portal data would require a different source.
// ═══════════════════════════════════════════════════════════════════

import { shouldRun, recordRun } from './fetcher-utils.js';

const FETCHER = 'cfbd';
const BASE = 'https://api.collegefootballdata.com';
const CURRENT_YEAR = 2026;

// Position normalization map — CFBD uses detailed positions,
// we group into standard football position groups
const POS_GROUP = {
  QB: 'QB', PRO: 'QB',
  RB: 'RB', FB: 'RB', HB: 'RB',
  WR: 'WR', FL: 'WR', SE: 'WR',
  TE: 'TE',
  OL: 'OL', OT: 'OL', OG: 'OL', C: 'OL', G: 'OL', T: 'OL',
  DL: 'DL', DT: 'DL', DE: 'DL', NT: 'DL', NG: 'DL',
  LB: 'LB', ILB: 'LB', OLB: 'LB', MLB: 'LB', WLB: 'LB', SLB: 'LB',
  DB: 'DB', CB: 'DB', S: 'DB', FS: 'DB', SS: 'DB', NB: 'DB', SAF: 'DB',
  EDGE: 'EDGE', RUSH: 'EDGE',
  K: 'Other', P: 'Other', LS: 'Other', PK: 'Other', ATH: 'Other', APB: 'Other',
};

function normalizePosition(pos) {
  if (!pos) return 'Other';
  const upper = pos.toUpperCase().trim();
  return POS_GROUP[upper] || 'Other';
}

/**
 * Get current ET month/day for period detection.
 */
function getETDate() {
  const now = new Date();
  const etStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const [y, m, d] = etStr.split('-').map(Number);
  return { year: y, month: m, day: d, dateStr: etStr };
}

/**
 * Determine cooldown based on current date period.
 * Football portal window (Jan 2–24): 6 hours
 *   - Jan 2–16: main window, Jan 20–24: CFP championship grace period
 * All other times: 24 hours
 */
function getCooldown() {
  const { month, day } = getETDate();
  if (month === 1 && day >= 2 && day <= 24) return 360;  // 6h — football portal window
  return 1440;                                             // 24h — off-season / preseason
}

/**
 * Should preseason intel run? Only Aug 1 – Nov 30.
 */
function isPreseason() {
  const { month } = getETDate();
  return month >= 8 && month <= 11;
}

/**
 * Fetch from CFBD API with auth header.
 */
async function cfbdFetch(env, endpoint) {
  const resp = await fetch(`${BASE}${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${env.CFBD_KEY}`,
      'Accept': 'application/json',
    },
  });
  if (!resp.ok) {
    throw new Error(`CFBD ${endpoint}: ${resp.status} ${resp.statusText}`);
  }
  return resp.json();
}

/**
 * Task A: Portal Snapshot — aggregate portal data into a single row.
 */
async function runPortalSnapshot(env) {
  const db = env.DB;
  const { dateStr } = getETDate();
  const today = new Date();

  // 1. Fetch current year portal entries
  let entries;
  try {
    entries = await cfbdFetch(env, `/player/portal?year=${CURRENT_YEAR}`);
  } catch (e) {
    console.error('CFBD portal fetch error:', e.message);
    return;
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    console.log('CFBD: no portal entries returned');
    return;
  }

  // 2. Count totals
  const totalEntries = entries.length;
  const available = entries.filter(e => !e.destination);
  const totalAvailable = available.length;
  const totalCommitted = entries.filter(e => e.destination).length;

  // 3. Count entries in last 7 days
  const sevenDaysAgo = new Date(today.getTime() - 7 * 86400000);
  const entries7d = entries.filter(e => {
    if (!e.transferDate) return false;
    return new Date(e.transferDate) >= sevenDaysAgo;
  }).length;

  // 4. Group by destination (arrivals) and origin (departures)
  const arrivals = {};
  const departures = {};
  for (const e of entries) {
    if (e.destination) {
      arrivals[e.destination] = (arrivals[e.destination] || 0) + 1;
    }
    if (e.origin) {
      departures[e.origin] = (departures[e.origin] || 0) + 1;
    }
  }

  // 5. Compute net per school and find top gainers/losers
  const allSchools = new Set([...Object.keys(arrivals), ...Object.keys(departures)]);
  const schoolStats = [];
  for (const school of allSchools) {
    const inCount = arrivals[school] || 0;
    const outCount = departures[school] || 0;
    schoolStats.push({ school, in: inCount, out: outCount, net: inCount - outCount });
  }

  const topGainers = [...schoolStats].sort((a, b) => b.net - a.net).slice(0, 5);
  const topLosers = [...schoolStats].sort((a, b) => a.net - b.net).slice(0, 5);

  // 6. Most active — total movement (arrivals + departures) per school
  const mostActive = [...schoolStats]
    .map(s => ({ school: s.school, arrivals: s.in, departures: s.out, total_moves: s.in + s.out }))
    .sort((a, b) => b.total_moves - a.total_moves)
    .slice(0, 5);

  // 7. Position availability — group available players by position
  const posCounts = {};
  for (const e of available) {
    const group = normalizePosition(e.position);
    posCounts[group] = (posCounts[group] || 0) + 1;
  }
  // Sort by standard position order
  const POS_ORDER = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'EDGE', 'Other'];
  const positionAvailability = POS_ORDER
    .filter(p => posCounts[p])
    .map(p => ({ position: p, count: posCounts[p] }));

  // 8. Average star rating of available players
  const starRatings = available
    .map(e => e.stars)
    .filter(s => s != null && s > 0);
  const avgStarRating = starRatings.length > 0
    ? Math.round((starRatings.reduce((sum, s) => sum + s, 0) / starRatings.length) * 10) / 10
    : null;

  // 9. Upsert snapshot row
  try {
    await db.prepare('DELETE FROM portal_snapshot WHERE snapshot_date = ?').bind(dateStr).run();
    await db.prepare(
      `INSERT INTO portal_snapshot (snapshot_date, year, total_entries, total_available, total_committed, entries_7d, top_gainers, top_losers, most_active, position_availability, avg_star_rating)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      dateStr, CURRENT_YEAR, totalEntries, totalAvailable, totalCommitted,
      entries7d, JSON.stringify(topGainers), JSON.stringify(topLosers),
      JSON.stringify(mostActive), JSON.stringify(positionAvailability), avgStarRating
    ).run();
  } catch (e) {
    console.error('CFBD snapshot insert error:', e.message);
  }

  console.log(`CFBD portal snapshot: ${totalEntries} entries (${totalAvailable} avail, ${totalCommitted} committed, ${entries7d} this week, avg ${avgStarRating}★)`);
}

/**
 * Task B: Preseason Intel — returning production + recruiting rankings.
 * Only runs Aug 1 – Nov 30.
 */
async function runPreseasonIntel(env) {
  const db = env.DB;

  // 1. Fetch returning production
  let returningProd = [];
  try {
    const returning = await cfbdFetch(env, `/player/returning?year=${CURRENT_YEAR}`);
    if (Array.isArray(returning) && returning.length > 0) {
      // Sort by totalPPA descending
      const sorted = returning
        .filter(r => r.totalPPA !== null && r.totalPPA !== undefined)
        .sort((a, b) => (b.totalPPA || 0) - (a.totalPPA || 0));

      const top5 = sorted.slice(0, 5).map(r => ({
        school: r.school,
        conference: r.conference || '',
        ppa_returning_pct: Math.round((r.totalPPA || 0) * 100),
      }));
      const bottom5 = sorted.slice(-5).reverse().map(r => ({
        school: r.school,
        conference: r.conference || '',
        ppa_returning_pct: Math.round((r.totalPPA || 0) * 100),
      }));

      returningProd = { top: top5, bottom: bottom5 };
    }
  } catch (e) {
    console.error('CFBD returning production error:', e.message);
    return;
  }

  // 2. Fetch recruiting rankings
  let recruitingRanks = [];
  try {
    const recruiting = await cfbdFetch(env, `/recruiting/teams?year=${CURRENT_YEAR}`);
    if (Array.isArray(recruiting)) {
      recruitingRanks = recruiting
        .sort((a, b) => (a.rank || 999) - (b.rank || 999))
        .slice(0, 10)
        .map(r => ({ school: r.team, rank: r.rank, points: r.points }));
    }
  } catch (e) {
    console.error('CFBD recruiting error:', e.message);
    // Non-fatal
  }

  // 3. Upsert into preseason_intel
  await db.prepare('DELETE FROM preseason_intel WHERE year = ?').bind(CURRENT_YEAR).run();
  await db.prepare(
    `INSERT INTO preseason_intel (year, returning_production, recruiting_rankings)
     VALUES (?, ?, ?)`
  ).bind(CURRENT_YEAR, JSON.stringify(returningProd), JSON.stringify(recruitingRanks)).run();

  console.log(`CFBD preseason intel: ${recruitingRanks.length} recruiting ranks`);
}

/**
 * Main fetcher entry point.
 */
export async function fetchCFBD(env, { force = false } = {}) {
  // Skip silently if no API key
  if (!env.CFBD_KEY) {
    console.log('CFBD: no CFBD_KEY set, skipping');
    return;
  }

  if (!force) {
    const cooldown = getCooldown();
    if (!await shouldRun(env.DB, FETCHER, cooldown)) {
      console.log(`CFBD: cooldown (${cooldown}m) not elapsed, skipping`);
      return;
    }
  }

  console.log('CFBD: starting fetch...');

  // Task A always runs
  await runPortalSnapshot(env);

  // Task B only during preseason (Aug–Nov)
  if (isPreseason()) {
    await runPreseasonIntel(env);
  }

  await recordRun(env.DB, FETCHER);
  console.log('CFBD: fetch complete');
}
