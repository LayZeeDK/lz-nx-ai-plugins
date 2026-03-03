# lz-nx.rlm

## What This Is

A Claude Code plugin that applies the Recursive Language Model (RLM) paradigm to Nx JavaScript/TypeScript monorepo navigation. It externalizes the codebase as a navigable variable in an isolated REPL sandbox, so Claude explores code programmatically without loading it into the conversation context. This prevents context rot and reduces token usage by 2-5x compared to standard Explore sub-agent workflows.

## Core Value

Claude can navigate and understand a large Nx workspace without burning context on intermediate exploration results. The conversation stays clean; the REPL is the scratch space that gets discarded.

## Requirements

### Validated

(None yet -- ship to validate)

### Active

- [ ] Workspace indexer builds a JSON index from Nx CLI output (`nx show projects --json`, `nx graph --print`, `tsconfig.base.json`)
- [ ] Path resolver translates between file paths and tsconfig path aliases
- [ ] REPL sandbox executes JavaScript in an isolated Node.js VM context with workspace-aware globals
- [ ] Handle-based result storage keeps large results in a Map, passing only lightweight stubs to the LLM
- [ ] RLM configuration controls guardrails (max iterations, max depth, max timeout, max consecutive errors)
- [ ] nx-runner wraps Nx CLI with command allowlisting (read-only operations only) and output caching
- [ ] `/lz-nx.rlm:explore` skill navigates the codebase via the REPL fill/solve loop, returning only distilled answers to the conversation
- [ ] `repl-executor` agent drives the RLM execution loop (fill phase -> solve phase -> FINAL answer)
- [ ] `haiku-searcher` agent handles mechanical search tasks as the `llm_query()` target for REPL sub-calls
- [ ] `/lz-nx.rlm:deps` command prints a dependency tree for a given Nx project (zero LLM tokens)
- [ ] `/lz-nx.rlm:find` command searches files scoped to specific Nx projects via the workspace index (zero LLM tokens)
- [ ] `/lz-nx.rlm:alias` command resolves tsconfig path aliases bidirectionally (zero LLM tokens)

### Out of Scope

- Angular-specific registries (component selector, store, service mappings) -- deferred to later milestone; v1 is generic Nx JS/TS
- Hooks (SessionStart, PreToolUse, PostToolUse, PreCompact) -- deferred; v1 has no automated behaviors
- Token benchmarking and `/lz-nx.rlm:status` command -- deferred; validate token savings manually first
- haiku-classifier agent (task complexity routing) -- deferred; users choose explore vs. commands manually
- Cache manager for search results -- deferred; optimization for later
- Agent teams features (debug, review, refactor, migrate) -- deferred to later milestone; requires proven foundation
- Additional skills (impact, analyze, test-gen, search, trace, patterns) -- deferred to later milestones
- Generic RLM engine extraction (`lz.rlm` standalone plugin) -- internal modularity supports future extraction, but no separate plugin for now

## Context

### RLM Paradigm

Recursive Language Models (MIT CSAIL, 2025) externalize prompts as navigable variables in a REPL. The LLM generates code to navigate the data rather than loading it into context. Three principles: symbolic handle to prompt, variables as output, symbolic recursion. This prevents context rot (performance degradation as context grows) and enables processing data far beyond the model's context window.

### Target Environment

Nx monorepos with JavaScript/TypeScript projects. The plugin is designed to scale from small workspaces (10-20 projects) to large monoliths (500+ projects, 1M+ LOC). The primary validation target is the Connect monolith (Nx 19.8, 537 projects, ~1.5-2M LOC) but the plugin has no Angular or Connect-specific dependencies.

### Research Foundation

Extensive research corpus in `research/`:
- `research/rlm/SYNTHESIS.md` -- RLM theory, architecture, benchmarks, existing implementations
- `research/claude-plugin/BRAINSTORM.md` -- detailed plugin design with token projections
- `research/claude-plugin/BRAINSTORM_AGENT_TEAMS.md` -- agent team integration proposals
- `research/nx/nx-cli.md` -- Nx CLI capabilities for workspace exploration
- `research/prompt-engineering/SYNTHESIS.md` -- prompt patterns for token efficiency

### Plugin Architecture

Plugin location: `plugins/lz-nx.rlm/`

Plugin structure:
```
plugins/lz-nx.rlm/
  .claude-plugin/
    plugin.json
  agents/
    repl-executor.md
    haiku-searcher.md
  commands/
    deps.md
    find.md
    alias.md
  skills/
    explore/
      SKILL.md
  scripts/
    workspace-indexer.mjs
    path-resolver.mjs
    repl-sandbox.mjs
    handle-store.mjs
    rlm-config.mjs
    nx-runner.mjs
```

### REPL Sandbox Design

Node.js `vm.createContext()` with controlled globals:

| Global | Purpose |
|--------|---------|
| `workspace` | The workspace index as a navigable object |
| `projects` | Shorthand for `workspace.projects` (Map) |
| `deps(name)` | Get dependency tree for a project |
| `dependents(name)` | Get reverse dependency tree |
| `read(path, start?, end?)` | Read file content (or slice) |
| `files(glob)` | Find files matching pattern |
| `search(pattern, paths?)` | Search file contents (git grep wrapper) |
| `nx(command)` | Run allowlisted Nx CLI command, return parsed output |
| `llm_query(prompt, model?)` | Sub-LLM call (routes to Haiku by default) |
| `FINAL(answer)` | Mark final answer (string) |
| `FINAL_VAR(name)` | Mark final answer (from variable) |
| `print(...args)` | Capture output (truncated) |
| `SHOW_VARS()` | List user-created variables |

Security: `codeGeneration: { strings: false, wasm: false }`, restricted builtins (no `process`, `require`, `child_process` except via controlled wrappers), execution timeout per block.

### Workspace Index Schema

JSON file (~50-100KB for large workspaces) containing:
- Project names mapped to source roots, types, tags, and available targets
- Dependency edges as an adjacency list
- Path aliases from `tsconfig.base.json`
- File counts per project root for incremental rebuild

Built from: `nx show projects --json`, `nx graph --print`, `tsconfig.base.json`, `nx show project <name>` (per project).

### Model Routing

| Operation | Model | Rationale |
|-----------|-------|-----------|
| Workspace indexing | None (Node.js) | Pure data transformation |
| REPL root orchestration | Sonnet | Code generation for navigation |
| Mechanical search sub-calls | Haiku | Bounded, mechanical tasks |
| Commands (deps, find, alias) | None (Node.js) | Deterministic scripts |

### Risk Profile

The REPL sandbox, execution loop, and handle-based result storage are the highest-risk components. They are based on patterns from only 2 existing Node.js implementations (Hampton-io/RLM and code-rabi/rllm), and the RLM research explicitly flags "brittleness in answer termination" and "the training gap" (current models aren't trained to use RLM scaffolding optimally) as open problems.

These components should be built and validated in early phases — before the skills and commands that depend on them. The explore skill is the primary integration test: if the REPL-powered explore skill does not reduce tokens vs. a standard Explore agent, the foundation needs rework before building more on top.

Low-risk components: workspace indexer (wraps known Nx CLI calls), path resolver (reads tsconfig.json), deterministic commands (deps, find, alias), and the plugin shell itself (standard Claude Code plugin conventions).

## Constraints

- **Cross-platform**: Must work on macOS, Linux, and Windows (Git Bash). Use Node.js scripts for all operations.
- **Node.js LTS**: Only dependency is Node.js LTS (no native modules, no Python, no Rust)
- **No Angular dependency**: V1 is generic Nx JS/TS. No `@angular/*` imports or Angular-specific scanning.
- **REPL language**: JavaScript only (Node.js VM). No S-expression DSL.
- **Index format**: JSON file. No SQLite for v1.
- **Plugin conventions**: Follow Claude Code plugin structure per `plugin-dev` plugin guidelines. Use `${CLAUDE_PLUGIN_ROOT}` for all intra-plugin paths.
- **No emojis in scripts**: Windows cp1252 compatibility. Use ASCII replacements.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| One plugin (not split generic + Nx) | Generic RLM engine has limited standalone user-facing value; Nx provides the structured map that makes RLM navigation powerful | -- Pending |
| Generic Nx JS/TS (not Angular-specific) | Broader audience, cleaner architecture; Angular intelligence as a future milestone | -- Pending |
| JavaScript REPL (not S-expression DSL) | Natural for TS workspace, proven in Hampton-io/RLM and code-rabi/rllm | -- Pending |
| JSON workspace index (not SQLite) | Simplest v1; loads directly as REPL variable; SQLite can be added later | -- Pending |
| No hooks in v1 | Hooks add complexity; skills and commands prove value first | -- Pending |
| Defer token benchmarking | Validate savings manually first; benchmarking infrastructure is overhead before core works | -- Pending |

---
*Last updated: 2026-03-03 after initialization (risk profile added)*
