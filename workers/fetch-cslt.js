// ═══════════════════════════════════════════════════════════════════
//  College Sports Litigation Tracker Fetcher
//  Scrapes https://www.collegesportslitigationtracker.com/tracker
//  Self-governing cooldown: every 6 hours, 6 AM–10 PM ET, skip overnight
// ═══════════════════════════════════════════════════════════════════

import { getETHour, shouldRun, recordRun, decodeEntities } from './fetcher-utils.js';

const FETCHER = 'cslt';
const CSLT_URL = 'https://www.collegesportslitigationtracker.com/tracker';

function getCooldown() {
  const h = getETHour();
  if (h >= 6 && h < 22) return 360; // 6 hours
  return null; // skip overnight
}

/**
 * Strip HTML tags, decode entities, normalize whitespace.
 */
function cleanText(html) {
  if (!html) return '';
  return decodeEntities(
    html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Extract first N characters from cleaned text, breaking at word boundary.
 */
function truncate(text, max = 500) {
  if (!text || text.length <= max) return text;
  const cut = text.lastIndexOf(' ', max);
  return text.slice(0, cut > 0 ? cut : max) + '...';
}

/**
 * Parse the "Latest Updates" and "Previous Updates" sections.
 * Returns array of { case_name, update_text, update_date }.
 */
function parseUpdates(html) {
  const updates = [];

  // Match each updates-accordion button + its panel
  const sectionRe = /<button[^>]*class="updates-accordion[^"]*"[^>]*>(.*?)<\/button>\s*<div[^>]*class="updates-panel"[^>]*>([\s\S]*?)<\/div>/gi;
  let sectionMatch;

  while ((sectionMatch = sectionRe.exec(html)) !== null) {
    const headerText = cleanText(sectionMatch[1]);
    const panelHtml = sectionMatch[2];

    // Extract date from header: "Latest Updates (Friday, February 20)" or "Previous Updates (Thursday, February 19)"
    const dateMatch = headerText.match(/\((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s*(.+?)\)/i);
    const updateDate = dateMatch ? dateMatch[1].trim() : null;

    // Parse each <li> in the panel
    const liRe = /<li>([\s\S]*?)<\/li>/gi;
    let liMatch;
    while ((liMatch = liRe.exec(panelHtml)) !== null) {
      const liHtml = liMatch[1];
      // Case name is in <i>Case Name:</i> or <em>Case Name:</em>
      const caseMatch = liHtml.match(/<(?:i|em)>(.*?)<\/(?:i|em)>/i);
      if (caseMatch) {
        const caseName = cleanText(caseMatch[1]).replace(/:$/, '').trim();
        // Update text is everything after the closing tag
        const afterTag = liHtml.slice(liHtml.indexOf(caseMatch[0]) + caseMatch[0].length);
        const updateText = cleanText(afterTag);
        if (caseName && updateText) {
          updates.push({ case_name: caseName, update_text: updateText, update_date: updateDate });
        }
      }
    }
  }

  return updates;
}

/**
 * Parse court info from the italicized citation line.
 * E.g.: "(No. 26-cv-00100, D. Nevada, Judge Anne R. Traum, filed February 9, 2026)"
 */
function parseCourtInfo(text) {
  const result = { court: null, judge: null, case_number: null, filed_date: null };
  if (!text) return result;

  // Case number: "No. XX-cv-XXXXX" or "Nos. XX-cv-XXXXX, XX-cv-XXXXX"
  const numMatch = text.match(/Nos?\.\s*([\d\w\-,\s]+?)(?:,\s*(?:[A-Z]|N\.D\.|S\.D\.|E\.D\.|W\.D\.|C\.D\.|M\.D\.))/i);
  if (numMatch) result.case_number = numMatch[1].trim();

  // Court: look for district court abbreviations
  const courtMatch = text.match(/(?:N\.D\.|S\.D\.|E\.D\.|W\.D\.|C\.D\.|M\.D\.)\s*\w+\.?|D\.\s*\w+\.?|NLRB|\d+(?:st|nd|rd|th)\s+Cir\./i);
  if (courtMatch) result.court = courtMatch[0].trim();

  // Judge
  const judgeMatch = text.match(/Judge\s+([A-Z][a-zA-Z\s.]+?)(?:,|\))/);
  if (judgeMatch) result.judge = judgeMatch[1].trim();

  // Filed date
  const filedMatch = text.match(/filed\s+([\w\s,]+?\d{4})/i);
  if (filedMatch) result.filed_date = filedMatch[1].trim();

  return result;
}

/**
 * Parse upcoming dates from <ul> after "Key Upcoming Dates" heading.
 * Returns JSON array: [{"date":"...","text":"..."}]
 */
function parseUpcomingDates(statusHtml) {
  const dates = [];
  // Find all "Key Upcoming Dates" sections
  const sections = statusHtml.split(/<h4[^>]*>Key Upcoming Dates/gi);
  for (let i = 1; i < sections.length; i++) {
    const section = sections[i];
    const ulMatch = section.match(/<ul>([\s\S]*?)<\/ul>/i);
    if (!ulMatch) continue;
    const liRe = /<li>([\s\S]*?)<\/li>/gi;
    let liMatch;
    while ((liMatch = liRe.exec(ulMatch[1])) !== null) {
      const text = cleanText(liMatch[1]);
      if (text && !text.match(/^N\/A/i)) {
        // Try to extract date prefix: "February 18, 2026: Reply Briefs Due"
        const dateTextMatch = text.match(/^([\w\s]+\d{1,2},\s*\d{4}):\s*(.+)/);
        if (dateTextMatch) {
          dates.push({ date: dateTextMatch[1].trim(), text: dateTextMatch[2].trim() });
        } else {
          dates.push({ date: null, text: text });
        }
      }
    }
  }
  return dates;
}

/**
 * Parse all cases from the page HTML.
 * Returns array of case objects.
 */
function parseCases(html) {
  const cases = [];

  // Find the main accordion section
  const accordionMatch = html.match(/<div class="accordion-section">([\s\S]*?)$/i);
  if (!accordionMatch) return cases;
  const accordionHtml = accordionMatch[1];

  // Track current case group from first-level-header divs
  let currentGroup = null;

  // Split by first-level-header to get groups
  const groupParts = accordionHtml.split(/<div class="first-level-header">/i);

  for (let g = 1; g < groupParts.length; g++) {
    const groupPart = groupParts[g];
    // Extract group name (text before closing </div>)
    const groupNameMatch = groupPart.match(/^([\s\S]*?)<\/div>/i);
    currentGroup = groupNameMatch ? cleanText(groupNameMatch[1]).replace(/\s+/g, ' ').trim() : null;

    // Find all second-level-accordion buttons in this group
    const caseRe = /<button[^>]*class="accordion second-level-accordion"[^>]*>([\s\S]*?)<\/button>\s*<div class="panel">([\s\S]*?)<\/div>\s*(?=(?:<!--|<button|<\/div class="case-group"|<div class="first-level-header"|$))/gi;

    // More robust: split by the button pattern
    const caseParts = groupPart.split(/<button[^>]*class="accordion second-level-accordion"[^>]*>/i);

    for (let c = 1; c < caseParts.length; c++) {
      try {
        const casePart = caseParts[c];

        // Extract case name and last event date from button text
        const buttonEnd = casePart.indexOf('</button>');
        if (buttonEnd === -1) continue;
        const buttonText = casePart.slice(0, buttonEnd);

        const nameMatch = buttonText.match(/^([\s\S]*?)(?:<em>|$)/i);
        const caseName = nameMatch ? cleanText(nameMatch[1]).trim() : cleanText(buttonText).trim();

        // Skip archive/document-only entries
        if (!caseName || caseName.match(/archived|pre-settlement/i)) continue;

        // Last event date from <em>(last event: ...)</em>
        const lastEventDateMatch = buttonText.match(/\(last event:\s*([\w\s,]+?\d{4})\)/i);
        const lastEventDate = lastEventDateMatch ? lastEventDateMatch[1].trim() : null;

        // Extract panel content
        const panelStart = casePart.indexOf('<div class="panel">');
        if (panelStart === -1) continue;
        const panelContent = casePart.slice(panelStart);

        // Description
        const descBoxMatch = panelContent.match(/<div class="description-box">([\s\S]*?)<\/div>/i);
        let description = '';
        let courtInfo = { court: null, judge: null, case_number: null, filed_date: null };

        if (descBoxMatch) {
          const descHtml = descBoxMatch[1];
          // Get first <p> after <h4>Description heading (not the court info italic line)
          const descParagraphs = descHtml.match(/<p>(?!<em>\()[\s\S]*?<\/p>/gi);
          if (descParagraphs) {
            description = truncate(cleanText(descParagraphs[0]));
          }

          // Court info from italic citation line
          const courtLineMatch = descHtml.match(/<p>\s*<em>\(((?:No|Initial)[\s\S]*?)\)<\/em>\s*<\/p>/i);
          if (courtLineMatch) {
            courtInfo = parseCourtInfo(courtLineMatch[1]);
          }
        }

        // Status
        const statusBoxMatch = panelContent.match(/<div class="status-box">([\s\S]*?)<\/div>\s*(?:<div class="documents-box">|$)/i);
        let statusSummary = '';
        let lastEventText = '';
        let upcomingDates = [];

        if (statusBoxMatch) {
          const statusHtml = statusBoxMatch[1];

          // First paragraph after "Current Status" heading
          const statusParagraphs = statusHtml.match(/<h4>Current Status<\/h4>\s*(<p>[\s\S]*?<\/p>)/i);
          if (statusParagraphs) {
            statusSummary = truncate(cleanText(statusParagraphs[1]));
          }

          // Latest Event
          const latestMatch = statusHtml.match(/<strong>Latest Event:<\/strong>([\s\S]*?)(?:<\/p>|<h4>)/i);
          if (latestMatch) {
            let eventText = cleanText(latestMatch[1]);
            // Extract date from (M/D/YYYY) or (Month D, YYYY)
            const eventDateMatch = eventText.match(/\((\d{1,2}\/\d{1,2}\/\d{4})\)/);
            if (eventDateMatch) {
              eventText = eventText.replace(eventDateMatch[0], '').trim();
            }
            lastEventText = eventText;
          }

          // Upcoming dates
          upcomingDates = parseUpcomingDates(statusHtml);
        }

        // Determine is_active
        const isDismissed = (statusSummary + ' ' + caseName).toLowerCase().includes('dismissed');

        cases.push({
          name: caseName,
          case_group: currentGroup,
          court: courtInfo.court,
          judge: courtInfo.judge,
          case_number: courtInfo.case_number,
          filed_date: courtInfo.filed_date,
          last_event_text: lastEventText || null,
          last_event_date: lastEventDate || null,
          status_summary: statusSummary || null,
          description: description || null,
          upcoming_dates: upcomingDates.length > 0 ? JSON.stringify(upcomingDates) : null,
          is_active: isDismissed ? 0 : 1,
        });
      } catch (err) {
        console.error(`CSLT: error parsing case:`, err.message);
        continue;
      }
    }
  }

  return cases;
}

// ── CSLT Homepage Key Dates Parser ──────────────────────────────

const CSLT_HOME_URL = 'https://www.collegesportslitigationtracker.com/';

/**
 * Parse the "Key Dates in Month Year" section from the CSLT homepage.
 * HTML structure: <strong>Key Dates in February 2026:</strong> <ul><li>...</li></ul>
 * Each <li>: <strong>February 4</strong>: Description in <em>Case Name</em>.
 */
function parseKeyDates(html) {
  const headerMatch = html.match(/Key\s+Dates\s+in\s+(\w+)\s+(\d{4})/i);
  if (!headerMatch) return { month: null, dates: [] };

  const monthName = headerMatch[1];
  const year = headerMatch[2];
  const month = `${monthName} ${year}`;

  // Find the <ul> after the header
  const afterHeader = html.slice(html.indexOf(headerMatch[0]));
  const ulMatch = afterHeader.match(/<ul[^>]*>([\s\S]*?)<\/ul>/i);
  if (!ulMatch) return { month, dates: [] };

  const dates = [];
  const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let m;

  while ((m = liRe.exec(ulMatch[1])) !== null) {
    const liHtml = m[1];

    // Date from <strong>
    const dateMatch = liHtml.match(/<strong[^>]*>(.*?)<\/strong>/i);
    if (!dateMatch) continue;
    const dateText = dateMatch[1].replace(/<[^>]+>/g, '').trim();

    // Convert "February 4" + year → ISO date
    const d = new Date(`${dateText}, ${year}`);
    const isoDate = !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : null;
    if (!isoDate) continue;

    // Case name from <em> or <i>
    const caseMatch = liHtml.match(/<(?:em|i)[^>]*>(.*?)<\/(?:em|i)>/i);
    const caseName = caseMatch ? caseMatch[1].replace(/<[^>]+>/g, '').trim() : '';

    // Description: strip HTML, remove date prefix, remove trailing "in CaseName."
    let text = liHtml.replace(/<[^>]+>/g, '').trim();
    const colonIdx = text.indexOf(':');
    if (colonIdx !== -1) text = text.slice(colonIdx + 1).trim();
    if (caseName) {
      const escaped = caseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      text = text.replace(new RegExp('\\s+in\\s+' + escaped + '\\.?\\s*$', 'i'), '');
    }
    text = text.replace(/\.\s*$/, '').trim();

    dates.push({ date: isoDate, case_name: caseName, description: text });
  }

  return { month, dates };
}

export async function fetchCSLTKeyDates(env, { force = false } = {}) {
  if (!force) {
    const cooldown = getCooldown();
    if (cooldown === null) {
      console.log('CSLT Key Dates: outside active hours, skipping');
      return;
    }
    if (!await shouldRun(env.DB, 'cslt-keydates', cooldown)) {
      console.log('CSLT Key Dates: cooldown not elapsed, skipping');
      return;
    }
  }

  console.log('Fetching CSLT homepage key dates...');

  let html;
  try {
    const resp = await fetch(CSLT_HOME_URL, {
      headers: { 'User-Agent': 'NILMonitor/1.0 (college athletics dashboard)' },
    });
    if (!resp.ok) {
      console.error(`CSLT Key Dates: fetch failed: ${resp.status}`);
      return;
    }
    html = await resp.text();
  } catch (err) {
    console.error('CSLT Key Dates: fetch error:', err.message);
    return;
  }

  const { month, dates } = parseKeyDates(html);

  if (!dates.length) {
    console.log('CSLT Key Dates: no dates parsed (HTML structure may have changed)');
    await recordRun(env.DB, 'cslt-keydates');
    return;
  }

  // Clear and re-insert (whole section replaces monthly)
  await env.DB.prepare('DELETE FROM cslt_key_dates').run();

  let inserted = 0;
  for (const d of dates) {
    try {
      await env.DB.prepare(
        `INSERT INTO cslt_key_dates (date, case_name, description, month)
         VALUES (?, ?, ?, ?)`
      ).bind(d.date, d.case_name, d.description, month).run();
      inserted++;
    } catch (err) {
      console.error(`CSLT Key Dates: insert error:`, err.message);
    }
  }

  await recordRun(env.DB, 'cslt-keydates');
  console.log(`CSLT Key Dates: ${inserted} dates stored for ${month}`);
}

// ── CSLT Tracker Full Scraper ──────────────────────────────────

export async function fetchCSLT(env, { force = false } = {}) {
  if (!force) {
    const cooldown = getCooldown();
    if (cooldown === null) {
      console.log('CSLT: outside active hours, skipping');
      return;
    }
    if (!await shouldRun(env.DB, FETCHER, cooldown)) {
      console.log(`CSLT: cooldown (${cooldown}m) not elapsed, skipping`);
      return;
    }
  }

  console.log('Fetching CSLT tracker page...');

  let html;
  try {
    const resp = await fetch(CSLT_URL, {
      headers: { 'User-Agent': 'NILMonitor/1.0 (college athletics dashboard)' },
    });
    if (!resp.ok) {
      console.error(`CSLT: fetch failed: ${resp.status}`);
      return;
    }
    html = await resp.text();
  } catch (err) {
    console.error('CSLT: fetch error:', err.message);
    return;
  }

  // Parse updates
  const updates = parseUpdates(html);
  let updatesInserted = 0;
  for (const u of updates) {
    try {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO case_updates (case_name, update_text, update_date)
         VALUES (?, ?, ?)`
      ).bind(u.case_name, u.update_text, u.update_date).run();
      updatesInserted++;
    } catch {
      // duplicate, skip
    }
  }

  // Parse cases
  const cases = parseCases(html);
  let casesUpserted = 0;
  for (const c of cases) {
    try {
      await env.DB.prepare(
        `INSERT INTO cases (name, case_group, court, judge, case_number, filed_date,
          last_event_text, last_event_date, status_summary, description,
          upcoming_dates, cslt_url, is_active, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(name, case_number) DO UPDATE SET
          case_group = excluded.case_group,
          court = COALESCE(excluded.court, court),
          judge = COALESCE(excluded.judge, judge),
          last_event_text = COALESCE(excluded.last_event_text, last_event_text),
          last_event_date = COALESCE(excluded.last_event_date, last_event_date),
          status_summary = COALESCE(excluded.status_summary, status_summary),
          description = COALESCE(excluded.description, description),
          upcoming_dates = COALESCE(excluded.upcoming_dates, upcoming_dates),
          is_active = excluded.is_active,
          updated_at = datetime('now')`
      ).bind(
        c.name, c.case_group, c.court, c.judge, c.case_number || '', c.filed_date,
        c.last_event_text, c.last_event_date, c.status_summary, c.description,
        c.upcoming_dates, CSLT_URL, c.is_active,
      ).run();
      casesUpserted++;
    } catch (err) {
      console.error(`CSLT: error upserting case "${c.name}":`, err.message);
    }
  }

  await recordRun(env.DB, FETCHER);
  console.log(`CSLT: ${casesUpserted} cases upserted, ${updatesInserted} updates inserted`);
}
