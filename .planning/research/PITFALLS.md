# Domain Pitfalls

**Domain:** Electron local persistence with event sourcing (SQLite + better-sqlite3)
**Project:** Mao -- Data Persistence
**Researched:** 2026-03-25

## Critical Pitfalls

Mistakes that cause rewrites, broken production builds, or data loss.

---

### Pitfall 1: Native Module Not Unpacked from ASAR

**What goes wrong:** `better-sqlite3` contains a compiled `.node` binary. When Electron Forge packages the app into an ASAR archive, the binary gets trapped inside the archive. The OS cannot load a shared library from inside a virtual filesystem, so `require('better-sqlite3')` throws `Error: Cannot open library` at runtime. The app works in development but crashes in production.

**Why it happens:** ASAR is Electron's virtual archive format -- it looks like a directory to Node but is actually a single file. Native `.node` binaries must be loaded by the OS dynamic linker, which cannot read from inside an ASAR. The `@electron-forge/plugin-auto-unpack-natives` plugin exists to solve this, but it has known regressions (notably issue #3934 where it stopped working after v7.4.0).

**Consequences:** Production build crashes on launch. Cannot be caught during development because ASAR is only used in packaged builds.

**Warning signs:**
- `npm run package` succeeds but the packaged app crashes immediately
- No `app.asar.unpacked` directory in the packaged output
- Error messages referencing `.node` files or `dlopen`/`LoadLibrary` failures

**Prevention:**
1. The `@electron-forge/plugin-auto-unpack-natives` package is already in `package.json` but is **not configured** in `forge.config.ts` -- it must be added to the plugins array
2. As a safety net, also configure `packagerConfig.asar` with explicit unpack patterns: `{ unpack: "*.{node,dll,dylib,so}" }`
3. Mark `better-sqlite3` as external in `vite.main.config.mts` via `build.rollupOptions.external: ["better-sqlite3"]` so Vite does not try to bundle the native binary
4. Always test with `npm run package` (or `npm run make`) before considering the feature complete -- development mode does not exercise ASAR at all
5. Consider adding a `rebuildConfig` with `onlyModules: ["better-sqlite3"]` to ensure the native module is compiled against Electron's Node headers

**Applies to phase:** Initial setup / infrastructure phase. Must be resolved before any SQLite code can be tested in production builds.

**Confidence:** HIGH -- well-documented across multiple Electron Forge issues and blog posts. The specific issue of the plugin being installed but not configured was directly observed in this codebase.

---

### Pitfall 2: Synchronous SQLite Blocking the Main Process Event Loop

**What goes wrong:** `better-sqlite3` has a synchronous API -- every `.run()`, `.get()`, `.all()` call blocks the Node.js event loop until the query completes. In Electron, the main process event loop also handles IPC messages from the renderer, window management, and system events. A slow query (even 50-100ms for a batch insert) freezes the entire application: the UI stops responding, IPC messages queue up, and window events are delayed.

**Why it happens:** Developers coming from web backends expect database queries to be fast enough to not matter. In Electron's main process, even a 30ms synchronous call blocks IPC dispatch, causing the renderer to perceive latency of 2-10x the actual query time due to message queueing.

**Consequences:** UI jank during writes. Stream events back up in the IPC pipeline during batch persistence. In extreme cases (large event replays), the app appears frozen for seconds.

**Warning signs:**
- UI stuttering when sending messages (stream events arrive in bursts instead of smoothly)
- `BrowserWindow` becomes unresponsive during database operations
- IPC roundtrip times spike during write operations

**Prevention:**
1. Use SQLite transactions for batch writes -- wrapping N inserts in a single `db.transaction(...)()` call is 10-100x faster than N individual inserts because it requires only one fsync
2. Buffer stream events in memory and flush to SQLite in batches (e.g., on `AssistantMessageEvent` or `ResultEvent` boundaries, not on every `ContentBlockDeltaApiEvent`)
3. Keep individual transactions small (under 5ms). Profile with `db.pragma('compile_options')` and `console.time()` during development
4. If batch event replay on startup proves slow (>200ms for rehydration), consider moving SQLite to a `utilityProcess` (Electron's supported way to run Node.js in a separate process) and communicating via IPC -- but only if profiling shows this is necessary
5. Use prepared statements (`db.prepare(...)`) rather than ad-hoc SQL strings -- they are significantly faster in better-sqlite3

**Applies to phase:** Persistence layer implementation. The architecture must account for this from the start, but the severity depends on actual data volumes.

**Confidence:** HIGH -- better-sqlite3's synchronous nature is its core design choice and well-documented. IPC latency amplification in Electron is confirmed by multiple sources.

---

### Pitfall 3: Data Corruption from Improper Shutdown or WAL File Separation

**What goes wrong:** SQLite in WAL mode creates two companion files alongside the main database: `.db-wal` (write-ahead log) and `.db-shm` (shared memory index). If the app exits without closing the database connection, the WAL file may not be checkpointed back into the main database. If a user manually moves or copies the `.db` file without its companions, committed transactions are lost.

**Why it happens:** Electron apps can be killed in many ways: the user force-quits, the OS terminates the process during shutdown, a crash occurs, or Windows Update reboots the machine. The existing `before-quit` handler in `main.ts` disposes the Effect runtime, but `runtime.dispose()` only cleans up Effect-managed resources. If the SQLite connection is not registered as a finalizer in an Effect Layer, it will not be closed during disposal.

**Consequences:** Lost transactions (committed to WAL but not checkpointed), database file that appears empty or missing recent data, or in rare cases, actual corruption if the WAL file is truncated.

**Warning signs:**
- `.db-wal` file grows very large (tens of MB) and never shrinks
- Data from the last session is missing after restart
- Different data depending on whether `.db-wal` exists alongside `.db`

**Prevention:**
1. Register the SQLite connection as an Effect `Layer` with proper `acquireRelease` semantics -- `acquire` opens the connection, `release` calls `db.close()`. This ensures `runtime.dispose()` in the existing `before-quit` handler closes the database
2. Enable WAL mode with `PRAGMA journal_mode = WAL` and set `PRAGMA synchronous = NORMAL` -- this combination guarantees no data loss on application crash (only OS-level crash or power loss can lose the most recent transaction)
3. Run periodic checkpoints: `PRAGMA wal_checkpoint(PASSIVE)` on a timer (e.g., every 60 seconds) to keep the WAL file small without blocking reads
4. On app startup, simply opening the database with WAL mode automatically recovers any uncommitted WAL data from a previous crash
5. Consider `PRAGMA locking_mode = EXCLUSIVE` since this is a single-process desktop app -- it eliminates the need for the `.db-shm` file entirely and simplifies file management

**Applies to phase:** Persistence layer implementation. The Layer/acquireRelease pattern must be part of the initial SQLite service design.

**Confidence:** HIGH -- SQLite's WAL behavior is authoritatively documented. The observation about Effect runtime disposal and the existing `before-quit` handler is based on direct code inspection.

---

### Pitfall 4: Partial Stream Data Persisted on User Abort

**What goes wrong:** The user terminates a Claude CLI session mid-response (e.g., closes a tab, sends Ctrl+C). The stream has emitted several `ContentBlockDeltaApiEvent` events but no final `AssistantMessageEvent` or `ResultEvent`. If the persistence layer writes events eagerly (on each stream event), the database contains an incomplete assistant response that cannot be meaningfully reconstructed.

**Why it happens:** The PROJECT.md explicitly requires "discard all partial output if user terminates a session mid-response" and "only persist complete assembled messages." But developers often implement persistence as a stream tap (write each event as it arrives) for simplicity, which violates this requirement.

**Consequences:** Orphaned partial events in the database. On session reconstruction, the UI shows a truncated assistant message with no clear end. The event log is semantically inconsistent -- it contains delta events without a corresponding complete message.

**Warning signs:**
- Events in the database with no corresponding `ResultEvent` for a given session/turn
- Truncated assistant messages appearing after app restart
- Growing count of orphaned events over time

**Prevention:**
1. Buffer stream events in memory during an active response turn. Only persist to SQLite when a complete turn boundary is reached (`AssistantMessageEvent` for assistant turns, `ResultEvent` for the full exchange)
2. If you persist `AssistantMessageEvent` directly (which contains the assembled content), you can skip persisting individual `ContentBlockDeltaApiEvent` events entirely -- they are redundant
3. Use Effect's `Stream.acquireRelease` or `Stream.onInterrupt` to handle cleanup when a stream is interrupted, ensuring the in-memory buffer is discarded rather than flushed
4. For the `SystemInitEvent` and tab metadata, persist immediately (these are not partial) -- they are needed for `--resume` functionality regardless of whether the response completes

**Applies to phase:** Stream-to-persistence integration phase. This is an architectural decision that must be made before implementing the write pipeline.

**Confidence:** HIGH -- directly derived from the project's own requirements and the existing event type system in `events.ts`.

---

## Moderate Pitfalls

---

### Pitfall 5: Event Store Unbounded Growth Without Snapshots

**What goes wrong:** Every CLI event is stored as a row forever. Over weeks of use across many tabs, the event store grows to hundreds of thousands of rows. Reconstructing a single session requires replaying all its events from the beginning, which gets progressively slower. A power user with dozens of long conversations experiences multi-second startup times.

**Why it happens:** Event sourcing without snapshots is simple to implement and works fine for small datasets. The growth is invisible during development and early use. By the time it becomes a problem, the architecture is committed.

**Prevention:**
1. Design the schema with snapshot support from day one, even if you do not implement snapshotting immediately. Include a `snapshots` table with `session_id`, `snapshot_data`, `event_sequence_number`, and `created_at` columns
2. The `AssistantMessageEvent` already contains the full assembled message content -- consider treating these as natural snapshot points rather than replaying delta events
3. Set a threshold (e.g., 500 events per session) at which a snapshot is automatically created
4. Implement a cleanup/compaction strategy: after creating a snapshot, mark pre-snapshot events as compactable (do not delete immediately -- keep for debugging, but allow future cleanup)
5. Index the events table on `(session_id, sequence_number)` for efficient range queries during replay

**Detection:** Monitor event counts per session. Alert (in dev tools or logs) when a session exceeds the snapshot threshold.

**Applies to phase:** Schema design phase (add the table), then snapshot implementation can be deferred to a later phase. The important thing is that the schema supports it from the start.

**Confidence:** MEDIUM -- the severity depends on actual usage patterns. A user with 5 short conversations will never hit this. A power user with 50 long conversations will. The mitigation strategies are well-established in event sourcing literature.

---

### Pitfall 6: Event Schema Evolution Without a Versioning Strategy

**What goes wrong:** The `ClaudeEvent` schema (defined via Effect Schema classes in `events.ts`) changes as the Claude CLI evolves or as the app adds new features. Old events stored in SQLite no longer decode correctly against the new schema. The app crashes or silently drops events during session reconstruction.

**Why it happens:** The Claude CLI is an external dependency -- its event format can change between versions. The app's own event types may also evolve (e.g., adding fields to `ResultEvent`, new event types). Without version tracking, old rows become unreadable.

**Prevention:**
1. Store a `schema_version` integer alongside each event row. Start at version 1
2. Store event data as JSON text in SQLite (not as separate columns) so the schema is decoupled from the table structure
3. Implement upcasters: functions that transform event JSON from version N to version N+1. Chain them: `v1 -> v2 -> v3 -> current`
4. Use Effect Schema's `Schema.optional()` and `Schema.NullOr()` for new fields so old events decode gracefully with defaults -- the existing event types already do this for some fields (e.g., `total_cost_usd` on `ResultEvent`)
5. When the Claude CLI adds new event types, handle them via `UnknownEvent` (which already exists as the catch-all) rather than crashing

**Detection:** Decoding failures during session reconstruction. Track schema version in a metadata table and log warnings when upcasting is needed.

**Applies to phase:** Schema design phase. The version column and JSON storage strategy must be decided upfront. Upcaster implementation can happen incrementally as the schema evolves.

**Confidence:** MEDIUM -- this is a standard event sourcing concern. The specific risk from Claude CLI changes is real but unpredictable in timing.

---

### Pitfall 7: app.getPath('userData') Platform Inconsistencies

**What goes wrong:** The database file is stored at `app.getPath('userData')`, but the actual path varies across platforms and packaging methods:
- Windows standard: `C:\Users\<user>\AppData\Roaming\<app-name>`
- Windows AppX: `C:\Users\<user>\AppData\Local\Packages\<appid>\LocalCache\Roaming\<app-name>` (different!)
- macOS: `~/Library/Application Support/<app-name>`
- Linux: `~/.config/<app-name>`

The app name is derived from `package.json`'s `name` field (currently `"mao"`) or `productName` (also `"mao"`). If these change, the userData path changes and existing databases are orphaned.

**Why it happens:** Developers test on one platform and assume paths work the same everywhere. The `productName` gotcha is particularly subtle -- characters valid in a product name but invalid in a file path (colons, slashes) cause failures on specific platforms.

**Prevention:**
1. Never hardcode paths. Always use `app.getPath('userData')` and join the database filename to it
2. Call `app.getPath('userData')` only after the `app.whenReady()` promise resolves (some paths throw errors before the ready event)
3. Keep `productName` in `package.json` simple and path-safe (the current value `"mao"` is fine)
4. Create the userData directory explicitly on first run (`fs.mkdirSync(dbDir, { recursive: true })`) -- some platforms do not create it automatically
5. Test packaged builds on all target platforms (Windows, macOS, Linux) -- development mode uses different paths than production

**Applies to phase:** Infrastructure setup. This is a one-time configuration concern but must be correct from the start.

**Confidence:** HIGH -- platform path differences are authoritatively documented by Electron. The AppX path issue is a known gotcha from Electron issue #39636.

---

### Pitfall 8: Vite Bundling Native Module Code

**What goes wrong:** Vite attempts to bundle `better-sqlite3` into the main process output, either failing at build time (cannot resolve `.node` binary) or producing a bundle that crashes at runtime because the native binding path is wrong.

**Why it happens:** Vite's default behavior is to bundle everything into a single file. Native modules with compiled binaries cannot be bundled -- they must remain as external `require()` calls that resolve to the actual `.node` file on disk. The Electron Forge Vite plugin handles most externals automatically, but native modules often need explicit configuration.

**Prevention:**
1. In `vite.main.config.mts`, add `better-sqlite3` to `build.rollupOptions.external`:
   ```typescript
   build: {
     rollupOptions: {
       external: ["better-sqlite3"],
     },
   },
   ```
2. Do NOT add it to `vite.renderer.config.mts` or `vite.preload.config.mts` -- better-sqlite3 should only be used in the main process
3. Verify by checking the built output: `better-sqlite3` should appear as a `require()` call, not inlined code

**Applies to phase:** Infrastructure setup, immediately when adding `better-sqlite3` as a dependency.

**Confidence:** HIGH -- this is the standard configuration approach documented by both Electron Forge and electron-vite.

---

## Minor Pitfalls

---

### Pitfall 9: Forgetting to Enable WAL Mode on First Connection

**What goes wrong:** SQLite defaults to `DELETE` journal mode. Without explicitly setting `PRAGMA journal_mode = WAL`, the database uses rollback journals which lock the entire file during writes, are slower for the write-heavy event sourcing pattern, and provide worse crash recovery.

**Prevention:** Run `PRAGMA journal_mode = WAL` and `PRAGMA synchronous = NORMAL` as the first statements after opening the database connection. Do this in the Layer's acquire function so it happens exactly once per connection lifecycle. WAL mode is persistent -- once set, it survives database close/reopen, but explicitly setting it on every open is harmless and defensive.

**Applies to phase:** Persistence layer implementation.

**Confidence:** HIGH.

---

### Pitfall 10: Database File on Cloud-Synced or Network Storage

**What goes wrong:** Some users configure their home directory or AppData to sync with cloud storage (OneDrive, iCloud, Dropbox). SQLite's WAL mode requires shared memory and POSIX file locking, neither of which works reliably over cloud sync or network filesystems. The database can become corrupted when the sync service copies the `.db` file without its `.db-wal` companion, or when file locks are not properly maintained.

**Prevention:**
1. Use `app.getPath('userData')` which is generally in a local path. On Windows, this is in `AppData\Roaming` which OneDrive does not sync by default (unlike `Documents` or `Desktop`)
2. If users report corruption, check whether their AppData is on a network drive or cloud-synced folder
3. Consider using `PRAGMA locking_mode = EXCLUSIVE` to eliminate the `.db-shm` file and reduce the risk from file sync services copying files independently

**Applies to phase:** Testing / hardening phase.

**Confidence:** MEDIUM -- depends on user environment. Most users will not encounter this, but it is a known SQLite failure mode.

---

### Pitfall 11: Electron Rebuild Targeting Wrong Node Headers

**What goes wrong:** `better-sqlite3` is compiled against the system Node.js headers during `npm install`, but Electron bundles its own version of Node.js with different V8 and ABI versions. The compiled `.node` binary crashes at runtime with `NODE_MODULE_VERSION mismatch` or similar errors.

**Prevention:**
1. Electron Forge's `@electron/rebuild` runs automatically during `electron-forge start` and `electron-forge package` -- verify it succeeds in the build output
2. Add `rebuildConfig: { onlyModules: ["better-sqlite3"] }` to `forge.config.ts` to make rebuild faster and more targeted
3. If using CI/CD, ensure the rebuild step runs in the same environment as the packaging step
4. After `npm install`, run `npx electron-rebuild -f -w better-sqlite3` to verify the module compiles against Electron headers

**Applies to phase:** Infrastructure setup (CI/CD and local development).

**Confidence:** HIGH -- ABI mismatch is the most commonly reported issue when adding native modules to Electron.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|---|---|---|
| Adding `better-sqlite3` dependency | ASAR packaging (#1), Vite bundling (#8), Electron rebuild (#11) | Configure forge.config.ts plugin + external + rebuild before writing any SQLite code |
| SQLite service Layer design | Improper shutdown (#3), main process blocking (#2) | Use Effect acquireRelease for the connection; batch writes in transactions |
| Stream-to-DB write pipeline | Partial data on abort (#4), main process blocking (#2) | Buffer in memory, flush on turn boundaries, use transactions |
| Event schema design | Unbounded growth (#5), schema evolution (#6) | Version column + JSON storage + snapshots table from day one |
| Session reconstruction | Unbounded growth (#5), schema evolution (#6) | Efficient indexed queries; upcasters for old events |
| Production packaging | ASAR unpacking (#1), rebuild mismatch (#11), platform paths (#7) | Test packaged builds on all platforms; verify app.asar.unpacked exists |
| Long-term maintenance | Event store growth (#5), Claude CLI changes (#6) | Snapshot thresholds; UnknownEvent catch-all; monitoring |

## Sources

- [Electron Forge auto-unpack-natives plugin docs](https://www.electronforge.io/config/plugins/auto-unpack-natives)
- [Electron Forge auto-unpack-natives issue #3934](https://github.com/electron/forge/issues/3934)
- [Integrating SQLite with Electron Forge (blog)](https://blog.loarsaw.de/using-sqlite-with-electron-electron-forge)
- [SQLite Write-Ahead Logging docs](https://sqlite.org/wal.html)
- [How to Corrupt an SQLite Database](https://sqlite.org/howtocorrupt.html)
- [Node.js Backpressuring in Streams](https://nodejs.org/en/learn/modules/backpressuring-in-streams)
- [Effect-TS Resourceful Streams docs](https://effect.website/docs/stream/resourceful-streams/)
- [Effect-TS Resource Management docs](https://effect.website/docs/resource-management/introduction/)
- [Event Sourcing Production Anti-Patterns (2026)](https://www.youngju.dev/blog/architecture/2026-03-07-architecture-event-sourcing-cqrs-production-patterns.en)
- [Event Schema Versioning Patterns](https://event-driven.io/en/simple_events_versioning_patterns/)
- [Electron app.getPath docs](https://www.electronjs.org/docs/latest/api/app)
- [Electron app.getPath AppX issue #39636](https://github.com/electron/electron/issues/39636)
- [Electron Forge Vite plugin docs](https://www.electronforge.io/config/plugins/vite)
- [better-sqlite3 npm package](https://www.npmjs.com/package/better-sqlite3)
- [Challenges Building an Electron App (blog)](https://www.danielcorin.com/posts/2024/challenges-building-an-electron-app/)
- [freeCodeCamp: Electron SQLite Multithreading Pain Points](https://www.freecodecamp.org/news/how-to-build-an-electron-desktop-app-in-javascript-multithreading-sqlite-native-modules-and-1679d5ec0ac/)

---

*Researched: 2026-03-25*
