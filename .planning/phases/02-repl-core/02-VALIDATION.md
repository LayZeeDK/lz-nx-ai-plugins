---
phase: 2
slug: repl-core
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-05
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                     |
| ---------------------- | --------------------------------------------------------- |
| **Framework**          | Vitest 4.x (devDependency in workspace)                   |
| **Config file**        | `tests/lz-nx.rlm/vitest.config.mjs` (exists from Phase 1) |
| **Quick run command**  | `npx vitest run --reporter=verbose`                       |
| **Full suite command** | `npx vitest run`                                          |
| **Estimated runtime**  | ~5 seconds                                                |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement | Test Type | Automated Command                                        | File Exists | Status  |
| -------- | ---- | ---- | ----------- | --------- | -------------------------------------------------------- | ----------- | ------- |
| 02-01-01 | 01   | 1    | REPL-01     | unit      | `npx vitest run tests/lz-nx.rlm/code-transform.test.mjs` | Wave 0      | pending |
| 02-01-02 | 01   | 1    | REPL-02     | unit      | `npx vitest run tests/lz-nx.rlm/print-capture.test.mjs`  | Wave 0      | pending |
| 02-01-03 | 01   | 1    | REPL-03     | unit      | `npx vitest run tests/lz-nx.rlm/rlm-config.test.mjs`     | Wave 0      | pending |
| 02-01-04 | 01   | 1    | REPL-04     | unit      | `npx vitest run tests/lz-nx.rlm/repl-session.test.mjs`   | Wave 0      | pending |
| 02-02-01 | 02   | 2    | REPL-01     | unit      | `npx vitest run tests/lz-nx.rlm/repl-globals.test.mjs`   | Wave 0      | pending |
| 02-02-02 | 02   | 2    | REPL-01     | unit      | `npx vitest run tests/lz-nx.rlm/repl-sandbox.test.mjs`   | Wave 0      | pending |
| 02-02-03 | 02   | 2    | REPL-04     | unit      | `npx vitest run tests/lz-nx.rlm/repl-sandbox.test.mjs`   | Wave 0      | pending |
| 02-02-04 | 02   | 2    | REPL-04     | unit      | `npx vitest run tests/lz-nx.rlm/repl-sandbox.test.mjs`   | Wave 0      | pending |

_Status: pending · green · red · flaky_

---

## Wave 0 Requirements

- [ ] `tests/lz-nx.rlm/repl-sandbox.test.mjs` — stubs for REPL-01 (sandbox execution), REPL-04 (SandboxResult, timeout, security)
- [ ] `tests/lz-nx.rlm/repl-globals.test.mjs` — stubs for REPL-01 (12 globals), REPL-02 (SHOW_VARS), REPL-04 (FINAL/FINAL_VAR)
- [ ] `tests/lz-nx.rlm/code-transform.test.mjs` — stubs for REPL-01 (const/let/var transformation)
- [ ] `tests/lz-nx.rlm/print-capture.test.mjs` — stubs for REPL-02 (truncation logic, formatting)
- [ ] `tests/lz-nx.rlm/rlm-config.test.mjs` — stubs for REPL-03 (config loading, merging)
- [ ] `tests/lz-nx.rlm/repl-session.test.mjs` — stubs for REPL-04 (session state serialization)

_Existing Phase 1 test infrastructure provides vitest.config.mjs, fixture patterns, and mock patterns._

---

## Manual-Only Verifications

_All phase behaviors have automated verification._

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
