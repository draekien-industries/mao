---
phase: 03
slug: write-pipeline
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-26
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | WPIPE-01, WPIPE-02, WPIPE-03, WPIPE-04 | unit | `npm test` | ❌ W0 (Plan 01 Task 1 creates) | ⬜ pending |
| 03-01-02 | 01 | 1 | WPIPE-01, WPIPE-02, WPIPE-03, WPIPE-04 | unit | `npm test` | ❌ W0 (Plan 01 Task 1 creates) | ⬜ pending |
| 03-02-01 | 02 | 2 | WPIPE-04 | integration | `npm run typecheck && npm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Test stubs for WPIPE-01 through WPIPE-04 — fulfilled by Plan 01 Task 1 (TDD RED phase)
- [x] Shared fixtures for EventStore and ClaudeCli mocks — fulfilled by Plan 01 Task 1

*Existing infrastructure covers test framework — vitest already installed. Plan 01 Task 1 is the Wave 0 step that creates all test files.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Stream transparency | WPIPE-04 | Requires visual confirmation renderer output unchanged | Run app, open tab, verify stream renders normally |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
