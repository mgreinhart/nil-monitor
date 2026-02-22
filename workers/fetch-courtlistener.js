// ═══════════════════════════════════════════════════════════════════
//  CourtListener Fetcher — Free API (token required)
//  CSLT (College Sports Litigation Tracker) is now the primary case
//  data source, providing case metadata, status, and expert summaries.
//  CourtListener provides supplemental filing activity (docket entries)
//  but no longer drives the Courtroom section. Cases in D1 are keyed
//  by (name, case_number) from CSLT; to re-enable CL integration,
//  match CL docket IDs to CSLT cases via case_number.
//
//  Self-governing cooldown:
//    6 AM–5 PM ET:  every 2 hours
//    5–10 PM ET:    every 4 hours
//    10 PM–6 AM ET: skip
//  Requires: wrangler secret put COURTLISTENER_TOKEN
//    (free — sign up at courtlistener.com, token in profile)
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

async function clFetch(path, token) {
  const resp = await fetch(`${CL_BASE}${path}`, {
    headers: {
      'User-Agent': 'NILMonitor/1.0',
      'Authorization': `Token ${token}`,
    },
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
  const token = env.COURTLISTENER_TOKEN;
  if (!token) {
    console.log('CourtListener: no COURTLISTENER_TOKEN configured, skipping (free at courtlistener.com)');
    return;
  }

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

  // Get active cases — CSLT cases use case_number (e.g. "24-cv-00238"),
  // not CL docket IDs. CL integration is dormant until a mapping is built.
  const { results: cases } = await env.DB.prepare(
    'SELECT id, name, case_number, last_event_date FROM cases WHERE is_active = 1'
  ).all();

  // No cases currently have numeric CL docket IDs — all will be skipped.
  // Future: extract CL docket IDs from case_number or a mapping table.
  let totalUpdated = 0;

  for (const c of cases) {
    // Skip cases without numeric CL docket IDs
    if (!/^\d+$/.test(c.case_number)) {
      continue; // Expected: CSLT cases use court-format case numbers, not CL IDs
    }

    try {
      const entries = await clFetch(
        `/docket-entries/?docket=${c.case_number}&order_by=-date_filed&page_size=5`,
        token
      );

      const latest = entries.results?.[0];
      const lastFilingDate = latest?.date_filed || null;
      const lastAction = stripHtml(latest?.description) || null;

      if (lastFilingDate && lastFilingDate !== c.last_event_date) {
        await env.DB.prepare(
          `UPDATE cases SET
            last_event_text = COALESCE(?, last_event_text),
            last_event_date = COALESCE(?, last_event_date),
            updated_at = datetime('now')
          WHERE id = ?`
        ).bind(lastAction, lastFilingDate, c.id).run();

        totalUpdated++;
        console.log(`CourtListener: NEW FILING "${c.name}" (${lastFilingDate}): ${lastAction?.substring(0, 100)}`);
      }
    } catch (err) {
      console.error(`CourtListener error for "${c.name}":`, err.message);
    }
  }

  await recordRun(env.DB, FETCHER);
  console.log(`CourtListener: done, ${totalUpdated} cases updated`);
}
