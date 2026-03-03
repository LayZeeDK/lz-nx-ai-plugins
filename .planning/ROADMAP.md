# Roadmap: lz-nx.rlm

## Overview

This roadmap delivers an RLM-powered Claude Code plugin for Nx workspace navigation. The journey starts with the plugin shell and workspace index (the data the REPL navigates), moves through the REPL sandbox (the highest-risk component), validates the index with zero-LLM deterministic commands, wires in agent-driven execution, and culminates with the explore skill -- the primary integration test that proves the RLM approach reduces token usage vs. standard exploration.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Plugin Shell and Foundation** - Scaffold the plugin and build the workspace index, path resolver, and Nx runner
- [ ] **Phase 2: REPL Sandbox** - Implement the isolated JavaScript REPL with workspace-aware globals and handle-based result storage
- [ ] **Phase 3: Deterministic Commands** - Build zero-LLM-token commands that validate the workspace index and provide immediate user value
- [ ] **Phase 4: Agent Integration** - Wire the execution loop, repl-executor agent, and haiku-searcher agent into a working RLM fill/solve cycle
- [ ] **Phase 5: Explore Skill** - Deliver the full RLM-powered explore workflow that ties all components together

## Phase Details

### Phase 1: Plugin Shell and Foundation
**Goal**: A valid Claude Code plugin exists with working foundation scripts that can index any Nx workspace and resolve paths
**Depends on**: Nothing (first phase)
**Requirements**: PLUG-01, PLUG-02, FOUND-01, FOUND-02, FOUND-03
**Success Criteria** (what must be TRUE):
  1. Running `nx show projects --json` in any Nx workspace and feeding its output to the workspace indexer produces a valid JSON index file containing project names, source roots, dependency edges, and path aliases
  2. The path resolver correctly translates a tsconfig path alias to its filesystem path and vice versa using the workspace index
  3. The nx-runner executes allowlisted read-only Nx commands and rejects disallowed commands (build, serve, deploy, etc.)
  4. The plugin is auto-discovered by Claude Code when installed via `/plugin install` and its commands/agents/skills appear in the plugin manifest
  5. All scripts run identically on macOS, Linux, and Windows (Git Bash) with zero npm dependencies
**Plans**: TBD

Plans:
- [ ] 01-01: Plugin scaffolding and workspace indexer
- [ ] 01-02: Path resolver and Nx runner

### Phase 2: REPL Sandbox
**Goal**: JavaScript code can be executed in an isolated VM context with workspace-aware globals, and large results are stored as lightweight handles instead of raw data
**Depends on**: Phase 1
**Requirements**: REPL-01, REPL-02, REPL-03
**Success Criteria** (what must be TRUE):
  1. JavaScript code executed in the sandbox can access workspace data through globals (`workspace`, `projects`, `deps()`, `dependents()`, `read()`, `files()`, `search()`, `nx()`, `print()`, `SHOW_VARS()`, `FINAL()`, `FINAL_VAR()`) and cannot access `process`, `require`, or `child_process` directly
  2. When a sandbox expression returns a result exceeding the size threshold, it is stored in the handle store and the sandbox returns a stub with a preview snippet, item count, and handle ID instead of the full data
  3. RLM guardrails (maxIterations, maxDepth, maxTimeout, maxConsecutiveErrors) are loaded from a JSON config file and enforced during execution -- exceeding any limit halts the loop with a descriptive message
**Plans**: TBD

Plans:
- [ ] 02-01: REPL sandbox with workspace-aware globals
- [ ] 02-02: Handle store and RLM configuration

### Phase 3: Deterministic Commands
**Goal**: Users can run zero-LLM-token slash commands to explore Nx project dependencies, find files, and resolve path aliases
**Depends on**: Phase 1
**Requirements**: CMD-01, CMD-02, CMD-03
**Success Criteria** (what must be TRUE):
  1. `/lz-nx.rlm:deps <project>` prints a human-readable dependency tree showing direct and transitive dependencies of the given Nx project
  2. `/lz-nx.rlm:find <pattern>` returns matching files scoped to Nx project source roots, using the workspace index to constrain the search
  3. `/lz-nx.rlm:alias <input>` resolves a tsconfig path alias to its filesystem path when given an alias, and resolves a filesystem path to its alias when given a path
  4. All three commands complete without invoking any LLM -- they are pure script execution
**Plans**: TBD

Plans:
- [ ] 03-01: Deps and alias commands
- [ ] 03-02: Find command

### Phase 4: Agent Integration
**Goal**: The RLM fill/solve execution loop works end-to-end with real LLM calls -- the repl-executor agent generates code, the sandbox executes it, and the haiku-searcher agent handles sub-calls
**Depends on**: Phase 1, Phase 2
**Requirements**: REPL-04, AGNT-01, AGNT-02
**Success Criteria** (what must be TRUE):
  1. The repl-executor agent receives a question and the workspace index, generates JavaScript code to navigate the workspace, observes sandbox execution results, and iterates until producing a `FINAL()` answer or hitting a guardrail limit
  2. The haiku-searcher agent can be invoked as the target for `llm_query()` calls, performing mechanical search tasks (pattern matching, file content extraction, classification) and returning concise results
  3. The execution loop correctly implements the fill/solve cycle: LLM generates code (fill), sandbox executes and appends results (solve), loop continues until `FINAL()` is called or a guardrail halts execution
  4. The repl-executor subagent's context is isolated -- intermediate exploration results do not leak into the parent conversation
**Plans**: TBD

Plans:
- [ ] 04-01: Execution loop and repl-executor agent
- [ ] 04-02: Haiku-searcher agent and llm_query integration

### Phase 5: Explore Skill
**Goal**: Users invoke `/lz-nx.rlm:explore` with a natural language question and receive a distilled answer without intermediate exploration polluting the conversation
**Depends on**: Phase 4
**Requirements**: SKIL-01
**Success Criteria** (what must be TRUE):
  1. `/lz-nx.rlm:explore "How are feature modules organized?"` accepts a natural language question, delegates to the repl-executor agent, and returns only the distilled `FINAL()` answer to the conversation
  2. The explore skill consumes measurably fewer conversation tokens than manually using Read/Bash tools to answer the same question (the core value proposition of the RLM approach)
**Plans**: TBD

Plans:
- [ ] 05-01: Explore skill definition and integration

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5
Note: Phase 3 depends only on Phase 1, so it can execute in parallel with Phase 2 if desired.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Plugin Shell and Foundation | 0/2 | Not started | - |
| 2. REPL Sandbox | 0/2 | Not started | - |
| 3. Deterministic Commands | 0/2 | Not started | - |
| 4. Agent Integration | 0/2 | Not started | - |
| 5. Explore Skill | 0/1 | Not started | - |
