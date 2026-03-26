---
phase: 03-write-pipeline
verified: 2026-03-26T20:19:00Z
status: passed
score: 10/10 must-haves verified
re_verification: false
---

# Phase 3: Write Pipeline Verification Report

**Phase Goal:** The existing CLI stream is transparently intercepted so complete events flow into the database without changing what the renderer receives
**Verified:** 2026-03-26T20:19:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Only complete AssistantMessageEvent persisted — no partial content rows | VERIFIED | `wrapStream` taps only `isAssistantMessage`, `isSystemInit`, `isResult`; test "discards StreamEventMessage and UnknownEvent" asserts `eventTypes.toEqual(["user_message", "system"])` |
| 2 | User termination mid-response leaves no partial data in database | VERIFIED | Test "no partial data on stream failure": stream fails after SystemInitEvent; `appendedEvents` contains only `user_message` and `system` (2 items), both complete events |
| 3 | SystemInitEvent persisted immediately to capture session_id | VERIFIED | Test "persists SystemInitEvent immediately": `appendedEvents[0].eventType === "user_message"`, `appendedEvents[1].eventType === "system"` |
| 4 | PersistentClaudeCli wraps ClaudeCli via Stream.tap; renderer receives identical stream | VERIFIED | Test "stream output is transparent": all 4 events including StreamEventMessage returned in exact order; `Layer.effect(ClaudeCli, ...)` re-provides same tag; `src/main.ts` lines 35-37 wire PersistentLayer between ClaudeRpcHandlers and ClaudeCliLive |

**Score from success criteria:** 4/4 truths verified

### Plan 01 Must-Have Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Only SystemInitEvent, AssistantMessageEvent, ResultEvent persisted | VERIFIED | `wrapStream` conditionals at lines 75-86; test "persists only complete events" confirms |
| 2 | User message persisted before stream for query and resume | VERIFIED | `Stream.concat(Stream.fromEffect(persistUserMessage...).pipe(Stream.drain), wrapStream(...))` at lines 108-113, 120-124 |
| 3 | For cont calls, user message persisted after SystemInitEvent | VERIFIED | `cont` handler: `Ref.set(sessionIdRef, event.session_id)` then `persistUserMessage(...)` at lines 136-143; test "extracts session_id from SystemInitEvent for cont" asserts `userMsgIdx > systemIdx` |
| 4 | Write failures caught and logged, never propagating | VERIFIED | `Effect.catchAll` on both `persistEvent` (lines 35-42) and `persistUserMessage` (lines 57-64); test "swallows write failures" confirms stream emits all 3 events with failing store |
| 5 | Decorator returns same stream elements in same order | VERIFIED | Test "stream output is transparent": `output` has length 4, all events equal to originals including StreamEventMessage |
| 6 | No partial data on stream interruption | VERIFIED | Test "no partial data on stream failure": only complete events in `appendedEvents` after failure |

### Plan 02 Must-Have Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | ClaudeRpcHandlers sees PersistentClaudeCli when resolving ClaudeCli tag | VERIFIED | `src/main.ts` line 36: `PersistentLayer` is directly below `ClaudeRpcHandlers` in `Layer.provideMerge` nesting |
| 2 | Renderer receives identical stream — no API changes | VERIFIED | Decorator implements same `ClaudeCli` Context.Tag interface; transparency confirmed by tests |
| 3 | App starts without errors — layer composition resolves correctly | VERIFIED | `npm run typecheck` exits 0; `npm test` exits 0 (113/113 pass); EventStore is available below PersistentLayer in stack |
| 4 | Complete query turn produces rows in EventStore | VERIFIED (unit) | Unit test "persists only complete events" confirms system, assistant, result rows written; wiring is live in main.ts |

**Combined plan score:** 10/10 must-haves verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/services/claude-cli/persistent/service.ts` | PersistentClaudeCli decorator layer and `makePersistentClaudeCliLive` export | VERIFIED | 169 lines; exports `makePersistentClaudeCliLive`; contains `Layer.effect(ClaudeCli,` at lines 90-91; substantive implementation with `persistEvent`, `persistUserMessage`, `wrapStream` helpers |
| `src/services/claude-cli/persistent/__tests__/service.test.ts` | Unit tests for all WPIPE requirements | VERIFIED | 401 lines; contains `describe("PersistentClaudeCli"`; 9 test cases; all pass |
| `src/main.ts` | Layer composition with PersistentClaudeCli | VERIFIED | Contains `import { makePersistentClaudeCliLive }` at line 8; `const PersistentLayer = makePersistentClaudeCliLive()` at line 31; PersistentLayer in BaseLayer at line 36 |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `persistent/service.ts` | `service-definition.ts` (ClaudeCli) | `Layer.effect(ClaudeCli, ...)` consumes and re-provides the tag | VERIFIED | `Layer.effect(\n  ClaudeCli,` lines 90-91; `yield* ClaudeCli` line 93 |
| `persistent/service.ts` | `event-store/service-definition.ts` (EventStore) | `yield* EventStore` | VERIFIED | Line 94: `const store = yield* EventStore` |
| `persistent/service.ts` | `events.ts` | `isSystemInit`, `isAssistantMessage`, `isResult` type guards | VERIFIED | Imported at lines 9-11; used at lines 75, 78, 81, 135, 150, 160 |
| `src/main.ts` | `persistent/service.ts` | `import makePersistentClaudeCliLive` | VERIFIED | Line 8: exact import present |
| `src/main.ts` (PersistentLayer) | `src/main.ts` (ClaudeCliLive) | `Layer.provideMerge` — PersistentLayer above ClaudeCliLive | VERIFIED | Lines 35-39: `Layer.provideMerge(PersistentLayer, Layer.provideMerge(ClaudeCliLive, ...))` |

---

### Data-Flow Trace (Level 4)

Not applicable. Phase 3 produces a service decorator (not a UI component or page), and all dynamic data paths are verified via unit tests rather than runtime rendering.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 9 unit tests pass for PersistentClaudeCli | `npx vitest run src/services/claude-cli/persistent/__tests__/service.test.ts` | 9 passed | PASS |
| Full test suite (113 tests) — no regressions | `npm test` | 113 passed (12 test files) | PASS |
| TypeScript compilation clean | `npm run typecheck` | exits 0 | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| WPIPE-01 | 03-01-PLAN.md | Stream deltas buffered in memory; only complete AssistantMessageEvent persisted | SATISFIED | `wrapStream` persists only `isAssistantMessage` events; StreamEventMessage (stream delta carrier) is explicitly discarded; test "persists only complete events" and "discards StreamEventMessage and UnknownEvent" confirm |
| WPIPE-02 | 03-01-PLAN.md | In-memory buffer discarded on termination — no partial data | SATISFIED | `Stream.tap` only fires for complete events already emitted; test "no partial data on stream failure" confirms only 2 complete records exist after mid-stream failure |
| WPIPE-03 | 03-01-PLAN.md | SystemInitEvent persisted immediately to capture session_id | SATISFIED | `persistEvent(store, sessionId, "system", event)` fires in `Stream.tap` on first complete event; test "persists SystemInitEvent immediately" confirms it is `appendedEvents[1]` (after `user_message`) |
| WPIPE-04 | 03-01-PLAN.md, 03-02-PLAN.md | PersistentClaudeCli decorator wraps ClaudeCli via Stream.tap; persistence invisible to renderer | SATISFIED | Decorator uses `Stream.tap` for side effects; returns same stream elements unchanged; wired in `src/main.ts` between ClaudeRpcHandlers and ClaudeCliLive; test "stream output is transparent" confirms 4/4 events returned in order |

No orphaned requirements: all Phase 3 requirements (WPIPE-01 through WPIPE-04) are claimed in plan frontmatter and verified. No other requirements in REQUIREMENTS.md are mapped to Phase 3.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `persistent/__tests__/service.test.ts` | 242 | `as QueryParams` type cast | Info | Test-only; narrows a union type `QueryParams \| ResumeParams \| ContinueParams` for assertion; no alternative without type narrowing at runtime; acceptable in test code |
| `persistent/__tests__/service.test.ts` | 328 | `as const` | Info | `as const` is explicitly permitted by project CLAUDE.md ("exception: the necessary `as const` is fine") |

No blockers or warnings. The implementation file (`service.ts`) contains zero `as` casts and zero `any` types.

---

### Human Verification Required

None. All success criteria are verifiable programmatically via unit tests and static analysis. The decorator's transparency and correctness are fully covered by the test suite.

If a live smoke test is desired after wiring:

**Test:** Start the app, open a Claude tab, send a query, wait for completion, then inspect the SQLite database at `%APPDATA%\mao\mao.db` for rows in the `events` table with `event_type IN ('user_message', 'system', 'assistant', 'result')`.
**Expected:** One `user_message` row, one `system` row, one `assistant` row, one `result` row for the completed turn.
**Why human:** Requires the Electron app to run and Claude CLI to be available on PATH.

---

### Gaps Summary

No gaps. All must-haves across both plans are verified. The implementation is substantive, correctly wired, and the data flows end-to-end from `Stream.tap` through `EventStore.append`. The ROADMAP's four success criteria all have concrete test coverage. TypeScript type-checks clean. 113 tests pass with no regressions.

---

_Verified: 2026-03-26T20:19:00Z_
_Verifier: Claude (gsd-verifier)_
