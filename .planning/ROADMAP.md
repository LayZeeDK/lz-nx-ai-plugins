# Roadmap: lz-nx.rlm

## Overview

This roadmap delivers the complete RLM-powered explore workflow for Nx workspaces in three phases following the strict dependency chain: workspace index must exist before the REPL sandbox can load it, and the sandbox must work before agent integration can drive it. Deterministic commands ship in Phase 1 alongside the foundation scripts because they depend only on the workspace index and deliver immediate user value. The REPL sandbox gets its own phase because it contains the highest-risk components (4 critical pitfalls). Phase 3 brings the agent and explore skill together to validate the core RLM thesis: does the plugin reduce tokens compared to standard exploration?

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation + Commands** - Plugin shell, workspace indexer, path resolver, Nx runner, and three deterministic commands delivering immediate user value
- [ ] **Phase 2: REPL Core** - Isolated JavaScript sandbox with workspace-aware globals, smart truncation, guardrails config, and the fill/solve execution loop
- [ ] **Phase 3: Agent + Explore** - repl-executor subagent driving the REPL loop and the explore skill validating the RLM token-savings thesis

## Phase Details

### Phase 1: Foundation + Commands
**Goal**: Users can install the plugin, build a workspace index, and run deterministic commands (deps, find, alias) that return useful results with zero LLM tokens
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
- [ ] 01-01-PLAN.md -- Plugin shell, command markdown, Nx-runner, test infrastructure
- [ ] 01-02-PLAN.md -- Workspace indexer, index-loader, path resolver
- [ ] 01-03-PLAN.md -- Three deterministic commands (deps, find, alias)

### Phase 2: REPL Core
**Goal**: The REPL sandbox can execute JavaScript code in an isolated VM context with workspace-aware globals, persist variables across turns, and enforce guardrails -- testable without any LLM by passing code via stdin
**Depends on**: Phase 1
**Requirements**: REPL-01, REPL-02, REPL-03, REPL-04
**Success Criteria** (what must be TRUE):
  1. Passing JavaScript code to the sandbox script produces a SandboxResult JSON on stdout containing output, variables, and any FINAL answer
  2. Variables assigned in one REPL turn persist and are accessible in subsequent turns within the same session
  3. Large results from workspace queries are truncated in print output but remain fully accessible via globalThis variables in the session
  4. The execution loop terminates reliably via FINAL(), maxIterations, maxTimeout, maxConsecutiveErrors, or stale-loop detection -- never hangs
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD

### Phase 3: Agent + Explore
**Goal**: Users can ask natural language questions about their Nx workspace via the explore skill, and receive distilled answers without intermediate exploration results polluting the conversation context
**Depends on**: Phase 2
**Requirements**: AGNT-01, SKIL-01
**Success Criteria** (what must be TRUE):
  1. Running `/lz-nx.rlm:explore "How many projects are there?"` returns a correct, concise answer to the conversation
  2. The repl-executor subagent drives multiple REPL iterations (fill/solve cycle) and returns only the FINAL answer -- intermediate code and output stay in the subagent's isolated context
  3. The explore skill works for queries requiring multi-step navigation (e.g., "What projects depend on shared-utils and what targets do they have?")
**Plans**: TBD

Plans:
- [ ] 03-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation + Commands | 0/3 | Planning complete | - |
| 2. REPL Core | 0/0 | Not started | - |
| 3. Agent + Explore | 0/0 | Not started | - |
