// ═══════════════════════════════════════════════════════════════════
//  CourtListener Fetcher — Unauthenticated Public API
//  Self-governing cooldown:
//    6 AM–5 PM ET:  every 2 hours
//    5–10 PM ET:    every 4 hours
//    10 PM–6 AM ET: skip
//  For each tracked case with a numeric source_id (CL docket ID),
//  fetches latest docket entries and updates D1. Setting updated_at
//  on change flags the case for the next AI pipeline run.
// ═══════════════════════════════════════════════════════════════════

import { getETHour, shouldRun, recordRun } from './fetcher-utils.js';

const FETCHER = 'courtlistener';
const CL_BASE = 'https://www.courtlistener.com/api/rest/v4';

function getCooldown() {
  const h = getETHour();
  if (h >= 6 && h < 17) return 120;
  if (h >= 17 && h < 22) return 240;
  return null;
}

async function clFetch(path) {
  const resp = await fetch(`${CL_BASE}${path}`, {
    headers: { 'User-Agent': 'NILMonitor/1.0' },
  });
  if (!resp.ok) throw new Error(`CourtListener ${path}: ${resp.status}`);
  return resp.json();
}

// Strip HTML tags from docket entry descriptions
function stripHtml(str) {
  if (!str) return null;
  return str.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim();
}

export async function fetchCourtListener(env) {
  const cooldown = getCooldown();
  if (cooldown === null) {
    console.log('CourtListener: outside active hours, skipping');
    return;
  }
  if (!await shouldRun(env.DB, FETCHER, cooldown)) {
    console.log(`CourtListener: cooldown (${cooldown}m) not elapsed, skipping`);
    return;
  }

  console.log('Fetching CourtListener updates...');

  // Get all tracked cases with a numeric source_id (CourtListener docket ID)
  const { results: cases } = await env.DB.prepare(
    'SELECT id, source_id, name, last_filing_date, filing_count FROM cases'
  ).all();

  let totalUpdated = 0;

  for (const c of cases) {
    // Skip cases without numeric CL docket IDs
    if (!/^\d+$/.test(c.source_id)) {
      console.log(`CourtListener: skipping "${c.name}" (no CL docket ID)`);
      continue;
    }

    try {
      // Fetch latest docket entries (most recent 5)
      const entries = await clFetch(
        `/docket-entries/?docket=${c.source_id}&order_by=-date_filed&page_size=5`
      );

      const filingCount = entries.count || 0;
      const latest = entries.results?.[0];
      const lastFilingDate = latest?.date_filed || null;
      const lastAction = stripHtml(latest?.description) || null;
      const clUrl = `https://www.courtlistener.com/docket/${c.source_id}/`;

      // Detect changes
      const hasNewFiling = lastFilingDate && lastFilingDate !== c.last_filing_date;
      const countChanged = filingCount !== (c.filing_count || 0);

      if (hasNewFiling || countChanged) {
        // Update case — setting updated_at flags it for the AI pipeline
        await env.DB.prepare(
          `UPDATE cases SET
            last_filing_date = COALESCE(?, last_filing_date),
            filing_count = ?,
            last_action = COALESCE(?, last_action),
            courtlistener_url = ?,
            updated_at = datetime('now')
          WHERE id = ?`
        ).bind(lastFilingDate, filingCount, lastAction, clUrl, c.id).run();

        totalUpdated++;
        if (hasNewFiling) {
          console.log(`CourtListener: NEW FILING "${c.name}" (${lastFilingDate}): ${lastAction?.substring(0, 100)}`);
        } else {
          console.log(`CourtListener: "${c.name}" count ${c.filing_count || 0} → ${filingCount}`);
        }
      } else {
        console.log(`CourtListener: "${c.name}" — no changes`);
      }
    } catch (err) {
      console.error(`CourtListener error for "${c.name}":`, err.message);
    }
  }

  await recordRun(env.DB, FETCHER);
  console.log(`CourtListener: done, ${totalUpdated} cases updated`);
}
