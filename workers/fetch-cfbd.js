// ═══════════════════════════════════════════════════════════════════
//  CFBD Transfer Portal Fetcher
//  Fetches aggregate portal data from CollegeFootballData.com API.
//  Two tasks: Portal Snapshot (year-round) + Preseason Intel (Aug–Nov).
//  Self-governing cooldown: 6h during portal windows, 24h otherwise.
// ═══════════════════════════════════════════════════════════════════

import { shouldRun, recordRun } from './fetcher-utils.js';

const FETCHER = 'cfbd';
const BASE = 'https://api.collegefootballdata.com';
const CURRENT_YEAR = 2026;

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
 * Winter window (Dec 1 – Jan 15): 6 hours
 * Spring window (Apr 1 – Apr 30): 6 hours
 * All other times: 24 hours
 */
function getCooldown() {
  const { month, day } = getETDate();
  if (month === 12 || (month === 1 && day <= 15)) return 360;   // 6h — winter window
  if (month === 4) return 360;                                    // 6h — spring window
  return 1440;                                                    // 24h — off-season
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
  const totalAvailable = entries.filter(e => !e.destination).length;
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

  // 6. Coaching fallout — fetch coaching changes
  let coachingFallout = [];
  try {
    const coaches = await cfbdFetch(env, `/coaches?year=${CURRENT_YEAR}&minYear=${CURRENT_YEAR}&maxYear=${CURRENT_YEAR}`);
    if (Array.isArray(coaches)) {
      const sixtyDaysAgo = new Date(today.getTime() - 60 * 86400000);

      // Find coaches who departed recently (seasons array shows their tenure)
      const recentDepartures = [];
      for (const coach of coaches) {
        if (!coach.seasons || !Array.isArray(coach.seasons)) continue;
        for (const season of coach.seasons) {
          if (!season.school) continue;
          // A coach with an end year matching current year or prior year indicates departure
          if (season.endYear && season.endYear >= CURRENT_YEAR - 1) {
            // Use the end of the season as approximate departure date
            const depDate = new Date(`${season.endYear}-12-01`);
            if (depDate >= sixtyDaysAgo) {
              recentDepartures.push({
                school: season.school,
                coach: `${coach.firstName || ''} ${coach.lastName || ''}`.trim(),
                departureDate: depDate,
              });
            }
          }
        }
      }

      // For each departure, count portal entries from that school within 30 days
      for (const dep of recentDepartures) {
        const thirtyDaysAfter = new Date(dep.departureDate.getTime() + 30 * 86400000);
        const portalCount = entries.filter(e =>
          e.origin === dep.school &&
          e.transferDate &&
          new Date(e.transferDate) >= dep.departureDate &&
          new Date(e.transferDate) <= thirtyDaysAfter
        ).length;

        if (portalCount > 3) {
          coachingFallout.push({
            school: dep.school,
            coach: dep.coach,
            departure_date: dep.departureDate.toISOString().split('T')[0],
            portal_entries_30d: portalCount,
          });
        }
      }

      // Sort by most recent, limit to 3
      coachingFallout.sort((a, b) => b.portal_entries_30d - a.portal_entries_30d);
      coachingFallout = coachingFallout.slice(0, 3);
    }
  } catch (e) {
    console.error('CFBD coaching fetch error:', e.message);
    // Non-fatal — continue without coaching data
  }

  // 7. Prior year total for YoY comparison
  let priorYearTotal = null;
  try {
    const priorEntries = await cfbdFetch(env, `/player/portal?year=${CURRENT_YEAR - 1}`);
    if (Array.isArray(priorEntries)) {
      // Filter to same calendar date range as current year
      const { month, day } = getETDate();
      const cutoffDate = `${CURRENT_YEAR - 1}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      priorYearTotal = priorEntries.filter(e => {
        if (!e.transferDate) return true; // Include entries without dates
        return e.transferDate <= cutoffDate;
      }).length;
    }
  } catch (e) {
    console.error('CFBD prior year fetch error:', e.message);
    // Non-fatal
  }

  // 8. Upsert snapshot row
  try {
    await db.prepare(
      `INSERT INTO portal_snapshot (snapshot_date, year, total_entries, total_available, total_committed, entries_7d, top_gainers, top_losers, coaching_fallout, prior_year_total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(snapshot_date) DO UPDATE SET
         year = excluded.year,
         total_entries = excluded.total_entries,
         total_available = excluded.total_available,
         total_committed = excluded.total_committed,
         entries_7d = excluded.entries_7d,
         top_gainers = excluded.top_gainers,
         top_losers = excluded.top_losers,
         coaching_fallout = excluded.coaching_fallout,
         prior_year_total = excluded.prior_year_total,
         created_at = datetime('now')`
    ).bind(
      dateStr, CURRENT_YEAR, totalEntries, totalAvailable, totalCommitted,
      entries7d, JSON.stringify(topGainers), JSON.stringify(topLosers),
      JSON.stringify(coachingFallout), priorYearTotal
    ).run();
  } catch (e) {
    // snapshot_date doesn't have a UNIQUE constraint yet — use DELETE + INSERT
    await db.prepare('DELETE FROM portal_snapshot WHERE snapshot_date = ?').bind(dateStr).run();
    await db.prepare(
      `INSERT INTO portal_snapshot (snapshot_date, year, total_entries, total_available, total_committed, entries_7d, top_gainers, top_losers, coaching_fallout, prior_year_total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      dateStr, CURRENT_YEAR, totalEntries, totalAvailable, totalCommitted,
      entries7d, JSON.stringify(topGainers), JSON.stringify(topLosers),
      JSON.stringify(coachingFallout), priorYearTotal
    ).run();
  }

  console.log(`CFBD portal snapshot: ${totalEntries} entries (${totalAvailable} avail, ${totalCommitted} committed, ${entries7d} this week)`);
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
