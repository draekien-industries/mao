# Phase 1: SQLite Infrastructure - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish a working SQLite database on the user's machine, managed as an Effect Layer with acquireRelease semantics. This includes native module packaging for Electron, database creation in the user's data directory, WAL mode, schema bootstrapping (table creation), and a startup integrity check with user-facing corruption dialog. The database connection and tables are ready for Phase 2's storage services to build queries on top of.

</domain>

<decisions>
## Implementation Decisions

### SQLite Library
- **D-01:** Use `@effect/sql-sqlite-node` as the SQLite library (not raw `better-sqlite3`). This provides tagged template queries, connection management as an Effect Layer with acquireRelease built-in, transactions via Effect.gen, and consistent patterns with the rest of the Effect codebase. Native module packaging concerns apply equally since it uses better-sqlite3 under the hood.

### Layer Design
- **D-02:** Create a project-owned `Database` service tag that wraps the `SqlClient` internally. The Database Layer runs WAL PRAGMA setup and integrity checks on acquire, and exposes the SqlClient for downstream services. This follows the existing pattern where `ClaudeCli` wraps `CommandExecutor`.

### Corruption Response
- **D-03:** When the startup integrity check (`PRAGMA quick_check`) detects corruption, show an Electron dialog to the user with two choices: "Continue anyway" or "Reset database."
- **D-04:** "Reset database" means delete the corrupted `.db` file (and WAL/SHM files), then create a fresh database. All conversation history is lost, but the app starts clean. No backup/rename of the corrupted file.

### Schema Bootstrapping
- **D-05:** Phase 1 creates the database tables (events, tabs) as part of the Database Layer setup using `CREATE TABLE IF NOT EXISTS`. Phase 1 owns the schema definition; Phase 2 owns the queries. This means the integrity check can also verify table structure, and Phase 2 starts with tables already in place.

### Claude's Discretion
- Table column definitions and exact schema design (guided by REQUIREMENTS.md EVNT-01 through EVNT-04 and TAB-01)
- Native module packaging approach (AutoUnpackNativesPlugin, electron-rebuild, Vite externals configuration)
- Error type design for database operations (TaggedError classes following existing pattern)
- Database file naming and exact path construction within app.getPath('userData')

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` -- INFRA-01 through INFRA-04 and SAFE-02 define the acceptance criteria for this phase; EVNT-01 through EVNT-04 and TAB-01 define the table schemas that Phase 1 must create

### Architecture
- `.planning/codebase/ARCHITECTURE.md` -- Layer composition pattern and process model
- `.planning/codebase/CONVENTIONS.md` -- Effect-TS service patterns (service-definition.ts, service.ts, errors.ts structure)
- `.planning/codebase/STRUCTURE.md` -- Where to add new services (src/services/<name>/)
- `.planning/codebase/CONCERNS.md` -- Flags AutoUnpackNativesPlugin regression (#3934)

### Existing Code
- `src/main.ts` -- Layer composition (BaseLayer, ServerLayer) and runtime lifecycle (before-quit disposal)
- `src/services/claude-cli/service.ts` -- Reference implementation for service pattern (wrapping a platform dependency)
- `src/services/claude-cli/service-definition.ts` -- Reference implementation for Context.Tag definition
- `src/services/claude-cli/errors.ts` -- Reference implementation for TaggedError pattern
- `forge.config.ts` -- Electron Forge config that needs native module packaging additions

### Project Context
- `.planning/PROJECT.md` -- Constraints section (Effect-TS patterns, local only, no partial data, performance)
- `.planning/STATE.md` -- Blocker note about @effect/sql-sqlite-node + Electron Forge Vite plugin limited precedent

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/services/diagnostics.ts` -- Structured logging with annotations; the Database service should add its own annotation keys
- Effect Logger infrastructure (DevLogger/ProdLogger) -- already composed into ServerLayer
- `before-quit` handler in `src/main.ts` -- runtime.dispose() will automatically trigger the Database Layer's acquireRelease cleanup

### Established Patterns
- **Service structure**: `service-definition.ts` (Context.Tag) + `service.ts` (Layer.effect implementation) + `errors.ts` (Schema.TaggedError classes) -- follow this exactly for the Database service
- **Layer composition**: `Layer.provideMerge` chain in `src/main.ts` -- the Database Layer slots between NodeContext and ClaudeCliLive
- **Error handling**: TaggedError union with format function, `Effect.mapError` for wrapping platform errors
- **Logging**: `Effect.annotateLogs("service", "database")` pattern with structured annotation keys

### Integration Points
- `src/main.ts:17-24` -- BaseLayer composition; Database Layer needs to be added here so downstream services can depend on it
- `forge.config.ts` -- Needs `@electron-forge/plugin-auto-unpack-natives` added to plugins array for native module support
- `vite.main.config.mts` -- May need `better-sqlite3` added to Vite externals so it's not bundled into the ASAR
- `package.json` -- Needs `@effect/sql-sqlite-node` and `@effect/sql` as dependencies

</code_context>

<specifics>
## Specific Ideas

No specific requirements -- open to standard approaches for the technical implementation within the decisions above.

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope.

</deferred>

---

*Phase: 01-sqlite-infrastructure*
*Context gathered: 2026-03-25*
