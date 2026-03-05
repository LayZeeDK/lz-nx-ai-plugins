# Task Spawning Research

Research into Claude Code's Task tool mechanics for spawning ephemeral sub-agents with isolated context windows. This research informs plugin design, particularly context rotation strategies that bring Ralph Loop principles into Claude Code plugins.

## Contents

| Document | Purpose |
|----------|---------|
| [TASK-SPAWNING-GUIDE.md](./TASK-SPAWNING-GUIDE.md) | Comprehensive reference for Task tool parameters, context isolation, parallel execution, cost model, plugin integration, and production patterns |
| [NESTED-CONTEXT-RESEARCH.md](./NESTED-CONTEXT-RESEARCH.md) | Evidence and analysis for achieving nested fresh context via `Bash(claude -p ...)`, bypassing the Task tool's no-nesting restriction |
| [sources/](./sources/) | Primary source materials (blog posts with article content and metadata) |

## Key Findings

- **Context isolation:** Each Task gets a fresh 200K token context window, completely isolated from the parent session and sibling Tasks
- **20K token overhead:** Every Task incurs ~20K tokens of non-negotiable startup cost (system prompt + tool definitions)
- **Batch execution:** Tasks run in batches of 7-10; Claude waits for the entire batch to complete before starting the next
- **No nesting via Task tool:** Tasks cannot spawn child Tasks via the Task tool (by design); however, `Bash(claude -p ...)` achieves nested fresh context via new OS process (see [NESTED-CONTEXT-RESEARCH.md](./NESTED-CONTEXT-RESEARCH.md))
- **Plugin integration:** Commands and skills can instruct Claude to spawn Tasks; hooks and agents cannot
- **Cost tradeoff:** Multi-agent sessions consume 3-4x more tokens than single-threaded equivalents

## Context Rotation Relevance

The Task tool provides what the original Ralph bash loop provides -- **fresh context per work unit** -- but from within a Claude Code session. This makes plugin-native context rotation feasible:

- **Delegated work** gets fresh context via Task tool
- **Nested delegation** achieves deeper fresh context via `Bash(claude -p ...)` from within Task workers
- **Orchestrator session** still accumulates context (limitation)
- **True full-session rotation** requires external bash loop (or `Bash(claude -p ...)` from within Task workers)

For the cybernetic model of context rotation and variety management, see the [Ralph Loop Knowledge Base](../ralph-loop/).

## Related Research

- [Ralph Loop Knowledge Base](../ralph-loop/) -- Core Ralph Loop documentation including implementation patterns, cybernetics analysis, failure modes, and metrics
- [Ralph Loop Implementation](../ralph-loop/IMPLEMENTATION.md) -- Context rotation thresholds and subagent orchestration
- [Ralph Loop Cybernetics Analysis](../ralph-loop/CYBERNETICS-ANALYSIS.md) -- Variety management and homeostasis models
- [Cybernetics-Inspired Plugin Design Guide](../ralph-loop/PLUGIN-GUIDE.md) -- Design guide for building plugins that improve on Ralph using Task-based context rotation and cybernetics theory

## Sources

See [sources/](./sources/) for the complete collection of primary source materials:

- [Task & Agent Tools](./sources/blog-claudelog-task-mechanics/) -- InventorBlack (ClaudeLog)
- [Task Tool vs Subagents](./sources/blog-task-vs-subagents/) -- Amit Kothari
