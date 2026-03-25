# Requirements: Mao — Data Persistence

**Defined:** 2026-03-25
**Core Value:** Users can close the app and resume exactly where they left off

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Infrastructure

- [ ] **INFRA-01**: Native module packaging configured (Vite externals, Forge AutoUnpackNativesPlugin, electron-rebuild) so better-sqlite3 works in packaged builds
- [ ] **INFRA-02**: SQLite database created in Electron's app.getPath('userData') on first launch
- [ ] **INFRA-03**: Database connection managed as Effect Layer with acquireRelease semantics for clean lifecycle
- [ ] **INFRA-04**: WAL mode enabled via PRAGMA for crash resilience and atomic transactions

### Event Storage

- [ ] **EVNT-01**: Each complete CLI event stored as an immutable row with session_id, sequence_number, event_type, event_data, and created_at
- [ ] **EVNT-02**: User messages stored as synthetic user_message events for full conversation reconstruction
- [ ] **EVNT-03**: Events partitioned by session_id for multi-tab independence
- [ ] **EVNT-04**: Sequence numbers maintain strict event ordering within each session

### Write Pipeline

- [ ] **WPIPE-01**: Stream deltas buffered in memory; only the complete AssistantMessageEvent is persisted
- [ ] **WPIPE-02**: In-memory buffer discarded on user termination with no partial data written to the database
- [ ] **WPIPE-03**: SystemInitEvent persisted immediately to capture session_id for resume capability
- [ ] **WPIPE-04**: PersistentClaudeCli decorator wraps ClaudeCli via Stream.tap for transparent persistence

### Tab Management

- [ ] **TAB-01**: Tab metadata stored: repository/cwd, git branch/worktree, Claude session ID, tab order, display label
- [ ] **TAB-02**: Active tab indicator persisted so the correct tab is focused on reopen
- [ ] **TAB-03**: Full tab layout restored on app reopen with all tabs pointing to correct projects

### Session Reconstruction

- [ ] **RECON-01**: Full conversation state reconstructed from stored events on app reopen
- [ ] **RECON-02**: CLI sessions resumed via --resume flag using stored session_id
- [ ] **RECON-03**: New RPC endpoint exposes session reconstruction to the renderer process

### Safety

- [ ] **SAFE-01**: Graceful shutdown flushes or explicitly discards pending writes on app quit via before-quit event
- [ ] **SAFE-02**: Database integrity check (PRAGMA quick_check) runs on startup and warns if corruption detected

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Performance

- **PERF-01**: Snapshot/materialized views for fast startup on long conversations
- **PERF-02**: Event replay profiling and optimization for sessions with hundreds of events

### Search & Analytics

- **SRCH-01**: Full-text conversation search across all sessions via SQLite FTS5
- **COST-01**: Cost and token usage tracking projections from stored ResultEvents
- **DBUG-01**: Event replay UI for stepping through stored events chronologically

## Out of Scope

| Feature | Reason |
|---------|--------|
| Cloud sync / remote storage | Single-user local-only app; cloud adds auth, conflict resolution, privacy concerns |
| Schema migration framework | Defer until schema stabilizes; use PRAGMA user_version for simple version tracking |
| Storing raw stream deltas | AssistantMessageEvent contains complete content; deltas are 10-50x bloat for no benefit |
| Full CQRS with separate databases | Overkill for single-user desktop app; single SQLite DB with direct queries suffices |
| Reactive database queries | App already has Effect streams + React state for live UI; DB is for persistence only |
| ORM layer | Simple 2-3 table schema; @effect/sql-sqlite-node tagged templates are sufficient |
| Event versioning / upcasting | Premature; Effect Schema tolerates missing/extra fields; DB wipe acceptable at this stage |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Pending |
| INFRA-02 | Phase 1 | Pending |
| INFRA-03 | Phase 1 | Pending |
| INFRA-04 | Phase 1 | Pending |
| EVNT-01 | Phase 2 | Pending |
| EVNT-02 | Phase 2 | Pending |
| EVNT-03 | Phase 2 | Pending |
| EVNT-04 | Phase 2 | Pending |
| WPIPE-01 | Phase 3 | Pending |
| WPIPE-02 | Phase 3 | Pending |
| WPIPE-03 | Phase 3 | Pending |
| WPIPE-04 | Phase 3 | Pending |
| TAB-01 | Phase 2 | Pending |
| TAB-02 | Phase 5 | Pending |
| TAB-03 | Phase 5 | Pending |
| RECON-01 | Phase 4 | Pending |
| RECON-02 | Phase 4 | Pending |
| RECON-03 | Phase 4 | Pending |
| SAFE-01 | Phase 5 | Pending |
| SAFE-02 | Phase 1 | Pending |

**Coverage:**
- v1 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0

---
*Requirements defined: 2026-03-25*
*Last updated: 2026-03-25 after roadmap creation*
