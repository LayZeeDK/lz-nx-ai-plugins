# Claude Code: When to Use Task Tool vs Subagents

- **Author:** Amit Kothari
- **Date:** 2025
- **URL:** https://amitkoth.com/claude-code-task-tool-vs-subagents/
- **Site:** Amit Kothari
- **Type:** Blog post / technical analysis

## Article

See [article.md](./article.md) for the full blog post content in Markdown.

## Summary

A comprehensive comparison of Claude Code's Task tool (ephemeral workers) versus custom subagents (persistent specialists). The article documents verified mechanics from community testing: 20K token overhead per spawn, 10-agent parallelism cap, batch execution model, context isolation, and the inability for either to spawn children.

Provides a practical decision framework (3 questions), real production patterns (Repository Explorer, Code Review Pipeline, Hybrid Orchestration), and documents failure modes for both approaches.

## Key Concepts

- Tasks are ephemeral workers with isolated 200K context windows; subagents are persistent specialists
- 20K token overhead per Task or subagent (non-negotiable system prompt + tool definitions)
- Parallelism caps at 10 concurrent operations, executing in batches (not dynamic queue draining)
- Neither Tasks nor subagents can spawn children (no nesting, by design)
- Context isolation prevents pollution but requires orchestration to share results
- Task results can be truncated -- critical details like stack traces may be lost
- Active multi-agent sessions consume 3-4x more tokens than single-threaded operations
- Subagents can't see each other's work -- everything routes through main thread
- The main thread is still the best orchestrator Claude Code has

### Decision Framework

1. Will I run this exact operation again? YES -> subagent, NO -> continue
2. Do I need to search/read more than 10 files? YES -> Tasks, NO -> main thread
3. Must operations share context? YES -> main thread, NO -> Tasks (parallel) or subagent (specialized)

### Production Patterns

- **Repository Explorer**: Feature-based Task splitting (auth, data models, API, tests) beats directory-based splitting
- **Code Review Pipeline**: Sequential subagents with file-based communication (style -> security -> tests)
- **Hybrid Orchestration**: Main thread identifies files -> Tasks read in parallel -> subagent designs approach -> Tasks implement -> subagent tests

## Referenced Resources

### GitHub Issues

- [#4911: Subagents consume 160K tokens for 3K work](https://github.com/anthropics/claude-code/issues/4911)
- [#4182: Subagents can't spawn other subagents](https://github.com/anthropics/claude-code/issues/4182)
- [#3013: Task progress tracking request](https://github.com/anthropics/claude-code/issues/3013)

### External References

- [Claude Code Official Subagent Docs](https://code.claude.com/docs/en/sub-agents)
- [Anthropic Best Practices](https://www.anthropic.com/engineering/claude-code-best-practices)
- [Claude Code Usage Monitor](https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor)
- [Community-shared security-auditor subagents](https://github.com/wshobson/agents)

## Related Sources

- [Task & Agent Tools](../blog-claudelog-task-mechanics/) -- ClaudeLog guide to Task tool mechanics
