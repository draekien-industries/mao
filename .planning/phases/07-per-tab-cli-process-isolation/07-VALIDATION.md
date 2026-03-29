---
phase: 7
slug: per-tab-cli-process-isolation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-29
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` (inherits from vite configs) |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | SAFE-01 | unit | `npm test` | ✅ | ⬜ pending |
| 07-01-02 | 01 | 1 | SAFE-01 | unit | `npm test` | ✅ | ⬜ pending |
| 07-01-03 | 01 | 1 | SAFE-01 | unit | `npm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

- `src/services/tab-runtime-manager/__tests__/service.test.ts` — existing unit tests for TabRuntimeManager
- `src/services/__tests__/shutdown.test.ts` — existing shutdown sequence tests

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end tab create → runtime → dispose on quit | SAFE-01 | Requires running Electron app with real before-quit lifecycle | 1. Start app, 2. Create tab, 3. Quit app, 4. Check logs for runtime disposal |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
