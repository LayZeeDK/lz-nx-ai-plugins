# Roadmap: lz-nx.rlm

## Overview

This roadmap delivers the complete RLM-powered explore workflow for Nx workspaces in three phases following the strict dependency chain: workspace index must exist before the REPL sandbox can load it, and the sandbox must work before agent integration can drive it. Deterministic commands ship in Phase 1 alongside the foundation scripts because they depend only on the workspace index and deliver immediate user value. The REPL sandbox gets its own phase because it contains the highest-risk components (4 critical pitfalls). Phase 3 brings the agent and explore skill together to validate the core RLM thesis: does the plugin reduce tokens compared to standard exploration?

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation + Commands** - Plugin shell, workspace indexer, path resolver, Nx runner, and three deterministic commands delivering immediate user value
- [ ] **Phase 1.1: Nx Project Setup + Linting** _(INSERTED)_ - Nx project definitions for plugin scripts and tests, inferred typecheck and lint targets with recommended ESLint rules
- [x] **Phase 2: REPL Core** - Isolated JavaScript sandbox with workspace-aware globals, smart truncation, guardrails config, and the fill/solve execution loop
- [ ] **Phase 3: Agent + Explore** - repl-executor subagent driving the REPL loop and the explore skill validating the RLM token-savings thesis

## Phase Details

### Phase 1: Foundation + Commands

**Goal**: Users can install the plugin, build a workspace index, and run deterministic commands (deps, find, alias) that return useful results without LLM calls in the scripts themselves (note: Claude Code still processes the command invocation)
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, CMD-01, CMD-02, CMD-03, PLUG-01, PLUG-02
**Success Criteria** (what must be TRUE):

1. User can install the plugin and it appears in Claude Code's slash command list
2. Running `/lz-nx.rlm:deps <project>` prints a dependency tree for the named project using the workspace index
3. Running `/lz-nx.rlm:find <pattern> --project <name>` returns file paths scoped to specific Nx projects
4. Running `/lz-nx.rlm:alias <path-or-alias>` resolves a tsconfig path alias to a file path and vice versa
5. All scripts work on macOS, Linux, and Windows (Git Bash) with zero npm dependencies
   **Plans**: 3 plans

Plans:

- [x] 01-01-PLAN.md -- Plugin shell, command markdown, Nx-runner, test infrastructure
- [x] 01-02-PLAN.md -- Workspace indexer, index-loader, path resolver
- [x] 01-03-PLAN.md -- Three deterministic commands (deps, find, alias)

### Phase 1.1: Nx Project Setup + Linting _(INSERTED)_

**Goal**: Plugin scripts and tests are discoverable Nx projects with inferred typecheck and lint targets, using recommended Nx ESLint rules -- all existing code passes both targets
**Depends on**: Phase 1
**Requirements**: DX-01, DX-02, DX-03
**Success Criteria** (what must be TRUE):

1. `nx show projects` lists both `lz-nx-rlm` (plugin scripts) and `lz-nx-rlm-test` (tests)
2. `nx typecheck lz-nx-rlm` runs TypeScript type checking against plugin scripts with no errors
3. `nx lint lz-nx-rlm` and `nx lint lz-nx-rlm-test` both pass using recommended Nx ESLint rules
4. `nx run-many -t lint` and `nx run-many -t typecheck` pass across all projects
   **Plans**: 1 plan

Plans:

- [x] 01.1-01-PLAN.md -- Project infrastructure, ESLint flat config, tsconfig, test .mjs-to-.ts conversion, type/lint fixes

### Phase 2: REPL Core

**Goal**: The REPL sandbox can execute JavaScript code in an isolated VM context with workspace-aware globals, persist variables across turns, and enforce guardrails -- testable without any LLM by passing code via stdin
**Depends on**: Phase 1
**Requirements**: REPL-01, REPL-02, REPL-03, REPL-04
**Success Criteria** (what must be TRUE):

1. Passing JavaScript code to the sandbox script produces a SandboxResult JSON on stdout containing output, variables, and any FINAL answer
2. Variables assigned in one REPL turn persist and are accessible in subsequent turns within the same session
3. Large results from workspace queries are truncated in print output but remain fully accessible via globalThis variables in the session
4. The execution loop terminates reliably via FINAL(), maxIterations, maxTimeout, maxConsecutiveErrors, or stale-loop detection -- never hangs
   **Plans**: 2 plans

Plans:

- [x] 02-01-PLAN.md -- Code transform, print capture, config loader, session state (foundation utilities)
- [x] 02-02-PLAN.md -- REPL globals factory and sandbox execution engine (VM integration)

### Phase 3: Agent + Explore

**Goal**: Users can ask natural language questions about their Nx workspace via the explore skill, and receive distilled answers without intermediate exploration results polluting the conversation context
**Depends on**: Phase 2
**Requirements**: AGNT-01, SKIL-01
**Success Criteria** (what must be TRUE):

1. Running `/lz-nx.rlm:explore "How many projects are there?"` returns a correct, concise answer to the conversation
2. The repl-executor subagent drives multiple REPL iterations (fill/solve cycle) and returns only the FINAL answer -- intermediate code and output stay in the subagent's isolated context
3. The explore skill works for queries requiring multi-step navigation (e.g., "What projects depend on shared-utils and what targets do they have?")
   **Plans**: 4 plans

Plans:

- [x] 03-01-PLAN.md -- repl-executor Sonnet subagent with XML two-phase system prompt and structural tests
- [ ] 03-02-PLAN.md -- explore skill with Task tool orchestration, result relay, and end-to-end manual verification _(Tasks 1-2 complete; Task 3 checkpoint pending)_
- [ ] 03-03-PLAN.md -- UAT gap closure: permission-prompt-free patterns and strengthened two-phase enforcement _(gap_closure)_
- [ ] 03-04-PLAN.md -- UAT gap closure: --file flag for sandbox, Write tool invocation, WORKSPACE_ROOT path derivation _(gap_closure)_

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 1.1 -> 2 -> 3

| Phase                          | Plans Complete | Status      | Completed  |
| ------------------------------ | -------------- | ----------- | ---------- |
| 1. Foundation + Commands       | 3/3            | Complete    | 2026-03-04 |
| 1.1 Nx Project Setup + Linting | 1/1            | Complete    | 2026-03-05 |
| 2. REPL Core                   | 2/2            | Complete    | 2026-03-05 |
| 3. Agent + Explore             | 1/4            | In progress | -          |
