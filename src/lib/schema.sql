-- CLIMB v0.1 SQLite schema
-- All statements are idempotent (IF NOT EXISTS) - applied on every boot.

-- Project-level constants (seeded once): start_date, start_followers, goal_followers, duration_days
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- User-editable settings (never store API keys here - those live in .env)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- SOURCE: origin of PROJECT 10K events. DB only in v0.1 - no dedicated input UI.
CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  project TEXT NOT NULL DEFAULT 'PROJECT_10K',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  model TEXT,
  source_id INTEGER REFERENCES sources(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);

-- Asset: one physical file (local original + optional Drive copy).
-- upload_status: LOCAL_SAVED -> DRIVE_PENDING -> DRIVE_UPLOADED / DRIVE_FAILED
CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL DEFAULT 'AI_CHAT'
    CHECK (source IN ('AI_CHAT', 'X_SCREENSHOT', 'ANALYTICS', 'CLIMB', 'OTHER')),
  source_id INTEGER REFERENCES sources(id),
  original_filename TEXT NOT NULL,
  stored_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  local_path TEXT NOT NULL,
  drive_file_id TEXT,
  drive_url TEXT,
  drive_folder_id TEXT,
  upload_status TEXT NOT NULL DEFAULT 'LOCAL_SAVED'
    CHECK (upload_status IN ('LOCAL_SAVED', 'DRIVE_PENDING', 'DRIVE_UPLOADED', 'DRIVE_FAILED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  uploaded_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_assets_sha256 ON assets(sha256);
CREATE INDEX IF NOT EXISTS idx_assets_upload_status ON assets(upload_status);

-- Attachment relation is separate from Asset: the same file (same sha256) may be
-- attached to multiple messages without merging the relations.
CREATE TABLE IF NOT EXISTS message_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL REFERENCES messages(id),
  asset_id INTEGER NOT NULL REFERENCES assets(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_message_attachments_message ON message_attachments(message_id);

-- X post drafts. RAW -> AI FEEDBACK -> AI MINIMAL EDIT (optional) -> FINAL -> RESULT
-- origin: CLIMB = drafted in the app, X_DIRECT = posted directly on X and
-- imported afterwards (e.g. from an analytics screenshot)
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER REFERENCES sources(id),
  origin TEXT NOT NULL DEFAULT 'CLIMB',
  post_type TEXT NOT NULL DEFAULT 'PRIMARY' CHECK (post_type IN ('PRIMARY', 'CASUAL')),
  raw_text TEXT NOT NULL,
  ai_feedback TEXT,
  ai_minimal_edit TEXT,
  final_text TEXT,
  minimal_edit_used INTEGER NOT NULL DEFAULT 0,
  prompt_version TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'FINAL', 'PUBLISHED', 'DISCARDED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  published_at TEXT
);

-- Every drafting stage of a post, in order: the rewriting process itself is
-- PROJECT 10K story material. RAW = first draft, REWRITE = user's rewrite,
-- AI_EDIT = the suggestion-applied version Claude produced, FINAL = what was
-- saved as final. Rows are append-only.
CREATE TABLE IF NOT EXISTS post_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id),
  revision INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('RAW', 'REWRITE', 'AI_EDIT', 'FINAL')),
  text TEXT NOT NULL,
  ai_feedback TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_post_revisions_post ON post_revisions(post_id);

-- Free-form tags (not a fixed set of 5)
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS post_tags (
  post_id INTEGER NOT NULL REFERENCES posts(id),
  tag_id INTEGER NOT NULL REFERENCES tags(id),
  PRIMARY KEY (post_id, tag_id)
);

-- Manual daily follower count. One row per date; same-date input overwrites.
CREATE TABLE IF NOT EXISTS daily_followers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  followers INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Manual post metrics. Never overwrite a post_id - append a new row per measurement.
CREATE TABLE IF NOT EXISTS post_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id),
  measured_at TEXT NOT NULL DEFAULT (datetime('now')),
  impressions INTEGER,
  likes INTEGER,
  reposts INTEGER,
  replies INTEGER,
  bookmarks INTEGER,
  profile_visits INTEGER,
  follows INTEGER
);
CREATE INDEX IF NOT EXISTS idx_post_metrics_post ON post_metrics(post_id);

-- AI coach: periodic data-grounded analysis with concrete next actions.
-- Append-only; the latest report is shown on the home screen.
CREATE TABLE IF NOT EXISTS coach_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  summary TEXT NOT NULL,
  actions TEXT NOT NULL, -- JSON array of action strings
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Learnings extracted from measured results. Injected into the diagnosis and
-- chat prompts so advice improves as data accumulates - this is how the app
-- "grows": data -> learnings -> better guidance.
CREATE TABLE IF NOT EXISTS learnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  insight TEXT NOT NULL,
  evidence TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- App improvement proposals generated by the coach. The user reviews them and,
-- when adopted, pastes the instruction into the Claude Code dev chat.
-- status: OPEN -> DONE (implemented) / DISMISSED (not doing)
CREATE TABLE IF NOT EXISTS dev_proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  reason TEXT NOT NULL,
  instruction TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'DONE', 'DISMISSED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- X profile (name/bio) history. Append-only like post_revisions - each save
-- records the date the wording went live (applied_on, JST) so the follower
-- graph can mark before/after.
CREATE TABLE IF NOT EXISTS profile_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  bio TEXT NOT NULL,
  ai_feedback TEXT,
  ai_edit TEXT,
  applied_on TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Manual time log for weekly review
CREATE TABLE IF NOT EXISTS time_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  category TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
