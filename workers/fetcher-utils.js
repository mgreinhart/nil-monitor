// ═══════════════════════════════════════════════════════════════════
//  Shared Fetcher Utilities
//  Self-governing cooldowns, keyword tagging, run tracking.
// ═══════════════════════════════════════════════════════════════════

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
 */
export async function shouldRun(db, fetcherName, cooldownMinutes) {
  if (cooldownMinutes === null) return false;

  const row = await db.prepare(
    'SELECT last_run FROM fetcher_runs WHERE fetcher_name = ?'
  ).bind(fetcherName).first();

  if (!row?.last_run) return true; // Never run before

  const lastRun = new Date(row.last_run.includes('T') ? row.last_run : row.last_run + 'Z');
  const elapsed = (Date.now() - lastRun.getTime()) / 60000;
  return elapsed >= cooldownMinutes;
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
 * Instant keyword tagging — assign a category based on title keywords.
 * Returns null if no keywords match (AI pipeline will tag later).
 */
export function categorizeByKeyword(title) {
  const t = title.toLowerCase();

  // Order matters: more specific patterns first
  if (/\bcsc\b|college sports commission|tip line/.test(t)) return 'CSC / Enforcement';
  if (/\bncaa governance\b|ncaa board|d-i council|rule change|bylaw|waiver/.test(t)) return 'NCAA Governance';
  if (/\bbill\b|legislation|committee hearing|senate|house bill|\blaw\b|statute|governor sign/.test(t)) return 'Legislation';
  if (/lawsuit|court|settlement|ruling|\bjudge\b|\bfiled\b|\bv\.\s|plaintiff|defendant/.test(t)) return 'Litigation';
  if (/revenue.sharing|salary cap|compensation cap|\bnil deal\b|\bcollective\b/.test(t)) return 'Revenue Sharing';
  if (/transfer portal|\broster\b|scholarship|eligibility|\bportal\b/.test(t)) return 'Roster / Portal';
  if (/realignment|\bconference\b.*\b(move|join|leav|add)|expansion|media rights/.test(t)) return 'Realignment';

  // Broader enforcement/investigation patterns (after CSC check)
  if (/\benforcement\b|\binvestigation\b|\bcompliance\b/.test(t)) return 'CSC / Enforcement';

  return null;
}
