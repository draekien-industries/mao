# Project Research Summary

**Project:** Mao — Data Persistence (SQLite Event Sourcing)
**Domain:** Local event sourcing persistence layer for Electron desktop chat app
**Researched:** 2026-03-25
**Confidence:** HIGH

## Executive Summary

This project adds a local SQLite-backed event store to the Mao Electron app, enabling conversation history to persist across restarts and tabs to resume their Claude CLI sessions. The domain is well-understood: SQLite event sourcing is a mature pattern, and all four research areas converged on the same core recommendation. The recommended approach is `@effect/sql-sqlite-node` (wrapping `better-sqlite3`) in the Electron main process, using Effect's service layer pattern to intercept the existing event stream via `Stream.tap` without modifying what the renderer receives. This fits the existing architecture cleanly — the app already uses Effect services and RPC, and the persistence layer slots in as a decorator on the `ClaudeCli` service.

The key architectural insight is that the write pipeline should buffer stream deltas in memory and only flush complete events to SQLite at turn boundaries (`AssistantMessageEvent`, `ResultEvent`). This simultaneously solves three problems: it avoids writing thousands of partial delta rows, it naturally discards partial output when a user terminates mid-stream (the buffer is simply cleared), and it keeps individual transactions small enough to avoid blocking the main process event loop. State reconstruction on startup is a straightforward read-side fold over stored events, ordered by per-session sequence numbers.

The most serious risks are in the infrastructure setup phase, not the business logic. `better-sqlite3` is a native C++ module that requires correct Electron Forge configuration (ASAR unpacking, Vite externals, electron-rebuild targeting) before any SQLite code can be tested in a production-like build. Getting this wrong produces builds that crash on launch — a failure that is invisible in development and only surfaces during packaging. These configurations must be validated in Phase 1 before building on top of them.

## Key Findings

### Recommended Stack

The official Effect ecosystem provides a purpose-built SQLite integration: `@effect/sql-sqlite-node` (~0.49.1) wraps `better-sqlite3` (~12.8.0) and exposes it via Effect's tagged template SQL and `Layer` dependency injection pattern. This eliminates any impedance mismatch between the Effect service layer and the database. All `@effect/*` packages are released from the same monorepo and must be updated together if version conflicts arise.

**Core technologies:**
- `better-sqlite3` ~12.8.0: synchronous SQLite driver — fastest Node.js SQLite binding; synchronous API is an advantage in the main process where there is no event loop concurrency to benefit from async
- `@effect/sql-sqlite-node` ~0.49.1: Effect-native SQLite layer — provides `SqliteClient.layer` and tagged template queries that return Effect values, integrating natively with the existing service architecture
- `@effect/sql` ~0.49.0: SQL abstraction and migration primitives — `SqliteMigrator.layer` handles schema migrations programmatically at startup
- `@electron/rebuild`: native module recompilation — required to target Electron's internal Node.js ABI rather than the system Node.js
- `@electron-forge/plugin-auto-unpack-natives`: ASAR extraction — already in devDependencies but not configured; must be added to `forge.config.ts`

**Explicitly not recommended:** Drizzle ORM (unnecessary abstraction, known pain points with drizzle-kit + electron-rebuild), Prisma (heavy binary, overkill for 2-3 tables), sql.js (loads entire DB into memory, browser-only value proposition), and CQRS with separate read/write databases (distributed systems pattern, no benefit in a single-user desktop app).

### Expected Features

The feature research established a clear MVP boundary. All eight table stakes features are interdependent and must ship together — there is no useful subset. The two safety features (D-5 graceful shutdown, D-6 integrity checks) are low effort and should be included in the initial implementation.

**Must have (table stakes):**
- Append-only event storage (TS-1) — foundation; nothing else works without it
- Partial message buffering (TS-5) — determines the write pipeline design; buffer deltas, flush on `AssistantMessageEvent`
- Terminated session cleanup (TS-7) — falls out naturally from the buffering design at no extra cost
- CLI session resume via `--resume` flag (TS-4) — store `session_id` from `SystemInitEvent` immediately; high value, low complexity
- Tab metadata persistence (TS-3) — store tab layout (cwd, branch, session_id, order) for restore
- State reconstruction from events (TS-2) — the payoff: fold stored events back into `ChatMessage[]` on startup
- Multi-tab independent persistence (TS-8) — natural consequence of partitioning by `session_id`
- Transaction safety and WAL mode (TS-6) — cross-cutting concern applied to all writes from day one
- Graceful shutdown state capture (D-5) — listen to `before-quit`, flush pending writes, close DB connection cleanly
- Database integrity checks on startup (D-6) — `PRAGMA quick_check` before serving any data; trivial to implement

**Should have (competitive):**
- Cost and token usage tracking (D-3) — data comes free with `ResultEvent` storage; build the projection UI later
- Snapshot/materialized view for fast startup (D-1) — defer until conversation length causes measurable startup lag; design schema to support it

**Defer (v2+):**
- Conversation search across sessions (D-2) — SQLite FTS5; no schema impact to add later
- Event replay for debugging (D-4) — falls out naturally from event store; low end-user priority

**Anti-features (explicitly excluded):** cloud sync, ORM layer, storing raw stream deltas, full CQRS with separate databases, reactive queries (the live stream pipeline already handles this), event versioning/upcasting (handle at read time via Effect Schema optional fields).

### Architecture Approach

The persistence layer sits entirely in the main process as a set of Effect services that intercept the existing `ClaudeCliLive -> RpcServer -> renderer` pipeline. The key pattern is service decoration: `PersistentClaudeCli` provides the same `ClaudeCli` tag as the existing implementation, wrapping it with `Stream.tap` to observe events as a side effect. `ClaudeRpcHandlers` is unaware of the decoration and requires no changes.

**Major components:**
1. `SqliteClient` + `SchemaInit` — database connection with WAL mode, creates tables on first run via `CREATE TABLE IF NOT EXISTS`
2. `EventStore` — append events, query events by session; receives only complete finalized events (no deltas)
3. `TabStore` — CRUD for tab metadata; logically linked to `EventStore` via `session_id` but physically independent
4. `StreamBuffer` — accumulates `ContentBlockDeltaApiEvent` text chunks in memory per session; flushes to `EventStore` on `AssistantMessageEvent`; uses `Effect.addFinalizer` to discard buffer on fiber interruption (user abort)
5. `PersistentClaudeCli` — wraps `ClaudeCli` with `Stream.tap`; routes events to `StreamBuffer`/`EventStore`/`TabStore`; injects synthetic user message events before forwarding to CLI
6. `SessionReconstructor` — read-path only; queries `TabStore` and `EventStore` on startup; exposed via new RPC endpoint; returns reconstructed `ChatMessage[]` per tab

**Schema:** Two tables. `events(id, session_id, event_type, payload TEXT/JSON, sequence_num, created_at)` with composite unique constraint on `(session_id, sequence_num)` and an index on `(session_id, sequence_num)`. `tabs(id UUID, session_id, title, cwd, git_branch, tab_order, created_at, updated_at)`. A `snapshots` table should be included in the schema from day one even though snapshotting is deferred — adding it later requires no migration.

**Build order dictated by dependency graph:** SQLite infrastructure -> storage services -> stream buffer -> persistent CLI decorator -> session reconstructor -> renderer integration.

### Critical Pitfalls

1. **Native module trapped in ASAR** — `better-sqlite3`'s `.node` binary cannot load from inside an ASAR archive; app crashes in production but works in development. Prevention: configure `AutoUnpackNativesPlugin` in `forge.config.ts` (already in devDependencies but not wired up), add `asar.unpack: "*.node"` as a safety net, mark `better-sqlite3` external in `vite.main.config.mts`. Validate with `npm run package` before building on top of the infrastructure.

2. **Synchronous SQLite blocking the main process event loop** — even a 50ms query freezes IPC dispatch, causing the renderer to perceive 2-10x latency. Prevention: buffer events in memory, flush in transactions at turn boundaries (one write per complete assistant turn, not one per delta), use prepared statements via `@effect/sql` tagged templates.

3. **Partial stream data persisted on user abort** — writing events eagerly on each `StreamEventMessage` leaves orphaned partial rows when the user terminates mid-stream. Prevention: buffer deltas in memory, only write `AssistantMessageEvent` (which contains the complete assembled content); use `Effect.addFinalizer` with `Exit.isInterrupted` to clear the buffer on interruption.

4. **Database connection not closed on app exit** — WAL files left uncheckpointed on force-quit cause apparent data loss on next startup. Prevention: register the SQLite connection in an Effect `Layer` with `acquireRelease` semantics so `runtime.dispose()` (called in the existing `before-quit` handler) closes the database.

5. **Vite bundling the native module** — Vite's default bundling behavior breaks native modules. Prevention: `build.rollupOptions.external: ["better-sqlite3"]` in `vite.main.config.mts`; only in the main config, never in renderer or preload configs.

## Implications for Roadmap

Based on the architecture's dependency graph and the pitfall phase warnings, a six-phase structure maps cleanly onto the build order discovered in research.

### Phase 1: Infrastructure Setup
**Rationale:** All subsequent phases depend on a working SQLite connection in a production-ready Electron build. The pitfall research identified four distinct infrastructure failures (ASAR, Vite bundling, electron-rebuild, platform paths) that are invisible in development and fatal in production. These must be resolved and validated with a packaged build before writing any business logic.
**Delivers:** `better-sqlite3` + `@effect/sql-sqlite-node` installed, Vite/Forge configured, native module rebuilding verified, `app.getPath('userData')` database path confirmed, WAL mode pragmas applied, `SchemaInit` layer creating tables, `PRAGMA quick_check` on startup. Packaged build tested and not crashing.
**Addresses:** TS-6 (WAL/transaction safety foundation), D-6 (integrity checks)
**Avoids:** Pitfalls 1 (ASAR), 3 (WAL shutdown), 7 (platform paths), 8 (Vite bundling), 9 (WAL mode), 11 (rebuild mismatch)

### Phase 2: Storage Services
**Rationale:** `EventStore` and `TabStore` are the stable foundation that buffering and reconstruction logic depend on. Building them before the buffering layer means the write API is finalized before the caller is written.
**Delivers:** `EventStore` service (appendEvent, getSessionEvents, deleteSessionEvents), `TabStore` service (upsertTab, getTabs, deleteTab, updateTabOrder), both using `@effect/sql` tagged template queries, both exposed as Effect layers.
**Addresses:** TS-1 (event storage), TS-3 (tab metadata), TS-8 (session partitioning)
**Implements:** EventStore and TabStore components from ARCHITECTURE.md

### Phase 3: Write Pipeline (Buffer + Persistent CLI)
**Rationale:** This is the most complex and highest-risk component — the `StreamBuffer` discard-on-interruption logic and `PersistentClaudeCli` stream decoration are where the architecture is most novel. Building it after storage services means the write target is stable.
**Delivers:** `StreamBuffer` service with `Effect.addFinalizer`-based discard, `PersistentClaudeCli` wrapping `ClaudeCliLive` via `Stream.tap`, synthetic user message event injection, `SystemInitEvent` -> `TabStore` session_id capture, main process Layer composition updated.
**Addresses:** TS-5 (buffering), TS-7 (terminated session cleanup), TS-4 (session resume via session_id capture)
**Avoids:** Pitfalls 2 (main process blocking), 4 (partial data on abort)

### Phase 4: Session Reconstruction
**Rationale:** Read-path only; depends on the write path being correct and producing well-ordered events. Separating read from write means reconstruction can be built and tested against a known-good event store.
**Delivers:** `SessionReconstructor` service, new RPC endpoint (`reconstructSessions`), tab state rebuilt as `ChatMessage[]` per tab on startup.
**Addresses:** TS-2 (state reconstruction), TS-4 (resume uses stored session_id)
**Implements:** SessionReconstructor component and read path from ARCHITECTURE.md

### Phase 5: Renderer Integration
**Rationale:** The renderer changes are the final integration point. They depend on the RPC endpoint existing and returning well-typed data. Keeping this separate avoids interleaving main-process and renderer changes.
**Delivers:** `useClaudeChat` updated to hydrate from `reconstructSessions()` on mount, tab UI reading from persisted metadata, graceful shutdown flush (`before-quit` integration with Effect runtime).
**Addresses:** TS-2 (full end-to-end reconstruction), TS-3 (tab restore), D-5 (graceful shutdown)

### Phase 6: Hardening
**Rationale:** After the core persistence is working end-to-end, validate against edge cases and production packaging on all platforms.
**Delivers:** Production packaged builds tested on Windows/macOS/Linux, cloud-synced AppData edge case documented, event store growth monitoring in dev tools, D-3 cost data confirmed flowing from stored `ResultEvent`s.
**Addresses:** D-3 (cost tracking data available), pitfalls 5 (growth monitoring), 6 (schema versioning strategy), 10 (cloud sync paths)
**Avoids:** Pitfall 7 (platform-specific path issues)

### Phase Ordering Rationale

- Phase 1 before everything else because four independent build-system failures (Pitfalls 1, 7, 8, 11) are invisible in development and collapse the project if discovered late.
- Phases 2 and 3 follow the architecture's own dependency graph: storage APIs must exist before the write pipeline can use them.
- Phase 4 (reconstruction) is deliberately after Phase 3 (writes) so reconstruction can be verified against data written by the real pipeline, not test fixtures alone.
- Phase 5 (renderer) is last in the main-process-side sequence because it integrates all prior work; changing renderer code before the RPC API is stable wastes effort.
- Phase 6 (hardening) is separate from Phase 5 because it requires packaged builds on all target platforms, which is slower than development iteration.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1:** The exact combination of `@effect/sql-sqlite-node` + Electron Forge Vite plugin has limited documented precedent. The `AutoUnpackNativesPlugin` has a known regression (issue #3934 post-v7.4.0). Validate configuration against current plugin version before planning implementation details.
- **Phase 3:** The `Effect.addFinalizer` + `Stream.tap` + fiber interruption interaction in the context of an active IPC session has no exact documented example. May need prototype validation during planning.

Phases with standard patterns (skip research-phase):
- **Phase 2:** `EventStore` and `TabStore` are standard CRUD services using documented `@effect/sql` tagged template patterns. No novel integration.
- **Phase 4:** Session reconstruction is a well-documented event sourcing read-model fold. The pattern is the same as `useClaudeChat`'s existing event processing.
- **Phase 5:** Standard renderer state hydration from RPC. The RPC pattern is already established in the codebase.
- **Phase 6:** Packaging and platform testing is procedural, not architectural.

## Confidence Assessment

- Stack — HIGH: All recommended packages are official Effect ecosystem releases or the established community standard (`better-sqlite3`). Version numbers confirmed current as of research date. The `@effect/sql-sqlite-node` wrapping `better-sqlite3` is explicitly confirmed by the package's documentation.
- Features — HIGH: Event sourcing patterns are well-established. The table stakes features map directly to stated project requirements. Deferred features are clearly deferred for principled reasons (premature optimization, pure read-side additions).
- Architecture — MEDIUM-HIGH: The service decoration pattern and `Stream.tap` approach are well-supported by Effect's API. The specific combination of `@effect/sql-sqlite-node` in an Electron main process with IPC has limited concrete examples, but each individual piece is well-documented. The Layer composition approach is inferred from Effect patterns rather than a direct example.
- Pitfalls — HIGH: All critical pitfalls are grounded in official documentation (SQLite WAL docs, Electron Forge issue tracker, better-sqlite3 documentation). The ASAR pitfall was confirmed by direct inspection of this codebase (plugin installed but not configured).

**Overall confidence:** HIGH

### Gaps to Address

- `@effect/sql-sqlite-node` + Electron Forge exact configuration: The tagged template query API and `SqliteClient.layer` options (e.g., whether WAL pragmas can be passed via config or must be set manually) need validation during Phase 1 implementation. The research confirmed the API exists but direct Electron Forge examples were scarce.
- `AutoUnpackNativesPlugin` current behavior: The known regression in issue #3934 may or may not be resolved in the version currently installed. Check the installed version against the issue timeline during Phase 1.
- Schema versioning strategy: Research recommends a `schema_version` column per event row, but the exact upcaster pattern with Effect Schema has not been prototyped. This is deferred (schema is new, no upcasting needed yet) but should be decided before the schema is published to any users.
- Sequence number management: Research recommends managing the monotonic `sequence_num` counter in-memory via a `Ref<number>` per session inside `PersistentClaudeCli`. The initialisation of this counter from the stored max sequence number (on session resume) needs explicit handling during Phase 3 design.

## Sources

### Primary (HIGH confidence)
- [better-sqlite3 npm](https://www.npmjs.com/package/better-sqlite3) — v12.8.0 current, synchronous API rationale
- [@effect/sql-sqlite-node npm](https://www.npmjs.com/package/@effect/sql-sqlite-node) — v0.49.1, SqliteClient.layer API
- [@effect/sql npm](https://www.npmjs.com/package/@effect/sql) — v0.49.0, tagged template queries, SqliteMigrator
- [@effect/sql README](https://github.com/Effect-TS/effect/blob/main/packages/sql/README.md) — query patterns
- [@effect/sql-sqlite-node API reference](https://effect-ts.github.io/effect/sql-sqlite-node/SqliteClient.ts.html) — layer constructor options
- [SQLite Write-Ahead Logging](https://sqlite.org/wal.html) — WAL behavior, checkpoint semantics
- [Electron Forge auto-unpack-natives](https://www.electronforge.io/config/plugins/auto-unpack-natives) — plugin configuration
- [@electron/rebuild npm](https://www.npmjs.com/package/@electron/rebuild) — ABI recompilation
- [Electron app.getPath docs](https://www.electronjs.org/docs/latest/api/app) — userData path by platform
- [Martin Fowler — Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html) — foundational pattern

### Secondary (MEDIUM confidence)
- [Effect SQL deepwiki — adapters](https://deepwiki.com/Effect-TS/effect/6.2-database-adapters-and-drivers) — adapter overview
- [Effect SQL deepwiki — migrations](https://deepwiki.com/Effect-TS/effect/7.3-migrations-and-advanced-features) — SqliteMigrator usage
- [Integrating SQLite with Electron Forge (blog)](https://blog.loarsaw.de/using-sqlite-with-electron-electron-forge) — Vite external config, ASAR unpacking
- [SoftwareMill — Implementing Event Sourcing with Relational Database](https://softwaremill.com/implementing-event-sourcing-using-a-relational-database/) — schema patterns
- [Electron Forge auto-unpack-natives issue #3934](https://github.com/electron/forge/issues/3934) — known regression
- [Electron app.getPath AppX issue #39636](https://github.com/electron/electron/issues/39636) — Windows AppX path gotcha
- [Event-Driven.io — Projections and Read Models](https://event-driven.io/en/projections_and_read_models_in_event_driven_architecture/) — reconstruction patterns
- [Event-Driven.io — Simple Event Versioning Patterns](https://event-driven.io/en/simple_events_versioning_patterns/) — upcaster approach

### Tertiary (MEDIUM-LOW confidence)
- [SQLite Forum — Event Sourcing with SQLite](https://www.sqliteforum.com/p/event-sourcing-with-sqlite) — community consensus on append-only design
- [Event Sourcing Production Anti-Patterns 2026](https://www.youngju.dev/blog/architecture/2026-03-07-architecture-event-sourcing-cqrs-production-patterns.en) — pitfall patterns
- [freeCodeCamp — Electron SQLite Multithreading](https://www.freecodecamp.org/news/how-to-build-an-electron-desktop-app-in-javascript-multithreading-sqlite-native-modules-and-1679d5ec0ac/) — main process approach validation

---
*Research completed: 2026-03-25*
*Ready for roadmap: yes*
