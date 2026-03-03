# RLM Claude Code Plugin Research

Brainstorm proposals for a Recursive Language Model (RLM) Claude Code plugin targeting large Nx/Angular monorepos.

> **Target workspace:** Connect `ng-app-monolith` -- Nx 19.8, Angular 18, ~1.5-2M LOC, ~1,700 components, 537 Nx projects.
> **Brainstorm date:** 2026-03-02

## Documents

| Document | Contents |
|----------|----------|
| [BRAINSTORM.md](./BRAINSTORM.md) | Full use case proposals: foundation layer, REPL environment, skills, commands, agents, hooks, scripts, workflows, context rot prevention, model routing, plugin structure, open questions |

## Research Dependencies

| Document | Location |
|----------|----------|
| RLM Research Synthesis | [research/rlm/SYNTHESIS.md](../rlm/SYNTHESIS.md) |
| Prompt Engineering Synthesis | [research/prompt-engineering/SYNTHESIS.md](../prompt-engineering/SYNTHESIS.md) |
| Nx CLI Research | [research/nx/nx-cli.md](../nx/nx-cli.md) |

## Goals

1. **Save tokens** on common Claude Code operations (Explore, research Tasks, Grep, Bash search)
2. **Prevent context rot** through REPL isolation -- intermediate results never enter the conversation
3. **Route to smaller models** (Haiku for mechanical work, Sonnet over Opus where possible)
4. **Use Node.js scripts** for deterministic operations that need zero LLM tokens
5. **Use Node.js** to host the RLM REPL sandbox (vm.createContext)
6. **Support Nx workspaces** with Angular/TypeScript codebases via `nx`, `ng`, `tsc` CLI integration

## Quick Reference: Proposed Components

### Skills (user-invokable and auto-invoked)

| Skill | Trigger | Model |
|-------|---------|-------|
| `/rlm:explore` | Open-ended codebase questions | Sonnet root + Haiku sub-calls |
| `/rlm:impact` | "What's affected if I change X?" | Node.js scripts + Sonnet + Haiku |
| `/rlm:analyze` | Large context / multi-file analysis | Sonnet root + Haiku map-reduce |
| `/rlm:test-gen` | "Write tests for X" | Sonnet root + Haiku per-test |
| `/rlm:trace` | Cross-boundary data flow tracing | Sonnet root + Haiku verification |
| `/rlm:patterns` | Pattern audit across 1,700 components | Haiku batch scan |
| `smart-search` | Auto-invoked on search intent | Haiku classifier + git grep |

### Commands (deterministic, zero LLM tokens)

| Command | Purpose |
|---------|---------|
| `/rlm:nx-deps` | Print dependency tree for a project |
| `/rlm:nx-find` | Project-aware file search via workspace index |
| `/rlm:nx-alias` | Resolve tsconfig path aliases |
| `/rlm:status` | Session metrics and token benchmarking |

### Agents

| Agent | Model | Role |
|-------|-------|------|
| `haiku-searcher` | Haiku | Lightweight mechanical search worker |
| `haiku-classifier` | Haiku | Task complexity router |
| `repl-executor` | Sonnet | RLM execution loop (isolated from main conversation) |

### Hooks

| Hook | Event | Purpose |
|------|-------|---------|
| Session index | SessionStart | Build/refresh workspace index |
| Strategy hints | SessionStart | Inject workspace-specific navigation hints |
| Knowledge preservation | PreCompact | Save key findings before compaction |
| Search optimization | PreToolUse | Intercept Explore tasks, route to lower-token strategies |
| Result caching | PostToolUse | Cache search/Nx results with file-mtime TTL |

### Node.js Scripts (deterministic, zero LLM tokens)

| Script | Purpose |
|--------|---------|
| `workspace-indexer.mjs` | Build JSON index of 537 projects + 1,700 components |
| `path-resolver.mjs` | Resolve tsconfig.base.json aliases |
| `deps-tree.mjs` | Dependency tree from Nx project graph |
| `affected-analyzer.mjs` | Parse `nx affected` output |
| `repl-sandbox.mjs` | Node.js VM REPL environment |
| `handle-store.mjs` | Handle-based result storage (97% token savings) |
| `token-benchmark.mjs` | Token counting for RLM vs. baseline comparison (opt-in) |
| `cache-manager.mjs` | Result caching with file-mtime TTL |
| `nx-runner.mjs` | Safe Nx CLI command wrapper (allowlisted read-only) |
| `file-scanner.mjs` | Fast file counting/sizing for index |
