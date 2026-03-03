# Feature Research

**Domain:** RLM-powered Nx monorepo navigation plugin for Claude Code
**Researched:** 2026-03-03
**Confidence:** HIGH (core features), MEDIUM (differentiators), LOW (agent teams)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users expect from any RLM-powered codebase navigation tool. Missing these means the plugin provides no value over vanilla Claude Code.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Workspace index** (project graph as JSON) | Every Nx AI integration starts here. Nx's own skills and MCP server expose the project graph. Without it, the plugin is blind. | MEDIUM | Build from `nx show projects --json`, `nx graph --print`, `tsconfig.base.json`. ~50-100KB for 537 projects. Pure Node.js, zero LLM tokens. |
| **REPL sandbox** (Node.js VM with workspace globals) | The defining RLM capability. Without a REPL, there is no context externalization -- the plugin is just another skill file. Every serious RLM plugin (rand, brainqub3, Hampton-io, rllm) implements this. | HIGH | `vm.createContext()` with controlled globals (`workspace`, `projects`, `deps()`, `read()`, `search()`, `FINAL()`). <5ms startup. Security: disable `codeGeneration.strings` and `codeGeneration.wasm`. |
| **Handle-based result storage** | Large results (537 project objects, 1,700 file paths) must not dump into LLM context. Matryoshka pattern claims 97% token savings on large result sets. | MEDIUM | Map-based store returning stub handles (`$projects: Map(537) [preview...]`). The LLM navigates handles via code rather than reading raw data. |
| **Execution loop** (fill/solve cycle) | The core RLM execution pattern. Root LLM generates code, sandbox executes, results appended, loop until `FINAL()`. Without this loop, the REPL is just a one-shot tool. | HIGH | 5-20 iterations typical. Needs `maxIterations`, `maxErrors`, `maxTimeout` guardrails. Proven pattern across all RLM implementations. |
| **Deterministic commands** (deps, find, alias) | Zero-LLM-token operations for common queries. Users want instant answers for "what depends on X", "where is file Y", "what alias maps to Z". Nx skills already teach agents to run `nx show projects`. | LOW | Node.js scripts wrapping `nx` CLI and `tsconfig.base.json` parsing. Three commands: `/deps` (dependency tree), `/find` (project-scoped file search), `/alias` (path alias resolution). |
| **Nx CLI wrapper** (allowlisted read-only commands) | The REPL needs safe access to Nx CLI for `nx show`, `nx graph`, `nx affected`. Must allowlist read-only commands and block mutations. | LOW | Allowlist: `show`, `graph`, `list`, `report`, `affected --print`. Block: `run`, `build`, `generate`, `migrate`. Timeout: 30s. Cache expensive operations (graph takes 3-5s). |
| **RLM configuration/guardrails** | Without guardrails, RLM loops can run indefinitely. The research shows only rand/rlm-claude-code implements explicit budget controls; its absence is a gap in the landscape. | LOW | `maxIterations` (20), `maxDepth` (2), `maxTimeout` (120s), `maxErrors` (3). JSON config file. |
| **Explore skill** (RLM-powered codebase Q&A) | The primary user-facing capability. "Where is X?", "How does Y work?", "What depends on Z?" -- answered via the REPL fill/solve loop. This is what users install the plugin for. | HIGH | Loads workspace index into REPL, root LLM (Sonnet) navigates, sub-calls to Haiku for mechanical search. Projected 2-5x token reduction vs. vanilla Explore agent. |

### Differentiators (Competitive Advantage)

Features that set this plugin apart from generic RLM plugins and Nx's own AI skills. These are the reasons a user would choose this plugin over alternatives.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Nx-native workspace model** | No existing RLM plugin understands Nx project graphs, dependency edges, path aliases, or project tags. Generic RLM plugins treat codebases as flat file trees. This plugin navigates the Nx graph structure natively. | MEDIUM | REPL globals include `deps(name)`, `dependents(name)`, project tags, targets. The workspace model is Nx-specific, not a generic file index. |
| **Sub-LLM model routing** | Root orchestration on Sonnet, mechanical sub-tasks on Haiku. No existing Claude Code RLM plugin implements model routing -- they all use a single model. The RLM paper shows depth-based routing is optimal. | MEDIUM | `llm_query(prompt)` defaults to Haiku. Root loop runs on Sonnet. Saves ~60-80% on sub-call costs vs. single-model approach. |
| **Impact analysis skill** (`/impact`) | Combines `nx affected` output with REPL-driven dependency traversal and Haiku risk classification. No competing plugin offers Nx-aware impact analysis. | MEDIUM | Script runs `nx affected --print`, REPL traverses graph, Haiku classifies risk per project. Projected ~15K tokens vs. 60-80K for manual multi-agent exploration. |
| **Cross-platform Node.js-only implementation** | Most RLM plugins require Python, Rust, Docker, or external services. This plugin needs only Node.js LTS -- the one runtime every Nx workspace already has. macOS, Linux, Windows (Git Bash). | LOW | Node.js VM for REPL, Node.js scripts for indexer/resolver, `child_process.execSync` for Nx CLI. Zero native modules. |
| **Context rot prevention by design** | The core RLM value: REPL isolation means intermediate search results, file contents, and dependency traversals never enter the main conversation. A 10-query session stays at ~50-60K tokens instead of 175-700K. | -- | This is architectural, not a discrete feature. Every REPL interaction is isolated; only `FINAL()` answers enter conversation context. |
| **Progressive workspace disclosure** | Instead of loading the full workspace index (8K tokens), load only project counts and top-level domains at session start (~2K), then expand on demand. Nx's own MCP server dumps everything; this plugin is selective. | LOW | Tier 1: domain summary (2K). Tier 2: domain detail on first query (1-3K). Tier 3: file content via REPL only (0 conversation tokens). |
| **Strategy hints** (model-specific REPL tips) | Prime Intellect's research shows strategy hints significantly improve RLM performance. Without hints, models sometimes underperform vs. base LLM. No existing plugin adapts hints to the workspace domain. | LOW | Workspace-specific hints injected into REPL system prompt: library naming conventions, domain structure, preferred search patterns. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem valuable but create problems. Documenting these prevents scope creep.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Persistent cross-session memory** (SQLite/knowledge graph) | 3 of 8 existing RLM plugins implement this (rand, EncrEor, memcp). Seems like a natural extension. | Adds massive complexity (SQLite, graph schemas, Hebbian learning, lifecycle management). The workspace index already provides structural memory deterministically. Cross-session memory is most valuable for document analysis, not codebase navigation where the source of truth is git. | The workspace index IS the persistent memory -- rebuilt from Nx CLI output each session. Git is the cross-session memory for code. |
| **Angular-specific registries** (component selectors, store classes, service providers) | The target workspace has 1,700 Angular components. Registries enable instant lookups. | Locks v1 to Angular, limiting the plugin to one framework. Regex scanning for decorators is brittle across Angular versions. TypeScript AST parsing is heavy. The generic Nx plugin serves a broader audience. | Defer to v2 milestone. V1 uses `search()` and `files()` globals for framework-agnostic patterns. Angular registries are a natural extension once the foundation proves value. |
| **MCP server integration** | 4 of 8 existing RLM plugins use MCP. Nx has its own MCP server. MCP is the dominant integration pattern in the landscape. | MCP adds tool definitions to the system prompt (consuming context tokens), requires server process management, and duplicates what skills + scripts already provide more efficiently. Nx's own blog post explains why they deleted most MCP tools in favor of skills. | Use skills and Node.js scripts. The REPL sandbox provides richer interaction than MCP tool calls. Reserve MCP only for future Nx Cloud CI integration. |
| **Hooks** (SessionStart, PreToolUse, PostToolUse, PreCompact) | Automate workspace indexing, intercept searches, cache results, preserve context before compaction. | Hooks add invisible behavior that is hard to debug. PreToolUse intercepts can confuse users when Claude behaves unexpectedly. PostToolUse caching adds stale data risk. SessionStart hooks slow down session initialization. V1 should prove value through explicit skill invocation before adding automation. | Defer to v1.x. V1 users manually invoke `/explore`, `/deps`, `/find`. If users consistently request "auto-index on session start", add SessionStart hook in v1.1. |
| **Token benchmarking / status dashboard** | Validates that RLM actually reduces tokens. The brainstorm proposes a `/status` command. | Premature optimization measurement. Building benchmarking infrastructure before the core REPL loop works is overhead. Manual validation (comparing token counts in Claude Code settings) is sufficient for v1. | Defer to v1.x. Validate token savings manually first. Add `/status` when there is evidence to show. |
| **Agent teams** (debug, review, refactor, migrate) | The brainstorm proposes 5 agent team workflows. Teams enable adversarial debugging and parallel refactoring. | Agent teams multiply token usage 3-10x. They require Claude Code's team features (not universally available), add massive complexity (team definitions, task management, worktree lifecycle, quality gates), and are unproven for RLM workflows. The brainstorm itself identifies that most RLM operations should NOT use agent teams. | Defer to v2+ milestone. The decision framework from the brainstorm is clear: only use teams when tasks require inter-agent communication AND file ownership boundaries AND the 3-10x cost is justified. |
| **S-expression DSL** (constrained REPL language) | Matryoshka uses S-expressions. Reduced entropy works better with smaller models. | JavaScript is natural for TS/Nx workspaces. Claude (Sonnet/Opus) generates JavaScript fluently. S-expressions add a learning curve for users reading REPL output. The target models (Sonnet, Haiku) are strong enough for JavaScript. | Use JavaScript REPL. The decision is already made in PROJECT.md. |
| **Semantic/vector search** (embeddings, BM25, hybrid) | Zilliz claude-context claims ~40% token reduction via semantic search. rlm-rs uses hybrid semantic+BM25. | Requires external embedding model (OpenAI, VoyageAI, Ollama), vector database, and index build time. Adds a dependency on AI infrastructure beyond Claude. The Nx workspace index + `git grep` provides deterministic, zero-cost search. Semantic search is valuable for natural language queries against documentation, not for navigating structured code. | Use `git grep` via the REPL's `search()` global for pattern search. Use the workspace index for structural queries. The combination covers 95% of codebase navigation needs without embedding infrastructure. |

## Feature Dependencies

```
[Workspace Index]
    |
    +--requires--> [REPL Sandbox]
    |                   |
    |                   +--requires--> [Execution Loop]
    |                   |                   |
    |                   |                   +--requires--> [Explore Skill]
    |                   |                   |
    |                   |                   +--enhances--> [Impact Skill]
    |                   |
    |                   +--requires--> [Handle Store]
    |                   |
    |                   +--requires--> [RLM Config/Guardrails]
    |
    +--requires--> [Nx CLI Wrapper]
    |                   |
    |                   +--enhances--> [REPL Sandbox] (nx() global)
    |
    +--requires--> [Deterministic Commands] (deps, find, alias)

[Sub-LLM Model Routing]
    +--enhances--> [Execution Loop] (Haiku sub-calls)
    +--enhances--> [Explore Skill]
    +--enhances--> [Impact Skill]

[Strategy Hints]
    +--enhances--> [Execution Loop] (better model behavior)

[Progressive Disclosure]
    +--enhances--> [Workspace Index] (selective loading)
```

### Dependency Notes

- **Workspace Index is the foundation:** Every other feature depends on the workspace index. It must be built first.
- **REPL Sandbox requires Workspace Index:** The REPL loads the workspace index as its primary navigable variable. Without the index, the REPL has nothing workspace-aware to navigate.
- **Execution Loop requires REPL Sandbox:** The fill/solve cycle executes code blocks in the sandbox. The loop cannot exist without the sandbox.
- **Explore Skill requires Execution Loop:** The user-facing exploration skill is the execution loop with workspace-specific system prompts and strategy hints.
- **Handle Store is a REPL component:** It is part of the sandbox infrastructure, managing large result sets. Must be built alongside the REPL.
- **Deterministic Commands are independent of REPL:** They read the workspace index directly via Node.js scripts. Can ship alongside or before the REPL.
- **Sub-LLM Routing enhances but does not block:** The execution loop works with a single model. Routing to Haiku for sub-calls is an optimization, not a dependency.
- **Impact Skill builds on Explore:** It combines `nx affected` output with REPL navigation. Requires the execution loop to be working first.

## MVP Definition

### Launch With (v1.0)

Minimum viable product -- what is needed to validate that RLM navigation actually reduces tokens and improves exploration quality in an Nx monorepo.

- [ ] **Workspace indexer** -- Node.js script building JSON index from Nx CLI output
- [ ] **Path resolver** -- Bidirectional tsconfig path alias resolution
- [ ] **REPL sandbox** -- Node.js VM with workspace-aware globals (`workspace`, `projects`, `deps()`, `dependents()`, `read()`, `files()`, `search()`, `nx()`, `llm_query()`, `FINAL()`, `FINAL_VAR()`, `print()`, `SHOW_VARS()`)
- [ ] **Handle-based result storage** -- Map store for large results, stub handles for LLM
- [ ] **RLM configuration** -- Guardrails: `maxIterations`, `maxDepth`, `maxTimeout`, `maxErrors`
- [ ] **Nx CLI wrapper** -- Allowlisted read-only commands with timeout and caching
- [ ] **Explore skill** -- RLM-powered codebase exploration via fill/solve loop
- [ ] **repl-executor agent** -- Drives the RLM execution loop as a subagent (isolated context)
- [ ] **haiku-searcher agent** -- Lightweight Haiku agent for mechanical search sub-calls
- [ ] **Deterministic commands** -- `/deps` (dependency tree), `/find` (project-scoped search), `/alias` (path alias lookup)

### Add After Validation (v1.x)

Features to add once the core REPL loop proves token savings and exploration quality.

- [ ] **Impact analysis skill** (`/impact`) -- Trigger: users manually tracing `nx affected` results
- [ ] **SessionStart hook** (auto-index) -- Trigger: users complaining about manual index rebuild
- [ ] **Strategy hints injection** -- Trigger: observing suboptimal REPL navigation strategies
- [ ] **Token benchmarking / status command** -- Trigger: need to quantify savings for adoption
- [ ] **PreCompact hook** (knowledge preservation) -- Trigger: users losing context during long sessions
- [ ] **Search optimization hook** (PreToolUse intercept) -- Trigger: users still spawning Explore agents for index-answerable queries
- [ ] **Result caching** (PostToolUse hook) -- Trigger: repeated identical searches in same session

### Future Consideration (v2+)

Features to defer until the foundation is proven and adopted.

- [ ] **Angular-specific registries** (component, store, service, route maps) -- Why defer: locks to one framework, regex scanning is brittle, broad Nx plugin serves more users first
- [ ] **Agent teams** (debug, review, refactor, migrate) -- Why defer: 3-10x token multiplier, requires Claude Code team features, massive complexity, unproven for RLM workflows
- [ ] **Additional skills** (analyze, test-gen, trace, patterns, search) -- Why defer: each requires the foundation to be stable; explore + impact cover the primary use cases
- [ ] **Generic RLM engine extraction** (`lz.rlm` standalone plugin) -- Why defer: internal modularity supports future extraction, but no separate plugin until Nx-specific value is proven
- [ ] **Semantic/vector search** -- Why defer: requires embedding infrastructure; `git grep` + workspace index covers 95% of navigation needs

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Workspace indexer | HIGH | MEDIUM | P1 |
| Path resolver | MEDIUM | LOW | P1 |
| REPL sandbox | HIGH | HIGH | P1 |
| Handle-based result storage | HIGH | MEDIUM | P1 |
| Execution loop (fill/solve) | HIGH | HIGH | P1 |
| RLM config/guardrails | MEDIUM | LOW | P1 |
| Nx CLI wrapper | HIGH | LOW | P1 |
| Explore skill | HIGH | HIGH | P1 |
| repl-executor agent | HIGH | MEDIUM | P1 |
| haiku-searcher agent | MEDIUM | MEDIUM | P1 |
| Deterministic commands (deps/find/alias) | HIGH | LOW | P1 |
| Sub-LLM model routing | MEDIUM | MEDIUM | P1 |
| Impact analysis skill | MEDIUM | MEDIUM | P2 |
| Strategy hints | MEDIUM | LOW | P2 |
| SessionStart hook | MEDIUM | LOW | P2 |
| Token benchmarking | LOW | MEDIUM | P2 |
| PreCompact hook | MEDIUM | MEDIUM | P2 |
| Angular registries | MEDIUM | HIGH | P3 |
| Agent teams | LOW | HIGH | P3 |
| Additional skills (analyze, trace, patterns) | MEDIUM | HIGH | P3 |
| Semantic/vector search | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch -- validates the core RLM hypothesis
- P2: Should have, add after core proves value
- P3: Nice to have, future milestone consideration

## Competitor Feature Analysis

| Feature | Nx AI Skills | rand/rlm-claude-code | coderlm (JaredStewart) | claude-context (Zilliz) | This Plugin |
|---------|-------------|---------------------|----------------------|------------------------|-------------|
| Workspace graph awareness | YES (native) | No | No | No | YES (via index) |
| REPL sandbox | No | Yes (Python) | No (HTTP API) | No | YES (Node.js VM) |
| Context externalization | No (skills dump into context) | Yes | Yes (tree-sitter server) | Yes (vector retrieval) | YES |
| Sub-LLM model routing | No | Yes (multi-provider) | No | No | YES (Sonnet root, Haiku sub) |
| Handle-based results | No | No | No | No (returns chunks) | YES |
| Budget/depth controls | No | Yes (detailed) | Moderate | No | YES |
| Persistent memory | No | Yes (SQLite + Hyperedges) | No | Yes (vector DB) | No (workspace index is deterministic) |
| Cross-session memory | No | Yes | No | Yes | No (git + index rebuild) |
| Tree-sitter indexing | No | No | Yes (7 languages) | No | No (Nx graph + git grep) |
| Semantic search | No | No | No | Yes (BM25 + vector) | No (git grep + index) |
| Cross-platform (Node.js only) | Yes | No (Rust + Python + Go) | No (Rust server) | No (embedding infra) | YES |
| Zero-token deterministic commands | Partial (nx CLI) | No | No | No | YES (3 commands) |
| Impact analysis (Nx affected) | Partial (CI monitoring) | No | No | No | YES |
| Knowledge graph | No | Yes (Hyperedges) | No | No | No |

**Key insight from the competitive analysis:** No existing plugin combines Nx workspace awareness with RLM context externalization. Nx's own tools provide the workspace graph but dump it into context. RLM plugins provide context externalization but treat codebases as flat file trees. This plugin occupies the intersection.

## Sources

### Research Corpus (local)
- `research/rlm/SYNTHESIS.md` -- RLM theory, architecture, 8 existing Claude Code plugin implementations
- `research/claude-plugin/BRAINSTORM.md` -- Detailed plugin design with token projections
- `research/claude-plugin/BRAINSTORM_AGENT_TEAMS.md` -- Agent team integration proposals

### Nx AI Integration (verified)
- [Enhance Your AI Coding Agent | Nx](https://nx.dev/docs/features/enhance-ai)
- [Teach Your AI Agent How to Work in a Monorepo | Nx Blog](https://nx.dev/blog/nx-ai-agent-skills)
- [Why we deleted (most of) our MCP tools | Nx Blog](https://nx.dev/blog/why-we-deleted-most-of-our-mcp-tools)
- [Nx MCP Server Reference | Nx](https://nx.dev/docs/reference/nx-mcp)
- [Nx 2026 Roadmap | Nx Blog](https://nx.dev/blog/nx-2026-roadmap)

### RLM Plugins (verified)
- [rand/rlm-claude-code](https://github.com/rand/rlm-claude-code) -- Most comprehensive RLM plugin (Rust + Python + Go)
- [JaredStewart/coderlm](https://github.com/JaredStewart/coderlm) -- Tree-sitter indexing server
- [zilliztech/claude-context](https://github.com/zilliztech/claude-context) -- Semantic code search MCP
- [massimodeluisa/recursive-decomposition-skill](https://github.com/massimodeluisa/recursive-decomposition-skill) -- RLM skill (progressive filtering)
- [zircote/rlm-rs](https://github.com/zircote/rlm-rs) -- Rust CLI RLM with hybrid search

### Claude Code Context Management (verified)
- [Manage costs effectively - Claude Code Docs](https://code.claude.com/docs/en/costs)
- [Hooks reference - Claude Code Docs](https://code.claude.com/docs/en/hooks)
- [Plugins reference - Claude Code Docs](https://code.claude.com/docs/en/plugins-reference)

---
*Feature research for: RLM-powered Nx monorepo navigation*
*Researched: 2026-03-03*
