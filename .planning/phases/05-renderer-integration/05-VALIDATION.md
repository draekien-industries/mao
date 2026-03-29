---
phase: 5
slug: renderer-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-29
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.1 |
| **Config file** | vitest.config.mts |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test && npm run typecheck`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | TAB-02 | unit | `npx vitest run src/atoms/__tests__/sidebar.test.ts -t "first tab"` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | TAB-03 | unit | `npx vitest run src/atoms/__tests__/sidebar.test.ts -t "reconstruct"` | ❌ W0 | ⬜ pending |
| 05-02-01 | 02 | 2 | D-09 | unit | `npx vitest run src/services/claude-cli/__tests__/events.test.ts -t "ToolResult"` | ❌ W0 | ⬜ pending |
| 05-02-02 | 02 | 2 | D-09 | unit | `npx vitest run src/services/claude-cli/persistent/__tests__/service.test.ts -t "tool_result"` | ❌ W0 | ⬜ pending |
| 05-02-03 | 02 | 2 | D-10 | unit | `npx vitest run src/services/database/session-reconstructor/__tests__/service.test.ts -t "tool_result"` | ❌ W0 | ⬜ pending |
| 05-03-01 | 03 | 3 | SAFE-01 | unit | `npx vitest run src/services/__tests__/shutdown.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/atoms/__tests__/sidebar.test.ts` — test stubs for reconstruction integration in loadProjectsAtom/setActiveTabAtom
- [ ] `src/services/claude-cli/__tests__/events.test.ts` — extend with ToolResultEvent decode tests
- [ ] `src/services/claude-cli/persistent/__tests__/service.test.ts` — extend with ToolResultEvent persistence cases
- [ ] `src/services/database/session-reconstructor/__tests__/service.test.ts` — extend with tool result reconstruction cases
- [ ] `src/services/__tests__/shutdown.test.ts` — new test file for per-tab runtime disposal order

*Existing infrastructure covers framework installation — Vitest already configured.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Skeleton loading visible during hydration | D-03 | Visual rendering timing | 1. Start app 2. Observe skeleton blocks appear briefly 3. Messages replace skeletons |
| Tab layout restored on app reopen | TAB-03 | Full Electron lifecycle | 1. Open app, create multiple tabs 2. Quit app 3. Reopen — all tabs present with correct projects |
| App quit does not lose data | SAFE-01 | OS-level quit signal | 1. Open app, send messages 2. Quit via Cmd+Q / Alt+F4 3. Reopen — last persisted messages intact |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
