export const EVENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    sequence_number INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    event_data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(session_id, sequence_number)
  )
`;

export const EVENTS_SESSION_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_events_session_id
  ON events (session_id)
`;

export const TABS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS tabs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    cwd TEXT NOT NULL,
    git_branch TEXT,
    display_label TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

export const PROJECTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    directory TEXT NOT NULL UNIQUE,
    is_git_repo INTEGER NOT NULL DEFAULT 0,
    worktree_base_path TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

export const TABS_ADD_PROJECT_ID_SQL = `
  ALTER TABLE tabs ADD COLUMN project_id INTEGER REFERENCES projects(id)
`;
