# Phase 3: Agent + Explore - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning

<domain>
## Phase Boundary

The repl-executor subagent driving the REPL fill/solve loop and the explore skill as the primary user-facing integration point that validates the RLM token-savings thesis. Users ask natural language questions about their Nx workspace; the explore skill spawns the agent, which navigates via the REPL sandbox and returns only the distilled FINAL answer. Intermediate exploration stays in the agent's isolated context.

</domain>

<decisions>
## Implementation Decisions

### Agent system prompt

- **Exploration strategy**: Goal-driven -- decompose question into sub-goals, tackle each with targeted globals. Matches Matryoshka and official RLM fill/solve pattern.
- **Code blocks per turn**: One code block per agent message. Simpler to parse, each turn has one SandboxResult. Matches Hampton-io and Matryoshka conventions.
- **FINAL answer format**: Match query complexity. Never dump raw data into FINAL -- use FINAL_VAR() for large results. RLM convention is agnostic on format (FINAL() is passed verbatim). Token savings come from the isolation boundary, not from compressing the final answer.
- **Globals quick-reference**: Inline quick-reference (~200 tokens) listing all 12 globals with signatures in the system prompt. SHOW_VARS() is for user-defined variables, not API discovery. Matches all RLM reference implementations.
- **Premature FINAL prevention**: XML-structured two-phase prompt (Sonnet-optimized). `<phase name="explore">`: gather data, do NOT call FINAL. `<phase name="answer">`: verify findings, call FINAL. Sonnet's literal instruction-following enforces the phase boundary structurally. Informed by Ralph Loop research: external verification > self-assessment.
- **No mechanical iteration floor**: The phase boundary prevents premature FINAL without needing a minimum iteration count.

### Agent model and invocation

- **Model**: Sonnet for v0.0.1 repl-executor. One-line upgrade path: `model: sonnet` -> `model: opus`. Opus evaluation deferred pending effort parameter verification in agent frontmatter.
- **Agent invocation**: Explore skill instructs Claude to use the Task tool to spawn the repl-executor. Skills CAN direct Task spawning; agents defined in `agents/` CANNOT spawn sub-Tasks (task-spawning research constraint).
- **Agent tools**: `tools: ["Bash", "Read"]` -- Bash to run the sandbox, Read to optionally inspect files directly. Minimal per principle of least privilege.
- **Agent color**: Claude's discretion (distinct from other agents in the plugin).

### Explore skill interface

- **Invocation**: `/lz-nx.rlm:explore <question>` via `$ARGUMENTS`. Question is passed as a string argument.
- **No-question handling**: If `$ARGUMENTS` is empty, the skill returns a usage hint rather than spawning the agent.
- **Skill structure**: Workflow skill pattern. SKILL.md is thin orchestration: validate `$ARGUMENTS` -> ensure workspace index exists (auto-build if missing) -> spawn repl-executor via Task tool -> relay result.
- **Context passing to agent**: The skill passes to the agent prompt: (1) user's question, (2) workspace index path, (3) workspace root path, (4) plugin root path, (5) `maxIterations` from config.
- **Intermediate isolation**: The entire RLM thesis. Agent's exploration (code, sandbox results, variable assignments) stays in the agent's isolated 200K context. User conversation only receives the distilled FINAL answer.
- **Output format**: Verbatim FINAL by default. Diagnostic footer (iterations, time, variables) only when `--debug` flag is passed with the question.

### Guardrail behavior

- **Iteration self-tracking**: The skill embeds `maxIterations` from config in the agent prompt. The agent counts its own Bash sandbox calls via conversation history and forces FINAL when reaching the limit.
- **Forced answer on limit**: When the agent reaches `maxIterations`, it forces a transition from explore phase to answer phase: "Summarize what you found so far using FINAL()." Sonnet's literal instruction-following ensures compliance. RLM convention (SYNTHESIS.md): "maxIterations hard cap: on expiry, make one final LLM call requesting just the answer."
- **External safety net**: `max_turns` on the Task call set to `maxIterations + 2` (headroom for non-code turns). If the agent fails to self-terminate, the external ceiling cuts it off and the skill reports: "Exploration did not complete."
- **Consecutive errors**: Agent self-tracks via conversation history. After `maxConsecutiveErrors` consecutive sandbox errors, force FINAL with partial findings.
- **Stale loop detection**: Agent self-tracks via conversation history. If N consecutive turns produce identical output, force FINAL with available findings.

### Session lifecycle

- **Session scope**: Ephemeral -- one fresh session per explore invocation. Variables from a previous explore don't carry over. Matches Hampton-io, brainqub3, and MIT official convention.
- **Session file location**: `.cache/repl-session-<id>.json` (decided in Phase 2).
- **Session ID generation**: Implementation detail (UUID or timestamp). Claude's discretion.
- **Cleanup**: Delete session file after successful completion. On failure (no FINAL or forced partial), keep the session file for post-mortem inspection (pairs with `--debug` flag).

### Execution loop orchestration

- **Agent IS the loop**: Each agent turn is one RLM iteration. The agent generates a code block, calls Bash to run the sandbox with code on stdin, receives SandboxResult JSON, and decides: explore more or call FINAL.
- **SandboxResult bridges turns**: The sandbox returns `{ output, variables, final, finalVar, error }`. If `final` is set, the agent stops and returns the answer. If `error` is set, the agent adjusts its approach. If neither, the agent generates the next code block.
- **What the agent returns**: Plain text containing the FINAL answer. On forced answer (iteration limit), the text is a partial summary with honest scope disclaimer. The skill relays this text directly (or with diagnostic footer if `--debug`).

### Claude's Discretion

- Agent system prompt exact wording and structure (within the decided constraints: XML two-phase, inline globals reference, goal-driven strategy)
- Agent frontmatter `description` field triggering examples
- Agent color selection
- Session ID format (UUID vs timestamp)
- Exact `--debug` footer format
- How the skill detects `--debug` in `$ARGUMENTS` (prefix, suffix, or flag parsing)
- Session file cleanup timing (immediate vs deferred)
- Workspace index auto-build messaging to user during explore

</decisions>

<specifics>
## Specific Ideas

- The XML two-phase prompt structure was validated against Sonnet optimization research: "takes you literally, does exactly what you ask." Phase boundary is the structural guard against premature FINAL.
- Ralph Loop research informed the premature-FINAL prevention: external verification > self-assessment. The "external" mechanism here is the phase boundary enforced by Sonnet's literal instruction-following.
- Opus evaluation deferred as explicit future item: "Evaluate Opus with effort parameter for repl-executor token efficiency." Without controllable effort, Opus uses ~2x more output tokens; with effort at medium, matches Sonnet quality with 76% fewer tokens.
- The `--debug` flag pattern keeps production output clean while enabling v0.0.1 validation. Once the RLM approach is proven efficient, `--debug` becomes a power-user feature.
- Forced answer attempt on guardrail trigger ensures the user always gets something -- even if partial. This is critical for UX: a partial answer with honest scope disclaimer is more useful than "exploration failed."

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets

- `scripts/repl-sandbox.mjs`: `executeSandbox(code, options)` returns SandboxResult JSON. Accepts `--session`, `--index`, `--timeout`, `--plugin-root`, `--workspace-root` CLI args. Code via stdin. This is the direct interface the agent calls via Bash.
- `scripts/shared/repl-globals.mjs`: `createReplGlobals(index, workspaceRoot, printCapture, finalHandlers)` creates all 12 globals. Includes `BUILTIN_GLOBAL_NAMES` set for session filtering.
- `scripts/repl-session.mjs`: `readSession(path)` / `writeSession(path, sandbox, builtinNames)` for ephemeral session state. Creates parent directory automatically.
- `scripts/rlm-config.mjs`: `loadConfig(pluginRoot, workspaceRoot)` with three-layer merging (DEFAULTS <- plugin <- user). Provides `maxIterations`, `maxTimeout`, `maxConsecutiveErrors`, `maxStaleOutputs`, `maxNoCodeTurns`, `maxDepth`.
- `scripts/shared/index-loader.mjs`: `loadIndex(workspaceRoot)` with auto-build/rebuild and staleness detection.
- `scripts/shared/output-format.mjs`: ASCII formatting helpers (`formatInfo`, `formatSuccess`, `formatError`).

### Established Patterns

- ESM `.mjs` with `node:` prefix imports, zero npm dependencies
- CLI entry point guarded by `process.argv` suffix check + arg presence
- Code passed via stdin (fd 0, cross-platform per CLAUDE.md)
- `[OK]`, `[ERROR]`, `[WARN]`, `[INFO]` ASCII prefix tags
- Agent frontmatter: name, description (with examples), model, color, tools (per plugin-dev agent-development skill)
- Skill SKILL.md: YAML frontmatter (name, description, version) + markdown body (per plugin-dev skill-development skill)

### Integration Points

- Workspace index at `tmp/lz-nx.rlm/workspace-index.json` -- explore skill ensures this exists before spawning agent
- Session state at `.cache/repl-session-<id>.json` -- created per explore invocation, cleaned up after
- Config at `plugins/lz-nx.rlm/lz-nx.rlm.config.json` (defaults) and `.claude/lz-nx.rlm.config.json` (user overrides) -- skill reads `maxIterations` to embed in agent prompt
- Sandbox invocation: `echo '<code>' | node ${CLAUDE_PLUGIN_ROOT}/scripts/repl-sandbox.mjs --index <path> --session <path> --workspace-root <path> --plugin-root <path>`
- Agent defined at `plugins/lz-nx.rlm/agents/repl-executor.md`
- Skill defined at `plugins/lz-nx.rlm/skills/explore/SKILL.md`

</code_context>

<deferred>
## Deferred Ideas

- Evaluate Opus with effort parameter for repl-executor token efficiency -- future milestone after effort parameter support in agent frontmatter is verified
- Persistent explore sessions (build on previous exploration) -- not in v0.0.1; each explore is independent
- haiku-searcher agent for `llm_query()` sub-calls -- deferred to later milestone (AGNT-02); subagent nesting constraint, `Bash(claude -p)` workaround documented in task-spawning research
- Auto-invocation of repl-executor when Claude detects workspace exploration needs -- v0.0.1 uses explicit skill invocation only
- Token benchmarking integration with `--debug` output -- deferred to OBSV-01/OBSV-02

</deferred>

---

*Phase: 03-agent-explore*
*Context gathered: 2026-03-06*
