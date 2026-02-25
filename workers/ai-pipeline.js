// ═══════════════════════════════════════════════════════════════════
//  AI Processing Pipeline
//  Reads new data from D1, sends to Claude, writes intelligence back.
//  Requires: wrangler secret put ANTHROPIC_KEY
// ═══════════════════════════════════════════════════════════════════

const MODEL = 'claude-sonnet-4-5-20250929';
const PIPELINE_ERRORS = [];

// ── Source Tiering for Briefing Quality ─────────────────────────
const SOURCE_TIERS = {
  1: ['espn', 'usa today', 'the athletic', 'sportico', 'associated press', 'ap news',
      'reuters', 'sports illustrated', 'cbs sports', 'front office sports',
      'new york times', 'nyt', 'washington post', 'wall street journal', 'wsj'],
  2: ['extra points', 'business of college sports', 'nil revolution',
      'on3', '247sports', 'yahoo sports'],
  4: ['afrotech', 'thedetroitbureau', 'detroit bureau', 'africa.com'],
};

function getSourceTier(source) {
  const s = (source || '').toLowerCase();
  for (const [tier, names] of Object.entries(SOURCE_TIERS)) {
    if (names.some(n => s.includes(n))) return Number(tier);
  }
  return 3;
}

function normalizeForDedup(title) {
  return (title || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
}

function titleSimilarity(a, b) {
  const wordsA = new Set(normalizeForDedup(a));
  const wordsB = new Set(normalizeForDedup(b));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const overlap = [...wordsA].filter(w => wordsB.has(w)).length;
  return overlap / Math.min(wordsA.size, wordsB.size);
}

function deduplicateHeadlines(headlines) {
  const tiered = headlines.map(h => ({ ...h, _tier: getSourceTier(h.source) }));
  tiered.sort((a, b) => a._tier - b._tier);

  const kept = [];
  for (const h of tiered) {
    const dominated = kept.some(k => titleSimilarity(k.title, h.title) > 0.5);
    if (dominated) continue;
    kept.push(h);
  }

  const sevOrder = { critical: 1, important: 2, routine: 3 };
  kept.sort((a, b) =>
    (sevOrder[a.severity] || 3) - (sevOrder[b.severity] || 3)
    || new Date(b.published_at) - new Date(a.published_at)
  );
  return kept;
}

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

// ── Task 1: Tag Untagged Headlines ───────────────────────────────
const TAG_BATCH_SIZE = 50;  // Keep batches small so response JSON fits within max_tokens

const TAG_SYSTEM_PROMPT = `You are tagging headlines for a college athletics regulatory dashboard called NIL Monitor.

SCOPE: This dashboard covers COLLEGE ATHLETICS ONLY. Headlines about professional sports (NFL, NBA, NHL, WNBA, MLB, MLS, etc.), non-US sports, or topics unrelated to college athletics must be marked "Off-Topic."

For each headline, assign:

Category (exactly one):
- Legislation: Federal or state bills, hearings, committee votes, enacted laws, and regulatory proposals specifically about college athlete compensation, NIL, or NCAA reform. Includes SCORE Act, SAFE Act, state NIL bills, Congressional hearings on college sports.
- Litigation: Court filings, rulings, settlements, lawsuits, injunctions, and legal actions involving NCAA, conferences, or college athletes. Includes House v. NCAA, eligibility lawsuits, antitrust cases, Title IX litigation related to revenue sharing.
- NCAA Governance: NCAA rule changes, board of directors/governors decisions, policy updates, organizational restructuring, committee actions, membership votes, manual updates. Internal NCAA decision-making.
- CSC / Enforcement: College Sports Commission (the House settlement enforcement body) actions, investigations, guidance documents, enforcement actions, personnel, compliance directives. Specifically about the CSC entity, not general NCAA enforcement.
- Revenue Sharing: The House v. NCAA settlement revenue-sharing mechanism — the $20.5M cap, schools paying athletes from institutional revenue, participation agreements, revenue distribution frameworks, opt-in/opt-out decisions, trust structures. NOT individual athlete NIL deals with brands or collectives.
- Roster / Portal: Transfer portal windows, roster management rules, eligibility disputes, waiver decisions, scholarship limits, multi-time transfer rules. Player movement mechanics and NCAA eligibility rules.
- Realignment: Conference membership changes, conference media rights deals, scheduling agreements, conference expansion/contraction, TV contract negotiations. Structural changes to the conference landscape.
- Off-Topic: NOT about college athletics. Includes: professional sports (NFL, NBA, NHL, WNBA, MLB, etc.), non-US sports, entertainment/celebrity news, stories where "NIL" refers to something other than Name Image Likeness. Also: individual athlete NIL deal announcements (brand partnerships, collective deals, marketplace valuations) that have NO regulatory, legal, or governance angle.

Severity (skip for Off-Topic):
- critical: Requires immediate institutional action or attention (new enforcement, court orders, imminent deadlines)
- important: Significant development that affects strategy (new bills, major filings, policy changes)
- routine: Noteworthy but no immediate action needed (commentary, minor updates, general news)

Sub-category (ONLY for "CSC / Enforcement" headlines — omit for all other categories):
- Guidance: Official guidance documents, memos, criteria, FAQs
- Investigation: Active investigations, inquiries, audit notices
- Enforcement: Formal warnings, penalties, sanctions, enforcement actions
- Personnel: Staff hires, appointments, organizational changes
- Rule Clarification: Interpretive guidance on existing rules, Q&A responses

IMPORTANT DISTINCTIONS:
- A story about a state passing an NIL bill → Legislation (not Revenue Sharing)
- A story about the CSC investigating an NIL deal → CSC / Enforcement (not Revenue Sharing)
- A story about an athlete signing a $2M NIL deal with Nike → Off-Topic (deal announcement, no regulatory angle)
- A story about the $20.5M revenue-sharing cap → Revenue Sharing
- A story about an NHL or WNBA player → Off-Topic
- A story about "private equity in college sports" → Realignment or NCAA Governance depending on context

Return ONLY valid JSON, no other text.`;

async function tagHeadlineBatch(env, db, batch) {
  const headlineList = batch.map(h =>
    `ID ${h.id}: [${h.source}] ${h.title}`
  ).join('\n');

  const userContent = `Tag each headline with a category and severity. For headlines categorized as "CSC / Enforcement", also include a sub_category field. For "Off-Topic" headlines, set severity to null.

HEADLINES:
${headlineList}

Return JSON:
{
  "tags": [
    { "id": ${batch[0].id}, "category": "Category Name", "severity": "routine|important|critical|null", "sub_category": "only for CSC / Enforcement, omit otherwise" }
  ]
}`;

  const result = await callClaude(env, TAG_SYSTEM_PROMPT, userContent);
  const tags = result.tags || [];
  console.log(`Tagging batch: Claude returned ${tags.length} tags for ${batch.length} headlines`);

  let count = 0;
  let dbErrors = 0;
  for (const tag of tags) {
    try {
      await db.prepare(
        'UPDATE headlines SET category = ?, severity = ?, sub_category = ? WHERE id = ?'
      ).bind(tag.category, tag.severity, tag.sub_category || null, tag.id).run();
      count++;
    } catch (err) {
      dbErrors++;
      console.error(`Tagging DB error for headline ${tag.id}:`, err.message);
    }
  }
  if (dbErrors > 0) console.warn(`Tagging batch: ${dbErrors} DB write errors`);
  return count;
}

async function tagHeadlines(env, db) {
  const { results: untagged } = await db.prepare(
    'SELECT id, source, title, url FROM headlines WHERE category IS NULL OR severity IS NULL ORDER BY published_at DESC LIMIT 200'
  ).all();

  console.log(`Tagging: found ${untagged.length} untagged headlines`);
  if (untagged.length === 0) return 0;

  let totalTagged = 0;
  // Process in batches to keep prompt + response within token limits
  for (let i = 0; i < untagged.length; i += TAG_BATCH_SIZE) {
    const batch = untagged.slice(i, i + TAG_BATCH_SIZE);
    const batchNum = Math.floor(i / TAG_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(untagged.length / TAG_BATCH_SIZE);
    console.log(`Tagging batch ${batchNum}/${totalBatches}: ${batch.length} headlines (IDs ${batch[0].id}–${batch[batch.length - 1].id})`);

    try {
      const count = await tagHeadlineBatch(env, db, batch);
      totalTagged += count;
      console.log(`Tagging batch ${batchNum}/${totalBatches}: wrote ${count} tags`);
    } catch (err) {
      console.error(`Tagging batch ${batchNum}/${totalBatches} FAILED:`, err.message);
      PIPELINE_ERRORS.push(`tagging batch ${batchNum}: ${err.message}`);
    }
  }

  console.log(`Tagging complete: ${totalTagged}/${untagged.length} headlines tagged`);
  return totalTagged;
}

// ── Task 2: CSC Activity Detection ───────────────────────────────
async function detectCSCActivity(env, headlines, db) {
  // Filter to only potentially CSC-related headlines
  const cscKeywords = /college sports commission|csc|enforcement|bryan seeley|katie medearis|compliance|investigation|tip line|valid business purpose/i;
  const relevant = headlines.filter(h => cscKeywords.test(h.title));

  if (relevant.length === 0) return [];

  // Fetch existing CSC items to avoid duplicates
  const { results: existingCSC } = await db.prepare(
    'SELECT text, tag FROM csc_activity ORDER BY activity_time DESC LIMIT 30'
  ).all();

  const system = `You identify and tag College Sports Commission (CSC) activity from news headlines for a regulatory dashboard.

The CSC is the enforcement body created by the House v. NCAA settlement. It oversees NIL compliance, revenue-sharing rules, and third-party deal enforcement.

Tags:
- Guidance: Official guidance documents, memos, criteria, FAQs
- Investigation: Active investigations, inquiries, audit notices
- Enforcement: Formal warnings, penalties, sanctions, enforcement actions
- Personnel: Staff hires, appointments, organizational changes
- Rule Clarification: Interpretive guidance on existing rules, Q&A responses

Only tag items that are specifically about CSC activity. General NIL news is not CSC activity unless the CSC is directly involved.

CRITICAL DEDUPLICATION RULE: If multiple headlines cover the SAME event (e.g., 5 outlets reporting the same investigation), create only ONE csc_item that represents the event. Pick the most descriptive headline and the earliest published timestamp. Do NOT create one item per headline — one item per distinct real-world event.

Return ONLY valid JSON, no other text.`;

  const headlineList = relevant.map(h =>
    `${h.source}: ${h.title}\n  Published: ${h.published_at}\n  URL: ${h.url}`
  ).join('\n');

  const existingList = existingCSC.length > 0
    ? existingCSC.map(c => `[${c.tag}] ${c.text}`).join('\n')
    : 'None';

  const userContent = `Identify items related to the College Sports Commission and tag each one.

POTENTIALLY CSC-RELATED HEADLINES:
${headlineList}

ALREADY TRACKED CSC ITEMS (do NOT create duplicates of these):
${existingList}

Return JSON:
{
  "csc_items": [
    {
      "text": "Description of the CSC activity",
      "tag": "Guidance|Investigation|Enforcement|Personnel|Rule Clarification",
      "source": "Source name",
      "source_url": "URL",
      "activity_time": "ISO 8601 timestamp from the headline's Published field"
    }
  ]
}

If none of these are actually NEW CSC activity (not already tracked), return: {"csc_items": []}`;

  try {
    const result = await callClaude(env, system, userContent);
    return result.csc_items || [];
  } catch (err) {
    console.error('CSC detection failed:', err.message);
    PIPELINE_ERRORS.push(`csc: ${err.message}`);
    return [];
  }
}

// ── Task 3: Daily Briefing ───────────────────────────────────────
async function generateBriefing(env, db, isAfternoon = false) {
  // 36-hour recency window on published_at — filters out old articles picked up late by aggregators
  const { results: rawHeadlines } = await db.prepare(
    `SELECT * FROM headlines WHERE category IS NOT NULL AND published_at >= datetime('now', '-36 hours') ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'important' THEN 2 ELSE 3 END, published_at DESC LIMIT 100`
  ).all();
  // Deduplicate: group similar headlines, keep highest-tier source
  const headlines = deduplicateHeadlines(rawHeadlines);
  console.log(`Briefing: ${rawHeadlines.length} raw headlines → ${headlines.length} after dedup (36h window)`);

  const { results: deadlines } = await db.prepare(
    "SELECT * FROM deadlines WHERE date >= date('now') AND date <= date('now', '+14 days') ORDER BY date ASC"
  ).all();

  const system = `You are a sharp deputy AD briefing your boss. Be direct — no throat-clearing, no filler.

IMPORTANT: This briefing covers REGULATORY, LEGAL, and GOVERNANCE developments ONLY.
Do NOT include:
- Individual player transfers or portal entries (unless they raise a compliance/eligibility dispute)
- Game results, scores, or athletic performance
- Recruiting news
- General roster management activity
- Coach hires/fires (unless related to compliance violations)

SOURCE PRIORITY:
Tier 1 (always prioritize — original reporting): ESPN, USA Today, The Athletic, Sportico, Associated Press, Reuters, Sports Illustrated, CBS Sports, Front Office Sports, New York Times, Washington Post, Wall Street Journal
Tier 2 (good analysis — reference frequently): Extra Points, Business of College Sports, NIL Revolution, On3, 247Sports, Yahoo Sports
Tier 3 (use only if no better source covers it): Regional newspapers
Tier 4 (deprioritize or skip): Aggregators, AI content farms, off-topic publications

Prioritize original reporting from Tier 1 and 2 sources. Do not feature stories that only appear in Tier 3-4 sources unless they contain genuinely new information not covered elsewhere. If a Tier 1 source covers a topic, use their reporting over lower-tier sources.

EDITORIAL FOCUS:
Focus on developments that have institutional implications — things an athletic director needs to act on or be aware of. Prefer stories about enforcement actions, regulatory changes, new legislation, court rulings, policy shifts, and industry structural changes. Deprioritize individual athlete deals, celebrity gossip, and republished/aggregated stories that don't add new information.

The audience is athletic directors managing institutional risk and compliance obligations.
Every item should answer: "Does this require action, awareness, or preparation from our institution?"
If the answer is no, don't include it.

STRICT FORMAT RULES:
- Always produce EXACTLY 4 sections. No more, no fewer.
- For each section, provide four fields:
  - "short_title": A punchy 6-10 word title that captures the core development. Written like a news ticker or push notification. No periods. Examples: "Nevada judge strikes NCAA eligibility rules", "'Street agents' draw multi-conference alarm", "Power 4 participation deadline holds at March 1"
  - "headline": ONE bold opening sentence stating what happened.
  - "body": ONE to TWO sentences max of detail/context/action items.
  - "url": The URL of the most relevant source article for this section (copy exactly from the headline list). If the section is about a deadline or forward-looking item with no specific article, use null.
- Lead with the most important item. Group related developments.
- Cite sources parenthetically (e.g., "per ESPN" or "(CourtListener)").
- If something requires institutional action, say so explicitly.
- Total output should be ~200-300 words.
- If today's headlines don't fill 4 sections, use the remaining sections for forward-looking items: upcoming deadlines, pending actions, or developments to watch this week. NEVER pad with old news.

Return ONLY valid JSON, no other text.`;

  const headlineList = headlines.map(h =>
    `[${h.severity?.toUpperCase()}] [${h.category}] [Tier ${h._tier || getSourceTier(h.source)}] ${h.source}: ${h.title}${h.url ? ` <${h.url}>` : ''}`
  ).join('\n');

  const deadlineList = deadlines.map(d =>
    `${d.date}: ${d.text} [${d.severity}]`
  ).join('\n');

  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const yesterdayET = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); })();

  let userContent;
  if (isAfternoon) {
    // Fetch this morning's briefing — carry-over is fine for impactful items
    const morningBriefing = await db.prepare(
      "SELECT content FROM briefings WHERE date = ? ORDER BY id DESC LIMIT 1"
    ).bind(todayET).first();
    const morningContent = morningBriefing?.content || '[]';
    const morningText = JSON.parse(morningContent)
      .map(s => `• ${s.headline} ${s.body}`)
      .join('\n');

    userContent = `Generate the afternoon update for ${today}. You must return EXACTLY 4 sections.

This morning's briefing covered:
${morningText || 'No morning briefing was generated.'}

Lead with any NEW developments since this morning. It's fine to carry over important morning items if they're still the biggest stories of the day — just rewrite them with fresh wording or updated context, don't copy verbatim. Fill any remaining sections with upcoming deadlines or developments to watch.

TODAY'S HEADLINES (tagged by severity):
${headlineList || 'No new headlines today.'}

UPCOMING DEADLINES (next 14 days):
${deadlineList || 'No imminent deadlines.'}

Return JSON (EXACTLY 4 sections):
{
  "sections": [
    {
      "short_title": "Punchy 6-10 word title for this item",
      "headline": "Bold opening sentence stating what happened.",
      "body": "One to two sentences of context or action items. No more.",
      "url": "https://example.com/article-url-from-headline-list or null"
    }
  ]
}`;
  } else {
    // Fetch yesterday's last briefing so the morning avoids repeating it
    const yesterdayBriefing = await db.prepare(
      "SELECT content FROM briefings WHERE date = ? ORDER BY id DESC LIMIT 1"
    ).bind(yesterdayET).first();
    const yesterdayContent = yesterdayBriefing?.content || '[]';
    const yesterdayText = JSON.parse(yesterdayContent)
      .map(s => `• ${s.headline}`)
      .join('\n');

    const yesterdayBlock = yesterdayText
      ? `\nYESTERDAY'S BRIEFING (do NOT repeat these unless there is a major new development to add):\n${yesterdayText}\n`
      : '';

    userContent = `Generate the morning briefing for ${today}. You must return EXACTLY 4 sections.

Lead with today's most important developments. If today's headlines don't fill all 4 sections, use remaining sections for upcoming deadlines or developments to watch this week.
${yesterdayBlock}
TODAY'S HEADLINES (tagged by severity):
${headlineList || 'No headlines yet today.'}

UPCOMING DEADLINES (next 14 days):
${deadlineList || 'No imminent deadlines.'}

Return JSON (EXACTLY 4 sections):
{
  "sections": [
    {
      "short_title": "Punchy 6-10 word title for this item",
      "headline": "Bold opening sentence stating what happened.",
      "body": "One to two sentences of context or action items. No more.",
      "url": "https://example.com/article-url-from-headline-list or null"
    }
  ]
}`;
  }

  // Retry once on failure (2-min wait between attempts for cron runs)
  let sections = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await callClaude(env, system, userContent);
      sections = result.sections || null;

      // Strip non-ASCII characters (Chinese, Japanese, Korean, Arabic, etc.)
      if (sections) {
        let hadNonAscii = false;
        sections = sections.map(s => {
          const cleaned = {};
          for (const [key, val] of Object.entries(s)) {
            if (typeof val === 'string' && /[^\x00-\x7F]/.test(val)) {
              hadNonAscii = true;
              cleaned[key] = val.replace(/[^\x00-\x7F]/g, '').replace(/\s{2,}/g, ' ').trim();
            } else {
              cleaned[key] = val;
            }
          }
          return cleaned;
        });
        if (hadNonAscii) {
          console.warn('Briefing: stripped non-ASCII characters from response');
        }
      }

      break;
    } catch (err) {
      console.error(`Briefing generation attempt ${attempt} failed:`, err.message);
      if (attempt < 2) {
        console.log('Retrying briefing generation in 2 minutes...');
        await new Promise(resolve => setTimeout(resolve, 120000));
      } else {
        PIPELINE_ERRORS.push(`briefing: ${err.message} (after 2 attempts)`);
        return null;
      }
    }
  }
  return sections;
}

// ── Write results to D1 ─────────────────────────────────────────
async function writeCSCActivity(db, items) {
  let count = 0;
  for (const item of items) {
    try {
      const activityTime = item.activity_time || new Date().toISOString();
      await db.prepare(
        `INSERT INTO csc_activity (tag, text, source, source_url, activity_time)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(item.tag, item.text, item.source, item.source_url || null, activityTime).run();
      count++;
    } catch (err) {
      // Skip errors
    }
  }
  return count;
}

async function writeBriefing(db, sections) {
  if (!sections || !Array.isArray(sections)) return 0;

  // Validate: only keep sections with non-empty headline and body
  const valid = sections.filter(s =>
    s && typeof s.headline === 'string' && s.headline.trim().length > 0
      && typeof s.body === 'string' && s.body.trim().length > 0
  );
  if (valid.length < 2) {
    console.error(`Briefing validation failed: only ${valid.length} valid sections (need >= 2)`);
    PIPELINE_ERRORS.push(`briefing: validation failed, ${valid.length} valid sections`);
    return 0;
  }

  // Use ET date, not UTC — avoids "Latest available" mismatch when UTC is ahead of ET
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

  // Never overwrite a good briefing with a worse one
  try {
    const existing = await db.prepare(
      'SELECT content FROM briefings WHERE date = ?'
    ).bind(today).first();
    if (existing?.content) {
      const existingSections = JSON.parse(existing.content);
      const existingValid = existingSections.filter(s =>
        s && typeof s.headline === 'string' && s.headline.trim().length > 0
          && typeof s.body === 'string' && s.body.trim().length > 0
      );
      if (existingValid.length > valid.length) {
        console.log(`Briefing: keeping existing (${existingValid.length} sections) over new (${valid.length} sections)`);
        return 0;
      }
    }
  } catch { /* existing content malformed, overwrite is fine */ }

  try {
    await db.prepare(
      `INSERT OR REPLACE INTO briefings (date, content, generated_at)
       VALUES (?, ?, datetime('now'))`
    ).bind(today, JSON.stringify(valid)).run();
    return 1;
  } catch (err) {
    console.error('Failed to write briefing:', err.message);
    return 0;
  }
}

// ── Main Pipeline ────────────────────────────────────────────────
export async function runAIPipeline(env, options = {}) {
  const { includeBriefing = true, isAfternoon = false } = options;
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

  // 2. Tag untagged headlines — always runs regardless of new data
  const headlinesTagged = await tagHeadlines(env, db);
  console.log(`AI Pipeline: tagged ${headlinesTagged} headlines`);

  // 3. Fetch new data since last run (for CSC detection + briefing)
  const headlines = await getNewHeadlines(db, lastRun);
  const caseUpdates = await getNewCaseUpdates(db, lastRun);
  const totalNew = headlines.length + caseUpdates.length;
  console.log(`AI Pipeline: ${headlines.length} new headlines, ${caseUpdates.length} case updates`);

  // 4. Detect CSC activity (only if new headlines)
  let cscWritten = 0;
  if (headlines.length > 0) {
    const cscItems = await detectCSCActivity(env, headlines, db);
    cscWritten = await writeCSCActivity(db, cscItems);
    console.log(`AI Pipeline: detected ${cscItems.length} CSC items, wrote ${cscWritten}`);
  }

  // 5. Generate briefing (only on briefing-eligible runs)
  let briefingWritten = 0;
  if (includeBriefing) {
    const briefingSections = await generateBriefing(env, db, isAfternoon);
    if (briefingSections && briefingSections.length > 0) {
      briefingWritten = await writeBriefing(db, briefingSections);
      console.log(`AI Pipeline: briefing generated (${briefingSections.length} sections)`);
    } else {
      console.log('AI Pipeline: briefing generation returned no sections');
    }
  } else {
    console.log('AI Pipeline: briefing skipped (non-briefing run)');
  }

  // 6. Record pipeline run
  await db.prepare(
    `INSERT INTO pipeline_runs (items_processed, headlines_tagged, deadlines_created, csc_items_created, briefing_generated)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(totalNew, headlinesTagged, 0, cscWritten, briefingWritten).run();

  console.log('AI Pipeline: complete');
  if (PIPELINE_ERRORS.length > 0) {
    const errors = [...PIPELINE_ERRORS];
    PIPELINE_ERRORS.length = 0;
    throw new Error(`Pipeline completed with errors: ${errors.join('; ')}`);
  }
}
