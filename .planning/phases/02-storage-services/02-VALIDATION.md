---
phase: 2
slug: storage-services
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-25
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.1 |
| **Config file** | `vitest.config.mts` |
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
| 02-01-01 | 01 | 1 | EVNT-01 | unit | `npx vitest run src/services/database/event-store/__tests__/service.test.ts -t "append"` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | EVNT-02 | unit | `npx vitest run src/services/database/event-store/__tests__/service.test.ts -t "user message"` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | EVNT-03 | unit | `npx vitest run src/services/database/event-store/__tests__/service.test.ts -t "session"` | ❌ W0 | ⬜ pending |
| 02-01-04 | 01 | 1 | EVNT-04 | unit | `npx vitest run src/services/database/event-store/__tests__/service.test.ts -t "sequence"` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 1 | TAB-01 | unit | `npx vitest run src/services/database/tab-store/__tests__/service.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 1 | D-05/D-09 | unit | `npx vitest run src/services/database/tab-store/__tests__/service.test.ts -t "cascade"` | ❌ W0 | ⬜ pending |
| 02-00-01 | 00 | 0 | D-06 | unit | `npx vitest run src/services/database/__tests__/schema.test.ts` | ✅ (update) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/services/database/event-store/__tests__/service.test.ts` — stubs for EVNT-01 through EVNT-04
- [ ] `src/services/database/event-store/__tests__/schemas.test.ts` — covers StoredEvent decode, UserMessageEvent
- [ ] `src/services/database/tab-store/__tests__/service.test.ts` — stubs for TAB-01, D-05/D-09 cascade
- [ ] `src/services/database/tab-store/__tests__/schemas.test.ts` — covers Tab, TabCreate, TabUpdate schemas
- [ ] Update `src/services/database/__tests__/schema.test.ts` — verify D-06 column removal

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
