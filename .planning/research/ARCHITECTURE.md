# Architecture Patterns

**Domain:** Event sourcing persistence layer for Electron chat app
**Researched:** 2026-03-25

## Recommended Architecture

The persistence layer sits entirely in the **main process** as a new set of Effect-TS services that intercept the existing event stream between `ClaudeCliLive` and the RPC transport. SQLite (via `better-sqlite3`) runs synchronously in the main process -- no worker threads needed.

The key insight: the app already has a clean streaming pipeline (`ClaudeCliLive` -> `RpcServer` -> renderer). The persistence layer wraps this pipeline with a **tap-and-buffer** pattern -- it observes the event stream, buffers partial messages, and writes complete events to SQLite, without altering what the renderer receives.

```
Renderer (React)
    |
    | @effect/rpc over IPC
    v
Main Process
    |
    v
ClaudeRpcHandlers (existing)
    |
    v
EventPersistence (NEW -- wraps ClaudeCli, taps the stream)
    |
    v
ClaudeCliLive (existing -- spawns CLI)
    |
    v
SqliteEventStore (NEW -- writes to SQLite)
    |
    v
SqliteClient (from @effect/sql-sqlite-node)
    |
    v
better-sqlite3 -> ~/.mao/mao.db
```

### Component Boundaries

**SqliteClient Layer** (`@effect/sql-sqlite-node`)
- Responsibility: Database connection lifecycle, prepared statement caching, WAL mode
- Communicates with: `better-sqlite3` native module
- Configuration: `app.getPath('userData')/mao.db`, WAL enabled (default)
- Effect service: `SqliteClient` from `@effect/sql-sqlite-node`

**EventStore Service** (NEW: `src/services/persistence/event-store.ts`)
- Responsibility: Append events to the `events` table, query events for session reconstruction
- Communicates with: `SqliteClient` for writes/reads
- Effect service: Custom `Context.Tag("EventStore")`
- Operations: `appendEvent`, `getSessionEvents`, `deleteSessionEvents`
- Does NOT handle buffering -- receives only complete, finalized events

**TabStore Service** (NEW: `src/services/persistence/tab-store.ts`)
- Responsibility: CRUD for tab metadata (repo path, branch, session ID, tab order)
- Communicates with: `SqliteClient` for writes/reads
- Effect service: Custom `Context.Tag("TabStore")`
- Operations: `upsertTab`, `getTabs`, `deleteTab`, `updateTabOrder`

**StreamBuffer** (NEW: `src/services/persistence/stream-buffer.ts`)
- Responsibility: Accumulates `StreamEventMessage` text deltas per session; emits the assembled `AssistantMessageEvent` for persistence; discards buffer on termination
- Communicates with: `EventStore` (writes finalized events)
- Effect service: Custom `Context.Tag("StreamBuffer")`
- Key behavior: Holds in-memory state per active session; only flushes to `EventStore` when `AssistantMessageEvent` or `ResultEvent` arrives
- Discard behavior: When a session is terminated mid-stream, the buffer is cleared without writing

**PersistentClaudeCli** (NEW: `src/services/persistence/persistent-cli.ts`)
- Responsibility: Wraps `ClaudeCli` to intercept the event stream and route events through `StreamBuffer`/`EventStore`
- Communicates with: `ClaudeCli` (upstream), `StreamBuffer` (buffering), `EventStore` (direct writes for non-streamed events), `TabStore` (session ID capture)
- Effect service: Provides `ClaudeCli` (same tag, different implementation)
- Pattern: Decorates the existing `ClaudeCli` stream with `Stream.tap` to observe events without modifying what the renderer receives

**SessionReconstructor** (NEW: `src/services/persistence/session-reconstructor.ts`)
- Responsibility: On app startup, reads all stored events and tab metadata to rebuild UI state
- Communicates with: `EventStore`, `TabStore`
- Exposed via RPC: New RPC endpoint for the renderer to call on mount
- Returns: Array of tab states with their reconstructed message history

**SchemaInit** (NEW: `src/services/persistence/schema-init.ts`)
- Responsibility: Creates tables on first run, runs pragmas (WAL, foreign keys)
- Communicates with: `SqliteClient`
- Pattern: Effect `Layer.effectDiscard` that runs DDL at layer construction time
- No migration framework yet (out of scope per PROJECT.md)

### Data Flow

**Write path (during active chat):**

1. User sends message via `useClaudeChat` -> RPC -> `PersistentClaudeCli`
2. `PersistentClaudeCli` delegates to underlying `ClaudeCli.query()`/`.resume()` to get the event `Stream`
3. The stream is wrapped with `Stream.tap` to observe each event:
   - `SystemInitEvent`: Persisted immediately to `EventStore`; session ID captured and written to `TabStore`
   - `StreamEventMessage` with `TextDelta`: Fed to `StreamBuffer` (in-memory accumulation only, no DB write)
   - `StreamEventMessage` (other subtypes): Fed to `StreamBuffer` for tracking
   - `AssistantMessageEvent`: `StreamBuffer` flushes -- the `AssistantMessageEvent` (which contains the complete message) is written to `EventStore`; buffer cleared
   - `ResultEvent`: Persisted immediately to `EventStore`; `StreamBuffer` finalized
   - `UnknownEvent`: Ignored (not persisted)
4. The original stream continues to the renderer unchanged -- persistence is side-effectful observation

**Discard path (user terminates mid-stream):**

1. User clicks "Stop" or closes tab while streaming
2. The stream fiber is interrupted (Effect fiber interruption)
3. `StreamBuffer` uses `Effect.addFinalizer` to detect interruption
4. On interruption: buffer is cleared, no partial data written to `EventStore`
5. `SystemInitEvent` was already persisted (that is fine -- it captures the session ID), but no incomplete assistant message is stored

**Read path (app startup / session reconstruction):**

1. App opens; renderer mounts and calls `reconstructSessions()` RPC
2. `SessionReconstructor` queries `TabStore` for all tabs
3. For each tab, queries `EventStore` for events ordered by `sequence_number`
4. Replays events to build `ChatMessage[]` arrays (same logic as `useClaudeChat` event processing)
5. Returns reconstructed state to renderer
6. Renderer populates tab UI with restored conversations
7. Subsequent messages use `cli.resume()` with the stored `session_id`

**Tab metadata flow:**

1. When user creates a new tab: `TabStore.upsertTab()` with repo path, branch, initial position
2. When `SystemInitEvent` arrives: `TabStore` updated with `session_id`
3. When user reorders tabs: `TabStore.updateTabOrder()`
4. When user closes a tab: `TabStore.deleteTab()` and `EventStore.deleteSessionEvents()`

## Patterns to Follow

### Pattern 1: Service Decoration via Same Tag

**What:** `PersistentClaudeCli` provides the `ClaudeCli` tag but wraps the real implementation. This is the same pattern as `ClaudeCliFromRpc` -- both provide `ClaudeCli` but with different backing implementations.

**When:** When you want to add cross-cutting behavior (persistence) without changing the consumer (`ClaudeRpcHandlers`).

**Why this fits:** `ClaudeRpcHandlers` already depends on `ClaudeCli`. By providing a `PersistentClaudeCli` layer that requires `ClaudeCli` (the real one) and provides `ClaudeCli` (the decorated one), the handler code stays untouched.

**Layer composition:**

```typescript
// Before (current):
const BaseLayer = Layer.provideMerge(
  ClaudeRpcHandlers,
  Layer.provideMerge(ClaudeCliLive, NodeContext.layer),
);

// After (with persistence):
const PersistenceLayer = Layer.provideMerge(
  PersistentClaudeCli,       // provides ClaudeCli (decorated)
  Layer.provideMerge(
    StreamBufferLive,
    Layer.provideMerge(
      EventStoreLive,
      Layer.provideMerge(TabStoreLive, SqliteLayer),
    ),
  ),
);

const BaseLayer = Layer.provideMerge(
  ClaudeRpcHandlers,          // consumes ClaudeCli (unaware of decoration)
  Layer.provideMerge(
    PersistenceLayer,          // provides decorated ClaudeCli
    Layer.provideMerge(ClaudeCliLive, NodeContext.layer),
  ),
);
```

### Pattern 2: @effect/sql Tagged Template Queries

**What:** Use `@effect/sql`'s tagged template literals for all database operations instead of raw `better-sqlite3` calls. This integrates with Effect's tracing, error handling, and resource management.

**When:** All database operations in `EventStore` and `TabStore`.

**Example:**

```typescript
// Inside EventStore service
const appendEvent = (event: PersistedEvent) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      INSERT INTO events (session_id, event_type, payload, sequence_number)
      VALUES (${event.sessionId}, ${event.eventType}, ${event.payload}, ${event.sequenceNumber})
    `;
  });

const getSessionEvents = (sessionId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    return yield* sql<PersistedEventRow>`
      SELECT * FROM events
      WHERE session_id = ${sessionId}
      ORDER BY sequence_number ASC
    `;
  });
```

**Confidence:** MEDIUM -- @effect/sql-sqlite-node exists and uses better-sqlite3, but concrete examples in Electron contexts are scarce. The API reference confirms the `layer()` constructor and tagged template usage.

### Pattern 3: Stream.tap for Side-Effect Observation

**What:** Use `Stream.tap` to observe events without modifying the stream. The persistence logic runs as a side effect; the original event is passed through unchanged.

**When:** In `PersistentClaudeCli` when wrapping the `ClaudeCli` event stream.

**Why:** The renderer must receive the exact same stream as before. Persistence is an observer, not a transformer.

```typescript
const wrapStream = (stream: Stream.Stream<ClaudeEvent, ClaudeCliError>) =>
  stream.pipe(
    Stream.tap((event) =>
      Effect.gen(function* () {
        const buffer = yield* StreamBuffer;
        yield* buffer.handleEvent(event);
      })
    ),
  );
```

### Pattern 4: Effect.addFinalizer for Discard-on-Termination

**What:** Attach a finalizer to the stream scope so that when the fiber is interrupted (user stops generation), the `StreamBuffer` is cleared without writing partial data.

**When:** In the `StreamBuffer` service construction or in `PersistentClaudeCli`'s stream wrapper.

**Why:** This is how Effect handles cleanup -- finalizers run on both normal completion and interruption, with the `Exit` value distinguishing the two cases.

```typescript
// Inside the stream wrapper scope
yield* Effect.addFinalizer((exit) =>
  Exit.isInterrupted(exit)
    ? buffer.discard(sessionId)  // user terminated -- throw away partial data
    : Effect.void               // normal completion -- buffer already flushed
);
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Database Access from Renderer

**What:** Importing `better-sqlite3` or `@effect/sql-sqlite-node` in renderer code.

**Why bad:** `better-sqlite3` is a native Node.js module. It cannot load in Electron's renderer process (which runs in a Chromium context). Even if `nodeIntegration` were enabled, native modules do not work in renderer web workers. The app has `OnlyLoadAppFromAsar: true` fuse enabled, further restricting this.

**Instead:** All database access stays in the main process. The renderer accesses persisted state through RPC endpoints.

### Anti-Pattern 2: Writing Every StreamEventMessage to Disk

**What:** Persisting each `content_block_delta` text chunk as it arrives.

**Why bad:** A single assistant response can produce hundreds of delta events. Writing each one creates massive I/O pressure, bloats the database, and makes reconstruction expensive. Worse, if the user terminates mid-stream, you must delete all those partial rows.

**Instead:** Buffer text deltas in memory. Only write the `AssistantMessageEvent` (which contains the complete, assembled message). This is one write per complete assistant turn instead of hundreds.

### Anti-Pattern 3: Storing Raw JSON Blobs Without Type Information

**What:** Storing `JSON.stringify(event)` without a discriminating `event_type` column.

**Why bad:** Reconstruction requires parsing every blob and switching on its type. Queries like "get all assistant messages for session X" become full-table scans with JSON parsing.

**Instead:** Store `event_type` as a separate indexed column. Store the payload as JSON, but use the type column for efficient filtering.

### Anti-Pattern 4: Global Mutable State for Stream Buffering

**What:** Using a module-level `Map<string, string>` to accumulate text deltas.

**Why bad:** Invisible to the Effect runtime, not scoped to any fiber lifecycle, no cleanup guarantees, untestable.

**Instead:** Use an Effect `Ref` or `SynchronizedRef` inside the `StreamBuffer` service. The service is scoped to the runtime lifecycle and integrates with finalizers.

### Anti-Pattern 5: Worker Threads for SQLite in This App

**What:** Spawning a worker thread to host `better-sqlite3` and communicating via `postMessage`.

**Why bad:** Adds complexity (serialization, error forwarding, lifecycle management) without meaningful benefit. The database operations for this app are simple appends and sequential reads -- they complete in microseconds. `better-sqlite3`'s synchronous API is an advantage here, not a liability. Worker threads are warranted for complex analytical queries over large datasets; not for append-only event stores with small payloads.

**Instead:** Run `better-sqlite3` directly in the main process via `@effect/sql-sqlite-node`.

## Schema Design

### events table

```sql
CREATE TABLE IF NOT EXISTS events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    TEXT    NOT NULL,
  event_type    TEXT    NOT NULL,  -- 'system_init' | 'assistant' | 'result' | 'user'
  payload       TEXT    NOT NULL,  -- JSON-encoded event data
  sequence_num  INTEGER NOT NULL,  -- monotonic per session, for ordering
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),

  UNIQUE(session_id, sequence_num)
);

CREATE INDEX IF NOT EXISTS idx_events_session
  ON events(session_id, sequence_num);
```

**What gets stored (event_type mapping):**

- `'system_init'`: The `SystemInitEvent` -- captures session_id, uuid
- `'user'`: Synthetic event storing the user's prompt text (not from CLI stream; injected by `PersistentClaudeCli` before calling `cli.query()`/`.resume()`)
- `'assistant'`: The `AssistantMessageEvent` -- complete assistant message with content blocks
- `'result'`: The `ResultEvent` -- completion marker with cost/usage data

**What does NOT get stored:**

- `StreamEventMessage` (text deltas) -- buffered in memory only
- `SystemRetryEvent` -- transient retry info, not needed for reconstruction
- `UnknownEvent` -- unrecognized events serve no reconstruction purpose

### tabs table

```sql
CREATE TABLE IF NOT EXISTS tabs (
  id            TEXT    PRIMARY KEY,  -- UUID, generated client-side
  session_id    TEXT,                 -- NULL until first SystemInitEvent
  title         TEXT,                 -- user-assigned or auto-generated
  cwd           TEXT    NOT NULL,     -- repository / working directory path
  git_branch    TEXT,                 -- current branch name
  tab_order     INTEGER NOT NULL,     -- position in tab bar
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tabs_order
  ON tabs(tab_order);
```

**Relationship:** `tabs.session_id` references `events.session_id` logically (not as a foreign key constraint, since a tab may exist before any events are created).

### Sequence number strategy

Each session maintains a monotonically increasing `sequence_num`:

1. User prompt event: `sequence_num = (max for session) + 1`
2. SystemInitEvent: `sequence_num = (max for session) + 1`
3. AssistantMessageEvent: `sequence_num = (max for session) + 1`
4. ResultEvent: `sequence_num = (max for session) + 1`

This counter is managed in-memory by `PersistentClaudeCli` (a simple `Ref<number>` per session) and only written to the DB with the event. On reconstruction, the max sequence_num is read to resume counting.

## Scalability Considerations

**At 1-5 tabs (typical):**
- Synchronous writes in main process are imperceptible (sub-millisecond for single INSERTs)
- In-memory buffering per session uses negligible RAM (a few KB of accumulated text per active stream)
- Reconstruction reads a handful of events per tab -- instant

**At 50+ tabs (stress test):**
- WAL mode prevents readers from blocking writers
- Each tab produces ~4 events per conversation turn (user, system_init, assistant, result)
- At 100 turns per tab * 50 tabs = 20,000 events -- SQLite handles this trivially
- Reconstruction queries are indexed on `session_id` -- still sub-second

**At 10,000+ events (long-lived sessions):**
- Consider snapshot tables: store the reconstructed state periodically and only replay events after the snapshot
- Not needed initially -- defer until actual performance data shows a need
- The indexed query `WHERE session_id = ? ORDER BY sequence_num` remains fast at this scale

## Build Order (Dependency Graph)

The components have clear dependencies that dictate build order:

```
Phase 1: Foundation
  SqliteClient Layer + SchemaInit
  (no dependencies on other new code)

Phase 2: Storage Services
  EventStore (depends on: SqliteClient)
  TabStore   (depends on: SqliteClient)

Phase 3: Buffering Logic
  StreamBuffer (depends on: EventStore)

Phase 4: Integration
  PersistentClaudeCli (depends on: ClaudeCli, StreamBuffer, EventStore, TabStore)
  Layer composition in main.ts

Phase 5: Reconstruction
  SessionReconstructor (depends on: EventStore, TabStore)
  New RPC endpoint for renderer

Phase 6: Renderer Integration
  Update useClaudeChat to use reconstructed state on mount
  Tab UI reads from persisted tab metadata
```

**Why this order:**
- Phase 1 is pure infrastructure with no business logic -- testable in isolation
- Phase 2 builds the storage APIs that everything else depends on
- Phase 3 is the most nuanced component (buffering/discard logic) -- benefits from having storage APIs stable
- Phase 4 is the integration point where existing code meets new code -- high risk, depends on everything below
- Phase 5 is read-path only, can be built after write-path is working
- Phase 6 is renderer-side changes that depend on everything else being available via RPC

## Electron Forge / Vite Configuration Impact

Adding `better-sqlite3` (via `@effect/sql-sqlite-node`) requires changes to the build configuration:

**forge.config.ts:**
- Add `rebuildConfig: { onlyModules: ['better-sqlite3'] }` to ensure electron-rebuild compiles it against Electron's Node headers
- Add `packagerConfig.asar.unpack` pattern to keep the native `.node` binary outside the ASAR archive

**vite.main.config.mts:**
- Add `better-sqlite3` and `@effect/sql-sqlite-node` to `build.rollupOptions.external` so Vite does not attempt to bundle the native module
- The renderer config needs no changes (database code stays in main process only)

**Confidence:** MEDIUM -- The general approach is well-documented across multiple sources, but the exact Vite + Electron Forge + `@effect/sql-sqlite-node` combination has limited precedent. Build configuration will need validation during Phase 1.

## Sources

- [better-sqlite3 threads documentation](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/threads.md) -- HIGH confidence
- [Electron issue #43513: native modules in worker threads](https://github.com/electron/electron/issues/43513) -- HIGH confidence (resolved, confirms main process is correct approach)
- [Electron Forge Vite plugin docs](https://www.electronforge.io/config/plugins/vite) -- HIGH confidence
- [better-sqlite3 synchronous API rationale](https://github.com/JoshuaWise/better-sqlite3/issues/32) -- HIGH confidence
- [@effect/sql-sqlite-node API reference](https://effect-ts.github.io/effect/sql-sqlite-node/SqliteClient.ts.html) -- HIGH confidence
- [@effect/sql README and query patterns](https://github.com/Effect-TS/effect/blob/main/packages/sql/README.md) -- HIGH confidence
- [Event sourcing with SQLite schema patterns](https://softwaremill.com/implementing-event-sourcing-using-a-relational-database/) -- MEDIUM confidence
- [SQL event store with ordering](https://github.com/mattbishop/sql-event-store) -- MEDIUM confidence
- [Integrating SQLite with Electron Forge](https://blog.loarsaw.de/using-sqlite-with-electron-electron-forge) -- MEDIUM confidence
- [Effect SQL deepwiki: adapters and query building](https://deepwiki.com/Effect-TS/effect/6.1-sql-core-and-database-adapters) -- MEDIUM confidence

---

*Architecture research: 2026-03-25*
