---
phase: 1
slug: foundation-commands
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-04
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x (devDependency in workspace) |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 0 | FOUND-01 | unit | `npx vitest run plugins/lz-nx.rlm/scripts/__tests__/workspace-indexer.test.mjs -t "indexer"` | Wave 0 | pending |
| 01-01-02 | 01 | 0 | FOUND-02 | unit | `npx vitest run plugins/lz-nx.rlm/scripts/__tests__/path-resolver.test.mjs -t "resolver"` | Wave 0 | pending |
| 01-01-03 | 01 | 0 | FOUND-03 | unit | `npx vitest run plugins/lz-nx.rlm/scripts/__tests__/nx-runner.test.mjs -t "runner"` | Wave 0 | pending |
| 01-02-01 | 02 | 1 | CMD-01 | unit | `npx vitest run plugins/lz-nx.rlm/scripts/__tests__/deps-command.test.mjs -t "deps"` | Wave 0 | pending |
| 01-02-02 | 02 | 1 | CMD-02 | unit | `npx vitest run plugins/lz-nx.rlm/scripts/__tests__/find-command.test.mjs -t "find"` | Wave 0 | pending |
| 01-02-03 | 02 | 1 | CMD-03 | unit | `npx vitest run plugins/lz-nx.rlm/scripts/__tests__/alias-command.test.mjs -t "alias"` | Wave 0 | pending |
| 01-03-01 | 03 | 1 | PLUG-01 | smoke | Manual: `claude --plugin-dir ./plugins/lz-nx.rlm` then `/lz-nx.rlm:deps` | Manual-only | pending |
| 01-03-02 | 03 | 1 | PLUG-02 | integration | `node plugins/lz-nx.rlm/scripts/deps-command.mjs --help` (all platforms) | Wave 0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `plugins/lz-nx.rlm/vitest.config.mjs` — Vitest config for plugin tests
- [ ] `plugins/lz-nx.rlm/scripts/__tests__/workspace-indexer.test.mjs` — covers FOUND-01
- [ ] `plugins/lz-nx.rlm/scripts/__tests__/path-resolver.test.mjs` — covers FOUND-02
- [ ] `plugins/lz-nx.rlm/scripts/__tests__/nx-runner.test.mjs` — covers FOUND-03
- [ ] `plugins/lz-nx.rlm/scripts/__tests__/deps-command.test.mjs` — covers CMD-01
- [ ] `plugins/lz-nx.rlm/scripts/__tests__/find-command.test.mjs` — covers CMD-02
- [ ] `plugins/lz-nx.rlm/scripts/__tests__/alias-command.test.mjs` — covers CMD-03
- [ ] `plugins/lz-nx.rlm/scripts/__tests__/fixtures/` — mock graph data, tsconfig data
- [ ] Test utilities for mocking `execSync` / `spawnSync` responses

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Plugin installs and commands appear in Claude Code slash command list | PLUG-01 | Requires Claude Code runtime for plugin discovery | Install plugin: `claude --plugin-dir ./plugins/lz-nx.rlm`, verify `/lz-nx.rlm:deps` appears in command list |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
