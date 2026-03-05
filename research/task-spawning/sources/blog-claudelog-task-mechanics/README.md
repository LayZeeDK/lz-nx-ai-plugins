# Task & Agent Tools - Claude Code Mechanics

- **Author:** InventorBlack (CTO at Command Stick, Mod at r/ClaudeAi)
- **Date:** 2025
- **URL:** https://claudelog.com/mechanics/task-agent-tools/
- **Site:** ClaudeLog
- **Type:** Blog post / technical guide

## Article

See [article.md](./article.md) for the full blog post content in Markdown.

## Summary

A practical guide to Claude Code's Task tool for delegating work to parallel sub-agents. Covers the mechanics of sub-agent spawning (up to 7 agents simultaneously per the author's observation), the overhead of interactive main-agent execution, and strategies for maximizing parallel throughput.

The article emphasizes that Claude uses sub-agents conservatively by default (primarily for read operations) and that explicit orchestration instructions are needed to fully leverage parallelism -- similar to multi-threaded programming.

## Key Concepts

- Task tool delegates to parallel sub-agents for file reads, code searches, web fetches
- Up to 7 agents simultaneously (author's observation; other sources report 10)
- Claude is conservative with sub-agent usage by default -- prefers read operations
- Explicit step-by-step orchestration unlocks better parallelism
- Balance token costs with performance gains -- group related tasks
- 7-parallel-Task feature implementation workflow pattern (component, styles, tests, types, hooks, integration, remaining)
- Context optimization: strip comments when reading code for analysis
- Each task should handle ONLY specified files or file types

## Referenced Resources

### Related Community Sources

- [Claude Code FAQ: What is the Task Tool?](https://claudelog.com/faqs/what-is-task-tool-in-claude-code/) -- ClaudeLog FAQ entry

## Related Sources

- [Task Tool vs Subagents](../blog-task-vs-subagents/) -- Deeper comparison of Task tool and custom subagents
