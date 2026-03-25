# Feature Landscape

**Domain:** Local event sourcing persistence layer for Electron desktop chat app
**Researched:** 2026-03-25
**Overall confidence:** HIGH (well-established patterns; SQLite event sourcing and Electron persistence are mature domains)

## Table Stakes

Features users expect. Missing = the persistence layer is broken or feels incomplete.

### TS-1: Append-Only Event Storage

- **Why expected:** The entire premise of event sourcing. Every completed CLI event (SystemInitEvent, AssistantMessageEvent, ResultEvent, etc.) gets stored as an immutable row. Without this, there is no persistence.
- **Complexity:** Low
- **Notes:** Schema needs: `event_id` (autoincrement), `session_id` (aggregate stream), `sequence_number` (ordering within session), `event_type` (discriminant), `event_data` (JSON blob), `created_at` (timestamp). Append-only means no UPDATE or DELETE operations on event rows.

### TS-2: Session State Reconstruction from Events

- **Why expected:** Users close the app and reopen it. They expect to see their full conversation history restored exactly as they left it. This is the core value proposition of the project.
- **Complexity:** Medium
- **Notes:** Query events for a session ordered by sequence number, fold them into ChatMessage arrays. The `AssistantMessageEvent` contains the complete assembled message content. User prompts need to be stored as events too (they are not currently emitted by CLI -- will need a synthetic "user_message" event type).

### TS-3: Tab Metadata Persistence

- **Why expected:** Users have multiple tabs open, each pointing at different repos/directories. Reopening the app should restore the tab layout, not just a blank window with a single tab. Browser-like "continue where you left off" is the baseline expectation for any tabbed desktop app.
- **Complexity:** Low
- **Notes:** Store: tab ID, display label, repository path/cwd, git branch, Claude session ID, tab order/position, active tab indicator, created/updated timestamps. This is a separate table from events -- it's mutable metadata, not an event stream.

### TS-4: CLI Session Resume via --resume Flag

- **Why expected:** The Claude CLI supports `--resume <session_id>` to continue a conversation. The app already uses this flag. Persistence must store the `session_id` from `SystemInitEvent` so it survives app restart.
- **Complexity:** Low
- **Notes:** Session ID is captured from the first `SystemInitEvent` in a stream. Must be persisted before any other events in the session, since a crash between session start and first event storage would lose the resume capability.

### TS-5: Partial/Chunked Message Buffering (Write-Side Assembly)

- **Why expected:** The CLI emits `StreamEventMessage` events with deltas (text chunks, tool use JSON fragments). Storing every delta individually is wasteful and makes reconstruction complex. The project requirement explicitly states: "Buffer partial/chunked stream messages, only persist the complete assembled message."
- **Complexity:** Medium
- **Notes:** Accumulate `ContentBlockDeltaApiEvent` chunks in memory. On `AssistantMessageEvent` (which contains the complete message), persist that event. The stream events themselves are ephemeral UI state, not persisted. This means the event store contains: user messages, complete assistant messages, system init events, result events -- NOT individual deltas.

### TS-6: Transaction Safety and Crash Resilience

- **Why expected:** SQLite with WAL mode provides atomic transactions. If the app crashes mid-write, partially written transactions are automatically rolled back on next open. Users expect their data not to be corrupted. This is not a feature users notice -- they notice its absence.
- **Complexity:** Low
- **Notes:** Enable WAL mode (`PRAGMA journal_mode=WAL`). Wrap multi-row inserts in explicit transactions. SQLite handles crash recovery automatically -- partial transactions roll back on next database open. The `better-sqlite3` synchronous API makes transaction boundaries straightforward.

### TS-7: Terminated Session Cleanup (No Orphaned Partial Data)

- **Why expected:** If a user force-kills a streaming response (closes tab, quits app mid-stream), no partial/incomplete data should be written. The project requirement: "Discard all partial output if user terminates a session mid-response."
- **Complexity:** Medium
- **Notes:** Since we buffer in memory and only write on `AssistantMessageEvent`, a killed stream simply means the in-memory buffer is discarded. No database cleanup needed. However, the session itself (tab metadata, session ID) should remain valid for future `--resume` calls. The key insight: buffering on the write side naturally solves the terminated session problem.

### TS-8: Multi-Tab Independent Persistence

- **Why expected:** Each tab is an independent Claude session. Events from tab A must not interfere with tab B. Querying tab A's history should not return tab B's events.
- **Complexity:** Low
- **Notes:** The `session_id` on every event naturally partitions data. Tab metadata table links tab IDs to session IDs. Query pattern: `SELECT * FROM events WHERE session_id = ? ORDER BY sequence_number`.

## Differentiators

Features that set the product apart. Not expected by users, but add meaningful value.

### D-1: Snapshot/Materialized View for Fast Startup

- **Why valuable:** As conversations grow long (hundreds of events per session), replaying all events on startup gets slower. A snapshot stores the latest reconstructed state so the app can load the snapshot and only replay events after it.
- **Complexity:** Medium-High
- **Notes:** Store periodic snapshots in a `snapshots` table: `session_id`, `last_event_sequence`, `state_data` (serialized ChatMessage array). On load: read snapshot, then replay only events with `sequence_number > last_event_sequence`. Community consensus is to defer snapshots until measured performance demands it -- "optimize when it hurts, not before." For a desktop chat app with typical conversation lengths (tens to low hundreds of messages), full replay should be fast enough initially.
- **Recommendation:** Defer to a later phase. Design the event store so snapshots can be added without schema changes (just add the snapshots table later).

### D-2: Conversation Search Across Sessions

- **Why valuable:** Users with many tabs and sessions may want to find "that conversation where I discussed X." Full-text search over stored message content would be a meaningful UX improvement.
- **Complexity:** Medium
- **Notes:** SQLite has built-in FTS5 (full-text search) support. Create an FTS virtual table indexed on message content. Query with `MATCH` syntax. This is a read-side optimization -- the events are already stored, FTS just indexes them differently.
- **Recommendation:** Defer. Not needed for core persistence milestone. The event store schema does not need to change to support this later.

### D-3: Cost and Token Usage Tracking

- **Why valuable:** `ResultEvent` includes `total_cost_usd` and `Usage` (input/output tokens). Persisting these allows showing cumulative cost per session, per day, across all sessions. Users of AI tools care about spend visibility.
- **Complexity:** Low
- **Notes:** The data is already present in the events being stored. The feature is really a read-side projection: aggregate `total_cost_usd` and usage from ResultEvents. Could be a simple query or a maintained projection table.
- **Recommendation:** Store the data as part of normal event persistence (it comes free). Build the UI/projection later.

### D-4: Event Replay for Debugging

- **Why valuable:** The entire event history is stored. A "replay" mode that steps through events chronologically would be a powerful debugging tool for both the app developer and potentially the end user.
- **Complexity:** Medium
- **Notes:** This is a natural capability of event sourcing. The events are there -- the feature is building a UI to step through them. The existing debug panel (eventsRef in useClaudeChat) already shows events; this extends it to persisted history.
- **Recommendation:** Defer. This falls out naturally from having a well-structured event store.

### D-5: Graceful Shutdown State Capture

- **Why valuable:** Use Electron's `before-quit` event to ensure any in-progress state (buffered but not yet persisted events) is either committed or explicitly discarded. Prevents edge cases where the app quits between event completion and database write.
- **Complexity:** Low-Medium
- **Notes:** Listen to `app.on('before-quit')`, flush any pending writes, close database connection cleanly. On Windows, `before-quit` may not fire during system shutdown -- use `powerMonitor` as a fallback. With `better-sqlite3`'s synchronous API, flushing is straightforward (no async race conditions).
- **Recommendation:** Include in initial implementation. Low effort, high safety value.

### D-6: Database Integrity Checks on Startup

- **Why valuable:** Run `PRAGMA integrity_check` or `PRAGMA quick_check` on app startup to detect any corruption from unexpected crashes or disk issues. Provides a safety net and early warning.
- **Complexity:** Low
- **Notes:** `PRAGMA quick_check` is faster than full `integrity_check` and sufficient for most cases. If corruption is detected, the app can warn the user rather than silently serving bad data.
- **Recommendation:** Include in initial implementation. Trivial to implement, significant safety value.

## Anti-Features

Features to explicitly NOT build.

### AF-1: Cloud Sync / Remote Storage

- **Why avoid:** Explicitly out of scope. This is a single-user, local-only desktop app. Cloud sync introduces authentication, conflict resolution, network error handling, and privacy concerns -- all massive complexity with no value for the stated use case.
- **What to do instead:** Store everything in `app.getPath('userData')`. The user's local filesystem is the only storage backend.

### AF-2: Schema Migration Framework

- **Why avoid:** Explicitly deferred in PROJECT.md. The schema is new and may change as the app evolves. Building a migration framework before the schema stabilizes is premature. SQLite's `PRAGMA user_version` can handle simple version tracking when the time comes.
- **What to do instead:** Use `CREATE TABLE IF NOT EXISTS` for initial schema creation. Track schema version with `PRAGMA user_version`. Defer a proper migration system until the schema is proven stable.

### AF-3: Storing Raw Stream Deltas

- **Why avoid:** Explicitly excluded in requirements. Each streaming response generates dozens to hundreds of delta events. Storing them individually would bloat the database 10-50x for no reconstruction benefit (the `AssistantMessageEvent` already contains the complete assembled content).
- **What to do instead:** Buffer deltas in memory for live UI updates. Only persist the final `AssistantMessageEvent` that contains the complete assembled content.

### AF-4: Full CQRS with Separate Read/Write Databases

- **Why avoid:** CQRS with separate read and write stores is designed for distributed systems with high write throughput and eventual consistency requirements. A single-user desktop app has neither. The added complexity of maintaining separate databases and synchronizing them provides no benefit here.
- **What to do instead:** Single SQLite database with both event tables and any denormalized read tables (e.g., tab metadata). Query the event store directly for state reconstruction. Add simple read-optimized views/tables only if query performance becomes a measured problem.

### AF-5: Real-Time Change Notifications / Reactive Queries

- **Why avoid:** Frameworks like RxDB or LiveStore provide reactive queries where the UI auto-updates when the database changes. This is overkill when the app already has a live stream pipeline (Effect Stream -> React state). The database is for persistence across restarts, not for live state management.
- **What to do instead:** Continue using Effect streams and React state for live UI. Read from the database only on app startup (state reconstruction) and write to it as events complete.

### AF-6: ORM Layer

- **Why avoid:** ORMs (TypeORM, Prisma, Sequelize) add abstraction over SQL that obscures what's happening, increases bundle size, and conflicts with the Effect-TS service pattern. The data model is simple (2-3 tables with straightforward queries). Raw SQL via `better-sqlite3` is more transparent and fits the synchronous main-process architecture.
- **What to do instead:** Write SQL directly using `better-sqlite3` prepared statements. Wrap in Effect-TS service/layer patterns for the same type-safety and composability an ORM would provide.

### AF-7: Event Versioning / Upcasting

- **Why avoid:** Event versioning handles evolving event schemas over time (e.g., v1 of AssistantMessageEvent has different fields than v2). This is important for long-lived distributed systems but premature for a new app where the event types come from the Claude CLI (which defines its own schema). If the CLI changes event shapes, a simple database wipe and re-accumulate is acceptable at this stage.
- **What to do instead:** Store events with their type discriminant. If event shapes change, handle it at read time with schema decoding that tolerates missing/extra fields (which Effect Schema already supports via optional fields and `Schema.Union` fallback ordering).

## Feature Dependencies

```
TS-1 (Event Storage) is the foundation for everything else
  |
  +-> TS-2 (State Reconstruction) -- requires stored events to replay
  |     |
  |     +-> D-1 (Snapshots) -- optimizes reconstruction, requires it to exist first
  |     +-> D-2 (Search) -- searches over stored events/messages
  |
  +-> TS-5 (Buffering) -- determines WHAT gets written to the event store
  |     |
  |     +-> TS-7 (Terminated Session Cleanup) -- buffering naturally solves this
  |
  +-> TS-8 (Multi-Tab Partitioning) -- session_id partitioning in the event store
  |
  +-> D-3 (Cost Tracking) -- reads from stored ResultEvents

TS-3 (Tab Metadata) is independent of the event store
  |
  +-> TS-4 (Session Resume) -- tab metadata stores the session_id needed for --resume

TS-6 (Transaction Safety) is a cross-cutting concern applied to all writes

D-5 (Graceful Shutdown) depends on the write pipeline existing
D-6 (Integrity Checks) is independent, runs on startup before anything else
```

## MVP Recommendation

**Prioritize (initial milestone):**

1. **TS-1: Append-Only Event Storage** -- foundation, nothing works without it
2. **TS-6: Transaction Safety** -- configure WAL mode and use transactions from day one
3. **TS-5: Partial Message Buffering** -- determines the write pipeline design
4. **TS-7: Terminated Session Cleanup** -- falls out naturally from buffering design
5. **TS-4: CLI Session Resume** -- low complexity, high value (resume conversations)
6. **TS-3: Tab Metadata Persistence** -- store tab layout for restore
7. **TS-2: State Reconstruction** -- the payoff: reload the app and see your conversations
8. **TS-8: Multi-Tab Independent Persistence** -- required for multi-tab UX
9. **D-5: Graceful Shutdown** -- low effort, high safety, include from the start
10. **D-6: Integrity Checks** -- trivial to implement, include from the start

**Defer (subsequent milestones):**

- **D-1: Snapshots** -- premature optimization; add when conversation length causes measurable startup lag
- **D-2: Conversation Search** -- pure read-side feature, no schema impact, add when users have enough sessions to need it
- **D-3: Cost Tracking UI** -- the data is stored for free with events; build the projection/UI later
- **D-4: Event Replay** -- debugging feature, low priority for end users

## Sources

- [Martin Fowler - Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html)
- [SoftwareMill - Implementing Event Sourcing with Relational Database](https://softwaremill.com/implementing-event-sourcing-using-a-relational-database/)
- [SQLite Forum - Event Sourcing with SQLite: Append-Only Design](https://www.sqliteforum.com/p/event-sourcing-with-sqlite)
- [SQLite Forum - Building Event Sourcing Systems with SQLite: CQRS Guide](https://www.sqliteforum.com/p/building-event-sourcing-systems-with)
- [SQLite - Write-Ahead Logging](https://sqlite.org/wal.html)
- [SQLite - How To Corrupt An SQLite Database File](https://sqlite.org/howtocorrupt.html)
- [Kurrent - Snapshots in Event Sourcing](https://www.kurrent.io/blog/snapshots-in-event-sourcing)
- [Domain Centric - Event Sourcing: Snapshotting](https://domaincentric.net/blog/event-sourcing-snapshotting)
- [Electron - app API (before-quit)](https://www.electronjs.org/docs/latest/api/app)
- [Station - What We Learned from Data Persistence in Our Growing Electron App](https://medium.com/getstation/what-we-learned-from-data-persistence-in-our-growing-electron-app-72c9ad19fce)
- [Microservices.io - Event Sourcing Pattern](https://microservices.io/patterns/data/event-sourcing.html)
- [Event-Driven.io - Guide to Projections and Read Models](https://event-driven.io/en/projections_and_read_models_in_event_driven_architecture/)
