---
phase: 05-renderer-integration
plan: 02
subsystem: api
tags: [effect-ts, managed-runtime, graceful-shutdown, electron]

# Dependency graph
requires:
  - phase: 04-session-reconstruction
    provides: ManagedRuntime and layer composition pattern in main.ts
provides:
  - TabRuntimeManager service with per-tab ManagedRuntime lifecycle
  - Graceful shutdown with per-tab disposal before main runtime disposal
  - Behavioral test coverage for shutdown disposal ordering
affects: [05-renderer-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: [per-tab ManagedRuntime isolation, Ref HashMap state management, shutdown disposal ordering]

key-files:
  created:
    - src/services/tab-runtime-manager/service-definition.ts
    - src/services/tab-runtime-manager/service.ts
    - src/services/tab-runtime-manager/__tests__/service.test.ts
    - src/services/__tests__/shutdown.test.ts
  modified:
    - src/main.ts

key-decisions:
  - "Used ManagedRuntime.make(Layer.empty) as scaffold for per-tab runtimes; real ClaudeCliLive wiring is future work"
  - "Used Cause.UnknownException for typed catch in tryPromise disposal calls"

patterns-established:
  - "TabRuntimeManager pattern: Ref<HashMap> for tracking per-tab runtime instances"
  - "Shutdown ordering: per-tab disposal with error resilience before main runtime disposal"

requirements-completed: [SAFE-01]

# Metrics
duration: 5min
completed: 2026-03-29
---

# Phase 05 Plan 02: Graceful Shutdown and Per-Tab Runtime Infrastructure Summary

**TabRuntimeManager service with Ref<HashMap> lifecycle tracking and shutdown disposal ordering ensuring per-tab runtimes dispose before main runtime**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-29T01:20:23Z
- **Completed:** 2026-03-29T01:25:14Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- TabRuntimeManager service with getOrCreate/dispose/disposeAll using Ref<HashMap> for per-tab ManagedRuntime tracking
- Shutdown disposal ordering: per-tab runtimes dispose before main runtime, with error resilience
- 7 new tests (4 service unit tests + 3 behavioral shutdown ordering tests), all passing with no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Create TabRuntimeManager service** - `5ba6eb5` (test: RED) then `a17ec4b` (feat: GREEN)
2. **Task 2: Create shutdown disposal ordering test** - `bb3870b` (test)
3. **Task 3: Wire TabRuntimeManager into main.ts** - `ccf9d0d` (feat)

_Note: Task 1 followed TDD with RED/GREEN commits_

## Files Created/Modified
- `src/services/tab-runtime-manager/service-definition.ts` - TabRuntimeManager Context.Tag with TabRuntime interface
- `src/services/tab-runtime-manager/service.ts` - Layer implementation with Ref<HashMap> state, ManagedRuntime.make(Layer.empty) scaffold
- `src/services/tab-runtime-manager/__tests__/service.test.ts` - 4 tests: create, idempotency, dispose, disposeAll
- `src/services/__tests__/shutdown.test.ts` - 3 behavioral tests: ordering, error resilience, per-tab-first contract
- `src/main.ts` - Added TabRuntimeManagerLayer to BaseLayer, extended before-quit handler

## Decisions Made
- Used `ManagedRuntime.make(Layer.empty)` as scaffold for per-tab runtimes. Real per-tab ClaudeCliLive wiring is deferred to future plans.
- Used `Cause.UnknownException` in `tryPromise` catch callbacks to satisfy the Effect language service typed-catch rule.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed untyped catch in tryPromise**
- **Found during:** Task 3 (typecheck verification)
- **Issue:** `catch: (error) => error` returns `unknown`, triggering Effect language service warning TS31
- **Fix:** Changed to `catch: (error) => new Cause.UnknownException(error)` for typed error handling
- **Files modified:** src/services/tab-runtime-manager/service.ts
- **Verification:** `npm run typecheck` passes with no warnings for tab-runtime-manager files
- **Committed in:** ccf9d0d (part of Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor typing improvement for correctness. No scope creep.

## Issues Encountered
None

## Known Stubs
- `src/services/tab-runtime-manager/service.ts` line 32: `ManagedRuntime.make(Layer.empty)` - intentional scaffold; per-tab ClaudeCliLive wiring will be implemented in a future plan when per-tab CLI process isolation is built

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- TabRuntimeManager is wired into main process and ready for per-tab CLI process isolation
- Shutdown ordering is tested and verified
- Next plan can build on this foundation to wire real per-tab layers

---
*Phase: 05-renderer-integration*
*Completed: 2026-03-29*

## Self-Check: PASSED
