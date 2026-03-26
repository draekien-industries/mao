---
phase: 02-storage-services
plan: 01
subsystem: database
tags: [effect-ts, schema, context-tag, sqlite, event-sourcing]

# Dependency graph
requires:
  - phase: 01-sqlite-infrastructure
    provides: Database Context.Tag, DatabaseQueryError, TABS_TABLE_SQL, EVENTS_TABLE_SQL
provides:
  - UserMessageEvent schema for storing user prompts
  - StoredEvent union schema for decoding persisted events
  - isUserMessage type guard for event discrimination
  - Tab, TabCreate, TabUpdate schemas for tab metadata
  - EventStore Context.Tag with append/getBySession/purgeSession interface
  - TabStore Context.Tag with CRUD + cascade delete interface
  - Updated TABS_TABLE_SQL without is_active and tab_order columns
affects: [02-02-PLAN, 02-03-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns: [StoredEvent union separate from ClaudeEvent, interface-first service design]

key-files:
  created:
    - src/services/database/event-store/schemas.ts
    - src/services/database/event-store/service-definition.ts
    - src/services/database/event-store/__tests__/schemas.test.ts
    - src/services/database/tab-store/schemas.ts
    - src/services/database/tab-store/service-definition.ts
    - src/services/database/tab-store/__tests__/schemas.test.ts
  modified:
    - src/services/database/schema.ts
    - src/services/database/__tests__/schema.test.ts

key-decisions:
  - "StoredEvent union kept separate from ClaudeEvent to avoid polluting CLI event types with persistence-only events"
  - "UserMessageEvent stores prompt only -- timestamp comes from created_at column"

patterns-established:
  - "StoredEvent union: ClaudeEvent members + UserMessageEvent, excluding StreamEventMessage, UnknownEvent as catchall last"
  - "Service interface files use Context.Tag with typed method signatures and DatabaseQueryError error channel"

requirements-completed: [EVNT-01, EVNT-02, TAB-01]

# Metrics
duration: 3min
completed: 2026-03-26
---

# Phase 02 Plan 01: Type Contracts and Service Interfaces Summary

**StoredEvent union schema, UserMessageEvent, Tab/TabCreate/TabUpdate schemas, and EventStore/TabStore Context.Tag service interfaces with full test coverage**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-26T07:11:34Z
- **Completed:** 2026-03-26T07:15:02Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Updated TABS_TABLE_SQL to remove is_active and tab_order columns per D-06 simplification
- Created StoredEvent union that wraps ClaudeEvent types plus UserMessageEvent (excluding StreamEventMessage) per D-02
- Defined EventStore and TabStore Context.Tag service interfaces with typed method signatures
- All 84 tests pass including 21 new schema decode and type guard tests

## Task Commits

Each task was committed atomically:

1. **Task 1: Update tabs schema and create EventStore + TabStore schema files with tests** - `99a0dd8` (feat)
2. **Task 2: Create EventStore and TabStore service-definition files** - `97b99d2` (feat)

## Files Created/Modified
- `src/services/database/schema.ts` - Updated TABS_TABLE_SQL DDL (removed is_active, tab_order)
- `src/services/database/__tests__/schema.test.ts` - Updated assertions, added negation tests for removed columns
- `src/services/database/event-store/schemas.ts` - UserMessageEvent, StoredEvent union, isUserMessage type guard
- `src/services/database/event-store/__tests__/schemas.test.ts` - Decode and type guard tests for event schemas
- `src/services/database/event-store/service-definition.ts` - EventStore Context.Tag (append, getBySession, purgeSession)
- `src/services/database/tab-store/schemas.ts` - Tab, TabCreate, TabUpdate schema classes
- `src/services/database/tab-store/__tests__/schemas.test.ts` - Decode tests for tab schemas
- `src/services/database/tab-store/service-definition.ts` - TabStore Context.Tag (create, delete, getAll, getById, update)

## Decisions Made
- StoredEvent union kept separate from ClaudeEvent to avoid polluting CLI event types with persistence-only events (UserMessageEvent)
- UserMessageEvent stores prompt text only; timestamp derived from the events table created_at column per D-01
- StreamEventMessage excluded from StoredEvent -- Phase 3 buffers and discards these, never persisted

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Type contracts and interfaces are fully defined for Plans 02 and 03 to implement against
- EventStore implementation (Plan 02) can proceed with append/getBySession/purgeSession against the defined interface
- TabStore implementation (Plan 03) can proceed with CRUD + cascade delete against the defined interface

## Self-Check: PASSED

All 8 files verified present. Both commit hashes (99a0dd8, 97b99d2) found in git log.

---
*Phase: 02-storage-services*
*Completed: 2026-03-26*
