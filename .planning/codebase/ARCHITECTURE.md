# Architecture

**Analysis Date:** 2026-03-03

## Pattern Overview

**Overall:** Layered Claude Code plugin system with RLM (Recursive Language Model) execution core

**Key Characteristics:**
- "Scripts at the bottom, agents at the top": deterministic Node.js scripts form the foundation; Claude Code agents drive LLM-powered workflows on top
- Zero external npm dependencies -- all components use Node.js 24 LTS built-in modules only
- Context externalization pattern: intermediate exploration results never enter the main conversation; only distilled `FINAL()` answers cross the boundary
- Nx-native workspace model: the plugin understands Nx project graphs, dependency edges, path aliases, and project tags natively

**Status:** Pre-implementation. This documents the planned architecture from `.planning/PROJECT.md`, `.planning/research/ARCHITECTURE.md`, and `.planning/ROADMAP.md`. No `plugins/` directory exists yet. Phase 1 (Plugin Shell and Foundation) is next.

## Layers

**User Layer (Claude Code conversation):**
- Purpose: Entry points for user interaction -- slash commands and skills exposed by the plugin
- Location: `plugins/lz-nx.rlm/commands/` (zero-LLM deterministic commands), `plugins/lz-nx.rlm/skills/` (RLM-powered skills)
- Contains: Markdown files with frontmatter that Claude Code parses for command/skill registration
- Depends on: Agent layer (skills delegate to agents), Foundation scripts (commands invoke Node.js scripts directly via Bash tool)
- Used by: End users typing slash commands in Claude Code

**Agent Layer:**
- Purpose: Drive LLM execution loops and perform model-routed work
- Location: `plugins/lz-nx.rlm/agents/`
- Contains: `repl-executor.md` (Sonnet agent, drives fill/solve loop), `haiku-searcher.md` (Haiku agent, mechanical search sub-calls)
- Depends on: REPL sandbox (via Bash tool invoking `node scripts/repl-sandbox.mjs`), Foundation scripts
- Used by: Skills (skills instruct Claude to spawn agents as subagents)

**REPL Sandbox:**
- Purpose: Execute LLM-generated JavaScript in an isolated Node.js VM context; keep intermediate results out of conversation context
- Location: `plugins/lz-nx.rlm/scripts/repl-sandbox.mjs`
- Contains: `node:vm` context with workspace-aware globals; handle store integration; variable persistence via `const/let` -> `globalThis` transformation
- Depends on: Foundation scripts (workspace-indexer, handle-store, rlm-config, nx-runner)
- Used by: Agent layer (repl-executor agent invokes sandbox per REPL turn)

**Foundation Scripts:**
- Purpose: Deterministic, zero-LLM Node.js scripts that build and query the workspace index
- Location: `plugins/lz-nx.rlm/scripts/`
- Contains: `workspace-indexer.mjs`, `path-resolver.mjs`, `nx-runner.mjs`, `handle-store.mjs`, `rlm-config.mjs`
- Depends on: External layer only (Nx CLI, filesystem, git)
- Used by: REPL sandbox (as injected globals), commands (directly via Bash tool), agents

**External:**
- Nx CLI (`nx show projects --json`, `nx graph --print`, `nx show project <name>`)
- Filesystem (file reading, glob matching)
- Git (`git grep` for `search()` REPL global)

## Data Flow

**RLM explore skill invocation (`/lz-nx.rlm:explore "question"`):**

1. User types `/lz-nx.rlm:explore "Where is X?"`
2. Claude reads `plugins/lz-nx.rlm/skills/explore/SKILL.md` and spawns `repl-executor` subagent
3. `repl-executor` agent receives query and workspace index path
4. Agent loads `workspace-index.json` as REPL `workspace` variable
5. Agent generates JavaScript in `repl` code blocks
6. REPL sandbox executes code via `node:vm` `vm.runInContext()`
7. If code returns large result (>10 items), result stored in handle store; LLM receives stub: `"$res1: Array(247) [...]"`
8. REPL returns `{ stdout, stderr, locals, error }` to agent
9. Agent appends truncated output as user message (2KB cap), generates next code block
10. Loop continues until `FINAL(answer)` is called or guardrail limit reached
11. `FINAL()` answer returned to main conversation; intermediate results discarded
12. Main conversation displays distilled result (only this enters conversation context)

**Deterministic command flow (`/lz-nx.rlm:deps my-project`):**

1. User types `/lz-nx.rlm:deps my-project`
2. Command markdown in `plugins/lz-nx.rlm/commands/deps.md` invokes: `node ${CLAUDE_PLUGIN_ROOT}/scripts/deps-tree.mjs my-project`
3. Script reads `workspace-index.json`
4. Script walks adjacency list in `index.deps`, formats dependency tree
5. Output displayed directly -- zero LLM tokens consumed

**Handle store flow (large result compression):**

1. REPL code: `let results = search("AuthService", allPaths)`
2. `search()` function calls `git grep`, returns 247 matches -- exceeds threshold
3. Results stored in `HandleStore` Map: `{ "$res1": [...247 items...] }`
4. LLM receives stub only: `"$res1: Array(247) [libs/auth/src/..., ...]"` (~50 tokens vs ~12K)
5. LLM navigates: `let subset = handle.filter("$res1", item => item.path.includes("feature"))`
6. `filter()` runs server-side on stored data, returns new handle `"$res2"`
7. Only materialized preview data enters LLM context

**State Management:**
- Workspace index: JSON file (`workspace-index.json`) built once per session by `workspace-indexer.mjs`; read-only during REPL execution
- Handle store: in-memory `Map<string, unknown[]>` scoped to one REPL session; discarded when sandbox is reset
- REPL variable state: `globalThis` properties on the vm context; persisted across turns within one execution loop
- RLM config: loaded once from `.claude/rlm-config.json` (or defaults) at session start

## Key Abstractions

**WorkspaceIndex:**
- Purpose: Structured representation of the entire Nx monorepo as a JSON-serializable object; the primary navigable variable in the REPL
- Examples: `plugins/lz-nx.rlm/scripts/workspace-indexer.mjs` (builder), loaded as `workspace` REPL global
- Schema:
  ```javascript
  {
    version: number,
    generated: string,          // ISO timestamp
    root: string,               // workspace root path
    projects: Record<string, { name, root, type, tags, targets }>,
    deps: Record<string, string[]>,         // adjacency list
    reverseDeps: Record<string, string[]>,  // reverse adjacency
    aliases: Record<string, string>,        // tsconfig path aliases
    stats: { projectCount, fileCount }
  }
  ```

**REPL Globals (Sandbox API):**
- Purpose: Workspace-aware functions injected into the vm context; the interface between LLM-generated code and the underlying data
- Examples: defined in `plugins/lz-nx.rlm/scripts/repl-sandbox.mjs`
- Key globals: `workspace`, `projects`, `deps(name)`, `dependents(name)`, `read(path, start?, end?)`, `files(glob)`, `search(pattern, paths?)`, `nx(command)`, `llm_query(prompt)`, `FINAL(answer)`, `FINAL_VAR(name)`, `print(...args)`, `SHOW_VARS()`

**Handle:**
- Purpose: Lightweight reference to a large result set stored server-side; prevents large arrays from entering LLM context
- Examples: defined in `plugins/lz-nx.rlm/scripts/handle-store.mjs`
- Pattern: auto-incrementing names (`$res1`, `$res2`); stub format `"$res1: Array(537) [preview...]"`
- Operations: `store(data)`, `get(handle)`, `stub(handle)`, `preview(handle, n)`, `filter(handle, predicate)`, `count(handle)`

**RLM Execution Loop:**
- Purpose: The fill/solve cycle -- LLM generates code (fill), sandbox executes and appends result (solve), repeat until `FINAL()` or guardrail
- Examples: implemented in `repl-executor` agent (`plugins/lz-nx.rlm/agents/repl-executor.md`) using Bash tool to invoke `repl-sandbox.mjs`
- Guardrails: `maxIterations` (default 20), `maxConsecutiveErrors` (default 3), `maxTimeout` (default 120s), `maxDepth` (default 2)

**Claude Code Plugin Manifest:**
- Purpose: Declares plugin identity, version, and auto-registration metadata for Claude Code discovery
- Examples: `plugins/lz-nx.rlm/.claude-plugin/plugin.json`
- Pattern: Standard Claude Code plugin structure per `AGENTS.md` conventions

## Entry Points

**`/lz-nx.rlm:explore` skill:**
- Location: `plugins/lz-nx.rlm/skills/explore/SKILL.md` (planned)
- Triggers: User invokes `/lz-nx.rlm:explore "question"` in Claude Code
- Responsibilities: Accept natural language question, instruct Claude to spawn `repl-executor` subagent, surface only the `FINAL()` answer to conversation

**`/lz-nx.rlm:deps` command:**
- Location: `plugins/lz-nx.rlm/commands/deps.md` (planned)
- Triggers: User invokes `/lz-nx.rlm:deps <project-name>`
- Responsibilities: Run `node scripts/deps-tree.mjs <project>`, print dependency tree from workspace index; zero LLM tokens

**`/lz-nx.rlm:find` command:**
- Location: `plugins/lz-nx.rlm/commands/find.md` (planned)
- Triggers: User invokes `/lz-nx.rlm:find <pattern>`
- Responsibilities: Search files scoped to Nx project source roots using workspace index; zero LLM tokens

**`/lz-nx.rlm:alias` command:**
- Location: `plugins/lz-nx.rlm/commands/alias.md` (planned)
- Triggers: User invokes `/lz-nx.rlm:alias <input>`
- Responsibilities: Bidirectional tsconfig path alias resolution (alias <-> filesystem path); zero LLM tokens

**`repl-executor` agent:**
- Location: `plugins/lz-nx.rlm/agents/repl-executor.md` (planned)
- Triggers: Spawned by `explore` skill (and future skills) as a Claude Code subagent
- Responsibilities: Drive RLM fill/solve execution loop on Sonnet; isolate intermediate exploration from parent conversation
- Nesting constraint: Claude Code enforces a single-level agent hierarchy. Subagents cannot spawn other subagents (the Task tool is not exposed to them), and teammates cannot create their own teams. The `repl-executor` agent therefore cannot delegate sub-exploration to nested agents. The `claude -p` Bash workaround exists but is unsupported -- it loses visibility, token accounting, and structured result passing. Design implication: all agent coordination must happen at the top level (main conversation or team lead), not within `repl-executor`. If deeper decomposition is needed, the main skill should spawn multiple flat subagents rather than nesting them.

## Error Handling

**Strategy:** Errors returned to LLM for self-correction; consecutive error counter halts on repeated failures

**Patterns:**
- Sandbox execution errors are appended as user messages: `"Error: <message>\nFix the error and try again."` -- allows LLM to self-correct
- `maxConsecutiveErrors` (default 3) aborts loop after N back-to-back failures: `"[ERROR] Aborted after 3 consecutive errors."`
- `maxIterations` (default 20) halts loop with: `"[ERROR] Max iterations reached without FINAL answer."`
- `maxTimeout` (default 120s) enforces wall-clock limit; each code block has a 5s individual sandbox timeout
- No-code response (LLM returns text without code blocks) triggers nudge: `"Write code to explore the workspace or call FINAL(answer)."`
- Graceful degradation: workspace index missing -> fall back to `nx show projects` at query time; REPL sandbox error -> return error to conversation, suggest manual Explore

## Cross-Cutting Concerns

**Logging:** ASCII-only output to stdout/stderr in all scripts (no emojis; Windows cp1252 compatibility required per `AGENTS.md`)

**Validation:** Nx-runner allowlist enforces read-only Nx CLI commands; REPL sandbox restricts globals (no `process`, `require`, `child_process` directly); `codeGeneration: { strings: false, wasm: false }` blocks `eval()` in sandbox

**Authentication:** None for v1; `llm_query()` (if implemented via direct API call in Phase 4) requires `ANTHROPIC_API_KEY` from environment; the Claude Code plugin system handles model routing via native subagent declarations

**Model Routing:**
| Operation | Model | Config |
|-----------|-------|--------|
| `repl-executor` agent | Sonnet | `model: sonnet` in agent frontmatter |
| `haiku-searcher` agent | Haiku | `model: haiku` in agent frontmatter |
| Main conversation | User's choice | Plugin does not override |
| Foundation scripts | None (Node.js) | Pure data transformation |

**Cross-platform:** All scripts use `.mjs` (ESM), Node.js built-in modules only, `node:path` for path manipulation, `child_process.execSync` for CLI calls -- no shell-specific syntax, runs identically on macOS, Linux, and Windows (Git Bash)

---

*Architecture analysis: 2026-03-03*
