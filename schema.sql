-- Workforce Junction — Request & Termination Workspace
-- SQLite schema

CREATE TABLE IF NOT EXISTS submissions (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL CHECK(type IN ('termination','crf','implementation')),
  client       TEXT DEFAULT '',
  broker       TEXT DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('draft','requested','approved','testing','completed')),
  owner        TEXT DEFAULT '',
  header_json  TEXT DEFAULT '{}',   -- header fields specific to the form type
  body_json    TEXT DEFAULT '{}',   -- long-form content (request text, SOW, category matrix, etc.)
  is_deleted   INTEGER DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id            TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  section_key   TEXT NOT NULL,
  item_key      TEXT NOT NULL,
  label         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','approved','testing','completed')),
  assignee      TEXT DEFAULT '',
  completed_on  TEXT DEFAULT '',
  notes         TEXT DEFAULT '',
  extra_json    TEXT DEFAULT '{}',
  UNIQUE(submission_id, section_key, item_key)
);

CREATE INDEX IF NOT EXISTS idx_tasks_submission ON tasks(submission_id);
CREATE INDEX IF NOT EXISTS idx_submissions_type ON submissions(type);

CREATE TABLE IF NOT EXISTS teams (
  id   TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS team_members (
  id      TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name    TEXT NOT NULL,
  email   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_logs (
  id         TEXT PRIMARY KEY,
  to_email   TEXT NOT NULL,
  subject    TEXT NOT NULL,
  body       TEXT NOT NULL,
  sent_at    TEXT NOT NULL
);
