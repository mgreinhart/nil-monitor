// ═══════════════════════════════════════════════════════════════════
//  AI Processing Pipeline
//  Reads new data from D1, sends to Claude, writes intelligence back.
//  Requires: wrangler secret put ANTHROPIC_KEY
// ═══════════════════════════════════════════════════════════════════

const MODEL = 'claude-sonnet-4-5-20250929';
const PIPELINE_ERRORS = [];

async function callClaude(env, systemPrompt, userContent) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Claude API ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  const text = data.content?.[0]?.text;
  if (!text) throw new Error('Empty Claude response');

  // Extract JSON from response (handles markdown code blocks)
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
  try {
    return JSON.parse(jsonMatch[1].trim());
  } catch (parseErr) {
    console.error('JSON parse failed. Raw response:', text.substring(0, 500));
    throw new Error(`JSON parse failed: ${parseErr.message}`);
  }
}

// ── Get last pipeline run time ───────────────────────────────────
async function getLastRunTime(db) {
  const row = await db.prepare(
    'SELECT ran_at FROM pipeline_runs ORDER BY id DESC LIMIT 1'
  ).first();
  if (row?.ran_at) return row.ran_at;
  // Default to 24 hours ago in D1 datetime format (YYYY-MM-DD HH:MM:SS)
  const d = new Date(Date.now() - 86400000);
  return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
}

// ── Fetch new data since last run ────────────────────────────────
async function getNewHeadlines(db, since) {
  const { results } = await db.prepare(
    'SELECT * FROM headlines WHERE fetched_at > ? ORDER BY published_at DESC LIMIT 100'
  ).bind(since).all();
  return results;
}

async function getNewCaseUpdates(db, since) {
  const { results } = await db.prepare(
    'SELECT * FROM cases WHERE updated_at > ? ORDER BY updated_at DESC'
  ).bind(since).all();
  return results;
}

async function getUnsummarizedCases(db) {
  const { results } = await db.prepare(
    "SELECT * FROM cases WHERE description IS NULL OR description = ''"
  ).all();
  return results;
}

// ── Task 1: Event Extraction ─────────────────────────────────────
async function extractEvents(env, headlines, caseUpdates) {
  if (headlines.length === 0 && caseUpdates.length === 0) return [];

  const system = `You are extracting discrete events for a college athletics regulatory dashboard called NIL Monitor.
An event is something that HAPPENED — a bill moved, a filing was made, a rule changed, guidance was issued, an enforcement action was taken, a settlement progressed. Not general commentary or opinion articles.

Focus on these categories:
- Legislation: New bills, committee hearings, votes, enactments
- Litigation: Court filings, rulings, settlements, hearings
- NCAA Governance: Rule changes, board decisions, policy updates
- CSC / Enforcement: College Sports Commission actions, investigations, guidance
- Revenue Sharing: Revenue-sharing implementation, cap changes, distribution updates
- Roster / Portal: Transfer portal activity, roster management rules
- Realignment: Conference changes, media rights, membership

For severity:
- critical: Requires immediate institutional action or attention (new enforcement, court orders, imminent deadlines)
- important: Significant development that affects strategy (new bills, major filings, policy changes)
- routine: Noteworthy but no immediate action needed (commentary, minor updates, general news)

Return ONLY valid JSON, no other text.`;

  // Limit to 40 headlines to keep prompt size manageable
  const topHeadlines = headlines.slice(0, 40);
  const headlineList = topHeadlines.map(h =>
    `[${h.category}] ${h.source}: ${h.title}\n  Published: ${h.published_at}\n  URL: ${h.url}`
  ).join('\n');

  const caseList = caseUpdates.map(c =>
    `[Case Update] ${c.name} (${c.court}) — Status: ${c.status}, Last filing: ${c.last_filing_date}, Filings: ${c.filing_count}, Updated: ${c.updated_at}`
  ).join('\n');

  const userContent = `Extract discrete events from these items. Only include items where something concrete happened — skip opinion pieces and general commentary.

Each item has a "Published" or "Updated" timestamp — return that timestamp as "event_time" so events are ordered by when they actually happened, not when we processed them.

HEADLINES (${topHeadlines.length}):
${headlineList || 'None'}

CASE UPDATES (${caseUpdates.length}):
${caseList || 'None'}

Return JSON:
{
  "events": [
    {
      "text": "One-sentence description of what happened",
      "category": "Legislation|Litigation|NCAA Governance|CSC / Enforcement|Revenue Sharing|Roster / Portal|Realignment",
      "severity": "routine|important|critical",
      "source": "Source name",
      "source_url": "URL",
      "event_time": "ISO 8601 timestamp from the source item's Published/Updated field"
    }
  ]
}`;

  try {
    const result = await callClaude(env, system, userContent);
    return result.events || [];
  } catch (err) {
    console.error('Event extraction failed:', err.message);
    PIPELINE_ERRORS.push(`events: ${err.message}`);
    return [];
  }
}

// ── Task 2: Deadline Extraction ──────────────────────────────────
async function extractDeadlines(env, headlines, caseUpdates) {
  if (headlines.length === 0 && caseUpdates.length === 0) return [];

  const system = `You extract upcoming deadlines from college athletics news and court data for a regulatory dashboard.
A deadline is a specific future date that requires action or attention — a hearing date, a filing deadline, a reporting window, a legislative hearing, a vote date, a portal window, an implementation date.

Do NOT extract:
- Dates that have already passed
- Vague timeframes ("sometime in spring")
- Publication dates of articles

For severity:
- critical: Institutional action required, affects compliance or legal standing
- important: Significant date that affects strategy or planning
- routine: Worth tracking but no immediate action needed

Return ONLY valid JSON, no other text.`;

  const headlineList = headlines.slice(0, 50).map(h =>
    `[${h.category}] ${h.source}: ${h.title}`
  ).join('\n');

  const caseList = caseUpdates.map(c =>
    `${c.name}: next_action=${c.next_action}, next_action_date=${c.next_action_date}, status=${c.status}`
  ).join('\n');

  const today = new Date().toISOString().split('T')[0];

  const userContent = `Today is ${today}. Extract any upcoming deadlines from these items. Only include dates that are in the future.

HEADLINES:
${headlineList || 'None'}

CASE DATA:
${caseList || 'None'}

Return JSON:
{
  "deadlines": [
    {
      "date": "YYYY-MM-DD",
      "category": "Legislation|Litigation|NCAA Governance|CSC / Enforcement|Revenue Sharing|Roster / Portal|Realignment",
      "text": "Brief description of what happens on this date",
      "severity": "routine|important|critical",
      "source": "Where this date was found"
    }
  ]
}`;

  try {
    const result = await callClaude(env, system, userContent);
    return result.deadlines || [];
  } catch (err) {
    console.error('Deadline extraction failed:', err.message);
    PIPELINE_ERRORS.push(`deadlines: ${err.message}`);
    return [];
  }
}

// ── Task 3: CSC Activity Detection ───────────────────────────────
async function detectCSCActivity(env, headlines) {
  // Filter to only potentially CSC-related headlines
  const cscKeywords = /college sports commission|csc|enforcement|bryan seeley|katie medearis|compliance|investigation|tip line|valid business purpose/i;
  const relevant = headlines.filter(h => cscKeywords.test(h.title));

  if (relevant.length === 0) return [];

  const system = `You identify and tag College Sports Commission (CSC) activity from news headlines for a regulatory dashboard.

The CSC is the enforcement body created by the House v. NCAA settlement. It oversees NIL compliance, revenue-sharing rules, and third-party deal enforcement.

Tags:
- Guidance: Official guidance documents, memos, criteria, FAQs
- Investigation: Active investigations, inquiries, audit notices
- Enforcement: Formal warnings, penalties, sanctions, enforcement actions
- Personnel: Staff hires, appointments, organizational changes
- Rule Clarification: Interpretive guidance on existing rules, Q&A responses

Only tag items that are specifically about CSC activity. General NIL news is not CSC activity unless the CSC is directly involved.

Return ONLY valid JSON, no other text.`;

  const headlineList = relevant.map(h =>
    `${h.source}: ${h.title}\n  URL: ${h.url}`
  ).join('\n');

  const userContent = `Identify items related to the College Sports Commission and tag each one.

POTENTIALLY CSC-RELATED HEADLINES:
${headlineList}

Return JSON:
{
  "csc_items": [
    {
      "text": "Description of the CSC activity",
      "tag": "Guidance|Investigation|Enforcement|Personnel|Rule Clarification",
      "source": "Source name",
      "source_url": "URL"
    }
  ]
}

If none of these are actually about CSC activity, return: {"csc_items": []}`;

  try {
    const result = await callClaude(env, system, userContent);
    return result.csc_items || [];
  } catch (err) {
    console.error('CSC detection failed:', err.message);
    PIPELINE_ERRORS.push(`csc: ${err.message}`);
    return [];
  }
}

// ── Task 4: Daily Briefing ───────────────────────────────────────
async function generateBriefing(env, db) {
  // Get today's events + recent headlines for context
  const { results: events } = await db.prepare(
    "SELECT * FROM events WHERE date(event_time) >= date('now', '-1 day') ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'important' THEN 2 ELSE 3 END, event_time DESC LIMIT 20"
  ).all();

  const { results: headlines } = await db.prepare(
    "SELECT * FROM headlines WHERE date(published_at) >= date('now', '-1 day') ORDER BY published_at DESC LIMIT 30"
  ).all();

  const { results: deadlines } = await db.prepare(
    "SELECT * FROM deadlines WHERE date >= date('now') AND date <= date('now', '+14 days') ORDER BY date ASC"
  ).all();

  if (events.length === 0 && headlines.length === 0) {
    return null; // Nothing to brief on
  }

  const system = `You are a sharp deputy Athletic Director briefing your boss at 6 AM. Write a concise briefing of the most significant developments in the last 24 hours.

Voice: Direct, action-oriented, no fluff. Cite sources. Highlight anything requiring institutional action. You're speaking to ADs, compliance officers, and sports lawyers who need to know what changed overnight.

Structure: 2-4 sections, each with a bold opening sentence and 2-3 sentences of supporting detail. Lead with the most important item. Group related items.

Return ONLY valid JSON, no other text.`;

  const eventList = events.map(e =>
    `[${e.severity?.toUpperCase()}] [${e.category}] ${e.text} (via ${e.source})`
  ).join('\n');

  const headlineList = headlines.slice(0, 20).map(h =>
    `[${h.category}] ${h.source}: ${h.title}`
  ).join('\n');

  const deadlineList = deadlines.map(d =>
    `${d.date}: ${d.text} [${d.severity}]`
  ).join('\n');

  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const userContent = `Generate the daily briefing for ${today}.

EVENTS (last 24 hours):
${eventList || 'No new events extracted yet.'}

RECENT HEADLINES:
${headlineList || 'No recent headlines.'}

UPCOMING DEADLINES (next 14 days):
${deadlineList || 'No imminent deadlines.'}

Return JSON:
{
  "sections": [
    {
      "headline": "Bold opening sentence describing the most significant development.",
      "body": "2-3 sentences of detail, context, and what it means for your institution. Cite sources."
    }
  ]
}`;

  try {
    const result = await callClaude(env, system, userContent);
    return result.sections || null;
  } catch (err) {
    console.error('Briefing generation failed:', err.message);
    PIPELINE_ERRORS.push(`briefing: ${err.message}`);
    return null;
  }
}

// ── Write results to D1 ─────────────────────────────────────────
async function writeEvents(db, events) {
  let count = 0;
  for (const e of events) {
    try {
      const eventTime = e.event_time || new Date().toISOString();
      await db.prepare(
        `INSERT INTO events (source, source_url, category, text, severity, event_time)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(e.source, e.source_url || null, e.category, e.text, e.severity, eventTime).run();
      count++;
    } catch (err) {
      // Skip duplicates or errors
    }
  }
  return count;
}

async function writeDeadlines(db, deadlines) {
  let count = 0;
  for (const d of deadlines) {
    // Check if this deadline already exists (same date + similar text)
    const existing = await db.prepare(
      "SELECT id FROM deadlines WHERE date = ? AND text LIKE '%' || ? || '%'"
    ).bind(d.date, d.text.substring(0, 30)).first();

    if (existing) continue;

    try {
      await db.prepare(
        `INSERT INTO deadlines (date, category, text, severity, source)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(d.date, d.category, d.text, d.severity, d.source || 'ai-extracted').run();
      count++;
    } catch (err) {
      // Skip errors
    }
  }
  return count;
}

async function writeCSCActivity(db, items) {
  let count = 0;
  for (const item of items) {
    try {
      await db.prepare(
        `INSERT INTO csc_activity (tag, text, source, source_url, activity_time)
         VALUES (?, ?, ?, ?, datetime('now'))`
      ).bind(item.tag, item.text, item.source, item.source_url || null).run();
      count++;
    } catch (err) {
      // Skip errors
    }
  }
  return count;
}

async function writeBriefing(db, sections) {
  if (!sections) return 0;
  const today = new Date().toISOString().split('T')[0];
  try {
    await db.prepare(
      `INSERT OR REPLACE INTO briefings (date, content, generated_at)
       VALUES (?, ?, datetime('now'))`
    ).bind(today, JSON.stringify(sections)).run();
    return 1;
  } catch (err) {
    console.error('Failed to write briefing:', err.message);
    return 0;
  }
}

// ── Main Pipeline ────────────────────────────────────────────────
export async function runAIPipeline(env) {
  const token = env.ANTHROPIC_KEY;
  if (!token) {
    console.log('AI Pipeline: no ANTHROPIC_KEY configured, skipping');
    return;
  }

  console.log('AI Pipeline: starting...');
  const db = env.DB;

  // 1. Get last run time
  const lastRun = await getLastRunTime(db);
  console.log(`AI Pipeline: processing data since ${lastRun}`);

  // 2. Fetch new data
  const headlines = await getNewHeadlines(db, lastRun);
  const caseUpdates = await getNewCaseUpdates(db, lastRun);

  const totalNew = headlines.length + caseUpdates.length;
  if (totalNew === 0) {
    console.log('AI Pipeline: no new data, skipping');
    return;
  }

  console.log(`AI Pipeline: ${headlines.length} new headlines, ${caseUpdates.length} case updates`);

  // 3. Extract events
  const events = await extractEvents(env, headlines, caseUpdates);
  const eventsWritten = await writeEvents(db, events);
  console.log(`AI Pipeline: extracted ${events.length} events, wrote ${eventsWritten}`);

  // 4. Extract deadlines
  const deadlines = await extractDeadlines(env, headlines, caseUpdates);
  const deadlinesWritten = await writeDeadlines(db, deadlines);
  console.log(`AI Pipeline: extracted ${deadlines.length} deadlines, wrote ${deadlinesWritten}`);

  // 5. Detect CSC activity
  const cscItems = await detectCSCActivity(env, headlines);
  const cscWritten = await writeCSCActivity(db, cscItems);
  console.log(`AI Pipeline: detected ${cscItems.length} CSC items, wrote ${cscWritten}`);

  // 6. Generate daily briefing
  const briefingSections = await generateBriefing(env, db);
  const briefingWritten = await writeBriefing(db, briefingSections);
  console.log(`AI Pipeline: briefing ${briefingWritten ? 'generated' : 'skipped'}`);

  // 7. Summarize unsummarized cases
  const unsummarized = await getUnsummarizedCases(db);
  for (const c of unsummarized) {
    try {
      const summary = await callClaude(env,
        'You write 2-sentence case summaries for an athletic director\'s regulatory dashboard. Include what the case is about and why it matters to college athletics. Be direct and factual.',
        `Summarize this case:\nName: ${c.name}\nCourt: ${c.court}\nJudge: ${c.judge}\nStatus: ${c.status}\nCategory: ${c.category}\nReturn JSON: {"summary": "2-sentence summary"}`
      );
      if (summary.summary) {
        await db.prepare('UPDATE cases SET description = ? WHERE id = ?')
          .bind(summary.summary, c.id).run();
        console.log(`AI Pipeline: summarized case "${c.name}"`);
      }
    } catch (err) {
      console.error(`AI Pipeline: failed to summarize "${c.name}":`, err.message);
    }
  }

  // 8. Record pipeline run
  await db.prepare(
    `INSERT INTO pipeline_runs (items_processed, events_created, deadlines_created, csc_items_created, briefing_generated)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(totalNew, eventsWritten, deadlinesWritten, cscWritten, briefingWritten).run();

  console.log('AI Pipeline: complete');
  if (PIPELINE_ERRORS.length > 0) {
    const errors = [...PIPELINE_ERRORS];
    PIPELINE_ERRORS.length = 0;
    throw new Error(`Pipeline completed with errors: ${errors.join('; ')}`);
  }
}
