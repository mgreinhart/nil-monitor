// ═══════════════════════════════════════════════════════════════════
//  Congress.gov Fetcher
//  Fetches recent bills from Congress.gov API, filters for NIL/
//  college sports relevance by keyword matching on titles.
//  Requires secret: wrangler secret put CONGRESS_KEY
// ═══════════════════════════════════════════════════════════════════

const BASE_URL = 'https://api.congress.gov/v3';
const CONGRESS = 119; // Current Congress (2025-2027)

// Keywords to match in bill titles (case-insensitive)
const NIL_KEYWORDS = [
  'nil', 'name image likeness',
  'college athlete', 'collegiate athlete', 'student athlete',
  'ncaa', 'intercollegiate',
  'college sports commission',
  'revenue sharing',
  'transfer portal',
  'title ix athlete',
  'amateur athlete',
];

function matchesKeywords(title) {
  const lower = title.toLowerCase();
  return NIL_KEYWORDS.some(kw => lower.includes(kw));
}

export async function fetchCongress(env) {
  const apiKey = env.CONGRESS_KEY;
  if (!apiKey) {
    console.log('Congress.gov: no API key configured, skipping');
    return;
  }

  console.log('Fetching Congress.gov bills...');

  // Fetch recently updated bills from the current Congress
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const url = `${BASE_URL}/bill/${CONGRESS}?api_key=${apiKey}&fromDateTime=${encodeURIComponent(since)}&sort=updateDate+desc&limit=250&format=json`;

  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'NILMonitor/1.0' },
    });

    if (!resp.ok) {
      console.error(`Congress.gov fetch failed: ${resp.status}`);
      return;
    }

    const data = await resp.json();
    const bills = data.bills || [];
    console.log(`Congress.gov: fetched ${bills.length} recent bills, filtering...`);

    let matched = 0;

    for (const bill of bills) {
      const title = bill.title || '';
      if (!matchesKeywords(title)) continue;

      const sourceId = `congress-${bill.congress}-${bill.type}-${bill.number}`;
      const billNumber = `${(bill.type || '').toUpperCase()} ${bill.number}`;
      const lastAction = bill.latestAction?.text || null;
      const lastActionDate = bill.latestAction?.actionDate || null;
      const billUrl = bill.url
        ? bill.url.replace('format=json', 'format=html').replace('api_key=' + apiKey, '')
        : `https://www.congress.gov/bill/${bill.congress}th-congress/${bill.originChamber?.toLowerCase()}-bill/${bill.number}`;

      try {
        // Upsert: insert or update if already tracked
        const existing = await env.DB.prepare(
          'SELECT id FROM bills WHERE source_id = ?'
        ).bind(sourceId).first();

        if (existing) {
          await env.DB.prepare(
            `UPDATE bills SET
              last_action = COALESCE(?, last_action),
              last_action_date = COALESCE(?, last_action_date),
              updated_at = datetime('now')
            WHERE source_id = ?`
          ).bind(lastAction, lastActionDate, sourceId).run();
        } else {
          await env.DB.prepare(
            `INSERT INTO bills (source_id, state, bill_number, title, status, last_action, last_action_date, url)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            sourceId,
            'Federal',
            billNumber,
            title,
            bill.latestAction?.text?.toLowerCase().includes('introduced') ? 'Introduced' : 'Active',
            lastAction,
            lastActionDate,
            billUrl
          ).run();
        }

        matched++;
      } catch (e) {
        console.error(`Congress.gov error inserting bill ${billNumber}:`, e.message);
      }
    }

    console.log(`Congress.gov: ${matched} NIL-related bills found/updated`);
  } catch (err) {
    console.error('Congress.gov fetch error:', err.message);
  }
}
