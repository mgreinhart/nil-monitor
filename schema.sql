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

-- Cases (from CourtListener + seeded at setup)
CREATE TABLE cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT UNIQUE,
  name TEXT,
  court TEXT,
  judge TEXT,
  status TEXT,
  category TEXT,
  filed_date TEXT,
  last_filing_date TEXT,
  filing_count INTEGER DEFAULT 0,
  next_action TEXT,
  next_action_date TEXT,
  description TEXT,
  courtlistener_url TEXT,
  pacer_url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Headlines (from NewsData.io + Google News RSS)
CREATE TABLE headlines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT,
  title TEXT,
  url TEXT UNIQUE,
  category TEXT,
  published_at TEXT,
  fetched_at TEXT DEFAULT (datetime('now'))
);

-- Events Timeline (AI-extracted from all sources)
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT,
  source_url TEXT,
  category TEXT,
  text TEXT,
  severity TEXT,
  event_time TEXT,
  created_at TEXT DEFAULT (datetime('now'))
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
  events_created INTEGER DEFAULT 0,
  deadlines_created INTEGER DEFAULT 0,
  csc_items_created INTEGER DEFAULT 0,
  briefing_generated INTEGER DEFAULT 0
);
