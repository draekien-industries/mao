---
phase: 03-write-pipeline
plan: 01
subsystem: database
tags: [effect-ts, stream, decorator, event-sourcing, persistence, tdd]

requires:
  - phase: 02-storage-services
    provides: EventStore service with append/getBySession/purgeSession API
provides:
  - PersistentClaudeCli decorator layer that transparently persists stream events
  - makePersistentClaudeCliLive factory function for layer composition
affects: [03-write-pipeline plan 02, 04-read-pipeline]

tech-stack:
  added: []
  patterns: [decorator layer pattern consuming and re-providing same Context.Tag, Stream.tap for side-effect persistence, Ref.unsafeMake for in-stream mutable state, Stream.concat for pre-stream effects]

key-files:
  created:
    - src/services/claude-cli/persistent/service.ts
    - src/services/claude-cli/persistent/__tests__/service.test.ts
  modified: []

key-decisions:
  - "Used Ref.unsafeMake for cont session_id tracking since the value is scoped to a single stream invocation"
  - "Used EventStoreService type alias instead of Context.Tag.Service for cleaner helper function signatures"
  - "Write failures swallowed via Effect.catchAll with structured logging instead of Effect.ignore to maintain observability"

patterns-established:
  - "Decorator layer pattern: Layer.effect(ClaudeCli, ...) consuming yield* ClaudeCli and yield* EventStore to intercept and re-provide the same service tag"
  - "Pre-stream persistence via Stream.concat(Stream.fromEffect(...).pipe(Stream.drain), wrappedStream)"
  - "Selective event persistence via type guard checks (isSystemInit, isAssistantMessage, isResult)"

requirements-completed: [WPIPE-01, WPIPE-02, WPIPE-03, WPIPE-04]

duration: 7min
completed: 2026-03-26
---

# Phase 03 Plan 01: PersistentClaudeCli Decorator Summary

**Effect-TS decorator layer that transparently intercepts ClaudeCli streams to persist complete events (system, assistant, result) and user messages to EventStore via Stream.tap**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-26T08:59:05Z
- **Completed:** 2026-03-26T09:05:45Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Implemented PersistentClaudeCli decorator that selectively persists only complete events (SystemInitEvent, AssistantMessageEvent, ResultEvent) while discarding StreamEventMessage, SystemRetryEvent, and UnknownEvent
- Pre-generates UUID session_id for query calls, uses existing session_id for resume, and extracts session_id from SystemInitEvent in-stream for cont calls
- 9 passing tests covering all WPIPE requirements plus write failure swallowing and session ID pre-generation

## Task Commits

Each task was committed atomically:

1. **Task 1: Write failing tests for PersistentClaudeCli decorator** - `5fd41cf` (test)
2. **Task 2: Implement PersistentClaudeCli decorator to make tests pass** - `d1671b3` (feat)

_TDD workflow: RED (test) then GREEN (feat). No refactor step needed._

## Files Created/Modified

- `src/services/claude-cli/persistent/service.ts` - Decorator layer with persistEvent, persistUserMessage, wrapStream helpers and makePersistentClaudeCliLive factory
- `src/services/claude-cli/persistent/__tests__/service.test.ts` - 9 test cases covering selective persistence, transparency, write failure swallowing, session_id pre-generation, and cont session_id extraction

## Decisions Made

- Used `Ref.unsafeMake("")` for cont session_id tracking since the Ref is scoped to a single stream invocation and does not need Effect context
- Defined `EventStoreService` type alias for helper function parameter types instead of using `Context.Tag.Service<typeof EventStore>` for readability
- Write failures are caught with `Effect.catchAll` plus structured logging annotations rather than silently ignored, maintaining observability

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added explicit parameter type annotations for noImplicitAny**
- **Found during:** Task 2 (Implementation)
- **Issue:** TypeScript strict mode reported TS7006 for implicit `any` on query/resume/cont method parameters inside the returned object literal
- **Fix:** Added explicit `QueryParams`, `ResumeParams`, `ContinueParams` type annotations to method parameters
- **Files modified:** src/services/claude-cli/persistent/service.ts
- **Verification:** `npx tsc --noEmit` exits 0
- **Committed in:** d1671b3 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor type annotation fix required by strict TypeScript config. No scope creep.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- PersistentClaudeCli decorator is ready for integration into the main process layer composition (Plan 02)
- The `makePersistentClaudeCliLive()` factory returns a Layer that slots between ClaudeCliLive and ClaudeRpcHandlers
- All 113 tests in the full suite pass with no regressions

## Self-Check: PASSED

- FOUND: src/services/claude-cli/persistent/service.ts
- FOUND: src/services/claude-cli/persistent/__tests__/service.test.ts
- FOUND: .planning/phases/03-write-pipeline/03-01-SUMMARY.md
- FOUND: commit 5fd41cf
- FOUND: commit d1671b3

---
*Phase: 03-write-pipeline*
*Completed: 2026-03-26*
