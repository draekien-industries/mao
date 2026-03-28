# Roadmap: Mao — Data Persistence

## Overview

This roadmap delivers a local SQLite event sourcing layer that lets users close the Mao Electron app and resume exactly where they left off. The build follows the architecture's natural dependency graph: establish a working SQLite connection in a packaged Electron build, then build storage services on top of it, then the write pipeline that intercepts the existing CLI stream, then session reconstruction that reads persisted events back into chat state, and finally renderer integration that ties it all together into the user-facing experience. Each phase delivers a verifiable capability that the next phase depends on.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: SQLite Infrastructure** - Native module packaging, database creation, connection lifecycle, and startup integrity checks
- [ ] **Phase 2: Storage Services** - EventStore and TabStore services providing the append/query API for persisted data
- [ ] **Phase 3: Write Pipeline** - Stream buffer and PersistentClaudeCli decorator that intercept CLI events and persist them transparently
- [x] **Phase 4: Session Reconstruction** - Read-path service that rebuilds full conversation state from stored events (completed 2026-03-26)
- [ ] **Phase 5: Renderer Integration** - Tab restore, session hydration in the UI, and graceful shutdown ensuring data safety

## Phase Details

### Phase 1: SQLite Infrastructure
**Goal**: A working SQLite database exists on the user's machine, managed as an Effect Layer, verified in a packaged Electron build
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, SAFE-02
**Success Criteria** (what must be TRUE):
  1. The app creates a SQLite database in the user's data directory on first launch, and reuses it on subsequent launches
  2. The packaged (production) build starts without crashing — better-sqlite3 native module loads correctly from outside the ASAR archive
  3. WAL mode is active and the database connection closes cleanly when the app quits (no orphaned WAL files on next startup)
  4. A startup integrity check runs and logs a warning if database corruption is detected
  5. The database connection is provided as an Effect Layer with acquireRelease semantics that other services can depend on
**Plans:** 2 plans
Plans:
- [x] 01-01-PLAN.md — Install SQLite dependencies, configure native module packaging, create Database service contracts
- [ ] 01-02-PLAN.md — Implement DatabaseLive Layer with integrity check and schema bootstrap, wire into main.ts, write tests

### Phase 2: Storage Services
**Goal**: Effect services exist for appending events and managing tab metadata, with correct partitioning by session
**Depends on**: Phase 1
**Requirements**: EVNT-01, EVNT-02, EVNT-03, EVNT-04, TAB-01
**Success Criteria** (what must be TRUE):
  1. A complete CLI event can be stored as an immutable row with session_id, sequence_number, event_type, event_data, and created_at
  2. User messages can be stored as synthetic user_message events alongside CLI events in the same session
  3. Events queried for a given session_id are returned in strict sequence_number order, independent of other sessions
  4. Tab metadata (repository/cwd, git branch, session ID, tab order, display label) can be created, updated, and queried
**Plans:** 3 plans
Plans:
- [ ] 02-01-PLAN.md — Update tabs schema (D-06), define StoredEvent/UserMessageEvent schemas, create EventStore and TabStore service contracts
- [ ] 02-02-PLAN.md — Implement EventStore service with append, getBySession, purgeSession and full test coverage
- [x] 02-03-PLAN.md — Implement TabStore service with CRUD and cascade delete, wire both stores into main.ts

### Phase 3: Write Pipeline
**Goal**: The existing CLI stream is transparently intercepted so complete events flow into the database without changing what the renderer receives
**Depends on**: Phase 2
**Requirements**: WPIPE-01, WPIPE-02, WPIPE-03, WPIPE-04
**Success Criteria** (what must be TRUE):
  1. Stream deltas are buffered in memory and only the complete AssistantMessageEvent is written to the database — no partial content rows exist
  2. When a user terminates a session mid-response, the in-memory buffer is discarded and no partial data appears in the database
  3. The SystemInitEvent is persisted immediately upon stream start, capturing the session_id for future resume capability
  4. The PersistentClaudeCli decorator wraps ClaudeCli via Stream.tap and the renderer receives the same stream it did before — persistence is invisible to the UI
**Plans:** 1/2 plans executed
Plans:
- [x] 03-01-PLAN.md — Implement PersistentClaudeCli decorator with TDD (tests + service implementation)
- [x] 03-02-PLAN.md — Wire PersistentClaudeCli into main.ts layer composition

### Phase 4: Session Reconstruction
**Goal**: Full conversation state can be rebuilt from stored events and exposed to the renderer via RPC
**Depends on**: Phase 3
**Requirements**: RECON-01, RECON-02, RECON-03
**Success Criteria** (what must be TRUE):
  1. A SessionReconstructor service can fold stored events back into a ChatMessage array that matches the original conversation state
  2. The reconstructed state includes the session_id needed to resume the CLI session via the --resume flag
  3. A new RPC endpoint exposes session reconstruction to the renderer process, returning typed data per tab
**Plans:** 3/3 plans complete
Plans:
- [x] 04-01-PLAN.md — Create shared extractAssistantText utility, reconstruction schemas, EventStore getBySessionWithMeta extension
- [x] 04-02-PLAN.md — SessionReconstructor service with TDD event fold logic
- [x] 04-03-PLAN.md — Create PersistenceRpcGroup, wire merged RPC groups into server/client/main.ts

### Phase 04.4: refine logging approach (INSERTED)

**Goal:** [Urgent work - to be planned]
**Requirements**: TBD
**Depends on:** Phase 4
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 04.4 to break down)

### Phase 04.1: Atom state foundation + sidebar shell (INSERTED)

**Goal:** Install effect-atom, migrate single-session chat from useClaudeChat hooks to atom-based state, build the two-tiered sidebar component with basic project/session structure. Proves the new architecture works end-to-end with one tab.
**Requirements**: TBD
**Depends on:** Phase 4
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 04.1 to break down)

### Phase 04.2: Project and session management with git integration (INSERTED)

**Goal:** Project registration via native directory picker, session creation with branch/worktree selection, git worktree creation via `git worktree add`, project removal with cascade. New RPC endpoints for git operations on the main process.
**Requirements**: RPC-01, RPC-02, RPC-03, RPC-04
**Depends on:** Phase 04.1
**Plans:** 4/5 plans executed

Plans:
- [x] 04.2-01-PLAN.md -- ProjectStore service with cascade delete
- [x] 04.2-02-PLAN.md -- GitService and DialogService implementations
- [x] 04.2-03-PLAN.md -- RPC layer: GitRpcGroup, DialogRpcGroup, extended PersistenceRpcGroup, four-way merge
- [x] 04.2-04-PLAN.md -- Sidebar React component
- [ ] 04.2-05-PLAN.md -- Project management UI

### Phase 04.3: Multi-tab orchestration with background streaming (INSERTED)

**Goal:** Multiple concurrent CLI streams running in background across tabs, tab switching without losing state, status indicators (streaming/unread/error/tool-input), smart scroll with per-tab position preservation, soft concurrency limit with warning banner.
**Requirements**: D-01 through D-16 (from 04.3-CONTEXT.md)
**Depends on:** Phase 04.2
**Plans:** 3 plans

Plans:
- [ ] 04.3-01-PLAN.md -- New atoms (unread, toolInput, draftInput, scroll), 5-state TabStatus, sendMessageAtom concurrency/unread/tool-input tracking, CSS tokens
- [ ] 04.3-02-PLAN.md -- Smart scroll behavior, draft input, tab switch scroll preservation in chat panel
- [ ] 04.3-03-PLAN.md -- SessionStatusIndicator tool-input extension, ConcurrencyWarningBanner, sidebar wiring

### Phase 5: Renderer Integration
**Goal**: Users experience seamless app restart — tabs restore, conversations appear, and quitting the app never loses data
**Depends on**: Phase 4
**Requirements**: TAB-02, TAB-03, SAFE-01
**Success Criteria** (what must be TRUE):
  1. On app reopen, all previously open tabs are restored with correct project context (cwd, git branch, display label) and the previously active tab is focused
  2. Each restored tab shows its full conversation history as it appeared before the app was closed
  3. Quitting the app (via menu, OS close, or keyboard shortcut) flushes or explicitly discards pending writes before the database connection closes — no data is silently lost
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. SQLite Infrastructure | 0/2 | Planning complete | - |
| 2. Storage Services | 0/3 | Planning complete | - |
| 3. Write Pipeline | 1/2 | In Progress|  |
| 4. Session Reconstruction | 3/3 | Complete   | 2026-03-26 |
| 5. Renderer Integration | 0/? | Not started | - |
