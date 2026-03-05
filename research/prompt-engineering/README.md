# Claude Code Prompt Engineering Guide

> **Purpose**: Curated documentation for Claude Code features, optimization techniques, and best practices
> **Audience**: Developers using Claude Code CLI for software engineering tasks
> **Scope**: Generic patterns applicable to any project (no project-specific content)

---

## Overview

This directory contains standalone documents covering Claude Code optimization strategies, derived from real-world experience and official Anthropic documentation. Each document is:

- **Claude Code-specific** (focused on CLI usage)
- **Generic** (applicable to any project)
- **Standalone** (can be read independently, with cross-references)
- **Source-backed** (includes external documentation links)

---

## Document Index

| Document                                                       | Description                                            | When to Use                                    |
| -------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------- |
| [FEATURES-AND-AVAILABILITY.md](./FEATURES-AND-AVAILABILITY.md) | Feature reference with GA/beta status                  | Checking feature availability, verification    |
| [COMMANDS-AND-CONTEXT.md](./COMMANDS-AND-CONTEXT.md)           | Slash commands, context management, CLAUDE.md          | Setting up projects, optimizing context usage  |
| [SKILLS-ARCHITECTURE.md](./SKILLS-ARCHITECTURE.md)             | Skills vs commands, design patterns, namespacing       | Building custom skills, workflow automation    |
| [TASK-SPAWNING-GUIDE.md](./TASK-SPAWNING-GUIDE.md)             | Task tool, model selection, parallel execution         | Multi-agent workflows, parallel processing     |
| [MCP-TOOL-SEARCH.md](./MCP-TOOL-SEARCH.md)                     | MCP lazy loading, tool discovery, token savings        | Working with MCP servers, large tool libraries |
| [LARGE-FILE-CHUNKING.md](./LARGE-FILE-CHUNKING.md)             | Chunking strategies for files >25K tokens              | Processing large documents, specs, logs        |
| [SKILL-CREATION-CHECKLIST.md](./SKILL-CREATION-CHECKLIST.md)   | Checklist for creating skills with large file handling | Skill development, code review                 |
| [MODEL-OPTIMIZATION-HAIKU.md](./MODEL-OPTIMIZATION-HAIKU.md)   | Haiku 4.5 optimization (speed, cost, agentic)          | Fast, cheap tasks; parallel sub-agents         |
| [MODEL-OPTIMIZATION-SONNET.md](./MODEL-OPTIMIZATION-SONNET.md) | Sonnet 4.5 patterns (TDD, parallel context)            | Standard implementation, daily development     |
| [MODEL-OPTIMIZATION-OPUS.md](./MODEL-OPTIMIZATION-OPUS.md)     | Opus 4.5 patterns (effort param, first-try)            | Complex reasoning, critical implementations    |

---

## Quick Model Selection Guide

| Task Type               | Recommended Model | Key Advantage                               |
| ----------------------- | ----------------- | ------------------------------------------- |
| Simple/mechanical tasks | **Haiku 4.5**     | 2-3x faster, 66% cheaper than Sonnet        |
| Standard implementation | **Sonnet 4.5**    | Best balance of speed/quality/cost          |
| Complex reasoning       | **Opus 4.5**      | 80.9% SWE-bench, highest first-try success  |
| Large context (>200K)   | **Sonnet 4.5**    | Only model with 1M context window           |
| Parallel sub-agents     | **Haiku 4.5**     | Low latency enables massive parallelization |

### Cost Comparison

| Model      | Input (per 1M tokens) | Output (per 1M tokens) | Relative Cost |
| ---------- | --------------------- | ---------------------- | ------------- |
| Haiku 4.5  | $1                    | $5                     | 1x (baseline) |
| Sonnet 4.5 | $3                    | $15                    | 3x            |
| Opus 4.5   | $5                    | $25                    | 5x            |

**Rule of thumb**: Use the cheapest model that can reliably complete the task.

---

## Learning Path

### Beginner: Getting Started

1. **[FEATURES-AND-AVAILABILITY.md](./FEATURES-AND-AVAILABILITY.md)** - Know what features are available (GA vs beta)
2. **[COMMANDS-AND-CONTEXT.md](./COMMANDS-AND-CONTEXT.md)** - Understand slash commands, shell commands, CLAUDE.md
3. **[MODEL-OPTIMIZATION-HAIKU.md](./MODEL-OPTIMIZATION-HAIKU.md)** - Learn Haiku patterns (simplest model)

### Intermediate: Building Skills

4. **[SKILLS-ARCHITECTURE.md](./SKILLS-ARCHITECTURE.md)** - Design custom skills and workflows
5. **[MCP-TOOL-SEARCH.md](./MCP-TOOL-SEARCH.md)** - Optimize MCP tool usage
6. **[MODEL-OPTIMIZATION-SONNET.md](./MODEL-OPTIMIZATION-SONNET.md)** - Master Sonnet for daily development

### Advanced: Multi-Agent & Complex Tasks

7. **[TASK-SPAWNING-GUIDE.md](./TASK-SPAWNING-GUIDE.md)** - Orchestrate parallel worker agents
8. **[LARGE-FILE-CHUNKING.md](./LARGE-FILE-CHUNKING.md)** - Handle large documents efficiently
9. **[SKILL-CREATION-CHECKLIST.md](./SKILL-CREATION-CHECKLIST.md)** - Build production-ready skills
10. **[MODEL-OPTIMIZATION-OPUS.md](./MODEL-OPTIMIZATION-OPUS.md)** - Leverage Opus for complex tasks

---

## Key Concepts Summary

### Context Management

- Use `/compact` proactively to maintain performance
- Keep CLAUDE.md concise and incremental
- Use `!` prefix for shell commands to save tokens
- Monitor context with `/context` command

### Skill Design

- Skills are multi-file workflow packages
- Commands are single-file prompt shortcuts
- Skills can auto-invoke based on context
- Use namespacing for organization (`/testing/unit`)

### Model Selection

- **Haiku**: Speed and cost (parallel workers)
- **Sonnet**: Balance (standard development)
- **Opus**: Quality (complex reasoning, first-try correctness)

### File Processing

- Claude Code Read tool: ~25K token limit per call
- Use semantic chunking over fixed-size chunks
- Parallel file loading for multiple independent files
- Validate content (not just structure) after reading

---

## External Resources

### Official Documentation

- [Claude Code: Best practices for agentic coding](https://www.anthropic.com/engineering/claude-code-best-practices)
- [Claude Docs - Prompting Best Practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices)
- [Tool Search Tool - Claude Docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool)
- [Extended thinking - Claude Docs](https://platform.claude.com/docs/en/build-with-claude/extended-thinking)

### Community Guides

- [Awesome Claude Code - GitHub](https://github.com/hesreallyhim/awesome-claude-code)
- [Cooking with Claude Code: The Complete Guide](https://www.siddharthbharath.com/claude-code-the-complete-guide/)
- [Shipyard | Claude Code CLI Cheatsheet](https://shipyard.build/blog/claude-code-cheat-sheet/)

---

## Document Conventions

### Terminology

| Term              | Meaning                                            |
| ----------------- | -------------------------------------------------- |
| **Slash command** | `/command` - Intent-specific AI action             |
| **Shell command** | `!command` - Direct bash execution                 |
| **Skill**         | Multi-file workflow package in `.claude/skills/`   |
| **Task**          | Ephemeral worker agent spawned via Task tool       |
| **MCP**           | Model Context Protocol - external tool integration |

### Code Examples

All code examples in these documents use generic patterns:

```typescript
// Generic component example
export class Component {
  readonly state = signal(false);
  toggle() {
    this.state.update((s) => !s);
  }
}
```

Replace with your project's conventions as needed.

---

**Version**: 1.0.0
**Last Updated**: 2026-01-20
