# Claude Code Prompt Engineering: Research Synthesis

> **Synthesized from**: 11 research documents covering features, commands, skills, model optimization, task spawning, MCP tools, and large file handling
> **Corpus date**: 2026-01-20
> **Synthesis date**: 2026-03-02

---

## Executive Summary

This corpus represents a practitioner's guide to Claude Code optimization, distilled from official Anthropic documentation, community resources, and local verification testing. The research spans three tiers: **foundational mechanics** ([commands](./COMMANDS-AND-CONTEXT.md), [context](./COMMANDS-AND-CONTEXT.md), [features](./FEATURES-AND-AVAILABILITY.md)), **architecture patterns** ([skills](./SKILLS-ARCHITECTURE.md), [tasks](./TASK-SPAWNING-GUIDE.md), [MCP](./MCP-TOOL-SEARCH.md)), and **model-specific optimization** ([Haiku](./MODEL-OPTIMIZATION-HAIKU.md), [Sonnet](./MODEL-OPTIMIZATION-SONNET.md), [Opus](./MODEL-OPTIMIZATION-OPUS.md)). The central thesis is that Claude Code effectiveness depends on matching the right model, prompt structure, and workflow architecture to each task's complexity and cost profile.

---

## 1. Model Selection: The Core Decision

The single most impactful optimization is choosing the right model for each task. The corpus establishes a clear three-tier hierarchy (see the [README model selection guide](./README.md) for a quick reference):

| Model          | Cost (Input/Output per 1M) | SWE-bench | Context | Best Role                                  |
| -------------- | -------------------------- | --------- | ------- | ------------------------------------------ |
| **Haiku 4.5**  | $1 / $5                    | 73.3%     | 200K    | Parallel workers, mechanical tasks         |
| **Sonnet 4.5** | $3 / $15                   | 77.2%     | 200K-1M | Daily development, standard implementation |
| **Opus 4.5**   | $15 / $75                  | 80.9%     | 200K    | Complex reasoning, first-try correctness   |

**Key finding**: The cost spread between models is 15x (Haiku to Opus), but the quality spread is only ~8 percentage points on SWE-bench. This asymmetry is the basis for the "cheapest model that reliably completes the task" heuristic.

**Decision tree distilled**:

- Mechanical/bounded tasks (search, template fill, pattern match) -> **Haiku**
- Standard implementation with moderate reasoning -> **Sonnet**
- Complex judgment, deep debugging, first-try-critical production code -> **Opus**
- Large context >200K tokens -> **Sonnet** (only model with 1M window)

---

## 2. Prompt Engineering Patterns by Model

Each model responds best to different prompt structures. The corpus identifies model-specific patterns that emerged from testing and community benchmarks.

### Haiku: Structured Constraint Satisfaction ([full guide](./MODEL-OPTIMIZATION-HAIKU.md))

Haiku excels when given explicit boundaries. The optimal prompt pattern uses:

- **XML tags** for structure (`<task>`, `<context>`, `<constraints>`, `<anti_goals>`)
- **Step-bounded reasoning** (3-5 steps maximum)
- **Checklists** over open-ended exploration
- **Anti-goals** to prevent scope creep ("Do NOT explain", "Do NOT suggest improvements")
- **Minimal output requests** (code only, no commentary)

The research shows Haiku is highly sensitive to examples and will reproduce demonstrated patterns closely. This makes few-shot prompting particularly effective.

### Sonnet: Phase-Based Implementation with Thinking Breaks ([full guide](./MODEL-OPTIMIZATION-SONNET.md))

Sonnet's optimal pattern leverages its 0% error rate on code editing benchmarks:

- **Phase-based execution** (context -> implementation -> verification -> completion)
- **Parallel tool calls** for context building (10-20x speedup over sequential reads)
- **Extended thinking** at phase transitions (8K for context, 16K for complex implementation)
- **Error-first TDD** (write failing test -> fix error -> repeat)
- **Explicit scope boundaries** ("IN SCOPE" / "OUT OF SCOPE" lists)

**Critical finding**: Sonnet 4.5 takes instructions literally. Without "OUT OF SCOPE" constraints, its coding excellence leads to over-engineering.

### Opus: Calibrated Language with First-Try Correctness ([full guide](./MODEL-OPTIMIZATION-OPUS.md))

Opus requires the most nuanced prompting:

- **Calibrated language** - use "Use X" not "CRITICAL: MUST use X" (Opus overtriggers on aggressive language)
- **Trust first-try correctness** - implement complete solution, then test (less iteration than Sonnet TDD)
- **Effort parameter** (beta, API-key only) - medium effort matches Sonnet's best at 76% fewer tokens
- **Word choice** - when extended thinking is disabled, prefer "consider/evaluate/analyze" over "think"
- **Vision capabilities** - improved multi-image processing for UI comparison workflows

---

## 3. Context Management: The Efficiency Multiplier

Context is the scarcest resource in Claude Code workflows. The corpus identifies several cross-cutting strategies (detailed in [COMMANDS-AND-CONTEXT.md](./COMMANDS-AND-CONTEXT.md)):

### Proactive Compaction

- Run `/compact` before context issues surface, not after
- `/context` command monitors current token usage
- Shell prefix `!` for direct bash execution saves ~30% tokens on standard operations

### CLAUDE.md Optimization

- No required format; keep concise and human-readable
- Grow incrementally as project evolves (not all at once)
- Focus on commands, key files, and style guides
- Link to detailed docs instead of inlining them

### Parallel File Loading

Loading multiple files in a single message is one of the highest-impact optimizations:

```
Sequential: Read(A) -> wait -> Read(B) -> wait -> Read(C) = T1 + T2 + T3
Parallel:   Read(A), Read(B), Read(C) in one message  = max(T1, T2, T3)
```

This yields 3-5x speedup for multi-file context gathering and costs the same number of tokens.

---

## 4. Large File Handling: Semantic Chunking

The Read tool has a ~25,000 token limit per call. The corpus dedicates two documents ([LARGE-FILE-CHUNKING.md](./LARGE-FILE-CHUNKING.md) and [SKILL-CREATION-CHECKLIST.md](./SKILL-CREATION-CHECKLIST.md)) to this problem, suggesting it is a frequent source of skill failures.

### Recommended Strategy: Semantic Section Chunking

1. Use search to discover section boundaries (header line numbers)
2. Calculate section ranges from boundary data
3. Read only relevant sections via offset/limit
4. Skip irrelevant sections (Background, Overview, Goals/Non-Goals)
5. **Validate content, not structure** - verify you can quote specific content, not just headers

### The "Full Read Required" Anti-Pattern

The corpus identifies a design-level anti-pattern where skill authors assume full file context is needed without testing. Key insight: most operations are section-scoped with no cross-section dependencies. The fix is to question the assumption and prove it through A/B testing of chunked vs. full-read output.

**Cost of the anti-pattern**: ~60 minutes per skill to debug and fix after failure, plus blocked user workflows on large documents (>1,250 lines). See the [Skill Creation Checklist](./SKILL-CREATION-CHECKLIST.md) for a prevention-oriented workflow that embeds chunking into the design phase.

---

## 5. Multi-Agent Architecture: Task Spawning

The Task tool spawns ephemeral worker agents with isolated 200K-token contexts. The [Task Spawning Guide](./TASK-SPAWNING-GUIDE.md) establishes clear patterns:

### When to Spawn Tasks

- **Spawn**: Independent tasks on different files, parallelizable analysis, background long-running work
- **Don't spawn**: Small tasks (<3 steps), tasks modifying the same files, tasks with dependencies

### Critical Cost Insight

Each Task carries ~20K tokens of overhead before any work begins. This makes Tasks cost-ineffective for trivial operations. The "batch similar operations into one Task" pattern (e.g., one Task reads 10 files instead of 10 Tasks reading 1 file each) addresses this.

### Error Handling

The corpus documents four known issues (see [known issues](./TASK-SPAWNING-GUIDE.md#known-issues-and-workarounds) for workarounds):

1. Model parameter sometimes ignored (defaults to Opus regardless of specification)
2. Haiku fails with "tool_reference blocks not supported" when parent has many MCP tools
3. Cascading failures where one Task failure terminates all running Tasks
4. Tool name uniqueness errors with many MCP tools

Mitigations: `run_in_background: true` for isolation, retry with exponential backoff, and fallback to higher-capability models.

---

## 6. MCP Tool Search: Lazy Loading ([full guide](./MCP-TOOL-SEARCH.md))

[MCP Tool Search](./MCP-TOOL-SEARCH.md) activates automatically when tool definitions exceed 10% of the context window (~10K tokens). This is one of the most impactful automatic optimizations:

| Metric                         | Without Tool Search | With Tool Search |
| ------------------------------ | ------------------- | ---------------- |
| Token consumption              | ~77K                | ~8.7K            |
| Context preserved              | 62%                 | 95%              |
| Tool selection accuracy (Opus) | 49%                 | 74%              |

**Key limitation**: Haiku does not support server-side Tool Search. Haiku sub-agents that need MCP tools require pre-loading tools via search before spawning (see [Haiku tool_reference issue](./MCP-TOOL-SEARCH.md#issue-haiku-tool_reference-error-github-14863)).

---

## 7. Skills vs. Commands Architecture

The corpus distinguishes two packaging models for reusable workflows (detailed in [SKILLS-ARCHITECTURE.md](./SKILLS-ARCHITECTURE.md) and [COMMANDS-AND-CONTEXT.md](./COMMANDS-AND-CONTEXT.md)):

| Aspect     | Slash Commands             | Skills                           |
| ---------- | -------------------------- | -------------------------------- |
| Files      | Single .md file            | Directory with supporting files  |
| Invocation | User-explicit (`/command`) | Manual or auto-invoked by Claude |
| Complexity | Simple prompt shortcuts    | Multi-step workflows             |
| Discovery  | Terminal autocomplete      | Tool list                        |

**Migration signal**: Upgrade a command to a skill when it needs supporting files, multi-step workflow emerges, or auto-invocation is desired (see [migration pattern](./SKILLS-ARCHITECTURE.md#migration-commands--skills)).

**Budget management**: The `SLASH_COMMAND_TOOL_CHAR_BUDGET` env var controls how many skills/commands load into context. Keep descriptions under 60 characters; name frequently-used skills alphabetically early.

---

## 8. Feature Availability Matrix

The corpus includes [verified local testing](./FEATURES-AND-AVAILABILITY.md#verification-summary-local-testing-2026-01-20) (2026-01-20) of feature availability:

| Feature              | Status       | Notes                                               |
| -------------------- | ------------ | --------------------------------------------------- |
| Skills               | GA           | Production ready                                    |
| Custom Commands      | GA           | Production ready                                    |
| Context Management   | GA           | `/compact`, `/context`                              |
| Extended Thinking    | GA           | Min 1,024 token budget                              |
| Interleaved Thinking | GA in CLI    | Enabled by default, no config needed                |
| Structured Outputs   | Beta         | `--json-schema` works, use with fallback            |
| Effort Parameter     | API-key only | "Custom betas are only available for API key users" |

**Not applicable to CLI**: Prompt caching (needs repeated identical context), Batch API (async/24h window), RAG (needs vector DB infrastructure).

---

## 9. Cross-Cutting Anti-Patterns

The corpus repeatedly warns against these patterns across multiple documents (see also [command anti-patterns](./COMMANDS-AND-CONTEXT.md#common-anti-patterns) and [chunking anti-patterns](./LARGE-FILE-CHUNKING.md#anti-patterns)):

1. **Vague prompts** - "Make this better" instead of specific goals with measurable criteria
2. **Waiting for context issues** - not running `/compact` proactively
3. **Sequential file reads** - loading files one at a time instead of parallel
4. **Grep for content loading** - using search for boundary discovery but not following up with Read for actual content
5. **No content validation** - proceeding to processing without verifying content was loaded (not just structure)
6. **Over-parallelization** - spawning Tasks for trivial work (20K overhead per Task)
7. **Aggressive prompt language for Opus** - using "MUST" / "CRITICAL" when Opus responds to normal language
8. **Assuming full file read is required** - not testing whether section-scoped operations work (see ["Full Read Required" anti-pattern](./LARGE-FILE-CHUNKING.md#anti-pattern-5-full-read-required-design-constraint))
9. **Static prompts** - never iterating based on failure analysis (meta-prompting feedback loops)
10. **Using beta features without fallbacks** - structured outputs, effort parameter

---

## 10. Cost Optimization Summary

The corpus provides several cost reduction strategies ordered by impact (model costs from [Task Spawning Guide](./TASK-SPAWNING-GUIDE.md#cost-optimization), caching/batch from [Haiku guide](./MODEL-OPTIMIZATION-HAIKU.md#rag--batch-processing-optimization), chunking from [Large File Chunking](./LARGE-FILE-CHUNKING.md#cost-performance-trade-offs)):

| Strategy                               | Savings                   | Applicability             |
| -------------------------------------- | ------------------------- | ------------------------- |
| Model routing (Haiku for simple tasks) | Up to 15x vs Opus         | Universal                 |
| MCP Tool Search (lazy loading)         | 85% token reduction       | MCP-heavy projects        |
| Effort parameter (Opus medium)         | 76% fewer output tokens   | Opus users with API key   |
| Prompt caching (API)                   | 90% on cache hits         | Repeated context patterns |
| Parallel file loading                  | Same cost, 3-5x faster    | Multi-file operations     |
| Batch API (async workloads)            | 50% output discount       | High-volume processing    |
| Semantic chunking (skip sections)      | 60-70% fewer input tokens | Large document processing |
| Shell prefix (`!`) for bash            | ~30% token savings        | Terminal operations       |

---

## 11. Extended Thinking: When and How Much

Extended thinking is available across all three models but should be applied selectively (see [Haiku thinking config](./MODEL-OPTIMIZATION-HAIKU.md#extended-thinking-configuration), [Sonnet thinking budgets](./MODEL-OPTIMIZATION-SONNET.md#optimization-6-extended-thinking-for-complex-logic), [Opus thinking strategy](./MODEL-OPTIMIZATION-OPUS.md#optimization-2-extended-thinking-budget-configuration)):

| Task Type                            | Thinking Budget | Model           |
| ------------------------------------ | --------------- | --------------- |
| Mechanical (template fill, search)   | None            | Haiku           |
| Simple implementation                | None            | Sonnet          |
| Gap/edge case detection              | 2K-4K           | Haiku or Sonnet |
| Standard feature implementation      | 8K-16K          | Sonnet          |
| Complex state management, a11y       | 16K-32K         | Sonnet or Opus  |
| Multi-component refactor, deep debug | 32K-64K         | Opus            |

**Interleaved thinking** (reasoning between tool calls) is GA in Claude Code CLI and enabled by default (see [feature verification](./FEATURES-AND-AVAILABILITY.md#interleaved-thinking-verified-working)). This enables Claude to reason about tool results before deciding next steps, improving multi-step agentic workflows.

---

## 12. Recommended Workflow Architecture

Synthesizing all patterns, the optimal Claude Code workflow is:

```
1. Project Setup
   - CLAUDE.md with concise, incremental instructions (see COMMANDS-AND-CONTEXT.md)
   - Skills for complex repeatable workflows (see SKILLS-ARCHITECTURE.md)
   - Commands for simple prompt shortcuts (see COMMANDS-AND-CONTEXT.md)

2. Session Start
   - /context to check baseline
   - Parallel file loading for context gathering
   - Extended thinking for architecture understanding

3. Implementation Loop
   For each task:
   a. Select model by complexity (Haiku/Sonnet/Opus)
   b. Structure prompt for target model
   c. Use semantic chunking for large files (see LARGE-FILE-CHUNKING.md)
   d. Parallel tool calls for multi-file operations (see MODEL-OPTIMIZATION-SONNET.md)
   e. Validate outputs before proceeding
   f. /compact proactively during long sessions

4. Multi-Agent Orchestration (when needed, see TASK-SPAWNING-GUIDE.md)
   - Sonnet/Opus as planner/orchestrator
   - Haiku as parallel workers (see MODEL-OPTIMIZATION-HAIKU.md)
   - Background tasks for isolation
   - Explicit error handling and fallback models

5. Quality Gates
   - Run tests after each implementation
   - Lint and build verification
   - Content validation (see SKILL-CREATION-CHECKLIST.md)
```

---

## Gaps and Future Research

The corpus identifies several areas needing further investigation:

1. **Effort parameter for CLI subscription users** - currently blocked; revisit when API-key restriction lifts
2. **Haiku + MCP Tool Search compatibility** - known issues with tool_reference blocks; track upstream fixes
3. **Task model parameter reliability** - sometimes ignored; workaround is inheriting from parent
4. **1M context cost-benefit for Sonnet** - premium pricing (2x input, 1.5x output) vs. progressive disclosure tradeoffs
5. **Structured Outputs GA timeline** - currently beta; production usage needs fallback patterns until stable

---

## Source Documents

| Document                                                       | Topic                                                                     |
| -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [README.md](./README.md)                                       | Corpus index, model selection quick reference, learning path              |
| [FEATURES-AND-AVAILABILITY.md](./FEATURES-AND-AVAILABILITY.md) | Feature reference with GA/beta status, local verification                 |
| [COMMANDS-AND-CONTEXT.md](./COMMANDS-AND-CONTEXT.md)           | Slash commands, shell commands, context management, CLAUDE.md             |
| [SKILLS-ARCHITECTURE.md](./SKILLS-ARCHITECTURE.md)             | Skills vs commands, design patterns, namespacing, auto-invocation         |
| [TASK-SPAWNING-GUIDE.md](./TASK-SPAWNING-GUIDE.md)             | Task tool parameters, model selection, parallel execution, error handling |
| [MCP-TOOL-SEARCH.md](./MCP-TOOL-SEARCH.md)                     | MCP lazy loading, tool discovery, token savings, known issues             |
| [LARGE-FILE-CHUNKING.md](./LARGE-FILE-CHUNKING.md)             | Chunking strategies, cost-performance tradeoffs, anti-patterns            |
| [SKILL-CREATION-CHECKLIST.md](./SKILL-CREATION-CHECKLIST.md)   | Skill authoring checklist with large file handling phases                 |
| [MODEL-OPTIMIZATION-HAIKU.md](./MODEL-OPTIMIZATION-HAIKU.md)   | Haiku 4.5 prompt patterns, speed/cost optimization, agentic workflows     |
| [MODEL-OPTIMIZATION-SONNET.md](./MODEL-OPTIMIZATION-SONNET.md) | Sonnet 4.5 phase-based implementation, TDD, parallel context loading      |
| [MODEL-OPTIMIZATION-OPUS.md](./MODEL-OPTIMIZATION-OPUS.md)     | Opus 4.5 effort parameter, first-try correctness, calibrated prompts      |

### External Sources

The corpus draws from:

- **Anthropic official docs**: platform.claude.com, anthropic.com/engineering, anthropic.com/news
- **Community guides**: Awesome Claude Code, Cooking with Claude Code, Shipyard cheatsheet
- **Performance analyses**: SWE-bench comparisons, cost benchmarks, speed tests
- **Local verification**: CLI testing of features (2026-01-20)
- **Known issues**: GitHub issues #12063, #14863, #6594, #10668

All individual documents contain full source links for traceability.
