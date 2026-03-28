# Mao — Data Persistence

## What This Is

A local data persistence layer for the Mao Electron app, which manages multiple Claude CLI sessions in parallel tabs. Uses event sourcing with SQLite to store each complete CLI event as a row, enabling full chat state reconstruction when the user quits and reopens the app.

## Core Value

Users can close the app and resume exactly where they left off — every tab, every conversation, fully restored from persisted events.

## Requirements

### Validated

- ✓ Electron multi-process architecture (main/preload/renderer) with Effect-TS service layers — existing
- ✓ Type-safe RPC over IPC bridging main and renderer processes — existing
- ✓ Claude CLI spawning with stream-json output parsing and typed event system — existing
- ✓ Single chat session with query/resume/continue support — existing
- ✓ React 19 UI with TanStack Router — existing

### Active

- [ ] Support multiple concurrent tabs, each with independent persistence

### Validated in Phase 04.3: Multi-Tab Orchestration with Background Streaming

- ✓ 5-state tab status derivation (error > tool-input > unread > streaming > idle) with per-tab atom families for unread, tool-input, draft input, scroll position, and auto-scroll
- ✓ Smart scroll behavior: auto-scroll at bottom, disable on scroll up, re-enable + clear unread on scroll to bottom, per-tab position preservation across tab switches
- ✓ Concurrency tracking with Effect.ensuring for leak-safe activeStreamCount, warning banner at 5+ streams
- ✓ Tool-input detection via ToolUseBlock content inspection, orange status indicator dot
- ✓ Per-tab draft input persistence via atom-backed state (TanStack Form removed from chat panel)

### Validated in Phase 04.1: Atom State Foundation + Sidebar Shell

- ✓ effect-atom runtime with RegistryProvider replacing ManagedRuntime pattern — Atom.runtime(ClaudeCliFromRpc) with per-tab state via Atom.family
- ✓ Per-tab chat state atoms (messages, streaming, session, error, events) with derived status atom for sidebar indicators
- ✓ Two-tiered sidebar with collapsible project/session structure and live streaming status indicators
- ✓ Chat panel migrated from useClaudeChat hook to atom-based state, proving architecture end-to-end with one tab

### Validated in Phase 04: Session Reconstruction

- ✓ Reconstruct full chat session state from stored events on app reopen — SessionReconstructor service folds StoredEvents into ChatMessage arrays via typed event fold logic
- ✓ Resume CLI sessions using the `--resume` flag with stored session IDs — SystemInitEvent session_id extracted to ReconstructedSession.sessionId, exposed via PersistenceRpcGroup.reconstructSession RPC
- ✓ New RPC endpoint exposes session reconstruction to renderer — PersistenceRpcGroup with reconstructSession and listTabs RPCs, merged with ClaudeRpcGroup on shared IPC transport

### Validated in Phase 03: Write Pipeline

- ✓ Buffer partial/chunked stream messages, only persist the complete assembled message — PersistentClaudeCli decorator persists only SystemInitEvent, AssistantMessageEvent, ResultEvent via Stream.tap
- ✓ Discard all partial output if user terminates a session mid-response — only complete events are ever written; no partial data possible on interruption

### Validated in Phase 02: Storage Services

- ✓ Local SQLite database on user's machine for event storage — EventStore and TabStore service layers implemented
- ✓ Event sourcing: each complete JSON event from the CLI stream stored as a row — EventStore.append with auto-assigned sequence numbers
- ✓ Tab metadata persistence: repository/cwd, git branch, session ID, display label — TabStore CRUD with cascade delete

### Out of Scope

- Cloud sync or remote storage — this is local-only persistence
- Real-time collaborative sessions — single user per machine
- Migration tooling for schema versioning — defer until schema stabilizes
- Storing raw partial/chunked stream data — only complete events are persisted

## Context

- The app already has a working chat flow: user prompt -> Effect stream -> Claude CLI spawn -> stream-json events -> React UI state
- The `ClaudeEvent` union in `src/services/claude-cli/events.ts` defines all event types: `SystemInitEvent`, `StreamEventMessage`, `AssistantMessageEvent`, `ResultEvent`, `UnknownEvent`
- `SystemInitEvent` contains the `session_id` needed for `--resume`
- Currently all state is ephemeral — lives in React `useState`/`useRef` within `useClaudeChat` hook
- The app uses Effect-TS throughout; the persistence layer should follow the same service/layer patterns
- `better-sqlite3` is the standard choice for Electron + SQLite

## Constraints

- **Tech stack**: Must use Effect-TS service/layer patterns consistent with existing architecture
- **Local only**: Database must be stored on the user's filesystem (Electron `app.getPath('userData')`)
- **No partial data**: Chunked stream messages must be fully assembled before writing; terminated sessions must not leave partial rows
- **Performance**: Writes should not block the UI or slow down CLI stream processing

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Event sourcing over snapshot storage | Enables full state reconstruction and future replay/debugging capabilities | — Pending |
| SQLite via better-sqlite3 | Synchronous API fits Electron main process; no native module compilation issues with Electron Forge | — Pending |
| Store only complete events | Saves space, avoids orphaned partial data, simplifies reconstruction logic | — Pending |

## Current State

Phase 04.5 complete (2026-03-28) — per-tab working directory threaded through to CLI process spawn via cwdAtom family, fixing multi-project directory mismatch. Next: Phase 05 (renderer integration).

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-28 after Phase 04.5 completion*
