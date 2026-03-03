# Claude Code Sub-agents: The 90% Performance Gain Nobody Talks About

> Source: [https://www.codewithseb.com/blog/claude-code-sub-agents-multi-agent-systems-guide](https://www.codewithseb.com/blog/claude-code-sub-agents-multi-agent-systems-guide)
> Author: Sebastian Ślęczka
> Site: Code With Seb Blog

---
Anthropic's internal tests show multi-agent systems outperform single agents by 90%. But most tutorials stop at YAML configs. Here's how to build production-ready orchestrator patterns with cost optimization and debugging techniques that actually work.

## Table of contents

[What Are Claude Code Sub-agents (Quick Primer)](https://www.codewithseb.com/#what-are-claude-code-sub-agents-quick-primer)

[Built-in vs Custom: When Each Makes Sense](https://www.codewithseb.com/#built-in-vs-custom-when-each-makes-sense)

[Built-in: Explore](https://www.codewithseb.com/#built-in-explore)

[Built-in: Plan](https://www.codewithseb.com/#built-in-plan)

[Built-in: general-purpose](https://www.codewithseb.com/#built-in-general-purpose)

[When to Build Custom Subagents](https://www.codewithseb.com/#when-to-build-custom-subagents)

[The Orchestrator-Worker Pattern: Anthropic's Secret Sauce](https://www.codewithseb.com/#the-orchestrator-worker-pattern-anthropics-secret-sauce)

[Creating Your First Custom Subagent](https://www.codewithseb.com/#creating-your-first-custom-subagent)

[Basic Structure](https://www.codewithseb.com/#basic-structure)

[Using the /agents Command](https://www.codewithseb.com/#using-the-agents-command)

[Key Configuration Options](https://www.codewithseb.com/#key-configuration-options)

[Model Selection Strategy: 70% Cost Reduction](https://www.codewithseb.com/#model-selection-strategy-70-cost-reduction)

[The Decision Matrix](https://www.codewithseb.com/#the-decision-matrix)

[Dynamic Selection in Practice](https://www.codewithseb.com/#dynamic-selection-in-practice)

[Real Cost Comparison](https://www.codewithseb.com/#real-cost-comparison)

[5 Common Mistakes That Waste 700K+ Tokens](https://www.codewithseb.com/#5-common-mistakes-that-waste-700k-tokens)

[Mistake #1: Using Subagents for Implementation](https://www.codewithseb.com/#mistake-1-using-subagents-for-implementation)

[Mistake #2: Giving All Tools to Every Agent](https://www.codewithseb.com/#mistake-2-giving-all-tools-to-every-agent)

[Mistake #3: Descriptive Agent Names](https://www.codewithseb.com/#mistake-3-descriptive-agent-names)

[Mistake #4: Ignoring Context Compaction](https://www.codewithseb.com/#mistake-4-ignoring-context-compaction)

[Mistake #5: Parallel File Edits Without Coordination](https://www.codewithseb.com/#mistake-5-parallel-file-edits-without-coordination)

[Debugging When Agents Fail: Techniques That Work](https://www.codewithseb.com/#debugging-when-agents-fail-techniques-that-work)

[Enable Debug Mode](https://www.codewithseb.com/#enable-debug-mode)

[Common Failure Patterns](https://www.codewithseb.com/#common-failure-patterns)

[Recovery Strategy](https://www.codewithseb.com/#recovery-strategy)

[Real-World Example: Multi-File Refactoring](https://www.codewithseb.com/#real-world-example-multi-file-refactoring)

[The Setup](https://www.codewithseb.com/#the-setup)

[The Orchestration (in CLAUDE.md)](https://www.codewithseb.com/#the-orchestration-in-claudemd)

[Execution](https://www.codewithseb.com/#execution)

[When NOT to Use Multi-Agent (The Honest Truth)](https://www.codewithseb.com/#when-not-to-use-multi-agent-the-honest-truth)

[Don't Use Multi-Agent When:](https://www.codewithseb.com/#dont-use-multi-agent-when)

[The 15x Token Reality Check](https://www.codewithseb.com/#the-15x-token-reality-check)

[Production Checklist](https://www.codewithseb.com/#production-checklist)

[Agent Configuration](https://www.codewithseb.com/#agent-configuration)

[Cost Control](https://www.codewithseb.com/#cost-control)

[Error Handling](https://www.codewithseb.com/#error-handling)

[Testing](https://www.codewithseb.com/#testing)

[References](https://www.codewithseb.com/#references)

[Sources](https://www.codewithseb.com/#sources)

[Further Reading](https://www.codewithseb.com/#further-reading)

Most Claude Code users are leaving 90% performance on the table. Not because they lack skill, but because every tutorial out there stops at "here's how to write a YAML config."

Anthropic's own research team published something remarkable: their multi-agent system with Claude Opus 4 as lead and Sonnet 4 subagents **outperformed a single Claude Opus 4 by 90.2%** on complex research tasks. That's not a marginal improvement. That's nearly doubling your output quality.

Yet most developers I talk to either don't use subagents at all, or use them like glorified function calls. Let me show you what you're missing.

## What Are Claude Code Sub-agents (Quick Primer)

A subagent is a specialized AI assistant that runs in its own context window. Think of it as spawning a focused worker that handles one specific job, returns results, and disappears—keeping your main conversation clean.

Each subagent gets:

-   **Its own 200K context window** (fresh, uncluttered)
-   **Custom system prompt** (domain-specific instructions)
-   **Tool restrictions** (only what it needs)
-   **Independent permissions** (sandboxed execution)

The key insight: subagents cannot spawn their own subagents. This prevents infinite nesting and keeps the architecture predictable.

```
┌─────────────────────────────────────────────┐
│           Main Claude Agent                 │
│         (Orchestrator - Opus)               │
├─────────────────────────────────────────────┤
│                    │                        │
│    ┌───────────────┼───────────────┐        │
│    ▼               ▼               ▼        │
│ ┌──────┐      ┌──────┐      ┌──────┐        │
│ │Explore│      │ Plan │      │Custom│        │
│ │(Haiku)│      │(Sonnet)│    │Agent │        │
│ └──────┘      └──────┘      └──────┘        │
└─────────────────────────────────────────────┘
```

## Built-in vs Custom: When Each Makes Sense

Claude Code ships with three built-in subagents. Before you create custom ones, understand what you already have.

### Built-in: Explore

**Best for:** Searching and analyzing codebases without modifications.

Explore is read-only and optimized for speed. When you ask Claude "where is X implemented?" it delegates to Explore, which can scan your entire codebase without polluting your main context.

```
# Claude automatically uses Explore when you ask:
"Find all usages of the AuthService class"
"What files handle payment processing?"
"Show me the test coverage for the user module"
```

Claude specifies thoroughness: **quick** for targeted lookups, **medium** for balanced exploration, **very thorough** for comprehensive analysis.

### Built-in: Plan

**Best for:** Gathering context before presenting implementation plans.

When you enter plan mode (`/plan`), Claude delegates research to the Plan subagent. It explores your codebase, understands patterns, and returns findings so Claude can propose a coherent strategy.

### Built-in: general-purpose

**Best for:** Complex, multi-step tasks requiring both exploration and action.

This is the heavy-hitter. Claude delegates to general-purpose when tasks need reasoning across multiple dependent steps. It's the "I need to think about this" agent.

### When to Build Custom Subagents

Build custom subagents when:

1.  **You need domain-specific expertise** (security auditing, performance profiling)
2.  **You want opinionated behavior** (enforce coding standards, reject bad patterns)
3.  **You need cost control** (route simple tasks to Haiku)
4.  **You have repeated workflows** (code review, documentation generation)

**Don't build custom subagents when:**

-   Built-in agents already handle your use case
-   You're doing one-off tasks
-   You want the agent to do implementation work (more on this below)

## The Orchestrator-Worker Pattern: Anthropic's Secret Sauce

Here's what most tutorials miss: the architecture that delivered that 90% improvement.

Anthropic's research system uses an **orchestrator-worker pattern**:

1.  **Lead agent (Orchestrator)** - Opus 4, analyzes queries, develops strategy, coordinates
2.  **Subagents (Workers)** - Sonnet 4, explore specific aspects in parallel
3.  **Memory system** - Persists context when conversations exceed 200K tokens

The lead agent doesn't do the grunt work. It thinks strategically and delegates tactically.

```
// Conceptual flow (not actual API)
async function researchTask(query: string) {
  // Orchestrator analyzes and plans
  const strategy = await orchestrator.plan(query)

  // Spawn parallel workers
  const results = await Promise.all([
    subagent.explore('documentation', strategy.docQueries),
    subagent.explore('codebase', strategy.codeQueries),
    subagent.explore('issues', strategy.issueQueries),
  ])

  // Orchestrator synthesizes
  return orchestrator.synthesize(results)
}
```

**Critical insight from Anthropic's research:** Token usage explains 80% of performance variance. More tokens = better results. Multi-agent systems use ~15x more tokens than chat interactions, but that investment pays off in quality.

## Creating Your First Custom Subagent

Subagents are Markdown files with YAML frontmatter. Location determines scope:

| Location | Scope |
| --- | --- |
| `~/.claude/agents/` | All projects (user-level) |
| `.claude/agents/` | Current project only |

### Basic Structure

```
---
name: security-reviewer
description: Reviews code for security vulnerabilities and OWASP Top 10 issues
model: sonnet
tools:
  - Read
  - Grep
  - Glob
---

You are a security-focused code reviewer. Your job is to identify vulnerabilities, not fix them.

## What to Check

- SQL injection vectors
- XSS vulnerabilities
- Authentication bypasses
- Sensitive data exposure
- Security misconfigurations

## Response Format

Return findings as:

1. Severity (Critical/High/Medium/Low)
2. Location (file:line)
3. Issue description
4. Remediation suggestion

Be thorough but concise. Only report actual vulnerabilities, not style issues.
```

### Using the /agents Command

The interactive way:

```
# In Claude Code
/agents
# → View all available subagents
# → Create new agent (guided setup)
# → Edit existing configurations
```

### Key Configuration Options

```
---
name: code-documenter # Identifier (avoid descriptive names - see gotchas)
description: Generates JSDoc... # When Claude should use this agent
model: haiku # haiku | sonnet | opus
tools: # Restrict available tools
  - Read
  - Glob
  - Grep
# Note: Never include 'Task' - subagents can't spawn subagents
---
```

## Model Selection Strategy: 70% Cost Reduction

This is where most developers leave money on the table. Strategic model selection can cut costs by 70% without sacrificing quality.

### The Decision Matrix

| Task Type | Model | Why |
| --- | --- | --- |
| Code review, linting, docs | **Haiku** | Fast, cheap, patterns are well-defined |
| Multi-file changes, debugging | **Sonnet** | Balanced reasoning, Anthropic's recommendation |
| Architecture, novel problems | **Opus** | Deep reasoning, worth the 5x premium |

### Dynamic Selection in Practice

```
# .claude/agents/quick-reviewer.md
---
name: quick-reviewer
model: haiku # Fast checks
tools: [Read, Grep]
---
# .claude/agents/deep-analyzer.md
---
name: deep-analyzer
model: opus # Complex reasoning
tools: [Read, Grep, Glob, Bash]
---
```

### Real Cost Comparison

From production benchmarks:

| Agent Config | Time | Cost | Accuracy |
| --- | --- | --- | --- |
| Haiku 4.5 | 8s | $0.03 | 60% |
| Sonnet 4.5 | 45s | $0.24 | 85% |
| Opus 4.5 | 2min | $1.20 | 95% |

**Pro tip:** Start with Sonnet (`claude --model sonnet`), switch to Opus for complex refactoring (`/model opus`), drop to Haiku for bulk operations (`/model haiku`).

## 5 Common Mistakes That Waste 700K+ Tokens

A GitHub issue documented critical token-wasting patterns from real production usage. Here's what to avoid.

### Mistake #1: Using Subagents for Implementation

Adam Wolf from the Claude Code team is clear: **"Sub agents work best when just looking for information and provide a small amount of summary back to main conversation thread."**

```
# ❌ Wrong: Implementation subagent

---

name: feature-implementer
description: Implements new features end-to-end
tools: [Read, Write, Edit, Bash]

---

# ✅ Right: Research subagent

---

name: feature-researcher
description: Analyzes codebase to understand implementation patterns
tools: [Read, Grep, Glob]

---
```

### Mistake #2: Giving All Tools to Every Agent

Allowing every agent access to all tools causes:

-   Agents overstepping their authority
-   Redundant task execution
-   Context pollution
-   Massive token waste

```
# ❌ Wrong
tools: [Read, Write, Edit, Bash, Grep, Glob, WebSearch, WebFetch]

# ✅ Right
tools: [Read, Grep]  # Only what's needed
```

### Mistake #3: Descriptive Agent Names

Here's a nasty gotcha: Claude Code infers subagent behavior from names. A `code-reviewer` agent gets pre-defined generic rules that **silently override your instructions**.

```
# ❌ Wrong - Claude applies default "code-reviewer" behavior
name: code-reviewer

# ✅ Right - Use non-descriptive names
name: cr-alpha
name: reviewer-7x
```

### Mistake #4: Ignoring Context Compaction

User preferences and warnings are lost after context compaction. I've seen this waste 80K+ tokens per repeat when the agent makes the same mistake over and over.

**Solution:** Put critical constraints in your `CLAUDE.md` file, which persists across compaction.

### Mistake #5: Parallel File Edits Without Coordination

There's no built-in mechanism to prevent agents from editing the same files simultaneously. This causes conflicts, compiler errors, and wasted work.

```
# In CLAUDE.md, add explicit coordination rules:

## File Edit Policy

- Only ONE agent may edit a file at a time
- Use file locks (create .lock files) before editing
- Announce file edits in agent output
```

## Debugging When Agents Fail: Techniques That Work

Agents fail. Here's how to diagnose and recover.

### Enable Debug Mode

```
claude --mcp-debug
```

This reveals:

-   Which subagent was invoked
-   What tools were called
-   Where the failure occurred

### Common Failure Patterns

**1\. YAML Frontmatter Syntax Errors**

Silently ignored. Your agent won't load and you won't know why.

```
# ❌ Wrong - missing quotes around description with special chars
description: Reviews code for "security" issues

# ✅ Right
description: 'Reviews code for "security" issues'
```

**2\. CLI Version Mismatch**

Agents stop loading after updates. Fix:

```
claude --version  # Check current
npm update -g @anthropic-ai/claude-code  # Update
```

**3\. Subagent Not Triggering**

Check the `description` field. Claude matches tasks to descriptions. Vague descriptions = no delegation.

```
# ❌ Too vague
description: Helps with code

# ✅ Specific trigger conditions
description: Analyzes TypeScript files for type safety issues when user asks about types or encounters type errors
```

### Recovery Strategy

When errors occur mid-task:

1.  **Don't restart from scratch** - Restarts are expensive
2.  **Build resume points** - Save intermediate state to files
3.  **Let agents adapt** - Inform them of failures, they adjust surprisingly well

```
# In your prompt after failure:

"The previous attempt failed at step 3 with error X.
Resume from step 3, accounting for this constraint."
```

## Real-World Example: Multi-File Refactoring

Let's refactor a deprecated function used across 75 files—the kind of task where multi-agent shines.

### The Setup

```
# .claude/agents/refactor-scout.md

---

name: refactor-scout
description: Finds all usages of deprecated functions across codebase
model: haiku
tools: [Grep, Glob, Read]

---

Find all usages of the specified function. Return:

- File path
- Line number
- Current usage context (surrounding 3 lines)
- Suggested replacement pattern
```

### The Orchestration (in CLAUDE.md)

```
## Refactoring Workflow

When deprecating a function:

1. Use refactor-scout to find ALL usages
2. Group findings by file
3. Process files sequentially (never parallel edits)
4. Run tests after each file
5. If tests fail, revert and flag for manual review
```

### Execution

```
You: "Deprecate the getCwd function, replace with getCurrentWorkingDirectory"

Claude: I'll use the refactor-scout agent to find all usages first.

[Spawns refactor-scout - 8 seconds with Haiku]

Found 75 usages across 23 files. Grouped by module:
- auth/ (12 files, 28 usages)
- api/ (8 files, 31 usages)
- utils/ (3 files, 16 usages)

Processing auth/session.ts first...
```

This approach:

-   Uses cheap Haiku for discovery
-   Keeps main context clean
-   Processes sequentially to avoid conflicts
-   Validates after each change

## When NOT to Use Multi-Agent (The Honest Truth)

Multi-agent isn't always better. Anthropic's own research identifies poor fits:

### Don't Use Multi-Agent When:

**1\. Tasks require shared context**

If all agents need to see the same information simultaneously, multi-agent adds overhead without benefit.

**2\. High interdependency between steps**

Sequential tasks where each step depends on the previous don't parallelize. You're just adding coordination overhead.

**3\. Simple, focused tasks**

For straightforward changes to 1-3 files, a single agent is faster and cheaper.

**4\. Coding tasks (usually)**

Anthropic notes: "Most coding tasks involve fewer truly parallelizable tasks than research." The built-in Explore agent handles most code understanding needs.

### The 15x Token Reality Check

Multi-agent systems use approximately **15x more tokens** than chat interactions. That's not a bug—it's the cost of parallel exploration.

Do the math:

-   Simple chat: ~2K tokens
-   Single agent: ~8K tokens (4x)
-   Multi-agent: ~30K tokens (15x)

If your task doesn't benefit from parallel exploration, you're just burning money.

## Production Checklist

Before deploying multi-agent workflows:

### Agent Configuration

-   Each agent has ONE clear purpose
-   Tools are restricted to minimum required
-   Names are non-descriptive (avoid behavioral inference)
-   Descriptions specify exact trigger conditions
-   YAML syntax validated (use a linter)

### Cost Control

-   Haiku for high-volume, pattern-matching tasks
-   Sonnet for balanced reasoning (default)
-   Opus reserved for architecture and novel problems
-   Token usage monitored per workflow

### Error Handling

-   Debug mode available (`--mcp-debug`)
-   Recovery points defined in CLAUDE.md
-   File edit coordination rules documented
-   Critical constraints survive context compaction

### Testing

-   Agents tested individually before orchestration
-   Parallel execution conflicts identified
-   Fallback behavior defined for failures

## References

### Sources

-   [Claude Code Sub-agents Documentation](https://code.claude.com/docs/en/sub-agents) - Official reference for YAML syntax and built-in agents
-   [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) - Anthropic's architecture and the 90.2% performance data
-   [Community Learnings: 7 Critical Token-Wasting Patterns](https://github.com/anthropics/claude-code/issues/13579) - Real production data on token waste
-   [Best practices for Claude Code subagents](https://www.pubnub.com/blog/best-practices-for-claude-code-sub-agents/) - PubNub's production pipeline experience

### Further Reading

-   [VoltAgent/awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents) - 100+ production-ready subagent templates
-   [Building agents with the Claude Agent SDK](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk) - Deep dive into agent architecture
-   [Claude Code Model Configuration](https://code.claude.com/docs/en/model-config) - Official guide to Haiku/Sonnet/Opus selection

* * *

~Seb 👊
