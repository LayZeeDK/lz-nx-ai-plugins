# Requirements: lz-nx.rlm

**Defined:** 2026-03-03
**Core Value:** Claude can navigate and understand a large Nx workspace without burning context on intermediate exploration results.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Foundation

- [ ] **FOUND-01**: Workspace indexer builds a JSON index from Nx CLI output (`nx show projects --json`, `nx graph --print`, `tsconfig.base.json`, `nx show project <name>`)
- [ ] **FOUND-02**: Path resolver translates between file paths and tsconfig path aliases bidirectionally
- [ ] **FOUND-03**: Nx-runner wraps Nx CLI with command allowlisting (read-only operations only), timeout enforcement, and output caching for expensive operations

### REPL Engine

- [ ] **REPL-01**: REPL sandbox executes JavaScript in an isolated Node.js VM context with workspace-aware globals (`workspace`, `projects`, `deps()`, `dependents()`, `read()`, `files()`, `search()`, `nx()`, `print()`, `SHOW_VARS()`, `FINAL()`, `FINAL_VAR()`)
- [ ] **REPL-02**: Handle-based result storage keeps large results in an in-memory Map, passing only lightweight stub handles (with preview and count) to the LLM
- [ ] **REPL-03**: RLM configuration controls guardrails via JSON config: `maxIterations` (default 20), `maxDepth` (default 2), `maxTimeout` (default 120s), `maxConsecutiveErrors` (default 3)
- [ ] **REPL-04**: Execution loop implements the fill/solve cycle — LLM generates code, sandbox executes, results appended, loop continues until `FINAL()` or guardrail limit reached

### Agents

- [ ] **AGNT-01**: `repl-executor` agent drives the RLM execution loop as a Sonnet subagent with isolated context, receiving the workspace index and returning only the distilled `FINAL()` answer
- [ ] **AGNT-02**: `haiku-searcher` agent handles mechanical search tasks (file content extraction, pattern matching, classification) as a Haiku subagent

### Skills

- [ ] **SKIL-01**: `/lz-nx.rlm:explore` skill accepts a natural language question about the codebase, navigates via the REPL fill/solve loop, and returns only the distilled answer to the conversation

### Commands

- [ ] **CMD-01**: `/lz-nx.rlm:deps` command prints a dependency tree for a given Nx project using the workspace index (zero LLM tokens)
- [ ] **CMD-02**: `/lz-nx.rlm:find` command searches files scoped to specific Nx projects via the workspace index and filesystem glob (zero LLM tokens)
- [ ] **CMD-03**: `/lz-nx.rlm:alias` command resolves tsconfig path aliases bidirectionally — path to alias and alias to path (zero LLM tokens)

### Plugin Shell

- [ ] **PLUG-01**: Plugin follows Claude Code plugin structure conventions (`.claude-plugin/plugin.json`, auto-discovered commands/agents/skills, `${CLAUDE_PLUGIN_ROOT}` for portable paths)
- [ ] **PLUG-02**: All scripts are cross-platform Node.js (.mjs) with zero npm dependencies, working on macOS, Linux, and Windows (Git Bash)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

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

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Angular-specific registries (component, store, service, route maps) | Locks v1 to one framework; regex scanning for decorators is brittle across Angular versions; generic Nx plugin serves broader audience first |
| Agent teams (debug, review, refactor, migrate) | 3-10x token multiplier; requires Claude Code team features; massive complexity; unproven for RLM workflows |
| Additional skills (analyze, test-gen, trace, patterns, search) | Each requires stable foundation; explore covers the primary use case for v1 |
| Generic RLM engine extraction (`lz.rlm` standalone plugin) | Internal modularity supports future extraction, but no separate plugin until Nx-specific value is proven |
| Semantic/vector search (embeddings, BM25, hybrid) | Requires embedding infrastructure beyond Claude; `git grep` + workspace index covers 95% of navigation needs |
| S-expression DSL | JavaScript is natural for TS/Nx workspaces; target models (Sonnet, Haiku) generate JavaScript fluently |
| MCP server integration | MCP adds tool definitions to system prompt consuming context tokens; skills + scripts are more efficient; Nx itself moved away from MCP |
| Persistent cross-session memory (SQLite, knowledge graph) | The workspace index IS deterministic persistent memory, rebuilt from Nx CLI each session; git is the cross-session memory for code |
| Hooks in v1 | Hooks add invisible behavior that is hard to debug; v1 proves value through explicit skill/command invocation first |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | - | Pending |
| FOUND-02 | - | Pending |
| FOUND-03 | - | Pending |
| REPL-01 | - | Pending |
| REPL-02 | - | Pending |
| REPL-03 | - | Pending |
| REPL-04 | - | Pending |
| AGNT-01 | - | Pending |
| AGNT-02 | - | Pending |
| SKIL-01 | - | Pending |
| CMD-01 | - | Pending |
| CMD-02 | - | Pending |
| CMD-03 | - | Pending |
| PLUG-01 | - | Pending |
| PLUG-02 | - | Pending |

**Coverage:**
- v1 requirements: 15 total
- Mapped to phases: 0
- Unmapped: 15

---
*Requirements defined: 2026-03-03*
*Last updated: 2026-03-03 after initial definition*
