# Phase 3: Agent + Explore - Research

**Researched:** 2026-03-06
**Domain:** Claude Code plugin agents, skills, and RLM execution loop integration
**Confidence:** HIGH

## Summary

Phase 3 integrates the repl-executor subagent and explore skill as the user-facing entry point for RLM-powered workspace exploration. All foundation scripts (Phase 1) and REPL sandbox engine (Phase 2) are complete and tested. The implementation requires two new files -- `agents/repl-executor.md` (agent definition with XML two-phase system prompt) and `skills/explore/SKILL.md` (skill definition with Task/Agent tool orchestration) -- plus their integration with the existing `scripts/repl-sandbox.mjs`, `scripts/rlm-config.mjs`, and `scripts/shared/index-loader.mjs`.

The research confirms that Claude Code's plugin system auto-discovers agents in `agents/` and skills in `skills/<name>/SKILL.md` directories at the plugin root. Agent files use YAML frontmatter (name, description, model, tools) followed by a markdown system prompt. Skills use YAML frontmatter (name, description, argument-hint, disable-model-invocation) followed by workflow instructions that Claude executes. The `$ARGUMENTS` variable provides user input, and `${CLAUDE_PLUGIN_ROOT}` resolves to the plugin's absolute path in hooks/scripts (but NOT in skill markdown -- use inline Bash commands instead).

The core design challenge is the XML two-phase system prompt for the repl-executor agent. Sonnet's literal instruction-following (documented in Anthropic's Claude 4 best practices) makes XML phase boundaries an effective structural guard against premature FINAL calls. The agent receives workspace context via the explore skill's Task tool prompt, not through its own file reads.

**Primary recommendation:** Implement in two deliverables: (1) repl-executor agent with XML two-phase prompt and inline globals quick-reference, (2) explore skill with argument validation, index auto-build, agent spawning via Task tool, and result relay with optional `--debug` footer.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Exploration strategy**: Goal-driven -- decompose question into sub-goals, tackle each with targeted globals. Matches Matryoshka and official RLM fill/solve pattern.
- **Code blocks per turn**: One code block per agent message. Simpler to parse, each turn has one SandboxResult. Matches Hampton-io and Matryoshka conventions.
- **FINAL answer format**: Match query complexity. Never dump raw data into FINAL -- use FINAL_VAR() for large results. RLM convention is agnostic on format (FINAL() is passed verbatim). Token savings come from the isolation boundary, not from compressing the final answer.
- **Globals quick-reference**: Inline quick-reference (~200 tokens) listing all 12 globals with signatures in the system prompt. SHOW_VARS() is for user-defined variables, not API discovery. Matches all RLM reference implementations.
- **Premature FINAL prevention**: XML-structured two-phase prompt (Sonnet-optimized). `<phase name="explore">`: gather data, do NOT call FINAL. `<phase name="answer">`: verify findings, call FINAL. Sonnet's literal instruction-following enforces the phase boundary structurally. Informed by Ralph Loop research: external verification > self-assessment.
- **No mechanical iteration floor**: The phase boundary prevents premature FINAL without needing a minimum iteration count.
- **Model**: Sonnet for v0.0.1 repl-executor. One-line upgrade path: `model: sonnet` -> `model: opus`.
- **Agent invocation**: Explore skill instructs Claude to use the Task tool to spawn the repl-executor. Skills CAN direct Task spawning; agents defined in `agents/` CANNOT spawn sub-Tasks (task-spawning research constraint).
- **Agent tools**: `tools: ["Bash", "Read"]` -- Bash to run the sandbox, Read to optionally inspect files directly.
- **Invocation**: `/lz-nx.rlm:explore <question>` via `$ARGUMENTS`. Question is passed as a string argument.
- **No-question handling**: If `$ARGUMENTS` is empty, the skill returns a usage hint rather than spawning the agent.
- **Skill structure**: Workflow skill pattern. SKILL.md is thin orchestration: validate `$ARGUMENTS` -> ensure workspace index exists (auto-build if missing) -> spawn repl-executor via Task tool -> relay result.
- **Context passing to agent**: The skill passes to the agent prompt: (1) user's question, (2) workspace index path, (3) workspace root path, (4) plugin root path, (5) `maxIterations` from config.
- **Intermediate isolation**: Agent's exploration stays in the agent's isolated 200K context. User conversation only receives the distilled FINAL answer.
- **Output format**: Verbatim FINAL by default. Diagnostic footer (iterations, time, variables) only when `--debug` flag is passed with the question.
- **Iteration self-tracking**: The skill embeds `maxIterations` from config in the agent prompt. The agent counts its own Bash sandbox calls via conversation history and forces FINAL when reaching the limit.
- **Forced answer on limit**: When the agent reaches `maxIterations`, it forces transition from explore phase to answer phase.
- **External safety net**: `max_turns` on the Task call set to `maxIterations + 2` (headroom for non-code turns).
- **Consecutive errors**: Agent self-tracks via conversation history. After `maxConsecutiveErrors` consecutive sandbox errors, force FINAL with partial findings.
- **Stale loop detection**: Agent self-tracks via conversation history. If N consecutive turns produce identical output, force FINAL with available findings.
- **Session scope**: Ephemeral -- one fresh session per explore invocation.
- **Session file location**: `.cache/repl-session-<id>.json` (decided in Phase 2).
- **Cleanup**: Delete session file after successful completion. On failure, keep for post-mortem.
- **Agent IS the loop**: Each agent turn is one RLM iteration. Agent generates code, calls Bash to run sandbox, receives SandboxResult JSON, decides: explore more or call FINAL.
- **SandboxResult bridges turns**: The sandbox returns `{ output, variables, final, finalVar, error }`.
- **What the agent returns**: Plain text containing the FINAL answer.

### Claude's Discretion

- Agent system prompt exact wording and structure (within the decided constraints: XML two-phase, inline globals reference, goal-driven strategy)
- Agent frontmatter `description` field triggering examples
- Agent color selection
- Session ID format (UUID vs timestamp)
- Exact `--debug` footer format
- How the skill detects `--debug` in `$ARGUMENTS` (prefix, suffix, or flag parsing)
- Session file cleanup timing (immediate vs deferred)
- Workspace index auto-build messaging to user during explore

### Deferred Ideas (OUT OF SCOPE)

- Evaluate Opus with effort parameter for repl-executor token efficiency
- Persistent explore sessions (build on previous exploration)
- haiku-searcher agent for `llm_query()` sub-calls (AGNT-02)
- Auto-invocation of repl-executor when Claude detects workspace exploration needs
- Token benchmarking integration with `--debug` output

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AGNT-01 | `repl-executor` agent drives the RLM execution loop as a Sonnet subagent with isolated context, receiving the workspace index and returning only the distilled `FINAL()` answer | Agent markdown format fully specified (frontmatter fields, system prompt, model selection, tools restriction). XML two-phase prompt pattern validated against Sonnet optimization research. Task tool mechanics documented for spawning and `max_turns` control. |
| SKIL-01 | `/lz-nx.rlm:explore` skill accepts a natural language question about the codebase, navigates via the REPL fill/solve loop, and returns only the distilled answer to the conversation | Skill SKILL.md format fully specified (frontmatter, `$ARGUMENTS`, `${CLAUDE_SKILL_DIR}`). Workflow skill pattern documented. Agent spawning from skills via Task tool confirmed as supported. Integration points with existing scripts verified. |

</phase_requirements>

## Standard Stack

### Core

| Component | Location | Purpose | Why Standard |
|-----------|----------|---------|--------------|
| Agent markdown | `agents/repl-executor.md` | Defines Sonnet subagent with XML two-phase system prompt | Claude Code auto-discovers agents in `agents/` directory |
| Skill SKILL.md | `skills/explore/SKILL.md` | User-facing explore command with Task tool orchestration | Claude Code auto-discovers skills in `skills/<name>/SKILL.md` |
| repl-sandbox.mjs | `scripts/repl-sandbox.mjs` | REPL execution engine (Phase 2, complete) | Already implemented and tested |
| rlm-config.mjs | `scripts/rlm-config.mjs` | Guardrails config loader (Phase 2, complete) | Three-layer merging, provides maxIterations |
| index-loader.mjs | `scripts/shared/index-loader.mjs` | Workspace index with auto-build (Phase 1, complete) | Staleness detection and auto-rebuild |

### Supporting

| Component | Location | Purpose | When to Use |
|-----------|----------|---------|-------------|
| repl-session.mjs | `scripts/repl-session.mjs` | Session state persistence | Each explore invocation creates ephemeral session |
| output-format.mjs | `scripts/shared/output-format.mjs` | ASCII formatting helpers | For skill messaging (auto-build notices, errors) |

### No Alternatives Needed

All decisions are locked. No library selection required -- the implementation uses only Claude Code's native plugin system (markdown files) and existing Phase 1/2 scripts (zero npm dependencies).

## Architecture Patterns

### Project Structure (New Files)

```
plugins/lz-nx.rlm/
  agents/
    repl-executor.md          # NEW: Sonnet subagent definition
  skills/
    explore/
      SKILL.md                # NEW: Explore skill definition
```

### Pattern 1: Agent Markdown with YAML Frontmatter

**What:** Claude Code agents are defined as markdown files with YAML frontmatter for configuration and a markdown body as the system prompt.

**When to use:** For all plugin agents.

**Specification** (from official Claude Code docs):

```yaml
---
name: repl-executor
description: |
  RLM execution loop agent for Nx workspace exploration.
  Use when the explore skill needs to navigate workspace data
  via the REPL fill/solve cycle.
model: sonnet
tools:
  - Bash
  - Read
---

[System prompt in markdown body]
```

Required frontmatter fields: `name`, `description`

Optional fields used here: `model` (sonnet), `tools` (Bash, Read)

Available but not used: `permissionMode`, `maxTurns` (set on Task call instead), `skills`, `mcpServers`, `hooks`, `memory`, `background`, `isolation`, `disallowedTools`

**Source:** [Claude Code subagent docs](https://code.claude.com/docs/en/sub-agents) (HIGH confidence)

### Pattern 2: Skill SKILL.md with Workflow Orchestration

**What:** Skills are directories with a `SKILL.md` file. The skill validates input, manages prerequisites, spawns the agent via Task tool, and relays results.

**When to use:** For the explore skill entry point.

**Specification** (from official Claude Code docs):

```yaml
---
name: explore
description: >
  Explore an Nx workspace by asking natural language questions.
  Navigates via the REPL fill/solve loop and returns only the
  distilled answer.
argument-hint: <question> [--debug]
disable-model-invocation: true
---

[Workflow instructions]
```

Key fields:
- `$ARGUMENTS`: All arguments passed when invoking the skill
- `${CLAUDE_SKILL_DIR}`: The directory containing the SKILL.md (for referencing bundled files)
- `${CLAUDE_PLUGIN_ROOT}` is NOT substituted in skill markdown content -- only in hooks.json. Use inline Bash commands for path resolution.
- `disable-model-invocation: true`: Prevents Claude from auto-triggering (user must type `/lz-nx.rlm:explore`)

**Source:** [Claude Code skills docs](https://code.claude.com/docs/en/skills) (HIGH confidence)

### Pattern 3: XML Two-Phase System Prompt (Sonnet-Optimized)

**What:** The agent system prompt uses XML tags to define two distinct phases that Sonnet follows literally.

**When to use:** For the repl-executor agent to prevent premature FINAL calls.

**Structure:**

```xml
<role>
You are an Nx workspace exploration agent...
</role>

<globals>
Available REPL globals:
- workspace: Full workspace index object
- projects: Project entries keyed by name
- deps(name): Get dependency targets
- dependents(name): Get reverse dependencies
- read(path, start?, end?): Read file content
- files(glob): List files matching pattern
- search(pattern, paths?): Search with git grep
- nx(command): Run read-only Nx CLI command
- print(...args): Print output (truncated)
- SHOW_VARS(): List user-defined variables
- FINAL(answer): Set final answer (string)
- FINAL_VAR(name): Set final answer from variable
</globals>

<phase name="explore">
## Exploration Phase
- Decompose the question into sub-goals
- Use targeted globals to gather data
- Store intermediate results in variables
- Do NOT call FINAL() during this phase
- Generate ONE code block per turn
</phase>

<phase name="answer">
## Answer Phase
- Verify your findings are complete
- Synthesize a clear, concise answer
- Call FINAL(answer) with the distilled result
- For large results, use FINAL_VAR(variableName)
</phase>

<guardrails>
...iteration tracking, error handling, stale detection...
</guardrails>
```

**Why this works:** Sonnet "takes you literally, does exactly what you ask." The phase boundary is a structural guard. The agent stays in explore phase until it has sufficient data, then transitions to answer phase.

**Source:** Anthropic's [Claude 4 best practices](https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/claude-4-best-practices) + project's prompt-engineering/MODEL-OPTIMIZATION-SONNET.md (HIGH confidence)

### Pattern 4: Task Tool Spawning from Skills

**What:** Skills can instruct Claude to use the Task/Agent tool to spawn a subagent with specific parameters.

**When to use:** For the explore skill to spawn the repl-executor agent.

**Key parameters:**

| Parameter | Value for explore | Purpose |
|-----------|------------------|---------|
| `description` | "Explore Nx workspace" | UI label |
| `prompt` | Constructed from user question + context | Full task instructions |
| `subagent_type` | "repl-executor" | Routes to the named agent |
| `model` | (inherited from agent def) | Sonnet |
| `max_turns` | `maxIterations + 2` | External safety net |

**Critical constraint:** Agents defined in `agents/` CANNOT spawn sub-Tasks. Only the main thread (or a skill running in main context) can spawn Tasks. This is by design (GitHub Issue #4182).

**Note on naming:** In Claude Code v2.1.63+, the Task tool was renamed to Agent tool. Existing `Task(...)` references still work as aliases.

**Source:** [Task-spawning research](research/task-spawning/TASK-SPAWNING-GUIDE.md), [Claude Code subagent docs](https://code.claude.com/docs/en/sub-agents) (HIGH confidence)

### Pattern 5: Sandbox Invocation from Agent

**What:** The agent runs the REPL sandbox by invoking Bash with code piped to stdin.

**When to use:** Each agent turn that generates a code block.

**Invocation pattern:**

```bash
echo '<generated_code>' | node ${PLUGIN_ROOT}/scripts/repl-sandbox.mjs \
  --index <workspace_index_path> \
  --session <session_path> \
  --workspace-root <workspace_root> \
  --plugin-root <plugin_root>
```

**SandboxResult JSON returned:**

```json
{
  "output": "printed output from code execution",
  "variables": { "key": "value" },
  "final": "the FINAL answer or null",
  "finalVar": "variable name or null",
  "error": "error message or null"
}
```

**Decision logic after each turn:**
- If `final` is set: Agent stops, returns the final answer text
- If `error` is set: Agent adjusts approach for next turn
- If neither: Agent generates next code block (next explore phase iteration)

**Source:** Existing `scripts/repl-sandbox.mjs` (Phase 2, verified in codebase) (HIGH confidence)

### Anti-Patterns to Avoid

- **Skill doing the REPL loop directly:** The skill MUST delegate to the agent. The isolation boundary (agent's separate 200K context) is the entire RLM thesis. If the skill ran the loop inline, all intermediate results would pollute the main conversation.
- **Agent reading its own config:** The agent receives all context via the Task prompt. It should NOT read config files itself -- the skill reads config and embeds values in the prompt.
- **Using `context: fork` on the skill:** The skill runs in the main conversation context (NOT forked). It orchestrates the agent spawn and relays results. If the skill forked, it couldn't relay the agent's response back to the user.
- **Multiple code blocks per agent turn:** Each turn produces exactly ONE code block + ONE Bash call. Multiple blocks per turn break the SandboxResult-per-turn assumption and complicate iteration counting.
- **Using `${CLAUDE_PLUGIN_ROOT}` in SKILL.md content:** This variable is NOT substituted in skill markdown. The skill must use other approaches to resolve paths (e.g., `${CLAUDE_SKILL_DIR}` to find the skill directory, or construct the plugin root by going up two levels from `${CLAUDE_SKILL_DIR}`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Agent definition format | Custom agent config files | `agents/repl-executor.md` with YAML frontmatter | Claude Code auto-discovers and parses this format |
| Skill definition format | Custom skill registration | `skills/explore/SKILL.md` with YAML frontmatter | Claude Code auto-discovers and manages skill lifecycle |
| Agent spawning mechanism | Custom subprocess management | Claude's Task/Agent tool | Handles context isolation, model routing, turn limits |
| REPL sandbox execution | New sandbox implementation | Existing `repl-sandbox.mjs` via Bash | Complete Phase 2 deliverable, fully tested |
| Config loading | Inline config parsing | Existing `rlm-config.mjs` loadConfig() | Three-layer merging already implemented |
| Workspace index management | Custom index building | Existing `index-loader.mjs` loadIndex() | Auto-build/rebuild with staleness detection |
| Session state management | Custom state persistence | Existing `repl-session.mjs` read/writeSession() | Already handles create/read/write/cleanup |

**Key insight:** Phase 3 creates only TWO new files (agent markdown + skill markdown). All execution logic is already built in Phase 1 and Phase 2 scripts. The new files are orchestration/configuration, not code.

## Common Pitfalls

### Pitfall 1: CLAUDE_PLUGIN_ROOT Not Available in Skill Content

**What goes wrong:** `${CLAUDE_PLUGIN_ROOT}` is substituted in `hooks.json` but NOT in skill markdown content or agent system prompts. Using it directly in SKILL.md produces a literal string, not the resolved path.

**Why it happens:** The plugin system substitutes environment variables only in specific contexts (hooks, MCP configs). Skill content and agent prompts use different substitution mechanisms (`$ARGUMENTS`, `${CLAUDE_SKILL_DIR}`).

**How to avoid:** The skill must determine paths at runtime. Options:
1. Use `${CLAUDE_SKILL_DIR}` (resolves to `plugins/lz-nx.rlm/skills/explore/`) and derive plugin root by navigating up.
2. Instruct Claude to use inline Bash commands to resolve paths.
3. The agent system prompt can reference paths passed in its Task prompt (the skill constructs these).

**Warning signs:** Literal `${CLAUDE_PLUGIN_ROOT}` appearing in agent output or sandbox commands.

### Pitfall 2: Agents Cannot Spawn Sub-Tasks

**What goes wrong:** The agent's `tools` field includes `["Bash", "Read"]` -- NOT the Task/Agent tool. If the agent tries to spawn a sub-task, it fails silently.

**Why it happens:** Claude Code deliberately excludes the Task tool from spawned agents to prevent infinite nesting (GitHub Issue #4182).

**How to avoid:** The repl-executor agent only uses Bash (to run sandbox) and Read (to optionally inspect files). All orchestration (spawning the agent, setting max_turns) happens in the explore skill, which runs in the main conversation context.

**Warning signs:** Agent prompt containing instructions to "spawn a sub-agent" or "use the Task tool."

### Pitfall 3: max_turns vs maxIterations Confusion

**What goes wrong:** `maxIterations` (from rlm-config) limits REPL sandbox calls (code execution turns). `max_turns` (Task tool parameter) limits total API round-trips including non-code turns (thinking, asking questions). Setting them equal causes premature termination.

**Why it happens:** The agent sometimes uses non-code turns (analyzing results, planning next step) that consume max_turns but are not REPL iterations.

**How to avoid:** Set `max_turns` to `maxIterations + 2` (decided in CONTEXT.md). The +2 provides headroom for non-code turns. The agent self-tracks iteration count via its conversation history.

**Warning signs:** "Exploration did not complete" errors when the agent was still within its iteration budget.

### Pitfall 4: Session File Leaks

**What goes wrong:** Session files at `.cache/repl-session-<id>.json` accumulate if cleanup fails.

**Why it happens:** If the explore skill fails before cleanup, or the agent crashes, session files are orphaned.

**How to avoid:** Decision from CONTEXT.md: delete session file after successful completion; keep on failure for post-mortem. The skill handles cleanup, not the agent.

**Warning signs:** Growing `.cache/` directory with stale session files.

### Pitfall 5: Code in stdin Containing Single Quotes

**What goes wrong:** When the agent generates code containing single quotes and the skill wraps it in `echo '...' | node sandbox.mjs`, the shell interprets the quotes and breaks the command.

**Why it happens:** JavaScript code frequently contains string literals with single quotes.

**How to avoid:** The agent must use heredoc syntax or properly escape quotes when passing code to the sandbox via Bash stdin. The system prompt should demonstrate the correct invocation pattern. Using `cat <<'REPL_CODE' | node ...` with quoted heredoc delimiter prevents all shell expansion.

**Warning signs:** Syntax errors from the sandbox that don't match the generated code.

### Pitfall 6: Premature FINAL on Simple Questions

**What goes wrong:** For trivially answerable questions ("How many projects?"), the agent might skip exploration and call FINAL immediately with an incorrect answer based on assumptions.

**Why it happens:** The agent "knows" it should be efficient and tries to answer without verifying.

**How to avoid:** The XML two-phase prompt explicitly forbids FINAL during the explore phase. Even for simple questions, the agent must execute at least one sandbox call to verify the answer before transitioning to the answer phase.

**Warning signs:** FINAL answers that are wrong but plausible, especially for simple counting queries.

## Code Examples

### Example 1: Agent Frontmatter

```yaml
# Source: Claude Code subagent docs (https://code.claude.com/docs/en/sub-agents)
---
name: repl-executor
description: |
  RLM execution loop agent for Nx workspace exploration.
  Drives the REPL fill/solve cycle to answer natural language
  questions about Nx workspace structure, dependencies, and code.
  Examples: "How many projects are there?", "What depends on shared-utils?",
  "Which projects have a build target?"
model: sonnet
tools:
  - Bash
  - Read
---
```

### Example 2: Skill Frontmatter

```yaml
# Source: Claude Code skills docs (https://code.claude.com/docs/en/skills)
---
name: explore
description: >
  Explore an Nx workspace by asking natural language questions.
  Navigates via the REPL fill/solve cycle and returns only the
  distilled answer without intermediate exploration results.
argument-hint: <question> [--debug]
disable-model-invocation: true
---
```

### Example 3: Sandbox Invocation Pattern (Agent's Bash Call)

```bash
# Source: Existing repl-sandbox.mjs CLI interface
# The agent generates code and passes it to the sandbox via stdin
cat <<'REPL_CODE' | node /path/to/plugin/scripts/repl-sandbox.mjs \
  --index /path/to/workspace/tmp/lz-nx.rlm/workspace-index.json \
  --session /path/to/workspace/.cache/repl-session-abc123.json \
  --workspace-root /path/to/workspace \
  --plugin-root /path/to/plugin
// Count projects
const count = Object.keys(projects).length;
print("Total projects: " + count);
REPL_CODE
```

### Example 4: SandboxResult Processing

```
# Agent receives this JSON from sandbox stdout:
{"output":"Total projects: 42\n","variables":{"count":42},"final":null,"finalVar":null,"error":null}

# Decision: final is null, error is null -> continue exploring
# Next turn: agent generates another code block for deeper investigation
```

### Example 5: Skill Task/Agent Tool Invocation

```markdown
# In SKILL.md, the instruction to Claude for spawning the agent:
Spawn the `repl-executor` agent with the Task tool using these parameters:
- description: "Explore Nx workspace"
- prompt: [constructed prompt with question, paths, maxIterations]
- max_turns: [maxIterations + 2]

Wait for the agent to complete. The agent's response contains the
distilled FINAL answer. Relay this answer to the user.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `Task tool` | `Agent tool` (Task still works as alias) | Claude Code v2.1.63 | The skill can reference either; `Task` is backwards-compatible |
| `commands/*.md` only | `skills/<name>/SKILL.md` + `commands/*.md` | Claude Code 2025 | Skills are preferred for complex workflows with supporting files |
| Custom agent config | `agents/*.md` with YAML frontmatter | Claude Code 2025 | Standardized format auto-discovered by Claude Code |

**Deprecated/outdated:**
- `SlashCommand` tool merged into `Skill` tool -- skills and commands both use the unified Skill tool
- `:*` syntax in `allowed-tools` is deprecated -- use `*` wildcard instead (per AGENTS.md)

## Open Questions

1. **Path resolution in skill content**
   - What we know: `${CLAUDE_PLUGIN_ROOT}` is NOT substituted in SKILL.md content. `${CLAUDE_SKILL_DIR}` IS available and resolves to the skill's directory.
   - What's unclear: The exact mechanism for the skill to discover the plugin root, workspace root, and index path at runtime.
   - Recommendation: The skill instructs Claude to determine paths using Bash commands (e.g., `dirname` to go up from skill dir to plugin root) or by using the `${CLAUDE_SKILL_DIR}` variable to navigate `../../scripts/` for the plugin's script directory. Alternatively, the skill can instruct Claude to use `git rev-parse --show-toplevel` for workspace root and derive other paths from there.

2. **Agent tool vs Task tool naming**
   - What we know: Task tool was renamed to Agent tool in v2.1.63. Old names work as aliases.
   - What's unclear: Which name the current Claude Code runtime version prefers when Claude interprets skill instructions.
   - Recommendation: Use "Task tool" in skill instructions since it's widely documented and backwards-compatible. Claude understands both names.

3. **REPL system prompt calibration**
   - What we know: The XML two-phase prompt structure is validated against Sonnet optimization research. The exact wording needs empirical testing.
   - What's unclear: Whether Sonnet consistently follows the "do NOT call FINAL during explore phase" instruction across diverse question types.
   - Recommendation: Accept this as a known concern (documented in STATE.md blockers). The initial implementation provides the structural guard; iteration on prompt wording can happen after manual testing in Phase 3 verification.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (via `@nx/vite`) |
| Config file | `tests/lz-nx.rlm/vitest.config.mjs` |
| Quick run command | `npm exec nx test lz-nx-rlm-test` |
| Full suite command | `npm exec nx run-many -t test` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AGNT-01 | repl-executor agent file exists with correct frontmatter | unit | `npm exec nx test lz-nx-rlm-test -- --testPathPattern agent` | Wave 0 |
| AGNT-01 | Agent system prompt contains XML phases, globals reference, guardrails | unit | `npm exec nx test lz-nx-rlm-test -- --testPathPattern agent` | Wave 0 |
| SKIL-01 | Explore skill file exists with correct frontmatter | unit | `npm exec nx test lz-nx-rlm-test -- --testPathPattern explore-skill` | Wave 0 |
| SKIL-01 | Skill content validates $ARGUMENTS, references Task tool, includes path resolution | unit | `npm exec nx test lz-nx-rlm-test -- --testPathPattern explore-skill` | Wave 0 |
| AGNT-01 | Integration: sandbox invocation via Bash produces valid SandboxResult | integration | `npm exec nx test lz-nx-rlm-test -- --testPathPattern repl-sandbox` | Exists |
| SKIL-01 | End-to-end: `/lz-nx.rlm:explore "How many projects?"` returns correct answer | manual-only | Manual testing in Claude Code session | N/A |

**Note on testability:** Agent markdown and skill markdown are primarily **prompt engineering deliverables**, not code. Their correctness is validated by:
1. **Structural tests:** Parse YAML frontmatter, verify required fields, check for XML phase markers in system prompt
2. **Integration tests:** Existing sandbox tests verify the execution engine
3. **Manual tests:** End-to-end verification requires a live Claude Code session

### Sampling Rate

- **Per task commit:** `npm exec nx test lz-nx-rlm-test`
- **Per wave merge:** `npm exec nx run-many -t test`
- **Phase gate:** Full suite green + manual exploration test before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/lz-nx.rlm/src/test/agent-definition.test.ts` -- validates agent frontmatter fields and system prompt structure (AGNT-01)
- [ ] `tests/lz-nx.rlm/src/test/explore-skill.test.ts` -- validates skill frontmatter fields and workflow content (SKIL-01)

*(These tests parse the markdown files and validate structural properties. They do NOT test LLM behavior -- that requires manual testing.)*

## Sources

### Primary (HIGH confidence)

- [Claude Code subagent docs](https://code.claude.com/docs/en/sub-agents) - Agent markdown format, frontmatter fields, tools, model selection, spawning mechanics, max_turns
- [Claude Code skills docs](https://code.claude.com/docs/en/skills) - Skill SKILL.md format, $ARGUMENTS, ${CLAUDE_SKILL_DIR}, disable-model-invocation, workflow patterns
- [Claude Code plugins reference](https://code.claude.com/docs/en/plugins-reference) - Plugin directory structure, auto-discovery, ${CLAUDE_PLUGIN_ROOT} scope
- Existing codebase: `scripts/repl-sandbox.mjs`, `scripts/rlm-config.mjs`, `scripts/shared/index-loader.mjs`, `scripts/repl-session.mjs` (Phase 1+2 deliverables)
- Project research: `research/task-spawning/TASK-SPAWNING-GUIDE.md` - Task tool parameters, context isolation, nesting constraints
- Project research: `research/task-spawning/NESTED-CONTEXT-RESEARCH.md` - Nesting restriction is policy (excluded from tools), not technical block
- Project research: `research/prompt-engineering/MODEL-OPTIMIZATION-SONNET.md` - XML structuring, literal instruction-following, phase-based prompts
- Project research: `research/rlm/SYNTHESIS.md` - Fill/solve cycle, REPL globals, FINAL protocol, emergent strategies

### Secondary (MEDIUM confidence)

- Project research: `research/prompt-engineering/SKILLS-ARCHITECTURE.md` - Skill design patterns, workflow vs reference skills, auto-invocation
- Project research: `research/prompt-engineering/SKILL-CREATION-CHECKLIST.md` - Large file handling (not directly applicable but informs skill design principles)
- [Anthropic Claude 4 best practices](https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/claude-4-best-practices) - Referenced for XML structuring and literal instruction-following (confirmed via Sonnet optimization guide)

### Tertiary (LOW confidence)

- None. All findings verified against primary or secondary sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All components verified in existing codebase and official docs
- Architecture: HIGH - Agent/skill format fully documented in official Claude Code docs, integration points verified in codebase
- Pitfalls: HIGH - Drawn from verified docs (CLAUDE_PLUGIN_ROOT scope), project research (nesting constraints), and codebase analysis (stdin quoting)

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (30 days -- stable foundation, Claude Code plugin system is mature)
