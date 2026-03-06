---
phase: 3
slug: agent-explore
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (via `@nx/vite`) |
| **Config file** | `tests/lz-nx.rlm/vitest.config.mjs` |
| **Quick run command** | `npm exec nx test lz-nx-rlm-test` |
| **Full suite command** | `npm exec nx run-many -t test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm exec nx test lz-nx-rlm-test`
- **After every plan wave:** Run `npm exec nx run-many -t test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | AGNT-01 | unit | `npm exec nx test lz-nx-rlm-test -- --testPathPattern agent` | Wave 0 | pending |
| 03-01-02 | 01 | 1 | AGNT-01 | unit | `npm exec nx test lz-nx-rlm-test -- --testPathPattern agent` | Wave 0 | pending |
| 03-02-01 | 02 | 1 | SKIL-01 | unit | `npm exec nx test lz-nx-rlm-test -- --testPathPattern explore-skill` | Wave 0 | pending |
| 03-02-02 | 02 | 1 | SKIL-01 | unit | `npm exec nx test lz-nx-rlm-test -- --testPathPattern explore-skill` | Wave 0 | pending |
| 03-INT-01 | -- | -- | AGNT-01 | integration | `npm exec nx test lz-nx-rlm-test -- --testPathPattern repl-sandbox` | Exists | pending |
| 03-E2E-01 | -- | -- | SKIL-01 | manual-only | Manual testing in Claude Code session | N/A | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `tests/lz-nx.rlm/src/test/agent-definition.test.ts` — validates agent frontmatter fields and system prompt structure (AGNT-01)
- [ ] `tests/lz-nx.rlm/src/test/explore-skill.test.ts` — validates skill frontmatter fields and workflow content (SKIL-01)

*These tests parse the markdown files and validate structural properties. They do NOT test LLM behavior — that requires manual testing.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `/lz-nx.rlm:explore "How many projects?"` returns correct answer | SKIL-01 | Requires live Claude Code session with Task tool | Run explore skill, verify answer matches `nx show projects --json` count |
| Agent drives multiple REPL iterations for multi-step queries | AGNT-01 | Requires live LLM interaction to test iteration behavior | Run explore skill with complex query, verify `--debug` shows >1 iteration |
| Intermediate exploration stays in agent context | AGNT-01 | Context isolation is a runtime property of Task tool | Run explore skill, verify main conversation only shows final answer |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
