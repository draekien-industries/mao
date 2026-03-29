# Requirements: Mao — Data Persistence

**Defined:** 2026-03-25
**Core Value:** Users can close the app and resume exactly where they left off

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Infrastructure

- [x] **INFRA-01**: Native module packaging configured (Vite externals, Forge AutoUnpackNativesPlugin, electron-rebuild) so better-sqlite3 works in packaged builds
- [x] **INFRA-02**: SQLite database created in Electron's app.getPath('userData') on first launch
- [x] **INFRA-03**: Database connection managed as Effect Layer with acquireRelease semantics for clean lifecycle
- [x] **INFRA-04**: WAL mode enabled via PRAGMA for crash resilience and atomic transactions

### Event Storage

- [ ] **EVNT-01**: Each complete CLI event stored as an immutable row with session_id, sequence_number, event_type, event_data, and created_at
- [ ] **EVNT-02**: User messages stored as synthetic user_message events for full conversation reconstruction
- [x] **EVNT-03**: Events partitioned by session_id for multi-tab independence
- [ ] **EVNT-04**: Sequence numbers maintain strict event ordering within each session

### Write Pipeline

- [x] **WPIPE-01**: Stream deltas buffered in memory; only the complete AssistantMessageEvent is persisted
- [x] **WPIPE-02**: In-memory buffer discarded on user termination with no partial data written to the database
- [x] **WPIPE-03**: SystemInitEvent persisted immediately to capture session_id for resume capability
- [x] **WPIPE-04**: PersistentClaudeCli decorator wraps ClaudeCli via Stream.tap for transparent persistence

### Tab Management

- [x] **TAB-01**: Tab metadata stored: repository/cwd, git branch/worktree, Claude session ID, tab order, display label
- [ ] **TAB-02**: Active tab indicator persisted so the correct tab is focused on reopen
- [x] **TAB-03**: Full tab layout restored on app reopen with all tabs pointing to correct projects

### Session Reconstruction

- [x] **RECON-01**: Full conversation state reconstructed from stored events on app reopen
- [x] **RECON-02**: CLI sessions resumed via --resume flag using stored session_id
- [x] **RECON-03**: New RPC endpoint exposes session reconstruction to the renderer process

### Safety

- [x] **SAFE-01**: Graceful shutdown flushes or explicitly discards pending writes on app quit via before-quit event
- [x] **SAFE-02**: Database integrity check (PRAGMA quick_check) runs on startup and warns if corruption detected

### Project & Session Management (Phase 04.2)

- [x] **PROJ-01**: Project table in SQLite with id, name, directory, is_git_repo, worktree_base_path; tabs reference project_id via foreign key (D-07)
- [x] **PROJ-02**: ProjectStore service provides create, getAll, getById, remove with cascade delete of tabs and events (D-06, D-20)
- [ ] **GIT-01**: GitService wraps git CLI via CommandExecutor for listBranches, getCurrentBranch, getRepoName, isGitRepo, listWorktrees, createWorktree, removeWorktree (D-21)
- [ ] **GIT-02**: Git worktree creation uses `git worktree add` with branch-exists detection; existing worktrees offered for reuse (D-11, D-12)
- [ ] **DIAL-01**: DialogService wraps Electron's native dialog.showOpenDialog for directory selection (D-22)
- [ ] **RPC-01**: GitRpcGroup exposes all git operations to the renderer via typed RPC (D-21)
- [ ] **RPC-02**: DialogRpcGroup exposes native directory picker to the renderer via typed RPC (D-22)
- [ ] **RPC-03**: PersistenceRpcGroup extended with createProject, listProjects, removeProject, createTab for project CRUD (D-23)
- [ ] **RPC-04**: All four RPC groups (Claude, Persistence, Git, Dialog) merged via RpcGroup.merge and wired into server/client/main.ts (D-24)
- [x] **ATOM-04**: Sidebar atoms replace mock data with real project/session state loaded from DB via RPC on app start (D-06, D-08)
- [x] **ATOM-05**: RendererRpcClient Context.Tag provides full typed RPC client to renderer atoms for calling persistence, git, and dialog operations
- [ ] **UI-01**: Session creation dialog with branch autocomplete (Command component) and "Create worktree" checkbox (D-01, D-05, D-10, D-11)
- [ ] **UI-02**: Project removal via right-click context menu with confirmation dialog showing session count (D-02, D-03)
- [ ] **UI-03**: Project registration via native directory picker with auto-derived name and auto-created first session (D-16, D-17)
- [x] **UI-04**: Sidebar empty state ("No projects yet") with Register Project button; new project auto-expands and activates (D-09, D-18)
- [x] **UI-05**: Session click shows skeleton loading transition while atom state resolves (D-04)

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
| INFRA-01 | Phase 1 | Complete |
| INFRA-02 | Phase 1 | Complete |
| INFRA-03 | Phase 1 | Complete |
| INFRA-04 | Phase 1 | Complete |
| EVNT-01 | Phase 2 | Pending |
| EVNT-02 | Phase 2 | Pending |
| EVNT-03 | Phase 2 | Complete |
| EVNT-04 | Phase 2 | Pending |
| WPIPE-01 | Phase 3 | Complete |
| WPIPE-02 | Phase 3 | Complete |
| WPIPE-03 | Phase 3 | Complete |
| WPIPE-04 | Phase 3 | Complete |
| TAB-01 | Phase 2 | Complete |
| TAB-02 | Phase 5 | Pending |
| TAB-03 | Phase 5 | Complete |
| RECON-01 | Phase 4 | Complete |
| RECON-02 | Phase 4 | Complete |
| RECON-03 | Phase 4 | Complete |
| SAFE-01 | Phase 5 | Complete |
| SAFE-02 | Phase 1 | Complete |
| PROJ-01 | Phase 04.2 | Complete |
| PROJ-02 | Phase 04.2 | Complete |
| GIT-01 | Phase 04.2 | Pending |
| GIT-02 | Phase 04.2 | Pending |
| DIAL-01 | Phase 04.2 | Pending |
| RPC-01 | Phase 04.2 | Pending |
| RPC-02 | Phase 04.2 | Pending |
| RPC-03 | Phase 04.2 | Pending |
| RPC-04 | Phase 04.2 | Pending |
| ATOM-04 | Phase 04.2 | Complete |
| ATOM-05 | Phase 04.2 | Complete |
| UI-01 | Phase 04.2 | Pending |
| UI-02 | Phase 04.2 | Pending |
| UI-03 | Phase 04.2 | Pending |
| UI-04 | Phase 04.2 | Complete |
| UI-05 | Phase 04.2 | Complete |

**Coverage:**
- v1 requirements: 36 total
- Mapped to phases: 36
- Unmapped: 0

---
*Requirements defined: 2026-03-25*
*Last updated: 2026-03-27 after Phase 04.2 planning*
