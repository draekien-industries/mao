# Phase 1: SQLite Infrastructure - Research

**Researched:** 2026-03-25
**Domain:** SQLite database layer for Electron with Effect-TS service patterns
**Confidence:** MEDIUM

## Summary

Phase 1 establishes a SQLite database on the user's filesystem, managed as an Effect Layer with acquireRelease semantics. The core library is `@effect/sql-sqlite-node` (v0.52.0), which wraps `better-sqlite3` and provides tagged template queries, connection lifecycle via Effect's Scope system, and built-in WAL mode support. The primary technical risk is native module packaging: `better-sqlite3` contains compiled `.node` binaries that must be unpacked from the ASAR archive. Electron Forge's `@electron-forge/plugin-auto-unpack-natives` has a known regression (issue #3934, open since May 2025, affects v7.4.0+) where it fails to unpack native modules. A manual workaround using `packagerConfig.asar.unpack` and a custom `ignore` function is required.

The `@effect/sql-sqlite-node` layer constructor already handles WAL mode activation, database file creation, and connection cleanup via `Scope.addFinalizer`. The project-owned `Database` service wraps this layer to add integrity checking (`PRAGMA quick_check`), schema bootstrapping (`CREATE TABLE IF NOT EXISTS`), and corruption dialog handling via Electron's `dialog.showMessageBoxSync`. All peer dependencies (`effect@^3.21.0`, `@effect/sql@^0.51.0`, `@effect/platform@^0.96.0`, `@effect/experimental@^0.60.0`) are already satisfied by the existing dependency tree.

**Primary recommendation:** Install `@effect/sql-sqlite-node` and `better-sqlite3` as direct dependencies. Use the `SqliteClient.layer()` constructor for connection management. Create a project-owned `Database` service that wraps `SqlClient` with integrity checks and schema bootstrap. Handle native module packaging via manual ASAR unpack configuration rather than relying on the broken AutoUnpackNatives plugin.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Use `@effect/sql-sqlite-node` as the SQLite library (not raw `better-sqlite3`). This provides tagged template queries, connection management as an Effect Layer with acquireRelease built-in, transactions via Effect.gen, and consistent patterns with the rest of the Effect codebase. Native module packaging concerns apply equally since it uses better-sqlite3 under the hood.
- **D-02:** Create a project-owned `Database` service tag that wraps the `SqlClient` internally. The Database Layer runs WAL PRAGMA setup and integrity checks on acquire, and exposes the SqlClient for downstream services. This follows the existing pattern where `ClaudeCli` wraps `CommandExecutor`.
- **D-03:** When the startup integrity check (`PRAGMA quick_check`) detects corruption, show an Electron dialog to the user with two choices: "Continue anyway" or "Reset database."
- **D-04:** "Reset database" means delete the corrupted `.db` file (and WAL/SHM files), then create a fresh database. All conversation history is lost, but the app starts clean. No backup/rename of the corrupted file.
- **D-05:** Phase 1 creates the database tables (events, tabs) as part of the Database Layer setup using `CREATE TABLE IF NOT EXISTS`. Phase 1 owns the schema definition; Phase 2 owns the queries. This means the integrity check can also verify table structure, and Phase 2 starts with tables already in place.

### Claude's Discretion
- Table column definitions and exact schema design (guided by REQUIREMENTS.md EVNT-01 through EVNT-04 and TAB-01)
- Native module packaging approach (AutoUnpackNativesPlugin, electron-rebuild, Vite externals configuration)
- Error type design for database operations (TaggedError classes following existing pattern)
- Database file naming and exact path construction within app.getPath('userData')

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-01 | Native module packaging configured (Vite externals, Forge AutoUnpackNativesPlugin, electron-rebuild) so better-sqlite3 works in packaged builds | Covered by "Native Module Packaging" section -- manual ASAR unpack config with custom ignore function as workaround for #3934 regression |
| INFRA-02 | SQLite database created in Electron's app.getPath('userData') on first launch | Covered by SqliteClient.layer() config -- `filename` parameter accepts full path; `better-sqlite3` creates the file automatically if it does not exist |
| INFRA-03 | Database connection managed as Effect Layer with acquireRelease semantics for clean lifecycle | Covered by `@effect/sql-sqlite-node` -- `SqliteClient.layer()` uses `Scope.addFinalizer(scope, Effect.sync(() => db.close()))` for cleanup |
| INFRA-04 | WAL mode enabled via PRAGMA for crash resilience and atomic transactions | Covered by `@effect/sql-sqlite-node` -- WAL mode enabled by default unless `disableWAL: true` is set in config |
| SAFE-02 | Database integrity check (PRAGMA quick_check) runs on startup and warns if corruption detected | Covered by "Integrity Check" section -- run `PRAGMA quick_check` via `sql.unsafe` tagged template or `executeUnprepared`, show Electron dialog on failure |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- NEVER use `as` type casting unless absolutely necessary -- prefer Effect Schema decoding or type narrowing
- NEVER use `any` type unless absolutely necessary -- use `ReturnType`, `Parameters`, etc. for complex types
- AVOID `useCallback`, `useMemo`, `memo` -- depend on React Compiler
- Use Effect-TS service/layer patterns consistent with existing architecture
- Follow kebab-case file naming, PascalCase for services/layers, TaggedError pattern for errors
- Biome formatting: 2 spaces, 80 char line width, double quotes, LF endings
- Test files in `__tests__/` subdirectory, `{name}.test.ts` format
- Structured logging with `Effect.annotateLogs`, never raw `console.log` (except lifecycle in main.ts)

## Standard Stack

### Core

- `@effect/sql-sqlite-node` v0.52.0 -- SQLite client for Effect ecosystem, wraps better-sqlite3 with tagged template queries and Effect Layer lifecycle management
  - Provides `SqliteClient.layer()` constructor with WAL mode, Scope-based cleanup, and prepared statement caching
  - Peer deps: `effect@^3.21.0`, `@effect/sql@^0.51.0`, `@effect/platform@^0.96.0`, `@effect/experimental@^0.60.0` (all satisfied by existing dependency tree)
- `@effect/sql` v0.51.0 -- Core SQL abstraction (SqlClient interface, tagged template queries, transactions)
  - Already installed as transitive dependency of `@effect/platform-node`
  - Must be added as direct dependency for import access
- `better-sqlite3` v12.8.0 -- Synchronous SQLite3 binding for Node.js (pulled in by `@effect/sql-sqlite-node`)
  - Contains native `.node` binary that requires special ASAR packaging
  - Must be added as direct dependency for electron-rebuild to find it

### Supporting

- `@electron-forge/plugin-auto-unpack-natives` v7.11.1 -- Already in devDependencies but NOT in forge.config.ts plugins array
  - Known regression: does not actually unpack natives in v7.4.0+ (issue #3934, still open)
  - Keep installed but supplement with manual ASAR config

### Alternatives Considered

- Raw `better-sqlite3` instead of `@effect/sql-sqlite-node` -- rejected by D-01; loses tagged templates, Effect Layer integration, and consistent patterns
- `@effect/sql-sqlite-bun` -- not applicable; project uses Node.js runtime via Electron
- Kysely or Drizzle ORM -- rejected in REQUIREMENTS.md Out of Scope; 2-3 table schema does not justify ORM overhead

**Installation:**
```bash
npm install @effect/sql-sqlite-node @effect/sql better-sqlite3
npm install --save-dev @types/better-sqlite3
```

**Version verification:**
- `@effect/sql-sqlite-node`: 0.52.0 (verified via npm view, published March 2026)
- `@effect/sql`: 0.51.0 (verified via npm view, published March 2026)
- `better-sqlite3`: 12.8.0 (verified via npm view, latest)
- `@electron-forge/plugin-auto-unpack-natives`: 7.11.1 (already in devDependencies)

## Architecture Patterns

### Recommended Project Structure
```
src/services/database/
  service-definition.ts   # Database Context.Tag with SqlClient accessor
  service.ts              # DatabaseLive Layer (wraps SqliteClient, runs bootstrap)
  errors.ts               # DatabaseOpenError, DatabaseCorruptionError, DatabaseQueryError
  schema.ts               # CREATE TABLE statements, table column definitions
  __tests__/
    service.test.ts       # Layer construction, schema bootstrap, integrity check
    schema.test.ts        # SQL statement correctness
```

### Pattern 1: SqliteClient Layer Construction
**What:** `@effect/sql-sqlite-node` provides `SqliteClient.layer()` which creates a database connection managed by Effect's Scope system
**When to use:** Always -- this is the only way to get a SqlClient in this stack
**Example:**
```typescript
// Source: https://github.com/Effect-TS/effect/blob/main/packages/sql-sqlite-node/src/SqliteClient.ts
import { SqliteClient } from "@effect/sql-sqlite-node";

const SqliteLive = SqliteClient.layer({
  filename: "/path/to/database.db",
  // WAL mode is enabled by default (disableWAL defaults to false)
  // prepareCacheSize defaults to 200
  // prepareCacheTTL defaults to 10 minutes
});
// Provides: SqliteClient | SqlClient
// Cleanup: db.close() via Scope.addFinalizer
```

### Pattern 2: Project-Owned Database Service Wrapping SqlClient
**What:** A `Database` service tag that depends on `SqlClient` and adds integrity checking + schema bootstrapping on acquire
**When to use:** Always -- D-02 mandates this pattern
**Example:**
```typescript
// Following existing ClaudeCli pattern from src/services/claude-cli/
import { SqlClient } from "@effect/sql";
import { Context, Effect, Layer } from "effect";

// service-definition.ts
export class Database extends Context.Tag("Database")<
  Database,
  {
    readonly sql: SqlClient.SqlClient;
  }
>() {}

// service.ts
export const DatabaseLive = Layer.effect(
  Database,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    // Integrity check runs on layer construction
    const result = yield* sql.unsafe("PRAGMA quick_check");
    // Handle corruption...

    // Schema bootstrap
    yield* sql.unsafe(`CREATE TABLE IF NOT EXISTS events (...)`);
    yield* sql.unsafe(`CREATE TABLE IF NOT EXISTS tabs (...)`);

    return { sql };
  }).pipe(Effect.annotateLogs("service", "database")),
);
```

### Pattern 3: Tagged Template Queries (for Phase 2 reference)
**What:** `@effect/sql` provides a `sql` tagged template function for parameterized queries
**When to use:** All query construction in Phase 2+
**Example:**
```typescript
// Source: https://github.com/Effect-TS/effect/blob/main/packages/sql/README.md
import { SqlClient } from "@effect/sql";

const sql = yield* SqlClient.SqlClient;

// Parameterized query (safe interpolation)
const rows = yield* sql<{
  readonly id: number;
  readonly event_type: string;
}>`SELECT id, event_type FROM events WHERE session_id = ${sessionId}`;

// Unsafe interpolation for identifiers
const result = yield* sql`SELECT * FROM ${sql(tableName)} LIMIT ${limit}`;

// Insert
yield* sql`INSERT INTO events ${sql.insert(eventData)}`;
```

### Pattern 4: Layer Composition in main.ts
**What:** The Database Layer slots between NodeContext and ClaudeCliLive in the layer composition chain
**When to use:** At app startup in `src/main.ts`
**Example:**
```typescript
// Current: NodeContext -> ClaudeCliLive -> ClaudeRpcHandlers
// New:     NodeContext -> SqliteLive -> DatabaseLive -> ClaudeCliLive -> ClaudeRpcHandlers

const SqliteLive = SqliteClient.layer({
  filename: path.join(app.getPath("userData"), "mao.db"),
});

const BaseLayer = Layer.provideMerge(
  ClaudeRpcHandlers,
  Layer.provideMerge(
    ClaudeCliLive,
    Layer.provideMerge(
      DatabaseLive,
      Layer.provideMerge(SqliteLive, NodeContext.layer),
    ),
  ),
);
```

### Anti-Patterns to Avoid
- **Importing `better-sqlite3` directly:** Always go through `@effect/sql-sqlite-node` and the `SqlClient` interface. Direct better-sqlite3 usage bypasses Effect's resource management.
- **Running PRAGMA via prepared statements:** PRAGMA statements should use `sql.unsafe()` or `executeUnprepared` since they are one-time configuration commands, not parameterized queries.
- **Creating the database file manually:** `better-sqlite3` creates the file automatically when opening a non-existent path. Do not use `fs.writeFile` or similar.
- **Placing SqliteClient.layer() inside the Database Layer:** The SqliteClient layer should be a separate layer that Database depends on, matching the pattern where ClaudeCli depends on CommandExecutor as a separate layer.

## Don't Hand-Roll

- **Database connection lifecycle** -- `@effect/sql-sqlite-node` handles open/close via `Scope.addFinalizer`. Do not call `db.open()`/`db.close()` manually.
- **WAL mode setup** -- `@effect/sql-sqlite-node` enables WAL by default via `db.pragma("journal_mode = WAL")` in its constructor. Do not re-run this PRAGMA.
- **Prepared statement caching** -- Built into `@effect/sql-sqlite-node` with configurable size (200) and TTL (10 min). Do not implement a custom cache.
- **SQL parameter escaping** -- Tagged template queries handle parameterization automatically. Never use string concatenation for SQL.
- **Native module rebuild** -- Electron Forge handles `electron-rebuild` automatically during `npm install` for native dependencies. Do not run `electron-rebuild` manually unless debugging.

## Common Pitfalls

### Pitfall 1: AutoUnpackNatives Plugin Regression (#3934)
**What goes wrong:** The `@electron-forge/plugin-auto-unpack-natives` plugin does not unpack `.node` files from ASAR in versions 7.4.0+, causing `Cannot find module 'better-sqlite3'` at runtime in packaged builds.
**Why it happens:** Regression introduced in Forge v7.4.0 (issue #3934, still open as of March 2026). The plugin's glob pattern `**/*.node` fires but the unpack configuration is not applied correctly by the Vite plugin pipeline.
**How to avoid:** Use manual ASAR unpack configuration in `packagerConfig`:
```typescript
packagerConfig: {
  asar: {
    unpack: "*.{node,dylib}",
  },
},
```
And mark `better-sqlite3` as external in Vite main config:
```typescript
// vite.main.config.mts
export default defineConfig({
  build: {
    rollupOptions: {
      external: ["better-sqlite3"],
    },
  },
});
```
**Warning signs:** App works in `npm start` (dev mode) but crashes with module-not-found error after `npm run package` or `npm run make`.

### Pitfall 2: Vite External Modules Not Copied to Package (#3917/#3738)
**What goes wrong:** Marking a module as `external` in Vite tells the bundler not to bundle it, but Electron Forge's Vite plugin does not automatically copy external modules into the packaged app's `node_modules`. This means the module is neither bundled nor available at runtime.
**Why it happens:** Open issue (#3738, still unresolved). The Vite plugin pipeline prunes node_modules aggressively after v7.5.0.
**How to avoid:** Use a `packagerConfig.ignore` function that preserves `better-sqlite3` (and its transitive deps) in the packaged `node_modules`:
```typescript
packagerConfig: {
  asar: {
    unpack: "*.{node,dylib}",
  },
  ignore: (file: string) => {
    if (!file) return false;
    if (file.startsWith("/.vite")) return false;
    if (file.startsWith("/node_modules")) {
      const parts = file.split("/");
      const moduleName = parts[2];
      const keepModules = [
        "better-sqlite3",
        "bindings",
        "file-uri-to-path",
        "prebuild-install",
        "node-addon-api",
      ];
      return !keepModules.some((m) => moduleName === m);
    }
    return true;
  },
},
```
**Warning signs:** Same as Pitfall 1 -- works in dev, crashes in packaged build.

### Pitfall 3: OnlyLoadAppFromAsar Fuse Conflicts with Unpacked Natives
**What goes wrong:** The `OnlyLoadAppFromAsar` Electron Fuse is currently enabled in `forge.config.ts`. This fuse restricts the app to load only from the ASAR archive. Native modules that are unpacked to `app.asar.unpacked/` should still be resolvable, but subtle path resolution issues can occur.
**Why it happens:** The ASAR unpack mechanism creates a parallel directory (`app.asar.unpacked/`) and Electron patches `fs` to transparently redirect. But the Fuse may affect how `require()` resolves paths in edge cases.
**How to avoid:** Test the packaged build early. If native module loading fails with the fuse enabled, the unpack glob pattern may need adjustment (e.g., `unpackDir` instead of `unpack`). The fuse should remain enabled for security.
**Warning signs:** `MODULE_NOT_FOUND` errors specifically mentioning `.node` file paths in production.

### Pitfall 4: Database File Path on Different Platforms
**What goes wrong:** `app.getPath('userData')` returns different paths per OS. The directory may not exist on first launch (rare but possible if a custom data directory is used).
**Why it happens:** Electron abstracts platform-specific paths, but `better-sqlite3` requires the parent directory to exist before creating the database file.
**How to avoid:** Ensure the parent directory exists before passing the filename to `SqliteClient.layer()`:
```typescript
import { mkdirSync } from "node:fs";
const dbDir = app.getPath("userData");
mkdirSync(dbDir, { recursive: true });
const dbPath = path.join(dbDir, "mao.db");
```
**Warning signs:** `SQLITE_CANTOPEN` error on first launch.

### Pitfall 5: PRAGMA quick_check on Large Databases
**What goes wrong:** `PRAGMA quick_check` scans all rows in all tables. On databases with thousands of events, this adds noticeable startup latency.
**Why it happens:** `quick_check` is O(N) in database size. It is faster than `integrity_check` (O(N log N)) but still not instant for large databases.
**How to avoid:** For Phase 1, this is acceptable since the database starts empty. In future phases, consider: (a) running quick_check only on first launch after crash/unclean shutdown, (b) using `PRAGMA quick_check(1)` to limit output to first error found, or (c) running the check asynchronously after the UI is visible.
**Warning signs:** Slow app startup after extended use (hundreds of sessions).

### Pitfall 6: @effect/experimental Peer Dependency
**What goes wrong:** `@effect/sql-sqlite-node` lists `@effect/experimental@^0.60.0` as a peer dependency. If not satisfied, npm may warn or fail depending on `--legacy-peer-deps` settings.
**Why it happens:** The SqliteClient.layer() internally uses `Reactivity.layer` from `@effect/experimental`.
**How to avoid:** Already satisfied -- `@effect/experimental@0.60.0` is installed transitively via `@effect/platform-node -> @effect/sql -> @effect/experimental`. Verify with `npm ls @effect/experimental` after installing new packages.
**Warning signs:** Peer dependency warnings during `npm install`.

## Code Examples

### SqliteClient Layer with app.getPath
```typescript
// Source: @effect/sql-sqlite-node SqliteClient.ts (verified from GitHub source)
import path from "node:path";
import { SqliteClient } from "@effect/sql-sqlite-node";
import { app } from "electron";

const SqliteLive = SqliteClient.layer({
  filename: path.join(app.getPath("userData"), "mao.db"),
  // WAL enabled by default (disableWAL: false)
  // Statement cache: 200 entries, 10 min TTL
});
// Provides: SqliteClient | SqlClient.SqlClient
```

### Integrity Check with PRAGMA quick_check
```typescript
// PRAGMA quick_check returns "ok" if no corruption detected
// Source: SQLite documentation (sqlite.org/pragma.html)
import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

const checkIntegrity = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const result = yield* sql.unsafe<{ quick_check: string }>(
    "PRAGMA quick_check"
  );
  // result[0].quick_check === "ok" means no corruption
  return result[0]?.quick_check === "ok";
}).pipe(Effect.annotateLogs("service", "database"));
```

### Schema Bootstrap with CREATE TABLE IF NOT EXISTS
```typescript
// Table schemas guided by REQUIREMENTS.md EVNT-01 through EVNT-04 and TAB-01
import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

const bootstrapSchema = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql.unsafe(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      sequence_number INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      event_data TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(session_id, sequence_number)
    )
  `);

  yield* sql.unsafe(`
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
  `);

  yield* Effect.logInfo("Database schema bootstrapped");
}).pipe(Effect.annotateLogs("service", "database"));
```

### Corruption Dialog with Electron
```typescript
// Source: Electron dialog API (electronjs.org/docs/latest/api/dialog)
import { dialog, app } from "electron";
import { Effect } from "effect";

const handleCorruption = (dbPath: string) =>
  Effect.sync(() => {
    const response = dialog.showMessageBoxSync({
      type: "warning",
      title: "Database Corruption Detected",
      message: "The application database may be corrupted.",
      detail:
        "You can continue using the app (data may be unreliable) or reset the database (all history will be lost).",
      buttons: ["Continue Anyway", "Reset Database"],
      defaultId: 0,
      cancelId: 0,
    });
    return response; // 0 = continue, 1 = reset
  });

const resetDatabase = (dbPath: string) =>
  Effect.sync(() => {
    const fs = require("node:fs");
    // Delete main db, WAL, and SHM files
    for (const suffix of ["", "-wal", "-shm"]) {
      const file = dbPath + suffix;
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  });
```

### Database TaggedError Pattern
```typescript
// Following existing pattern from src/services/claude-cli/errors.ts
import { Schema } from "effect";

export class DatabaseOpenError extends Schema.TaggedError<DatabaseOpenError>()(
  "DatabaseOpenError",
  { message: Schema.String, cause: Schema.String },
) {}

export class DatabaseCorruptionError extends Schema.TaggedError<DatabaseCorruptionError>()(
  "DatabaseCorruptionError",
  { message: Schema.String },
) {}

export class DatabaseQueryError extends Schema.TaggedError<DatabaseQueryError>()(
  "DatabaseQueryError",
  { message: Schema.String, cause: Schema.String },
) {}

export const DatabaseErrorSchema = Schema.Union(
  DatabaseOpenError,
  DatabaseCorruptionError,
  DatabaseQueryError,
);

export type DatabaseError = Schema.Schema.Type<typeof DatabaseErrorSchema>;

export function formatDatabaseError(err: DatabaseError): string {
  switch (err._tag) {
    case "DatabaseOpenError":
      return `Failed to open database: ${err.message}`;
    case "DatabaseCorruptionError":
      return `Database corruption detected: ${err.message}`;
    case "DatabaseQueryError":
      return `Database query failed: ${err.message}`;
  }
}
```

## State of the Art

- `@effect/sql-sqlite-node` v0.52.0 is the current stable release (March 2026), matching the project's Effect v3.21.0 ecosystem
- `better-sqlite3` v12.8.0 is the latest release; it is the de-facto synchronous SQLite library for Node.js
- Electron Forge v7.11.1 is the project's current version; the native module packaging regression (#3934) remains open but has well-documented workarounds
- `PRAGMA quick_check` is the recommended lightweight integrity check for startup use (O(N) vs O(N log N) for full `integrity_check`)

**Deprecated/outdated:**
- `node-sqlite3` (async): replaced by `better-sqlite3` for synchronous use cases; not compatible with `@effect/sql-sqlite-node`
- `@electron-forge/plugin-auto-unpack-natives` default behavior: broken since v7.4.0; manual ASAR config required

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | Yes | v24.13.1 | -- |
| npm | Package install | Yes | 11.8.0 | -- |
| Electron | App shell | Yes | 41.0.3 | -- |
| Electron Forge | Build pipeline | Yes | 7.11.1 | -- |
| Vitest | Testing | Yes | 4.1.1 | -- |
| Biome | Linting | Yes | 2.4.8 | -- |
| better-sqlite3 | SQLite binding | Not installed | -- | Install via npm |
| @effect/sql-sqlite-node | Effect SQL layer | Not installed | -- | Install via npm |
| @effect/sql | SQL abstractions | Transitive only | 0.51.0 | Add as direct dependency |

**Missing dependencies with no fallback:**
- `@effect/sql-sqlite-node` and `better-sqlite3` must be installed to proceed

**Missing dependencies with fallback:**
- None

## Validation Architecture

### Test Framework

- Framework: Vitest 4.1.1
- Config file: `vitest.config.mts`
- Quick run command: `npx vitest run src/services/database`
- Full suite command: `npm test`

### Phase Requirements to Test Map

- INFRA-01 (native module packaging): manual-only -- requires `npm run package` and launching the packaged executable; cannot be automated in unit tests
- INFRA-02 (database created in userData): unit -- verify SqliteClient.layer() creates file at expected path when given a temp directory
- INFRA-03 (Effect Layer with acquireRelease): unit -- verify layer construction succeeds and provides SqlClient; verify cleanup runs on scope close
- INFRA-04 (WAL mode): unit -- verify `PRAGMA journal_mode` returns `wal` after layer construction
- SAFE-02 (integrity check on startup): unit -- verify `PRAGMA quick_check` runs; verify corruption handling logic (mock corrupt response)

### Sampling Rate
- **Per task commit:** `npx vitest run src/services/database`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before verify

### Wave 0 Gaps
- `src/services/database/__tests__/service.test.ts` -- covers INFRA-02, INFRA-03, INFRA-04, SAFE-02
- `src/services/database/__tests__/errors.test.ts` -- covers error formatting
- `src/services/database/__tests__/schema.test.ts` -- covers table creation SQL validity
- Note: Tests will use a temp directory (e.g., `os.tmpdir()`) for database files, not the actual `app.getPath('userData')`

## Open Questions

1. **Exact `ignore` function for packagerConfig**
   - What we know: The ignore function must preserve `better-sqlite3` and its transitive native dependencies in `node_modules` during packaging
   - What's unclear: The exact list of modules that `better-sqlite3` v12.8.0 needs at runtime (bindings, file-uri-to-path, prebuild-install, node-addon-api are candidates)
   - Recommendation: Install packages first, then inspect `node_modules/better-sqlite3/node_modules/` to determine the exact dependency list. Test with `npm run package` early.

2. **`dialog.showMessageBoxSync` timing relative to Effect runtime**
   - What we know: The dialog must show during Database layer construction, which happens inside Effect's runtime. `showMessageBoxSync` is synchronous and blocks the main process.
   - What's unclear: Whether calling `showMessageBoxSync` inside an `Effect.sync()` wrapper during layer construction interacts correctly with Effect's fiber scheduler
   - Recommendation: Use `Effect.sync(() => dialog.showMessageBoxSync(...))` which is safe because it runs synchronously on the current fiber. Test this path manually.

3. **Rebuild for Electron's Node.js ABI**
   - What we know: `better-sqlite3` ships prebuilt binaries. If no prebuild matches Electron 41's Node ABI, `electron-rebuild` runs automatically via Forge.
   - What's unclear: Whether `better-sqlite3@12.8.0` has prebuilds for Electron 41's exact ABI
   - Recommendation: After `npm install better-sqlite3`, check if `npm start` works. If not, run `npx electron-rebuild -f -w better-sqlite3` to rebuild.

## Sources

### Primary (HIGH confidence)
- [@effect/sql-sqlite-node SqliteClient.ts source](https://github.com/Effect-TS/effect/blob/main/packages/sql-sqlite-node/src/SqliteClient.ts) -- Layer constructor, WAL mode, Scope.addFinalizer, SqliteClientConfig interface
- [@effect/sql README.md](https://github.com/Effect-TS/effect/blob/main/packages/sql/README.md) -- Tagged template query syntax, sql.insert, sql.unsafe
- [Electron dialog API](https://www.electronjs.org/docs/latest/api/dialog) -- showMessageBoxSync usage, pre-ready safety
- [SQLite PRAGMA documentation](https://sqlite.org/pragma.html) -- quick_check behavior and performance
- [Electron native modules tutorial](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules) -- electron-rebuild, ASAR handling

### Secondary (MEDIUM confidence)
- [Electron Forge issue #3934](https://github.com/electron/forge/issues/3934) -- AutoUnpackNatives regression, workaround configurations (open issue, multiple user confirmations)
- [Electron Forge issue #3738](https://github.com/electron/forge/issues/3738) -- Vite plugin ASAR packaging issues (open issue)
- [Electron Forge Vite plugin docs](https://www.electronforge.io/config/plugins/vite) -- External module configuration guidance
- [Effect-TS examples Sql.ts](https://github.com/Effect-TS/examples/blob/main/examples/http-server/src/Sql.ts) -- Layer composition pattern with SqliteMigrator
- [Challenges Building an Electron App](https://www.danielcorin.com/posts/2024/challenges-building-an-electron-app/) -- Practical better-sqlite3 + Forge packaging experience

### Tertiary (LOW confidence)
- [Integrating SQLite with Electron Forge blog](https://blog.loarsaw.de/using-sqlite-with-electron-electron-forge) -- Community blog post with forge config examples (rate-limited, could not fully verify)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- `@effect/sql-sqlite-node` API verified from source code; version compatibility confirmed against npm registry
- Architecture: HIGH -- follows established project patterns (ClaudeCli service as reference); layer composition verified against existing `src/main.ts`
- Native module packaging: MEDIUM -- workarounds verified from multiple GitHub issues but not tested on this exact project+version combination; #3934 is still open
- Pitfalls: MEDIUM -- aggregated from multiple sources; some configurations need validation during implementation

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable ecosystem; main risk is Forge fixing #3934 which would simplify packaging config)
