# Phase 1: SQLite Infrastructure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-03-25
**Phase:** 01-sqlite-infrastructure
**Areas discussed:** SQLite library choice, Corruption response, Schema bootstrapping

---

## SQLite Library Choice

### Q1: Which SQLite library should the persistence layer use?

| Option | Description | Selected |
|--------|-------------|----------|
| @effect/sql-sqlite-node (Recommended) | Effect's SQL client built on better-sqlite3. Provides tagged template queries, connection management as an Effect Layer (acquireRelease built-in), transactions via Effect.gen, and consistent patterns with the rest of the Effect codebase. Native module packaging concern applies equally -- it still uses better-sqlite3 under the hood. | Y |
| Raw better-sqlite3 | Direct synchronous API. Simpler dependency, more control over connection lifecycle, but you'd need to manually wrap it in an Effect Layer and write your own acquireRelease. Queries would be plain JS method calls rather than tagged templates. | |
| @effect/sql-sqlite-wasm | WebAssembly-based SQLite -- no native module packaging concerns at all (no AutoUnpackNatives needed). Trades away the synchronous API and some performance, but completely eliminates the ASAR/native module risk flagged in STATE.md. | |

**User's choice:** @effect/sql-sqlite-node (Recommended)
**Notes:** None

### Q2: Layer design -- project-owned tag vs direct SqlClient?

| Option | Description | Selected |
|--------|-------------|----------|
| Project-owned Database tag (Recommended) | A thin wrapper: Database service that depends on SqlClient internally, runs WAL PRAGMA + integrity check on acquire, exposes the SqlClient for downstream services. Follows the existing pattern (ClaudeCli wraps CommandExecutor). | Y |
| Direct SqlClient passthrough | Just configure @effect/sql-sqlite-node's Layer with the right path and expose SqlClient directly. WAL + integrity check run as startup Effects rather than being part of the Layer. Simpler, but less encapsulated. | |

**User's choice:** Project-owned Database tag (Recommended)
**Notes:** None

---

## Corruption Response

### Q1: What should the app do when startup integrity check detects corruption?

| Option | Description | Selected |
|--------|-------------|----------|
| Log warning + continue (Recommended) | Log a structured warning via Effect.logWarning with corruption details. The app starts normally. Rationale: partial corruption often affects only some rows -- the user can still use the app for new sessions. A future phase could add user-facing notification. | |
| Show dialog + let user choose | Display an Electron dialog: 'Database may be corrupted. Continue anyway / Reset database.' Gives the user control but adds UI complexity in Phase 1 (an infrastructure phase). | Y |
| Log warning + mark DB read-only | Log the warning and disable writes (new events won't persist). The app functions for new sessions but won't corrupt data further. Adds complexity to the write pipeline in Phase 3. | |

**User's choice:** Show dialog + let user choose
**Notes:** User prefers giving the user control over silent degradation.

### Q2: What should 'Reset database' mean?

| Option | Description | Selected |
|--------|-------------|----------|
| Delete and recreate (Recommended) | Delete the corrupted .db file (and WAL/SHM files), then create a fresh database. Simple, predictable. All conversation history is lost, but the app starts clean. | Y |
| Rename old + create new | Rename the corrupted file to .db.corrupt.{timestamp} for potential manual recovery, then create a fresh database. Slightly more complex but preserves the corrupted file for debugging. | |

**User's choice:** Delete and recreate (Recommended)
**Notes:** None

---

## Schema Bootstrapping

### Q1: Should Phase 1 create tables or leave that to Phase 2?

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 1 creates tables (Recommended) | The Database Layer runs CREATE TABLE IF NOT EXISTS on acquire. Tables are ready when Phase 2 starts building storage services. Clean separation: Phase 1 owns the schema, Phase 2 owns the queries. Also means Phase 1's integrity check can verify table structure. | Y |
| Phase 2 creates tables | Phase 1 delivers only a bare SQLite connection + WAL + integrity. Phase 2's EventStore/TabStore create their own tables on first use. Each service owns its own schema. More modular, but integrity checks in Phase 1 can't verify table structure. | |
| Phase 1 creates a migration runner | A simple PRAGMA user_version-based migration system that runs CREATE TABLE statements. Overkill for v1 (REQUIREMENTS.md explicitly defers migration tooling), but sets up for future schema changes. | |

**User's choice:** Phase 1 creates tables (Recommended)
**Notes:** None

---

## Claude's Discretion

- Table column definitions and exact schema design
- Native module packaging approach
- Error type design for database operations
- Database file naming and path construction

## Deferred Ideas

None -- discussion stayed within phase scope.
