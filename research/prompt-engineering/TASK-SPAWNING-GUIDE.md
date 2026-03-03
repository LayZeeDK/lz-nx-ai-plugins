# Claude Code Task Spawning Guide

> **Audience**: Developers building multi-agent workflows in Claude Code
> **Purpose**: Optimize Task tool usage, model selection, and error handling patterns
> **Last Updated**: 2026-01-20

---

## Table of Contents

1. [Overview](#overview)
2. [Task Tool Parameters](#task-tool-parameters)
3. [Model Selection Strategy](#model-selection-strategy)
4. [Prompt Optimization by Target Model](#prompt-optimization-by-target-model)
5. [Parallel vs Sequential Spawning](#parallel-vs-sequential-spawning)
6. [Error Handling Patterns](#error-handling-patterns)
7. [Cost Optimization](#cost-optimization)
8. [Known Issues and Workarounds](#known-issues-and-workarounds)
9. [Best Practices](#best-practices)
10. [References](#references)

---

## Overview

The Task tool enables Claude Code to spawn ephemeral worker agents for parallel execution. Unlike persistent subagents defined in `.claude/agents/`, Task workers are temporary—they receive context, perform work, and return results before terminating.

### Key Characteristics

| Aspect          | Task Tool Workers         | Custom Subagents                 |
| --------------- | ------------------------- | -------------------------------- |
| **Persistence** | Ephemeral (one-off)       | Persistent (reusable)            |
| **Context**     | Isolated 200K tokens each | Shared configuration             |
| **Spawning**    | Dynamic via Task tool     | Pre-defined in `.claude/agents/` |
| **Nesting**     | Cannot spawn children     | Cannot spawn children            |
| **Parallelism** | Up to 10 concurrent       | Sequential by default            |

### Architecture Pattern

```
┌────────────────────────────────────────────────────────┐
│              Orchestrator (Main Thread)                 │
│                                                         │
│  1. Parse input → 2. Classify tasks → 3. Spawn workers  │
└───────────────────────────┬─────────────────────────────┘
                            │
      ┌─────────────────────┼─────────────────────┐
      ▼                     ▼                     ▼
┌───────────┐         ┌───────────┐         ┌───────────┐
│ Task(A)   │         │ Task(B)   │         │ Task(C)   │
│ 200K ctx  │         │ 200K ctx  │         │ 200K ctx  │
│ Isolated  │         │ Isolated  │         │ Isolated  │
└─────┬─────┘         └─────┬─────┘         └─────┬─────┘
      │                     │                     │
      └─────────────────────┼─────────────────────┘
                            ▼
                   Results aggregated
```

---

## Task Tool Parameters

### Core Parameters

| Parameter           | Type    | Required | Description                                                      |
| ------------------- | ------- | -------- | ---------------------------------------------------------------- |
| `description`       | string  | Yes      | Short (3-5 words) summary for tracking                           |
| `prompt`            | string  | Yes      | Full task instructions for the worker                            |
| `subagent_type`     | string  | Yes      | Agent type: `"general-purpose"`, `"Explore"`, `"Plan"`, `"Bash"` |
| `model`             | string  | No       | Target model: `"haiku"`, `"sonnet"`, `"opus"`                    |
| `run_in_background` | boolean | No       | Execute asynchronously (default: false)                          |
| `max_turns`         | integer | No       | Limit agentic turns before stopping                              |
| `resume`            | string  | No       | Agent ID to continue from previous execution                     |

### Example Usage

```typescript
// Basic Task spawn
Task({
  description: 'Analyze component',
  prompt: 'Read component.ts and identify all public methods...',
  subagent_type: 'general-purpose',
  model: 'sonnet',
});

// Background execution
Task({
  description: 'Run full test suite',
  prompt: 'Execute npm run test and report results...',
  subagent_type: 'Bash',
  run_in_background: true,
});

// Resume previous agent
Task({
  description: 'Continue analysis',
  prompt: 'Finish the remaining items from the previous session',
  subagent_type: 'general-purpose',
  resume: 'agent-id-12345',
});
```

### Subagent Types

| Type              | Tools Available              | Best For                     |
| ----------------- | ---------------------------- | ---------------------------- |
| `general-purpose` | All tools                    | Complex multi-step tasks     |
| `Explore`         | Read-only (Glob, Grep, Read) | Codebase analysis, searching |
| `Plan`            | Read-only + analysis         | Architecture planning        |
| `Bash`            | Bash only                    | Command execution            |

---

## Model Selection Strategy

### Default Behavior

- If `model` is **omitted**: Inherits from parent (recommended)
- If `model` is **specified**: Uses that model (subject to known issues)

### Selection Matrix

| Task Complexity            | Reasoning Depth | Model      | Rationale                    |
| -------------------------- | --------------- | ---------- | ---------------------------- |
| Mechanical (pattern-based) | None            | **haiku**  | Fast, cheap, reliable        |
| Standard implementation    | Moderate        | **sonnet** | Balanced capability/cost     |
| Complex judgment           | Deep            | **opus**   | Best reasoning, highest cost |

### Decision Tree

```
START
  │
  ├─ Is task mechanical (search/replace, template fill)?
  │   └─ YES → haiku
  │
  ├─ Does task require code modification?
  │   ├─ YES, simple (exact code provided) → haiku (if safe) OR sonnet
  │   └─ YES, complex (requires reasoning) → sonnet OR opus
  │
  ├─ Does task require deep analysis or judgment?
  │   └─ YES → opus
  │
  └─ DEFAULT → sonnet (best balance)
```

### Cost Comparison

| Model      | Input (per 1M) | Output (per 1M) | Relative Cost |
| ---------- | -------------- | --------------- | ------------- |
| Haiku 4.5  | $1             | $5              | 1× (baseline) |
| Sonnet 4.5 | $3             | $15             | 3×            |
| Opus 4.5   | $15            | $75             | 15×           |

**Rule of Thumb**: Use the cheapest model that can reliably complete the task.

---

## Prompt Optimization by Target Model

### Haiku Prompt Pattern

Haiku excels at structured, bounded tasks with explicit instructions.

**Optimizations**:

- XML tags for structure boundaries
- Step-bounded reasoning (3-5 steps max)
- Checklists for verifiable output
- Anti-goals to prevent scope creep
- No verbose explanations requested

```xml
<role>
You are an implementation assistant.
Output: Exact results only. No explanations.
</role>

<task>
{Task description}
</task>

<context>
File: {file_path}
Lines: {line_numbers}
</context>

<action_steps>
Execute exactly these steps:
1. Read {file_path}
2. Identify {target}
3. Use Edit tool with old_string/new_string
4. Verify success
</action_steps>

<constraints>
- Maximum 3 file edits
- Use Edit tool (NOT Write tool)
- Do NOT modify unrelated sections
</constraints>

<success_criteria>
- [ ] Edit tool returned success
- [ ] Change at correct location
</success_criteria>

<anti_goals>
- Do NOT explain what you're doing
- Do NOT ask for confirmation
- Do NOT suggest improvements
</anti_goals>
```

### Sonnet Prompt Pattern

Sonnet handles standard implementation with moderate reasoning.

**Optimizations**:

- Phase-based execution with thinking checkpoints
- Parallel file loading (specify files to read simultaneously)
- Extended thinking budget hints (8K-16K tokens)
- Error-first TDD approach
- Explicit OUT OF SCOPE constraints

```markdown
<role>
You are an implementation agent executing systematic changes.
Extended thinking budget: 8K tokens for context, 16K for complex logic.
</role>

<implementation_phases>

<phase name="context" parallel_tools="true" extended_thinking="8K">
## Phase 1: Context Loading (PARALLEL)

Read these files SIMULTANEOUSLY:

- {file_1}
- {file_2}
- {file_3}

Think about:

- What's the current state?
- What's the minimal change needed?
- What could go wrong?
  </phase>

<phase name="implementation" extended_thinking="16K">
## Phase 2: Implementation

1. Write test first (if behavior change)
2. Implement minimal fix
3. Verify immediately
   </phase>

<phase name="verification">
## Phase 3: Verification

- [ ] Change addresses requirement
- [ ] No unintended side effects
      </phase>

</implementation_phases>

<constraints>
**IN SCOPE**: {specific items}
**OUT OF SCOPE**: Refactoring, additional features, documentation beyond JSDoc
</constraints>
```

### Opus Prompt Pattern

Opus handles complex tasks requiring deep reasoning and judgment.

**Optimizations**:

- Medium effort parameter mention (76% token savings)
- Calibrated language (avoid aggressive "MUST"/"CRITICAL")
- "Consider/Evaluate/Analyze" word choice (not "think")
- First-try correctness approach
- Extended thinking budget hints (16K-32K tokens)

```markdown
<role>
You are an expert implementation agent with deep reasoning capabilities.
Use medium effort for optimal token efficiency.
Extended thinking budget: 16K-32K tokens.
</role>

<task id="{ID}" severity="HIGH">

## Problem Statement

{Summary}

## Location(s)

{Locations}

## Recommendation

{Recommendation}

</task>

<implementation_strategy>

## Phase 1: Deep Analysis (Extended Thinking: 16K)

Evaluate:

- What is the root cause?
- What are the resolution options?
- What are the tradeoffs?
- What could go wrong?

Assess impact on:

- Related components
- Existing tests
- Future maintenance

## Phase 2: First-Try Implementation

Leverage your expert capabilities:

1. Implement the complete solution
2. Handle edge cases proactively
3. Verify once

Note: Opus 4.5 has higher first-try success rate.
Implement fully, then verify.

</implementation_strategy>

<guidance>
Trust your expert judgment for implementation details.
Make the change directly—do not create planning documents.
</guidance>
```

---

## Parallel vs Sequential Spawning

### Parallelism Limits

- **Maximum concurrent Tasks**: 10
- **Queue behavior**: Additional tasks wait in queue
- **Context isolation**: Each Task has its own 200K context

### When to Parallelize

**Use Parallel Spawning When**:

- Tasks are **independent** (no shared state)
- Tasks operate on **different files**
- Results can be **aggregated** afterward
- Speed matters more than token cost

**Use Sequential Spawning When**:

- Tasks have **dependencies**
- Tasks modify the **same files**
- Results from Task A inform Task B
- Debugging/observability is critical

### Parallel Spawn Pattern

```typescript
// Spawn multiple independent tasks in ONE message
// Claude Code will execute them concurrently

Task({
  description: 'Analyze component A',
  prompt: '...',
  subagent_type: 'Explore',
  model: 'haiku',
});

Task({
  description: 'Analyze component B',
  prompt: '...',
  subagent_type: 'Explore',
  model: 'haiku',
});

Task({
  description: 'Analyze component C',
  prompt: '...',
  subagent_type: 'Explore',
  model: 'haiku',
});

// All three run concurrently (up to 10 parallel)
```

### Sequential Spawn Pattern

```typescript
// Task 1: Get information
const result1 = Task({
  description: 'Identify files to modify',
  prompt: 'Find all files importing the component...',
  subagent_type: 'Explore',
});

// Wait for result1, then use it in Task 2
const result2 = Task({
  description: 'Modify identified files',
  prompt: `Modify these files: ${result1.files.join(', ')}...`,
  subagent_type: 'general-purpose',
});
```

### Background Execution

```typescript
// Non-blocking execution
Task({
  description: 'Long-running analysis',
  prompt: 'Analyze entire codebase for security issues...',
  subagent_type: 'general-purpose',
  run_in_background: true,
});

// Continue with other work while background task runs
// Use TaskOutput tool to check results later:
TaskOutput({
  task_id: 'background-task-id',
  block: false, // Non-blocking check
});
```

---

## Error Handling Patterns

### Common Failure Modes

| Failure               | Cause                 | Mitigation                                |
| --------------------- | --------------------- | ----------------------------------------- |
| **Rate limit (429)**  | Too many requests     | Reduce parallelism, add delays            |
| **Context overflow**  | Task prompt too large | Chunk input, summarize context            |
| **Timeout**           | Task takes too long   | Set `max_turns`, break into smaller tasks |
| **Model unavailable** | Model access issues   | Use fallback model, check quotas          |
| **Cascading failure** | One failure kills all | Use background tasks for isolation        |

### Retry Pattern with Exponential Backoff

```markdown
<error_handling>
IF Task fails:

1. Log error with task ID and reason
2. Check if retryable (429 = yes, 400 = usually no)
3. IF retryable:
   - Wait: 2^attempt × 1000ms (max 32s)
   - Add jitter: ±25% randomness
   - Retry up to 3 times
4. IF max retries exceeded:
   - Mark task as failed
   - Report error to orchestrator
   - Continue with remaining tasks
</error_handling>
```

### Graceful Degradation

```markdown
<fallback_strategy>

1. Primary: Try with specified model (e.g., opus)
2. Fallback 1: If rate limited, try with sonnet
3. Fallback 2: If sonnet fails, try with haiku (if task is simple enough)
4. Final: Report failure with diagnostic info
</fallback_strategy>
```

### Task Isolation Pattern

To prevent cascading failures where one Task error kills all Tasks:

```typescript
// Use background execution for isolation
Task({
  description: 'Task A',
  prompt: '...',
  run_in_background: true, // Isolated execution
});

Task({
  description: 'Task B',
  prompt: '...',
  run_in_background: true, // Isolated execution
});

// Each task has independent error handling
// One failure doesn't affect others
```

### Validation Pattern

```markdown
<output_validation>
After Task returns:

1. Check return status (success/failure)
2. Validate output format (if structured)
3. Verify expected changes were made
4. IF validation fails:
   - Log discrepancy
   - Retry with clarified prompt
   - OR escalate to higher-capability model
</output_validation>
```

---

## Cost Optimization

### Token Overhead

**Critical Insight**: Each Task spawns a new Claude instance with ~20,000 tokens of context overhead before any work begins.

| Approach       | Overhead | Best For                  |
| -------------- | -------- | ------------------------- |
| Main thread    | 0        | Small tasks (<3 steps)    |
| Single Task    | ~20K     | Medium isolated tasks     |
| Multiple Tasks | ~20K × N | Large parallelizable work |

### Cost-Effective Patterns

**1. Batch Similar Tasks**

```markdown
❌ Inefficient: 10 separate Tasks for 10 file reads
✅ Efficient: 1 Task that reads 10 files in parallel
```

**2. Use Explore for Read-Only Work**

```typescript
// Explore subagent is optimized for codebase analysis
Task({
  subagent_type: 'Explore', // Faster, cheaper
  model: 'haiku', // Cheapest model
  prompt: 'Find all usages of ErrorHandler...',
});
```

**3. Minimize Context in Prompts**

```markdown
❌ Inefficient: Include entire file contents in prompt
✅ Efficient: Reference file paths, let Task read them
```

**4. Route by Complexity**

```markdown
Classification → Model Assignment → Cost
────────────────────────────────────────
LOW severity → haiku → $0.01-0.02
MEDIUM severity → sonnet → $0.05-0.10
HIGH severity → opus → $0.50-1.00
```

### Cost Monitoring

Track these metrics per Task:

- Input tokens consumed
- Output tokens generated
- Model used
- Success/failure rate
- Retry count

---

## Known Issues and Workarounds

### Issue: Model Parameter Ignored

**Problem**: Task tool's `model` parameter may be ignored, defaulting to Opus regardless of specification.

**Workaround**:

- Omit `model` parameter to inherit from parent
- Or use custom subagents with explicit model configuration

**Reference**: [GitHub Issue #12063](https://github.com/anthropics/claude-code/issues/12063)

### Issue: Haiku Tool Reference Error

**Problem**: Haiku subagents fail with "tool_reference blocks not supported" when parent has many MCP tools.

**Workaround**:

- Reduce MCP tool count
- Use sonnet instead of haiku for complex tooling

**Reference**: [GitHub Issue #14863](https://github.com/anthropics/claude-code/issues/14863)

### Issue: Cascading Failures

**Problem**: In some versions, one Task failure terminates all running Tasks.

**Workaround**:

- Use `run_in_background: true` for isolation
- Implement retry logic at orchestrator level

**Reference**: [GitHub Issue #6594](https://github.com/anthropics/claude-code/issues/6594)

### Issue: Tool Name Uniqueness

**Problem**: Task fails with "tools: Tool names must be unique" when parent has many MCP tools.

**Workaround**:

- Reduce MCP tool configuration
- Use subagents with tool restrictions

**Reference**: [GitHub Issue #10668](https://github.com/anthropics/claude-code/issues/10668)

---

## Best Practices

### Do

1. **Match model to task complexity** — Haiku for mechanical, Sonnet for standard, Opus for complex
2. **Use parallel spawning** for independent tasks (up to 10 concurrent)
3. **Provide explicit constraints** — Anti-goals, scope boundaries, step limits
4. **Validate outputs** — Check return status and verify changes
5. **Use Explore subagent** for read-only codebase analysis
6. **Batch related operations** — One Task for multiple related files
7. **Include context in prompts** — File paths, line numbers, requirement IDs
8. **Handle errors gracefully** — Retry logic, fallback models, clear reporting

### Avoid

1. **Don't over-parallelize** — 20K token overhead per Task adds up
2. **Don't spawn Tasks for trivial work** — Main thread is cheaper for small tasks
3. **Don't ignore model parameter issues** — Test model selection, use workarounds
4. **Don't assume Tasks share context** — Each has isolated 200K window
5. **Don't nest Task spawning** — Subagents cannot spawn children
6. **Don't use aggressive language for Opus** — Calibrated prompts perform better
7. **Don't skip validation** — Tasks can fail silently

### Checklist for New Task Implementations

- [ ] Task has clear, bounded scope
- [ ] Model selected based on complexity
- [ ] Prompt optimized for target model
- [ ] Parallel/sequential decision made explicitly
- [ ] Error handling defined
- [ ] Output validation specified
- [ ] Cost estimated and acceptable

---

## References

### Official Documentation

- [Create custom subagents - Claude Code Docs](https://code.claude.com/docs/en/sub-agents)
- [Claude Code Model Configuration](https://support.claude.com/en/articles/11940350-claude-code-model-configuration)
- [Advanced tool use - Anthropic](https://www.anthropic.com/engineering/advanced-tool-use)

### Community Guides

- [Task/Agent Tools - ClaudeLog](https://claudelog.com/mechanics/task-agent-tools/)
- [Claude Code: Task Tool vs Subagents - Amit Kothari](https://amitkoth.com/claude-code-task-tool-vs-subagents/)
- [How to Use Claude Code Subagents - Zach Wills](https://zachwills.net/how-to-use-claude-code-subagents-to-parallelize-development/)
- [Claude Code and Subagents - Medium](https://medium.com/@techofhp/claude-code-and-subagents-how-to-build-your-first-multi-agent-workflow-3cdbc5e430fa)
- [Multi-agent parallel coding with Claude Code Subagents - Medium](https://medium.com/@codecentrevibe/claude-code-multi-agent-parallel-coding-83271c4675fa) (member-only)
- [Embracing parallel coding agents - Simon Willison](https://simonwillison.net/2025/Oct/5/parallel-coding-agents/)

### Multi-Agent Orchestration

- [Multi-Agent Orchestration: Running 10+ Claude Instances - DEV](https://dev.to/bredmond1019/multi-agent-orchestration-running-10-claude-instances-in-parallel-part-3-29da)
- [Claude Subagents Complete Guide - Cursor IDE](https://www.cursor-ide.com/blog/claude-subagents)
- [GitHub - wshobson/agents](https://github.com/wshobson/agents)

### Known Issues

- [Issue #12063: Task tool ignores model parameter](https://github.com/anthropics/claude-code/issues/12063)
- [Issue #14863: Haiku tool_reference error](https://github.com/anthropics/claude-code/issues/14863)
- [Issue #6594: Subagent termination bug](https://github.com/anthropics/claude-code/issues/6594)
- [Issue #10668: Tool name uniqueness error](https://github.com/anthropics/claude-code/issues/10668)
- [Issue #9905: Background agent execution request](https://github.com/anthropics/claude-code/issues/9905)

---

**Related Documents:**
- [MODEL-OPTIMIZATION-HAIKU.md](./MODEL-OPTIMIZATION-HAIKU.md) - Haiku prompt patterns
- [MODEL-OPTIMIZATION-SONNET.md](./MODEL-OPTIMIZATION-SONNET.md) - Sonnet patterns
- [MODEL-OPTIMIZATION-OPUS.md](./MODEL-OPTIMIZATION-OPUS.md) - Opus patterns
- [SKILLS-ARCHITECTURE.md](./SKILLS-ARCHITECTURE.md) - Skills vs commands

---

**Version**: 1.0.0
