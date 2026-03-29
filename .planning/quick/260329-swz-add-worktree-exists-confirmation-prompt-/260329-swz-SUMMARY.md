---
phase: quick
plan: 260329-swz
subsystem: ui/dialog
tags: [worktree, ux, d-12]
dependency_graph:
  requires: [checkWorktreeExistsAtom]
  provides: [worktree-exists-confirmation-prompt]
  affects: [create-session-dialog]
tech_stack:
  patterns: [debounced-effect-check, useAtomSet-promise-mode]
key_files:
  modified:
    - src/components/create-session-dialog.tsx
decisions:
  - "Used useAtomSet with mode: 'promise' to get async return from checkWorktreeExistsAtom"
  - "Added null check on result.path alongside exists check for type narrowing (avoids as-cast)"
metrics:
  duration: 3min
  completed: 2026-03-29
---

# Quick Task 260329-swz: Add Worktree-Exists Confirmation Prompt Summary

Debounced worktree existence check in CreateSessionDialog with amber inline message and dynamic submit button text via useAtomSet promise mode on checkWorktreeExistsAtom.

## What Was Done

### Task 1: Add worktree-exists check and inline prompt to CreateSessionDialog

Added a complete worktree-exists detection flow to CreateSessionDialog:

- New `worktreeCheck` state tracking whether an existing worktree was found
- `checkWorktreeExistsAtom` dispatched via `useAtomSet` with `mode: "promise"` to get the async result
- A `useEffect` with 300ms debounce that fires when `branchName`, `useWorktree`, `open`, `isGitRepo`, or `cwd` change
- Guard clause resets state when conditions are not met (dialog closed, no branch, checkbox unchecked)
- Amber `FieldDescription` message when worktree exists: shows the existing path and informs user it will be reused
- Submit button text changes from "Create Session" to "Use Existing Worktree" when an existing worktree is detected
- State properly resets on dialog close

**Commit:** f10175f

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] useAtomSet returns void by default, not Promise**

- **Found during:** Task 1
- **Issue:** `useAtomSet(checkWorktreeExistsAtom)` returns void, so `.then()` was not available
- **Fix:** Used `useAtomSet(checkWorktreeExistsAtom, { mode: "promise" })` to get Promise-returning dispatch
- **Files modified:** src/components/create-session-dialog.tsx
- **Commit:** f10175f

**2. [Rule 1 - Bug] result.path can be null per atom return type**

- **Found during:** Task 1 (typecheck)
- **Issue:** `result.path` is typed `string | null`, cannot assign to `{ path: string }` state
- **Fix:** Added `result.path !== null` guard alongside `result.exists` check for proper type narrowing
- **Files modified:** src/components/create-session-dialog.tsx
- **Commit:** f10175f

## Verification

- typecheck: PASSED
- biome check: PASSED (no fixes needed)
- tests: PASSED (216/216)

## Known Stubs

None.

## Self-Check: PASSED

- File `src/components/create-session-dialog.tsx`: FOUND
- Commit `f10175f`: FOUND
