---
phase: 1
slug: sqlite-infrastructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-25
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.1 |
| **Config file** | `vitest.config.mts` |
| **Quick run command** | `npx vitest run src/services/database` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/services/database`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | INFRA-02 | unit | `npx vitest run src/services/database/__tests__/service.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | INFRA-03 | unit | `npx vitest run src/services/database/__tests__/service.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 1 | INFRA-04 | unit | `npx vitest run src/services/database/__tests__/service.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-04 | 01 | 1 | SAFE-02 | unit | `npx vitest run src/services/database/__tests__/service.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 2 | INFRA-01 | manual | `npm run package` + launch | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/services/database/__tests__/service.test.ts` — stubs for INFRA-02, INFRA-03, INFRA-04, SAFE-02
- [ ] `src/services/database/__tests__/errors.test.ts` — error formatting coverage
- [ ] `src/services/database/__tests__/schema.test.ts` — SQL statement validity checks

*Tests use `os.tmpdir()` for database files, not `app.getPath('userData')`*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Native module loads in packaged build | INFRA-01 | Requires `npm run package` and launching the built executable; cannot be automated in unit tests | 1. Run `npm run package` 2. Launch packaged executable from `out/` directory 3. Verify app starts without crash 4. Check logs for database connection success |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
