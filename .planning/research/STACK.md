# Technology Stack

**Project:** Mao -- Data Persistence (SQLite Event Sourcing)
**Researched:** 2026-03-25

## Recommended Stack

### Database Engine

- **better-sqlite3** ~12.8.0
  - Purpose: SQLite database driver for the Electron main process
  - Why: Synchronous API is ideal for Electron's main process (no callback hell, no promise overhead for simple reads). Fastest SQLite binding for Node.js -- outperforms all async alternatives. The de facto standard for Electron + SQLite. Prebuilt binaries available for major platforms.
  - Confidence: HIGH (npm 12.8.0 published March 2026, 5000+ dependents, community consensus)

- **@types/better-sqlite3** (latest)
  - Purpose: TypeScript type definitions for better-sqlite3
  - Why: better-sqlite3 is a native C++ addon without built-in TypeScript types
  - Confidence: HIGH

### Effect SQL Integration

- **@effect/sql** ~0.49.0
  - Purpose: Core SQL abstraction layer providing SqlClient interface, tagged template SQL queries, and migration primitives
  - Why: Native Effect integration means all database operations return Effect values, compose with existing service layers, and participate in Effect's error channel and dependency injection. Eliminates the impedance mismatch of wrapping a non-Effect ORM.
  - Confidence: HIGH (official Effect ecosystem package, part of the Effect monorepo)

- **@effect/sql-sqlite-node** ~0.49.1
  - Purpose: SQLite-specific implementation of @effect/sql using better-sqlite3 under the hood
  - Why: Provides `SqliteClient.layer` for dependency injection, `SqliteMigrator.layer` for schema migrations, and tagged template literal SQL queries that return Effect values. This is the idiomatic way to use SQLite in an Effect-TS application. It wraps better-sqlite3 so you get the performance benefits without losing Effect integration.
  - Confidence: HIGH (official Effect ecosystem, published 17 days ago, wraps better-sqlite3)

### Build Tooling (additions to existing)

- **@electron/rebuild** (latest)
  - Purpose: Rebuild better-sqlite3's native bindings against the Electron version's Node.js ABI
  - Why: better-sqlite3 ships prebuilt binaries for standard Node.js, but Electron uses a different Node.js version internally. @electron/rebuild recompiles native modules to match. The scoped `@electron/` package is the current maintained version (the old `electron-rebuild` name is deprecated).
  - Confidence: HIGH (official Electron project, recommended in Electron docs)

### NOT Recommended

- **drizzle-orm**: While Drizzle has excellent TypeScript support and even a `drizzle-orm/effect-schema` validation integration, it adds an unnecessary abstraction layer. For event sourcing, the schema is simple (append-only events table + metadata tables). Drizzle's value proposition is complex relational queries and type-safe query building -- neither of which is needed here. Using `@effect/sql-sqlite-node` gives native Effect integration without a middleman. The Drizzle + Electron combination also has known pain points with `drizzle-kit` requiring a separate Node.js-compatible build of better-sqlite3 (NODE_MODULE_VERSION mismatch after electron-rebuild).

- **sql.js**: Pure JavaScript SQLite compiled via Emscripten. Avoids native module compilation but loads the entire database into memory. Significantly slower than better-sqlite3 for a native Electron app. Only use sql.js if you need browser/WASM compatibility, which is not the case here.

- **sqlite3 (node-sqlite3)**: Older async-callback-based SQLite binding. Slower than better-sqlite3, more complex API, less actively maintained. No reason to use this when better-sqlite3 exists.

- **better-sqlite3-multiple-ciphers**: Fork with encryption support. The Mao app stores CLI events locally on the user's machine -- there is no sensitive data that warrants database-level encryption. Adds compilation complexity for no benefit.

- **Prisma**: Heavy ORM with its own query engine binary. Overkill for a simple event store with 2-3 tables. Adds significant bundle size and startup time to an Electron app.

- **kysely**: Excellent type-safe query builder, but @effect/sql already provides tagged template SQL with full type safety via Effect Schema. Adding Kysely would mean wrapping a non-Effect library for no gain.

## Version Compatibility Notes

All `@effect/*` packages are released from the same monorepo and are version-coordinated. When installing:

- The existing project uses `effect` ^3.21.0, `@effect/platform` ^0.96.0, `@effect/platform-node` ^0.106.0
- Install `@effect/sql` and `@effect/sql-sqlite-node` with `^` ranges and npm will resolve compatible versions
- If version conflicts arise, update all `@effect/*` packages together (they follow a coordinated release cadence)

## Electron Native Module Configuration

### Vite Configuration (vite.main.config.mts)

better-sqlite3 must be marked as external in the main process Vite config so Vite does not attempt to bundle the native C++ addon:

```typescript
import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      external: ["better-sqlite3"],
    },
  },
});
```

### Forge Configuration (forge.config.ts)

The project already has `@electron-forge/plugin-auto-unpack-natives` in devDependencies but it is NOT configured in `forge.config.ts`. It must be added to ensure native `.node` binaries are extracted from the ASAR archive at runtime:

```typescript
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";

// In the plugins array:
new AutoUnpackNativesPlugin({}),
```

The `packagerConfig.asar` may also need an `unpack` pattern as a fallback:

```typescript
packagerConfig: {
  asar: {
    unpack: "**/*.node",
  },
},
```

### Rebuild Script

Add a rebuild script to package.json for development:

```json
{
  "scripts": {
    "rebuild": "electron-rebuild -f -w better-sqlite3"
  }
}
```

Or use `@electron/rebuild` directly. Electron Forge should handle this automatically during `make`/`package` if configured correctly, but an explicit rebuild script is useful for development and CI troubleshooting.

## SQLite Configuration (Runtime)

Set these pragmas on database open for optimal Electron performance:

```typescript
// WAL mode: allows concurrent reads during writes (critical for non-blocking UI)
db.pragma("journal_mode = WAL");

// Synchronous NORMAL: good balance of safety and speed for a local app
db.pragma("synchronous = NORMAL");

// Foreign keys: enforce referential integrity
db.pragma("foreign_keys = ON");
```

These should be set directly on the better-sqlite3 Database instance before passing it to the @effect/sql-sqlite-node layer, or configured via `SqliteClient.layer` options if supported.

## Installation

```bash
# Core persistence dependencies
npm install @effect/sql @effect/sql-sqlite-node better-sqlite3

# Type definitions
npm install -D @types/better-sqlite3

# Native module rebuild tool (if not already handled by Forge)
npm install -D @electron/rebuild
```

## Migration Strategy

@effect/sql provides `SqliteMigrator.layer` which:

- Reads migration files from a specified directory (or programmatic loader)
- Tracks applied migrations in a `_migrations` table
- Runs pending migrations in order on app startup
- Returns Effect values, composable with the existing service layer architecture

For this project, migrations run programmatically at app startup in the Electron main process -- no CLI tool needed at runtime. `drizzle-kit` is not required.

Migration files are TypeScript modules exporting an Effect that performs schema changes:

```typescript
// migrations/0001_create_events.ts
import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_events_session_id
    ON events(session_id)
  `;
});
```

## Database Location

Store the SQLite database in Electron's user data directory:

```typescript
import { app } from "electron";
import path from "path";

const dbPath = path.join(app.getPath("userData"), "mao.db");
```

This follows Electron conventions and survives app updates. The path varies by platform:

- Windows: `%APPDATA%/mao/mao.db`
- macOS: `~/Library/Application Support/mao/mao.db`
- Linux: `~/.config/mao/mao.db`

## Sources

- [better-sqlite3 on npm](https://www.npmjs.com/package/better-sqlite3) -- v12.8.0, published March 2026
- [@effect/sql-sqlite-node on npm](https://www.npmjs.com/package/@effect/sql-sqlite-node) -- v0.49.1
- [@effect/sql on npm](https://www.npmjs.com/package/@effect/sql) -- v0.49.0
- [Effect-TS SQL documentation (DeepWiki)](https://deepwiki.com/Effect-TS/effect/6.2-database-adapters-and-drivers)
- [Effect-TS Migrations (DeepWiki)](https://deepwiki.com/Effect-TS/effect/7.3-migrations-and-advanced-features)
- [@electron/rebuild on npm](https://www.npmjs.com/package/@electron/rebuild)
- [Electron Forge auto-unpack-natives plugin](https://www.electronforge.io/config/plugins/auto-unpack-natives)
- [Integrating SQLite with Electron Forge (blog)](https://blog.loarsaw.de/using-sqlite-with-electron-electron-forge)
- [Drizzle ORM effect-schema docs](https://orm.drizzle.team/docs/effect-schema)
- [SQLite WAL mode with Drizzle (GitHub issue)](https://github.com/drizzle-team/drizzle-orm/issues/4968)
- [Electron Forge Vite plugin docs](https://www.electronforge.io/config/plugins/vite)
