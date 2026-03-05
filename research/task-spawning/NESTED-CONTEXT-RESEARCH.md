# Nested Fresh Context via Bash(claude -p)

Research into achieving recursive delegation through `Bash(claude -p ...)` from within Task-spawned agents, bypassing the Task tool's no-nesting restriction.

## Key Finding

The Task tool's "no nesting" restriction (GitHub Issue [#4182](https://github.com/anthropics/claude-code/issues/4182)) is implemented by **excluding the Task tool from spawned agents' tool definitions**. It is NOT a system-level guard preventing nested Claude sessions. The Bash tool remains available, and `claude -p` spawns an entirely new OS process with its own fresh context window.

This means plugin authors can choose their own tradeoff between:
- The **structured Task tool** (observable, managed, single-level)
- **Raw CLI invocation** via `Bash(claude -p ...)` (unmanaged, unlimited depth, requires own safeguards)

## Evidence

### Task Nesting Restriction Is Policy, Not Technical Block

The restriction is enforced by excluding the Task tool from the agent's available tools:

- `research/task-spawning/sources/blog-task-vs-subagents/article.md:56`: "When a subagent tries to use the Task tool, it gets nothing."
- GitHub Issue [#4182](https://github.com/anthropics/claude-code/issues/4182) acknowledges "recursive claude -p calls" as a known workaround

### Bash(claude -p) Works From Within Claude Sessions

Live test (Claude Code v2.1.37):
```
$ claude -p "What is 2+2" --max-budget-usd 0.05 --no-session-persistence
Error: Exceeded USD budget (0.05)
```

The command **executed** (the budget cap was hit, not a recursion/permission block). This confirms:
- The `claude` binary is on PATH inside the Bash tool's environment
- No guard prevents nested invocation
- `claude -p` spawns an independent OS process with its own fresh context

**Billing note:** `claude -p` inherits the parent session's authentication. On subscription plans (Team, Pro, Max), nested invocations consume the same shared usage pool as interactive sessions -- no separate API credits are required. The `--max-budget-usd` flag is an API-billing concept (for Console/API-key auth) and is not meaningful on subscription plans.

### Environment Variables Present But Non-Blocking

Environment variables set inside Claude Code sessions:
```
CLAUDECODE=1
CLAUDE_CODE_SSE_PORT=35577
CLAUDE_CODE_ENTRYPOINT=cli
```

`CLAUDECODE=1` is set (confirmed empirically). However, it does NOT prevent nested `claude -p` invocations. It is an informational flag, not a recursion guard.

Sources: GitHub Issue [#531](https://github.com/anthropics/claude-code/issues/531)

### Community Projects Validate the Pattern

Multiple community projects use recursive `claude -p` in production:
- [claude-recursive-spawn](https://github.com/haasonsaas/claude-recursive-spawn) -- Bash script for recursive Claude Code execution with depth control
- [learn-claude-code](https://github.com/shareAI-lab/learn-claude-code) -- Documents "calling itself via bash implements subagents"

### The Ralph Bash Loop Pattern Already Uses This

From `research/ralph-loop/IMPLEMENTATION.md`:
```bash
cat "$PROMPT_FILE" | claude -p \
    --dangerously-skip-permissions \
    --output-format=stream-json \
    --model opus \
    --verbose
```

This is the core Ralph pattern: pipe a prompt file to `claude -p` in a loop, each iteration getting fresh context with state persisted in files/git.

## CLI Flags Reference

Relevant flags for nested invocation (from `claude --help` v2.1.37):

| Flag | Purpose |
|------|---------|
| `-p` / `--print` | Non-interactive mode: print response and exit |
| `--no-session-persistence` | Don't save session to disk (only with `--print`) |
| `--dangerously-skip-permissions` | Bypass all permission prompts (sandbox only) |
| `--max-budget-usd <n>` | Cap API spending per invocation (API-billing only; not meaningful on subscription plans) |
| `--model <model>` | Select model (opus, sonnet, haiku) |
| `--output-format <fmt>` | `text` (default), `json`, `stream-json` |
| `--allowed-tools <list>` | Restrict available tools |
| `--disallowed-tools <list>` | Block specific tools |
| `--fallback-model <model>` | Automatic fallback on overload (only with `--print`) |

## Risks and Anti-Patterns

| Risk | Mitigation |
|------|------------|
| Infinite recursion | Implement depth counter via file or env var; set hard limit per invocation |
| Usage explosion | Depth limits and timeouts per invocation; each `claude -p` consumes subscription usage from the shared pool |
| Loss of observability | `--output-format=stream-json` for structured output; log to files |
| Permission model bypass | `--dangerously-skip-permissions` should ONLY be used in sandboxes |
| Silent failure | Capture exit codes and stderr; implement timeout |
| Output truncation | `claude -p` returns full output to stdout; no summarization (unlike Task tool result truncation) |

**Important caveats:**
- This is NOT an officially supported pattern -- GitHub Issue #4182 calls recursive `claude -p` calls "unmaintainable hacks"
- `--dangerously-skip-permissions` should NEVER be recommended outside sandboxed environments
- All recursive examples must include depth limits and timeouts
- `Bash(claude -p ...)` is NOT equivalent to Task tool nesting (different observability, permission model)

**Billing model:** On subscription plans (Team, Pro, Max), `claude -p` inherits the parent session's authentication and consumes usage from the same shared pool. No separate API credits are required. The `--max-budget-usd` flag is an API-billing concept for Console/API-key auth and is not meaningful on subscription plans. For subscription users, depth limits and timeouts are the primary cost safeguards.

## Architecture

```
Main Session (accumulates context)
  +-- Task Worker (fresh 200K context, managed by Claude Code)
        +-- Bash(claude -p ...) (fresh context, new OS process, unmanaged)
              +-- Bash(claude -p ...) (theoretically unlimited depth)
```

### Nesting Depth Options

- **1 level**: Orchestrator -> Task Worker (standard; managed by Claude Code)
- **2+ levels**: Orchestrator -> Task Worker -> `Bash(claude -p ...)` (unmanaged; requires own safeguards)
- **Unlimited**: Each `claude -p` can invoke further `claude -p` (requires depth guards and timeouts)

## Comparison: Task Tool vs Bash(claude -p)

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

## Experimental Verification

Experimental tests were defined (see the [plugin guide plan](../../plans/add-ralph-plugin-guide.plan.md) Task 0.5.4) but not yet executed. `claude -p` inherits the parent session's authentication, so on subscription plans (Team, Pro, Max) it consumes the shared usage pool -- no separate API credits are required. Testing is feasible within the subscription allocation.

**Status:** Pending. Findings rest on documentation analysis, GitHub issue evidence, and community project validation. The core mechanism (`Bash(claude -p ...)` from within a Task worker) is well-documented in community projects like [claude-recursive-spawn](https://github.com/haasonsaas/claude-recursive-spawn) and acknowledged in GitHub Issue [#4182](https://github.com/anthropics/claude-code/issues/4182).

## Source References

- GitHub Issue [#4182](https://github.com/anthropics/claude-code/issues/4182) -- "Subagents can't spawn other subagents" / "unmaintainable hacks like recursive claude -p calls"
- GitHub Issue [#531](https://github.com/anthropics/claude-code/issues/531) -- CLAUDECODE environment variable (informational, not a recursion guard)
- GitHub Issue [#581](https://github.com/anthropics/claude-code/issues/581) -- `-p` mode permission model differences
- Official docs: [Sub-agents](https://code.claude.com/docs/en/sub-agents), [Headless mode](https://code.claude.com/docs/en/headless)
- Community: [claude-recursive-spawn](https://github.com/haasonsaas/claude-recursive-spawn), [learn-claude-code](https://github.com/shareAI-lab/learn-claude-code)

## Related Documents

- [TASK-SPAWNING-GUIDE.md](./TASK-SPAWNING-GUIDE.md) -- Comprehensive Task tool reference (includes summary of nested context findings)
- [Ralph Loop Implementation](../ralph-loop/IMPLEMENTATION.md) -- Context rotation thresholds, the original bash loop pattern
- [Ralph Loop Cybernetics Analysis](../ralph-loop/CYBERNETICS-ANALYSIS.md) -- Variety management and homeostasis models for context rotation
