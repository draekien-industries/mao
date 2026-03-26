---
phase: 03
slug: write-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| {N}-01-01 | 01 | 1 | WPIPE-01 | unit | `npm test` | ❌ W0 | ⬜ pending |
| {N}-01-02 | 01 | 1 | WPIPE-02 | unit | `npm test` | ❌ W0 | ⬜ pending |
| {N}-01-03 | 01 | 1 | WPIPE-03 | unit | `npm test` | ❌ W0 | ⬜ pending |
| {N}-01-04 | 01 | 1 | WPIPE-04 | unit | `npm test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Test stubs for WPIPE-01 through WPIPE-04
- [ ] Shared fixtures for EventStore and ClaudeCli mocks

*Existing infrastructure covers test framework — vitest already installed.*

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
