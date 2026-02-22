-- Bills (state + federal, from LegiScan)
CREATE TABLE bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT UNIQUE,
  state TEXT,
  bill_number TEXT,
  title TEXT,
  description TEXT,
  status TEXT,
  sponsor TEXT,
  cosponsor_count INTEGER DEFAULT 0,
  committee TEXT,
  last_action TEXT,
  last_action_date TEXT,
  url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Cases (from College Sports Litigation Tracker)
CREATE TABLE cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  case_group TEXT,
  court TEXT,
  judge TEXT,
  case_number TEXT,
  filed_date TEXT,
  last_event_text TEXT,
  last_event_date TEXT,
  status_summary TEXT,
  description TEXT,
  upcoming_dates TEXT,        -- JSON array: [{"date":"YYYY-MM-DD","text":"..."}]
  cslt_url TEXT DEFAULT 'https://www.collegesportslitigationtracker.com/tracker',
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(name, case_number)
);

-- Case Updates (from CSLT "Latest Updates" / "Previous Updates" sections)
CREATE TABLE IF NOT EXISTS case_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_name TEXT NOT NULL,
  update_text TEXT NOT NULL,
  update_date TEXT,
  fetched_at TEXT DEFAULT (datetime('now')),
  UNIQUE(case_name, update_text)
);

-- Headlines (from NewsData.io + Google News RSS, AI-tagged with category + severity)
CREATE TABLE headlines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT,
  title TEXT,
  url TEXT UNIQUE,
  category TEXT,                -- AI-assigned: Legislation, Litigation, NCAA Governance, etc.
  sub_category TEXT,            -- AI-assigned: CSC sub-tag (Guidance, Investigation, etc.)
  severity TEXT,                -- AI-assigned: routine, important, critical
  published_at TEXT,
  fetched_at TEXT DEFAULT (datetime('now'))
);

-- Deadlines (AI-extracted + pre-loaded)
CREATE TABLE deadlines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT,
  category TEXT,
  text TEXT,
  severity TEXT,
  source TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- CSC Activity (AI-tagged from news + official sources)
CREATE TABLE csc_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tag TEXT,
  text TEXT,
  source TEXT,
  source_url TEXT,
  activity_time TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Daily Briefings (AI-generated)
CREATE TABLE briefings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT UNIQUE,
  content TEXT,
  generated_at TEXT DEFAULT (datetime('now'))
);

-- House Settlement (key metrics, updated periodically)
CREATE TABLE house_settlement (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE,
  value TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Pipeline runs (tracks when AI pipeline last ran)
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ran_at TEXT DEFAULT (datetime('now')),
  items_processed INTEGER DEFAULT 0,
  headlines_tagged INTEGER DEFAULT 0,
  deadlines_created INTEGER DEFAULT 0,
  csc_items_created INTEGER DEFAULT 0,
  briefing_generated INTEGER DEFAULT 0
);

-- Fetcher self-governing cooldowns
CREATE TABLE IF NOT EXISTS fetcher_runs (
  fetcher_name TEXT PRIMARY KEY,
  last_run TEXT
);
