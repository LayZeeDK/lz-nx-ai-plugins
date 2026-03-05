# Requirements: lz-nx.rlm

**Defined:** 2026-03-03
**Core Value:** Claude can navigate and understand a large Nx workspace without burning context on intermediate exploration results.

## v0.0.1 Requirements

Requirements for initial milestone. Each maps to roadmap phases.

### Foundation

- [x] **FOUND-01**: Workspace indexer builds a JSON index from Nx CLI output (primarily `nx graph --print` which returns all project nodes, metadata, and dependency edges in one call, plus `tsconfig.base.json` for path aliases)
- [x] **FOUND-02**: Path resolver translates between file paths and tsconfig path aliases bidirectionally
- [x] **FOUND-03**: Nx-runner wraps Nx CLI with command allowlisting (read-only operations only), timeout enforcement, output caching, mandatory env vars (`NX_TUI=false`, `NX_INTERACTIVE=false`, `NX_NO_CLOUD=true`), stdout-based error detection (Nx writes errors to stdout, not stderr), and `maxBuffer: 10MB` for large workspaces

### REPL Engine

- [ ] **REPL-01**: REPL sandbox executes JavaScript in an isolated Node.js VM context with workspace-aware globals (`workspace`, `projects`, `deps()`, `dependents()`, `read()`, `files()`, `search()`, `nx()`, `print()`, `SHOW_VARS()`, `FINAL()`, `FINAL_VAR()`)
- [ ] **REPL-02**: Smart result truncation via `globalThis` persistence and `print()` truncation keeps large results navigable without flooding context -- the LLM sees compact stubs while full data remains accessible in session state
- [ ] **REPL-03**: RLM configuration controls guardrails via JSON config: `maxIterations` (default 20), `maxDepth` (default 2), `maxTimeout` (default 120s), `maxConsecutiveErrors` (default 3)
- [ ] **REPL-04**: Execution loop implements the fill/solve cycle with four-layer termination guards (maxIterations, maxTimeout, maxErrors, stale-loop detection) -- LLM generates code, sandbox executes, results appended, loop continues until `FINAL()` or guardrail limit reached

### Agents

- [ ] **AGNT-01**: `repl-executor` agent drives the RLM execution loop as a Sonnet subagent with isolated context, receiving the workspace index and returning only the distilled `FINAL()` answer

### Skills

- [ ] **SKIL-01**: `/lz-nx.rlm:explore` skill accepts a natural language question about the codebase, navigates via the REPL fill/solve loop, and returns only the distilled answer to the conversation

### Commands

- [x] **CMD-01**: `/lz-nx.rlm:deps` command prints a dependency tree for a given Nx project using the workspace index (deterministic -- no LLM calls in scripts, though Claude Code still processes the invocation)
- [x] **CMD-02**: `/lz-nx.rlm:find` command searches files scoped to specific Nx projects via the workspace index and git grep (deterministic -- no LLM calls in scripts)
- [x] **CMD-03**: `/lz-nx.rlm:alias` command resolves tsconfig path aliases bidirectionally -- path to alias and alias to path (deterministic -- no LLM calls in scripts)

### Developer Experience

- [x] **DX-01**: Plugin scripts directory (`plugins/lz-nx.rlm/`) is an Nx project (`lz-nx-rlm`) with an inferred `typecheck` target via `@nx/js/typescript` plugin
- [x] **DX-02**: Both the plugin scripts project (`lz-nx-rlm`) and the test project (`lz-nx-rlm-test`) have inferred `lint` targets via `@nx/eslint/plugin` using recommended Nx ESLint rules
- [x] **DX-03**: ESLint flat config (`eslint.config.mjs`) uses default recommended Nx ESLint plugin rules; all existing Phase 1 code passes lint and typecheck with no suppression comments

### Plugin Shell

- [x] **PLUG-01**: Plugin follows Claude Code plugin structure conventions (`.claude-plugin/plugin.json`, auto-discovered commands/agents/skills, `${CLAUDE_PLUGIN_ROOT}` for portable paths)
- [x] **PLUG-02**: All scripts are cross-platform Node.js (.mjs) with zero npm dependencies, working on macOS, Linux, and Windows (Git Bash)

## Later Milestone Requirements

Deferred to next milestone. Tracked but not in current roadmap.

### Agents

- **AGNT-02**: `haiku-searcher` agent handles mechanical search tasks (file content extraction, pattern matching, classification) as a Haiku subagent, invoked via `llm_query()` through Claude Code's native Task tool (no direct Anthropic API calls)

### Skills

- **SKIL-10**: `/lz-nx.rlm:impact` skill combines `nx affected` output with REPL-driven dependency traversal and risk classification
- **SKIL-11**: Strategy hints injection primes the REPL system prompt with workspace-specific navigation patterns

### Hooks

- **HOOK-01**: SessionStart hook auto-rebuilds workspace index when stale
- **HOOK-02**: PreCompact hook preserves critical workspace context before auto-compaction
- **HOOK-03**: PreToolUse hook intercepts Explore/search tool calls and routes index-answerable queries through the REPL
- **HOOK-04**: PostToolUse hook caches repeated search results within a session

### Observability

- **OBSV-01**: Token benchmarking tracks per-query token usage vs. baseline Explore agent
- **OBSV-02**: `/lz-nx.rlm:status` command shows workspace index health, cache stats, and session token usage

### CLI

- **CLI-01**: Standalone CLI entry point (`bin/lz-nx.mjs`) wraps deps, find, and alias commands for consumers outside Claude Code -- scripts already export core functions and have `process.argv` entry points, so this is a thin dispatch layer

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature                                                                 | Reason                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direct Anthropic API calls                                              | Plugin only supports Claude Code flat-rate subscriptions (Team); all LLM operations go through Claude Code's native Task tool and subagent system                                                                                                         |
| Angular-specific registries (component, store, service, route maps)     | Locks v0.0.1 to one framework; regex scanning for decorators is brittle across Angular versions; generic Nx plugin serves broader audience first                                                                                                          |
| Agent teams (debug, review, refactor, migrate)                          | 3-10x token multiplier; requires Claude Code team features; massive complexity; unproven for RLM workflows                                                                                                                                                |
| Additional skills (analyze, test-gen, trace, patterns, search)          | Each requires stable foundation; explore covers the primary use case for v0.0.1                                                                                                                                                                           |
| Generic RLM engine extraction (`lz.rlm` standalone plugin)              | Internal modularity supports future extraction, but no separate plugin until Nx-specific value is proven                                                                                                                                                  |
| Semantic/vector search (embeddings, BM25, hybrid)                       | Requires embedding infrastructure beyond Claude; `git grep` + workspace index covers the workspace navigation use cases (see `.planning/quick/1-research-and-analyze-git-grep-and-altern/ANALYSIS.md`)                                                    |
| S-expression DSL                                                        | JavaScript is natural for TS/Nx workspaces; target models (Sonnet, Haiku) generate JavaScript fluently                                                                                                                                                    |
| MCP server integration                                                  | MCP adds tool definitions to system prompt consuming context tokens; skills + scripts are more efficient; Nx itself moved away from MCP                                                                                                                   |
| Persistent cross-session memory (SQLite, knowledge graph)               | The workspace index IS deterministic persistent memory, rebuilt from Nx CLI each session; git is the cross-session memory for code                                                                                                                        |
| Runtime ESM CDN imports in sandbox (esm.sh, skypack, jspm, import maps) | vm contexts have no module system; CDN imports break controlled-globals security model, add network dependency, require vm.SourceTextModule with custom linker; if npm functionality is needed, import in host process and expose as controlled vm global |
| Hooks in v0.0.1                                                         | Hooks add invisible behavior that is hard to debug; v0.0.1 proves value through explicit skill/command invocation first                                                                                                                                   |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase     | Status   |
| ----------- | --------- | -------- |
| FOUND-01    | Phase 1   | Complete |
| FOUND-02    | Phase 1   | Complete |
| FOUND-03    | Phase 1   | Complete |
| REPL-01     | Phase 2   | Pending  |
| REPL-02     | Phase 2   | Pending  |
| REPL-03     | Phase 2   | Pending  |
| REPL-04     | Phase 2   | Pending  |
| AGNT-01     | Phase 3   | Pending  |
| SKIL-01     | Phase 3   | Pending  |
| CMD-01      | Phase 1   | Complete |
| CMD-02      | Phase 1   | Complete |
| CMD-03      | Phase 1   | Complete |
| DX-01       | Phase 1.1 | Complete |
| DX-02       | Phase 1.1 | Complete |
| DX-03       | Phase 1.1 | Complete |
| PLUG-01     | Phase 1   | Complete |
| PLUG-02     | Phase 1   | Complete |

**Coverage:**

- v0.0.1 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0

---

_Requirements defined: 2026-03-03_
_Last updated: 2026-03-05 -- DX-01, DX-02, DX-03 marked complete (Phase 1.1 plan 01)_
