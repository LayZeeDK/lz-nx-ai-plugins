# Claude Code MCP Tool Search Guide

> **Audience**: Developers using Claude Code with MCP servers
> **Purpose**: Optimize MCP tool usage through deferred loading and on-demand discovery
> **Last Updated**: 2026-01-20

---

## Table of Contents

1. [Overview](#overview)
2. [How It Works](#how-it-works)
3. [Configuration](#configuration)
4. [Token Savings](#token-savings)
5. [Accuracy Improvements](#accuracy-improvements)
6. [MCPSearch Tool Usage](#mcpsearch-tool-usage)
7. [Best Practices](#best-practices)
8. [Known Issues](#known-issues)
9. [References](#references)

---

## Overview

MCP Tool Search enables Claude Code to work with large tool libraries (50+ tools) by dynamically discovering and loading tools on-demand rather than loading all tool definitions into context upfront.

### The Problem It Solves

MCP servers can expose dozens or hundreds of tools. Loading all tool definitions upfront causes:

| Issue                   | Impact                                              |
| ----------------------- | --------------------------------------------------- |
| **Context pollution**   | Tool schemas consume 40-70% of 200K context window  |
| **Degraded accuracy**   | Claude's tool selection degrades beyond 30-50 tools |
| **Wasted tokens**       | Paying for tools never used in a session            |
| **Session limitations** | Less room for code, files, and conversation         |

### The Solution

MCP Tool Search (enabled by default since Claude Code 2.1.7) implements **lazy loading** for MCP tools:

```
Before Tool Search:                    After Tool Search:
┌──────────────────────────────┐       ┌──────────────────────────────┐
│ Context Window (200K)        │       │ Context Window (200K)        │
│ ┌──────────────────────────┐ │       │ ┌──────────────────────────┐ │
│ │ MCP Tools: 82K tokens    │ │       │ │ MCPSearch Tool: 3K tokens│ │
│ │ (41% consumed)           │ │       │ │ (1.5% consumed)          │ │
│ └──────────────────────────┘ │       │ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │       │ ┌──────────────────────────┐ │
│ │ Available: 118K tokens   │ │       │ │ Available: 197K tokens   │ │
│ │ (59% remaining)          │ │       │ │ (98.5% remaining)        │ │
│ └──────────────────────────┘ │       │ └──────────────────────────┘ │
└──────────────────────────────┘       └──────────────────────────────┘
```

---

## How It Works

### Automatic Activation

Tool Search activates automatically when MCP tool descriptions exceed **10% of the context window** (~10K tokens). No manual configuration required.

| Condition              | Behavior                                  |
| ---------------------- | ----------------------------------------- |
| Tool definitions < 10K | Traditional upfront loading (unchanged)   |
| Tool definitions > 10K | Automatic deferred loading with MCPSearch |

### Discovery Flow

```
1. Claude Code detects MCP tools exceed threshold
                    ↓
2. Tools marked with defer_loading: true
                    ↓
3. MCPSearch tool injected into context (~3K tokens)
                    ↓
4. Claude sees tool list summary, not full schemas
                    ↓
5. When Claude needs a tool, it calls MCPSearch
                    ↓
6. MCPSearch returns 3-5 relevant tools (~3K tokens)
                    ↓
7. Claude invokes the discovered tool
```

### Search Variants

Claude Code supports two search modes:

| Mode      | Query Format          | Best For                                       |
| --------- | --------------------- | ---------------------------------------------- |
| **Regex** | Python regex patterns | Precise matching: `"weather"`, `"get_.*_data"` |
| **BM25**  | Natural language      | Exploratory: "find tools for creating issues"  |

**Regex pattern examples**:

- `"weather"` — matches tool names/descriptions containing "weather"
- `"get_.*_data"` — matches `get_user_data`, `get_weather_data`, etc.
- `"database.*query|query.*database"` — OR patterns for flexibility
- `"(?i)slack"` — case-insensitive search

---

## Configuration

### Default Behavior (Recommended)

Tool Search auto mode is enabled by default. No configuration needed for most users.

### Disabling Tool Search

If you need all tools loaded upfront (e.g., for debugging), add MCPSearch to disallowed tools:

```json
// settings.json
{
  "disallowedTools": ["MCPSearch"]
}
```

### Per-Tool Control

Keep frequently-used tools loaded upfront while deferring others:

```json
// MCP server configuration
{
  "mcp_toolset": {
    "mcp_server_name": "my-server",
    "default_config": {
      "defer_loading": true
    },
    "configs": {
      "critical_tool_1": { "defer_loading": false },
      "critical_tool_2": { "defer_loading": false }
    }
  }
}
```

**Recommendation**: Keep 3-5 most frequently used tools as non-deferred for optimal performance.

### Verification

Use Claude Code commands to verify Tool Search status:

```bash
# Check MCP server token consumption
/doctor

# View context usage
/context
```

---

## Token Savings

### Benchmarks

Anthropic's engineering team published these benchmarks:

| Metric                  | Traditional | With Tool Search | Improvement            |
| ----------------------- | ----------- | ---------------- | ---------------------- |
| **Token consumption**   | ~77K tokens | ~8.7K tokens     | **85% reduction**      |
| **Context preserved**   | 62%         | 95%              | +33 percentage points  |
| **Per-search overhead** | N/A         | ~3K tokens       | Amortized over session |

### Real-World Example

One user reported:

| Metric                 | Before     | After      |
| ---------------------- | ---------- | ---------- |
| **Total context used** | 143K/200K  | 66K/200K   |
| **MCP tools overhead** | 82K (41%)  | ~8K (4%)   |
| **Available for work** | 12K (5.8%) | 134K (67%) |

---

## Accuracy Improvements

Tool Search not only saves tokens but improves tool selection accuracy:

| Model    | Without Tool Search | With Tool Search | Improvement            |
| -------- | ------------------- | ---------------- | ---------------------- |
| Opus 4   | 49%                 | 74%              | +25 percentage points  |
| Opus 4.5 | 79.5%               | 88.1%            | +8.6 percentage points |

**Why accuracy improves**: With fewer tools visible at once, Claude makes more confident selections. The search step also provides implicit confirmation that a tool exists for the task.

---

## MCPSearch Tool Usage

### When Claude Code Uses MCPSearch

Claude automatically uses MCPSearch when:

1. MCP tools are deferred (automatic with Tool Search enabled)
2. A task requires tools not currently in context
3. The user explicitly asks for MCP tool capabilities

### MCPSearch Parameters

```typescript
MCPSearch({
  query: string,      // Search term (regex or natural language)
  max_results?: number // Default: 5
})
```

### Direct Selection Mode

When you know exactly which tool you need:

```
query: "select:mcp__github__create_issue"
```

This bypasses search and loads the specific tool directly.

### Keyword Search Mode

When exploring available tools:

```
query: "create github issues"
```

Returns up to 5 matching tools ranked by relevance.

### Response Format

MCPSearch returns tool references that are automatically expanded:

```json
{
  "tool_references": [
    { "type": "tool_reference", "tool_name": "mcp__github__create_issue" },
    { "type": "tool_reference", "tool_name": "mcp__github__list_issues" }
  ]
}
```

---

## Best Practices

### For Claude Code Users

| Practice                           | Rationale                                                    |
| ---------------------------------- | ------------------------------------------------------------ |
| **Let auto mode work**             | Default thresholds are well-tuned                            |
| **Use `/doctor` to verify**        | Confirms Tool Search is active and working                   |
| **Write clear tool requests**      | "Create a GitHub issue" finds tools better than "make thing" |
| **Use direct selection when sure** | `select:mcp__*` bypasses search overhead                     |

### For MCP Server Authors

| Practice                             | Rationale                                           |
| ------------------------------------ | --------------------------------------------------- |
| **Use descriptive tool names**       | `github_create_issue` > `create` > `gi`             |
| **Include keywords in descriptions** | Match how users describe tasks naturally            |
| **Expand your tool library**         | Context penalty is gone—comprehensive is now viable |
| **Document common search patterns**  | Help users discover your tools efficiently          |

### For Skill/Orchestrator Authors

| Practice                           | Rationale                                          |
| ---------------------------------- | -------------------------------------------------- |
| **Account for search overhead**    | Each MCPSearch call adds ~3K tokens                |
| **Batch related tool discoveries** | One search for multiple related tools              |
| **Pre-select known tools**         | Use `select:` mode when tool name is known         |
| **Handle tool_reference blocks**   | Spawned Tasks may receive these instead of schemas |

---

## Known Issues

### Issue: Haiku tool_reference Error (GitHub #14863)

**Problem**: Haiku subagents fail with "tool_reference blocks not supported" when the parent has many MCP tools configured.

**Cause**: Tool Search returns `tool_reference` blocks that Haiku cannot process correctly.

**Workarounds**:

1. **Pre-load tools before spawning Haiku Tasks**:

   ```markdown
   Before spawning Haiku Task:

   1. Call MCPSearch to discover needed tools
   2. Ensure tools are loaded into context
   3. Spawn Haiku Task (tools now available without tool_reference)
   ```

2. **Use Sonnet for MCP-heavy operations**:

   ```typescript
   // Upgrade to Sonnet when MCP tools are involved
   if (requiresMCPTools) {
     model = 'sonnet';
   }
   ```

3. **Reduce MCP tool count**:
   - Disable unused MCP servers for the project
   - Use project-specific `.mcp.json` with minimal servers

**Reference**: [GitHub Issue #14863](https://github.com/anthropics/claude-code/issues/14863)

### Issue: Model Support Limitations

**Haiku is NOT supported** for server-side Tool Search:

| Model      | Tool Search Support |
| ---------- | ------------------- |
| Opus 4.5   | Full support        |
| Sonnet 4.5 | Full support        |
| Haiku 4.5  | Not supported       |

For Haiku orchestrators with MCP tools:

- Pre-discover tools using MCPSearch before spawning Haiku Tasks
- Or upgrade to Sonnet for MCP-dependent operations

### Issue: Search Not Finding Tools

**Symptoms**: Claude doesn't find expected tools via MCPSearch

**Debugging**:

1. Check tool name and description—Claude searches BOTH
2. Test regex patterns: `import re; re.search(r"your_pattern", "tool_name")`
3. Searches are case-sensitive by default (use `(?i)` for case-insensitive)
4. Add common keywords to tool descriptions

---

## Interaction with Task Tool

### Task Spawning with MCPSearch

When spawning Tasks that need MCP tools:

1. **Parent discovers tools first**:

   ```markdown
   Orchestrator (has MCPSearch):

   1. Call MCPSearch to find needed tools
   2. Tools load into orchestrator context
   3. Spawn Task with explicit tool references in prompt
   ```

2. **Task inherits tool context**:

   ```markdown
   Spawned Task receives:

   - The prompt you provided
   - Tools currently loaded in orchestrator context
   - May receive tool_reference blocks (Haiku incompatible)
   ```

3. **Workaround for Haiku Tasks**:

   ```markdown
   IF orchestrator uses Haiku AND spawning Task that needs MCP tools:
   Either:

   - Pre-load specific tools via MCPSearch before spawning
   - Upgrade Task to Sonnet for MCP operations
   - Include explicit tool names in prompt (not tool_reference)
   ```

---

## References

### Official Documentation

- [Tool Search Tool - Claude Docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool)
- [Connect Claude Code to tools via MCP](https://code.claude.com/docs/en/mcp)
- [Advanced Tool Use - Anthropic Engineering](https://www.anthropic.com/engineering/advanced-tool-use)

### Community Guides

- [MCP Tool Search Context Pollution Guide - Cyrus](https://www.atcyrus.com/stories/mcp-tool-search-claude-code-context-pollution-guide)
- [Claude Code Lazy Loading for MCP Tools - JP Caparas](https://jpcaparas.medium.com/claude-code-finally-gets-lazy-loading-for-mcp-tools-explained-39b613d1d5cc)
- [Claude Code Fixes MCP Issues - Analytics India](https://analyticsindiamag.com/ai-news-updates/claude-code-finally-fixes-the-huge-issue-with-mcps/)
- [Configuring MCP Tools - Scott Spence](https://scottspence.com/posts/configuring-mcp-tools-in-claude-code)

### Known Issues

- [Issue #14863: Haiku tool_reference error](https://github.com/anthropics/claude-code/issues/14863)
- [Issue #7328: MCP Tool Filtering Feature Request](https://github.com/anthropics/claude-code/issues/7328)
- [Issue #4380: Per-agent MCP Tool Filtering](https://github.com/anthropics/claude-code/issues/4380)

---

**Related Documents:**

- [TASK-SPAWNING-GUIDE.md](./TASK-SPAWNING-GUIDE.md) - Task tool patterns
- [MODEL-OPTIMIZATION-HAIKU.md](./MODEL-OPTIMIZATION-HAIKU.md) - Haiku prompt patterns

---

**Version**: 1.0.0
