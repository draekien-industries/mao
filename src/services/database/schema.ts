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
    tab_order INTEGER NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;
