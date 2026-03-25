---
phase: 01-sqlite-infrastructure
plan: 01
subsystem: database
tags: [sqlite, better-sqlite3, effect-sql, electron-forge, native-modules, vite]

# Dependency graph
requires: []
provides:
  - "@effect/sql-sqlite-node, @effect/sql, better-sqlite3 installed as dependencies"
  - "Vite main config excludes better-sqlite3 from bundling via rollupOptions.external"
  - "Forge ASAR unpack config for native .node/.dylib binaries"
  - "Forge packagerConfig.ignore function preserving better-sqlite3 and transitive deps"
  - "DatabaseOpenError, DatabaseCorruptionError, DatabaseQueryError tagged error types"
  - "EVENTS_TABLE_SQL, EVENTS_SESSION_INDEX_SQL, TABS_TABLE_SQL schema constants"
  - "Database Context.Tag interface exposing SqlClient.SqlClient"
affects: [01-02-sqlite-infrastructure]

# Tech tracking
tech-stack:
  added: ["@effect/sql-sqlite-node", "@effect/sql", "better-sqlite3", "@types/better-sqlite3"]
  patterns: ["native module ASAR unpack with manual ignore function", "Database TaggedError union pattern"]

key-files:
  created:
    - "src/services/database/errors.ts"
    - "src/services/database/schema.ts"
    - "src/services/database/service-definition.ts"
  modified:
    - "package.json"
    - "forge.config.ts"
    - "vite.main.config.mts"

key-decisions:
  - "Used manual ASAR unpack + ignore function instead of AutoUnpackNativesPlugin (regression #3934)"
  - "Schema properties sorted alphabetically in TaggedError classes to match Biome useSortedProperties"

patterns-established:
  - "Database TaggedError pattern: DatabaseOpenError, DatabaseCorruptionError, DatabaseQueryError with format function"
  - "Native module packaging: external in Vite + ASAR unpack + packagerConfig.ignore for selective node_modules preservation"

requirements-completed: [INFRA-01]

# Metrics
duration: 3min
completed: 2026-03-25
---

# Phase 1 Plan 1: SQLite Dependencies and Database Contracts Summary

**SQLite native module packaging configured for Electron Forge with @effect/sql-sqlite-node, plus Database service contracts (errors, schema SQL, Context.Tag interface)**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-25T10:20:36Z
- **Completed:** 2026-03-25T10:23:48Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Installed @effect/sql-sqlite-node, @effect/sql, and better-sqlite3 with type definitions
- Configured Vite to exclude better-sqlite3 from bundling and Forge to unpack native binaries and preserve native module dependencies in packaged builds
- Created Database service contract files: three TaggedError types with union and format function, CREATE TABLE SQL for events and tabs matching REQUIREMENTS.md, and Database Context.Tag exposing SqlClient

## Task Commits

Each task was committed atomically:

1. **Task 1: Install SQLite dependencies and configure native module packaging** - `cb42145` (feat)
2. **Task 2: Create Database service contracts (errors, schema SQL, service definition)** - `d6219ec` (feat)

## Files Created/Modified
- `package.json` - Added @effect/sql-sqlite-node, @effect/sql, better-sqlite3 as dependencies; @types/better-sqlite3 as devDependency
- `forge.config.ts` - Changed asar to unpack config object; added ignore function preserving native modules
- `vite.main.config.mts` - Added build.rollupOptions.external for better-sqlite3
- `src/services/database/errors.ts` - DatabaseOpenError, DatabaseCorruptionError, DatabaseQueryError with union schema and format function
- `src/services/database/schema.ts` - EVENTS_TABLE_SQL, EVENTS_SESSION_INDEX_SQL, TABS_TABLE_SQL constants
- `src/services/database/service-definition.ts` - Database Context.Tag with SqlClient.SqlClient accessor

## Decisions Made
- Used manual ASAR unpack configuration (`asar: { unpack: "*.{node,dylib}" }`) plus a custom `packagerConfig.ignore` function instead of `AutoUnpackNativesPlugin`, which has a known regression (#3934) in Forge v7.4.0+
- Sorted schema properties alphabetically within TaggedError classes to satisfy Biome's useSortedProperties rule

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None - all files contain complete implementations as specified.

## Next Phase Readiness
- All SQLite packages installed and importable
- Build configuration handles native module packaging (Vite external + Forge ASAR unpack + ignore function)
- Database service contracts ready for Plan 02 to implement the DatabaseLive layer with SqliteClient, integrity checks, and schema bootstrapping
- Events and tabs table schemas match REQUIREMENTS.md specifications (EVNT-01 through EVNT-04, TAB-01)

## Self-Check: PASSED

All 6 files verified present. Both task commits (cb42145, d6219ec) verified in git log.

---
*Phase: 01-sqlite-infrastructure*
*Completed: 2026-03-25*
