# Task Spawning Guide: Claude Code Task Tool Mechanics

This document is a technical reference for Claude Code's Task tool, which spawns ephemeral sub-agents to perform work in parallel. It synthesizes verified mechanics from community testing, official documentation, and production usage patterns. For source articles, see [sources/](./sources/).

## Task Tool Parameters

The Task tool accepts the following parameters, derived from the Claude Code system prompt:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `description` | string | Yes | Short 3-5 word summary of the task (used in UI/logging) |
| `prompt` | string | Yes | The full task instructions for the spawned agent |
| `subagent_type` | string | No | Agent specialization hint |
| `model` | string | No | Model override (`sonnet`, `opus`, `haiku`) |
| `run_in_background` | boolean | No | Run asynchronously without blocking the main thread |
| `resume` | string | No | Agent ID to continue a previous Task's work |
| `max_turns` | number | No | Maximum API round-trips before the Task terminates |

### Subagent Types

The `subagent_type` parameter hints at the agent's specialization. Known values include:

- **Bash** -- Shell command execution
- **Explore** -- Codebase navigation and file discovery
- **Plan** -- Planning and analysis
- **general-purpose** -- Default; full tool access

The exact set of available subagent types may vary across Claude Code versions. Claude selects tools and behavior based on this hint, but all sub-agents have access to the same underlying tool set.

## Context Isolation Model

Each spawned Task receives a **fresh 200K token context window** that is independent of the main thread and all sibling Tasks (Kothari, "When to Use Task Tool vs Subagents").

### Key properties

- **No shared memory.** Tasks cannot read from or write to the main thread's context. They receive only the instructions provided in the `prompt` parameter.
- **No sibling visibility.** Tasks cannot see the outputs of other concurrently running Tasks. All results route back through the main thread.
- **No parent context inheritance.** The Task does not inherit the conversation history, CLAUDE.md contents, or previously gathered context from the main thread unless explicitly included in the `prompt`.
- **Result collection is the main thread's responsibility.** The orchestrating agent must collect, synthesize, and act on Task results. This is by design -- it prevents context pollution between independent operations.

### Implications

- Critical context (file paths, expected formats, specific instructions) must be embedded directly in the `prompt`.
- Results from one Task that are needed by another must pass through the main thread as an intermediary.
- The main thread remains the single point of orchestration and the only entity with full conversation context.

## Parallel Execution

### Batch Execution Model

Tasks execute in **batches, not as a dynamic queue** (Kothari). When multiple Tasks are dispatched simultaneously, Claude Code launches them as a batch and waits for all Tasks in that batch to complete before proceeding. There is no dynamic queue draining where a completed slot is immediately filled by the next pending Task.

This means the **slowest Task in a batch determines the batch's total wall-clock time**. A batch of 7 Tasks where 6 complete in 5 seconds and 1 takes 60 seconds will take 60 seconds total.

### Concurrency Limits

Community testing reports varying concurrency caps:

| Source | Reported Limit |
|--------|---------------|
| InventorBlack (ClaudeLog) | 7 concurrent Tasks |
| Kothari | 10 concurrent Tasks |

**Recommendation:** Use 7 as a conservative planning ceiling. Exceeding the limit causes additional Tasks to queue for the next batch rather than fail.

### Batch Scheduling Strategies

- **Balance batch sizes.** Avoid mixing fast operations (file reads) with slow operations (complex analysis) in the same batch. The slow operation blocks the entire batch.
- **Group by expected duration.** Place similarly-timed operations together.
- **Prefer fewer, well-scoped Tasks** over many granular ones to reduce overhead (InventorBlack).

## Cost Model

### Per-Task Overhead

Every spawned Task incurs approximately **20K tokens of overhead** before it performs any useful work (Kothari). This overhead is non-negotiable and consists of:

- System prompt injection
- Tool definitions
- Context framing

### Multi-Agent Token Multiplier

Active multi-agent sessions consume **3-4x more tokens** than equivalent single-threaded operations (Kothari). This multiplier accounts for:

- Per-Task system prompt overhead (20K each)
- Duplicated context that must be passed explicitly in prompts
- Result collection and synthesis by the main thread

### When Overhead Is Justified

| Scenario | Recommendation |
|----------|---------------|
| Reading/searching 10+ files | Tasks (parallel reads amortize overhead) |
| Single file read or edit | Main thread (20K overhead is wasteful) |
| Independent operations on distinct file sets | Tasks (natural parallelism boundary) |
| Operations requiring shared context | Main thread (avoids re-transmitting context) |
| Repeated identical operation | Subagent (persistent, reusable) |
| One-off investigation | Task (ephemeral, no cleanup needed) |

### Model Routing

Use the `model` parameter to route Tasks to cost-appropriate models:

| Model | Use Case | Cost Profile |
|-------|----------|-------------|
| `haiku` | Mechanical tasks: file reads, pattern searches, formatting | Lowest |
| `sonnet` | Standard tasks: code analysis, implementation, review | Medium |
| `opus` | Complex tasks: architectural decisions, nuanced reasoning | Highest |

**Note:** GitHub Issue [#12063](https://github.com/anthropics/claude-code/issues/12063) reports that the `model` parameter may be ignored in some versions.

## Plugin Integration

Claude Code plugins have four component types. Their ability to trigger Task spawning depends on how they interact with the Claude agent.

| Component | Can Trigger Tasks? | Mechanism |
|-----------|-------------------|-----------|
| Commands (slash commands) | Yes | Claude executes the command's markdown instructions, which can direct it to use the Task tool |
| Skills | Yes | Skill instructions (SKILL.md) direct Claude's behavior, which can include spawning Tasks |
| Agents (.claude/agents/) | No | Agents receive their own fresh context but cannot invoke the Task tool from within that context |
| Hooks | No | Hooks are Node.js/bash scripts that return JSON; they do not interact with Claude's tool system |

### Mechanism Details

**Commands** are markdown files that Claude reads and follows as instructions. Since Claude has access to the Task tool during command execution, command instructions can direct Claude to spawn Tasks (e.g., "Use the Task tool to read all test files in parallel").

**Skills** work similarly to commands -- the SKILL.md file provides instructions that Claude follows, and those instructions can include Task-based orchestration patterns.

**Agents** defined in `.claude/agents/` are invoked with their own fresh context window. They operate as independent Claude sessions and do not have the ability to spawn sub-Tasks from within their execution context.

**Hooks** are pre/post scripts that run outside Claude's agent loop entirely. They execute as Node.js or bash processes and communicate via JSON responses (`additionalContext`, `decision`, `reason`). They have no mechanism to invoke Claude tools.

## Production Patterns

### Repository Explorer

Explores a large codebase by splitting investigation across feature boundaries rather than directory boundaries (Kothari).

```
Main thread: Identify feature areas (auth, data models, API, tests)
  |
  +-- Task 1: Explore authentication code
  +-- Task 2: Explore data model layer
  +-- Task 3: Explore API endpoints
  +-- Task 4: Explore test coverage
  |
Main thread: Synthesize findings into architectural overview
```

**Key insight:** Feature-based splitting produces more coherent results than directory-based splitting because features often span multiple directories (Kothari).

### Code Review Pipeline

Sequential subagents with file-based communication, where each stage writes findings that the next stage reads (Kothari).

```
Main thread: Identify changed files
  |
  +-- Subagent 1 (style): Check formatting, naming, conventions
  +-- Subagent 2 (security): Audit for vulnerabilities
  +-- Subagent 3 (tests): Verify test coverage
  |
Main thread: Aggregate review comments
```

This pattern uses subagents (persistent specialists) rather than ephemeral Tasks because each review stage may be reused across multiple PRs.

### Hybrid Orchestration

Combines the main thread, parallel Tasks, and specialized subagents for complex multi-phase workflows (Kothari).

```
Main thread: Identify target files
  |
  +-- Tasks (parallel): Read all target files
  |
Main thread: Collect file contents
  |
  +-- Subagent (design): Propose implementation approach
  |
Main thread: Review and approve design
  |
  +-- Tasks (parallel): Implement changes across files
  |
  +-- Subagent (test): Write and run tests
  |
Main thread: Final review and commit
```

### Ralph-Style Context Rotation via Tasks

The Task tool provides what the original Ralph bash loop provides -- **fresh context per work unit** -- but from WITHIN a Claude Code session. This makes plugin-native context rotation feasible.

Architecture: The orchestrator session stays lean (reads state file, dispatches work); all real work is delegated to Tasks with fresh 200K context windows:

```
Stop Hook (iteration lifecycle)
  +-- Orchestrator Session (lean: reads state file, dispatches)
        +-- Task Worker 1 (fresh 200K: implement feature A)
        +-- Task Worker 2 (fresh 200K: run tests)
        +-- Task Worker 3 (fresh 200K: code review)
              +-- Results written to files/git (persistent state)
```

**Key limitation:** The orchestrator session itself still accumulates context. True full-session rotation requires external tooling (bash loop). Tasks provide fresh context for **delegated work**, not for the orchestrator itself.

**Cost tradeoff:** 20K token overhead per Task means this approach trades tokens for context freshness. Batch related work into fewer Tasks to amortize overhead -- 1 Task reading 10 files is better than 10 Tasks reading 1 file each.

For Ralph Loop implementation details, see [../ralph-loop/IMPLEMENTATION.md](../ralph-loop/IMPLEMENTATION.md). For the cybernetic model of context as homeostasis, see [../ralph-loop/CYBERNETICS-ANALYSIS.md](../ralph-loop/CYBERNETICS-ANALYSIS.md).

## Decision Framework

Use this three-question decision tree to choose between the main thread, Tasks, and subagents (adapted from Kothari):

```
1. Will I run this exact operation again?
   |
   +-- YES --> Use a subagent (persistent specialist, reusable)
   +-- NO  --> Continue to question 2

2. Do I need to search/read more than 10 files?
   |
   +-- YES --> Use Tasks (parallel file operations amortize 20K overhead)
   +-- NO  --> Continue to question 3

3. Must operations share context with each other?
   |
   +-- YES --> Use the main thread (only entity with full context)
   +-- NO  --> Use Tasks (parallel) or subagent (specialized)
```

### Additional Heuristics

- **Default to the main thread.** Claude is conservative with sub-agent usage by default, and for good reason -- most operations complete faster without the 20K token overhead (InventorBlack).
- **Explicit orchestration unlocks parallelism.** Claude will not aggressively parallelize unless instructed with step-by-step orchestration in the prompt (InventorBlack).
- **Group related tasks.** Rather than spawning one Task per file, group related files into a single Task to reduce total overhead (InventorBlack).
- **Each Task should handle only its specified files.** Clear scope boundaries prevent duplicate work and conflicting edits (InventorBlack).

## Known Limitations

### No Nesting (via Task Tool)

Neither Tasks nor subagents can spawn child agents **via the Task tool**. This is by design and documented in GitHub Issue [#4182](https://github.com/anthropics/claude-code/issues/4182). All Task-based orchestration must flow through the main thread (Kothari).

However, `Bash(claude -p ...)` achieves nested fresh-context invocations by spawning a new OS process. See [Nested Context via Bash(claude -p)](#nested-context-via-bashclaude--p) below for details.

### Result Truncation

Task results returned to the main thread can be truncated. Critical details such as stack traces, full error messages, or large code blocks may be lost in transit. Design Task prompts to produce concise, structured output (Kothari).

### No Progress Visibility

There is no mechanism to monitor the progress of running Tasks. The main thread dispatches Tasks and waits for completion with no intermediate status updates. Requested in GitHub Issue [#3013](https://github.com/anthropics/claude-code/issues/3013).

### No Error Recovery Within Tasks

If a Task encounters an error, it cannot retry or recover. The error propagates back to the main thread, which must decide how to handle it. There is no built-in retry mechanism (Kothari).

### Batch Execution Only

Tasks execute in batches, not as a dynamic queue. Completed slots are not backfilled with pending Tasks. This means uneven Task durations lead to idle capacity while waiting for the slowest Task in the batch (Kothari).

### Configuration Drift for Persistent Subagents

Subagents (as opposed to ephemeral Tasks) can experience configuration drift over long sessions. Their initial instructions may become less relevant as the codebase changes during the session (Kothari).

### Token Overhead Cannot Be Reduced

The approximately 20K token overhead per Task is non-negotiable. It cannot be reduced by simplifying prompts or limiting tool access. This is a fixed cost of the system prompt and tool definition injection (Kothari).

## Known Issues

GitHub issues related to Task spawning and sub-agent mechanics:

| Issue | Title | Status | Description |
|-------|-------|--------|-------------|
| [#4911](https://github.com/anthropics/claude-code/issues/4911) | Subagents consume 160K tokens for 3K work | Open | Disproportionate token consumption relative to useful output |
| [#4182](https://github.com/anthropics/claude-code/issues/4182) | Subagents can't spawn other subagents | Open | No nesting by design; all orchestration routes through main thread |
| [#3013](https://github.com/anthropics/claude-code/issues/3013) | Task progress tracking request | Open | No visibility into running Task status |
| [#12063](https://github.com/anthropics/claude-code/issues/12063) | Model parameter ignored | Open | The `model` parameter on Tasks may not take effect |
| [#14863](https://github.com/anthropics/claude-code/issues/14863) | Haiku tool_reference error | Open | Error when using Haiku model for Tasks |
| [#6594](https://github.com/anthropics/claude-code/issues/6594) | Cascading failures | Open | Failures in one Task or subagent can cascade |
| [#10668](https://github.com/anthropics/claude-code/issues/10668) | Tool name uniqueness | Open | Tool name collisions across agents |

## Nested Context via Bash(claude -p)

While the Task tool prevents nesting by design, the Bash tool remains available to spawned agents and can invoke `claude -p` to spawn an entirely new OS process with its own fresh context window. This is not an officially supported pattern -- it is a workaround that exploits the fact that the "no nesting" restriction is a **policy choice** (Task tool excluded from agent tool definitions) rather than a **technical block** (no system-level guard prevents `claude -p` invocation).

### Architecture

```
Main Session (accumulates context)
  +-- Task Worker (fresh 200K context)
        +-- Bash(claude -p ...) (fresh context, new OS process)
              +-- Bash(claude -p ...) (theoretically unlimited depth)
```

Each `claude -p` invocation is an independent OS process with:
- Its own fresh context window (no parent conversation history)
- Its own system prompt and tool definitions
- Full stdout/stderr capture (no result truncation, unlike Task tool)
- Independent permission model

### Comparison: Task Tool vs Bash(claude -p)

| Aspect | Task Tool | Bash(claude -p) |
|--------|-----------|-----------------|
| Fresh context | Yes (200K window) | Yes (full session) |
| Nesting | Blocked by design | Unlimited (with depth guards) |
| Result handling | Returned to parent, may be truncated | stdout capture, full output |
| Observability | Claude Code tracks progress | Must implement own logging |
| Cost control | Inherits parent billing | Inherits parent auth; on subscription plans, consumes shared usage pool (depth limits and timeouts as safeguards) |
| Tool access | All tools except Task | All tools (configurable via `--allowed-tools`) |
| Permission model | Inherits parent permissions | Own permission mode or `--dangerously-skip-permissions` (sandbox only) |
| Concurrency | Up to 7-10 parallel Tasks | Limited by OS process limits |

### When to Use Which

- **Task tool**: Standard delegation. Use for parallel reads, independent investigations, and work that benefits from Claude Code's built-in orchestration. Single-level only.
- **Bash(claude -p)**: Deep nesting or full-output capture. Use when Task workers need to sub-delegate, when result truncation is unacceptable, or when simulating the Ralph bash loop from within a plugin.
- **Hybrid**: Task workers for the first level of delegation; `Bash(claude -p ...)` from within Task workers for deeper nesting.

### Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Infinite recursion | Depth counter via file or environment variable; hard limit per invocation |
| Usage explosion | Depth limits and timeouts per invocation; each `claude -p` consumes subscription usage from the shared pool |
| Loss of observability | `--output-format=stream-json` for structured output; log to files |
| Permission bypass | `--dangerously-skip-permissions` should ONLY be used in sandboxed environments |
| Silent failure | Capture exit codes and stderr; implement timeouts |
| Output encoding | Ensure consistent encoding (UTF-8) across process boundaries |

**Billing note:** On subscription plans (Team, Pro, Max), `claude -p` inherits the parent session's authentication and consumes usage from the same shared pool. No separate API credits are required. The `--max-budget-usd` flag is an API-billing concept for Console/API-key auth and is not meaningful on subscription plans.

### Community Precedent

- [claude-recursive-spawn](https://github.com/haasonsaas/claude-recursive-spawn) -- Bash script for recursive Claude Code execution with depth control
- [learn-claude-code](https://github.com/shareAI-lab/learn-claude-code) -- Documents "calling itself via bash implements subagents"

### Relationship to Ralph Bash Loop

The Ralph bash loop (`while :; do cat PROMPT.md | claude -p; done`) is the original pattern for fresh-context iteration. `Bash(claude -p ...)` from within a Task worker is the same pattern made available from within a Claude Code plugin session. This enables a hybrid architecture where the plugin manages the iteration lifecycle (via Stop hook) while delegating work to fresh-context workers (via Task tool) that can further sub-delegate to fresh-context sub-sessions (via `claude -p`).

For detailed evidence, risks, and experimental findings, see [NESTED-CONTEXT-RESEARCH.md](./NESTED-CONTEXT-RESEARCH.md). For Ralph Loop implementation patterns, see [../ralph-loop/IMPLEMENTATION.md](../ralph-loop/IMPLEMENTATION.md).

## Related Documents

### Local Research

- [Nested Context Research](./NESTED-CONTEXT-RESEARCH.md) -- Evidence and analysis for Bash(claude -p) nesting capability
- [Ralph Loop Implementation](../ralph-loop/IMPLEMENTATION.md) -- Context rotation thresholds, subagent orchestration, Stop Hook mechanics
- [Ralph Loop Cybernetics Analysis](../ralph-loop/CYBERNETICS-ANALYSIS.md) -- Variety management (Ashby's Law), context as homeostasis, comparator externalization
- [Ralph Loop Failure Modes](../ralph-loop/FAILURE-MODES.md) -- Context rot, gutter detection, compaction loss
- [Ralph Loop Best Practices](../ralph-loop/BEST-PRACTICES.md) -- Subagent usage recommendations, context management strategies
- [Ralph Loop Overview](../ralph-loop/OVERVIEW.md) -- Conceptual foundation for the Ralph Loop pattern

### Source Articles

- [Task & Agent Tools](./sources/blog-claudelog-task-mechanics/) -- InventorBlack (ClaudeLog), practical guide to Task tool mechanics
- [Task Tool vs Subagents](./sources/blog-task-vs-subagents/) -- Amit Kothari, comprehensive comparison with decision framework

### External References

- [Claude Code Official Subagent Docs](https://code.claude.com/docs/en/sub-agents)
- [Anthropic Best Practices for Claude Code](https://www.anthropic.com/engineering/claude-code-best-practices)
- [Claude Code Usage Monitor](https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor) -- Community tool for tracking token consumption
