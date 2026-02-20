// ═══════════════════════════════════════════════════════════════════
//  CourtListener Fetcher
//  Updates tracked cases from CourtListener REST API v4.
//  Works without auth for public data. Optional token for higher
//  rate limits: wrangler secret put COURTLISTENER_TOKEN
// ═══════════════════════════════════════════════════════════════════

const CL_BASE = 'https://www.courtlistener.com/api/rest/v4';

async function clFetch(path, token) {
  const headers = { 'User-Agent': 'NILMonitor/1.0' };
  if (token) {
    headers['Authorization'] = `Token ${token}`;
  }
  const resp = await fetch(`${CL_BASE}${path}`, { headers });
  if (!resp.ok) throw new Error(`CourtListener ${path}: ${resp.status}`);
  return resp.json();
}

export async function fetchCourtListener(env) {
  const token = env.COURTLISTENER_TOKEN || null;

  console.log('Fetching CourtListener updates...');

  // Get all tracked cases that have a source_id
  const { results: cases } = await env.DB.prepare(
    'SELECT id, source_id, name FROM cases'
  ).all();

  for (const c of cases) {
    try {
      // Step 1: Search for the case if we don't have a CourtListener docket ID
      // source_id is either a CL docket ID (numeric) or a slug we seeded
      let docketId = c.source_id;

      // If source_id is not numeric, search for the case by name
      if (!/^\d+$/.test(docketId)) {
        const search = await clFetch(
          `/search/?type=d&q=${encodeURIComponent(c.name)}&order_by=score+desc`,
          token
        );
        if (search.results && search.results.length > 0) {
          docketId = search.results[0].docket_id;
          // Store the CL docket ID for future lookups
          await env.DB.prepare(
            'UPDATE cases SET source_id = ? WHERE id = ?'
          ).bind(String(docketId), c.id).run();
          console.log(`Mapped "${c.name}" → CL docket ${docketId}`);
        } else {
          console.log(`No CL docket found for "${c.name}"`);
          continue;
        }
      }

      // Step 2: Fetch docket details
      const docket = await clFetch(`/dockets/${docketId}/`, token);

      // Step 3: Fetch recent docket entries (latest 5)
      const entries = await clFetch(
        `/docket-entries/?docket=${docketId}&order_by=-date_filed&page_size=5`,
        token
      );

      // Step 4: Update the case in D1
      const filingCount = entries.count || 0;
      const lastFilingDate = docket.date_last_filing || null;
      const judge = docket.assigned_to_str || null;
      const court = docket.court_id || null;
      const clUrl = docket.absolute_url
        ? `https://www.courtlistener.com${docket.absolute_url}`
        : null;

      await env.DB.prepare(
        `UPDATE cases SET
          court = COALESCE(?, court),
          judge = COALESCE(?, judge),
          last_filing_date = COALESCE(?, last_filing_date),
          filing_count = ?,
          courtlistener_url = COALESCE(?, courtlistener_url),
          updated_at = datetime('now')
        WHERE id = ?`
      ).bind(court, judge, lastFilingDate, filingCount, clUrl, c.id).run();

      console.log(`Updated "${c.name}": ${filingCount} filings, last ${lastFilingDate}`);
    } catch (err) {
      console.error(`CourtListener error for "${c.name}":`, err.message);
    }
  }

  console.log('CourtListener update complete');
}
