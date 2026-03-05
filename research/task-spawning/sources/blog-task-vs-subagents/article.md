# Claude Code - When to use task tool vs subagents

> Source: [https://amitkoth.com/claude-code-task-tool-vs-subagents/](https://amitkoth.com/claude-code-task-tool-vs-subagents/)
> Author: Amit Kothari
> Site: Amit Kothari

---
## Key takeaways

-   **Tasks are ephemeral workers, subagents are persistent specialists** - Tasks spin up lightweight Claude instances for one-off parallel work, while subagents maintain configurations across sessions
-   **Each approach has a 20k token overhead cost** - Both Tasks and subagents start with roughly 20,000 tokens of context loading before your actual work begins
-   **Parallelism caps at 10 concurrent operations** - You can queue more, but only 10 Tasks or subagents run simultaneously, executing in batches
-   **Context isolation is both the strength and weakness** - Separate 200k token windows prevent pollution but require careful orchestration to share results
-   Need help implementing these strategies? [Let's discuss your specific challenges](https://amitkoth.com/).

## The confusion that costs you speed

Use Tasks for parallel file searches. Use subagents for code review.

Done. Blog post over.

Except… that’s what everyone says, and then you watch your token count explode while Claude spawns 50 Tasks to read three files. Or you carefully configure a subagent that can’t spawn its own workers, leaving you wondering why your “parallel” processing feels so… sequential.

Users are reporting patterns where [subagents consume 160k tokens](https://github.com/anthropics/claude-code/issues/4911) for work that takes 3k in the main context. The documentation doesn’t cover this clearly. Neither do the [official best practices](https://www.anthropic.com/engineering/claude-code-best-practices).

The Task tool and subagents aren’t just different interfaces to the same thing. They’re fundamentally different execution models with opposing strengths. And everyone’s using them backwards. It’s another example of how [enterprises fragment their AI implementations](https://amitkoth.com/claude-computer-use-chrome-plugin) instead of thinking holistically.

## What Tasks do

The [Task tool](https://claudelog.com/faqs/what-is-task-tool-in-claude-code/) doesn’t create “subagents.” It spawns ephemeral Claude workers - think of them as temporary contractors who show up, do one specific job, then vanish. Each Task gets its own 200k context window, completely isolated from everything else.

Watch what happens when you run multiple Tasks:

```
# What you think happens:
# Task 1 starts → Task 2 starts → Task 3 starts → all run together

# What happens:
# Batch 1: Tasks 1-10 start → all must complete
# Batch 2: Tasks 11-20 start → all must complete
# Batch 3: Tasks 21-30 start...
```

Community testing shows that Claude doesn’t dynamically pull from the queue as Tasks complete. It waits for the entire batch to finish before starting the next one. [The parallelism level caps at 10](https://medium.com/@sampan090611/experiences-on-claude-codes-subagent-and-little-tips-for-using-claude-code-c4759cd375a7), according to user reports.

But here’s the magic: Tasks are _fast_ for the right job. Need to search for a pattern across 500 files? Spawn 10 parallel Tasks, each handling 50 files. They can’t talk to each other (that’s the point), but they all report back to you. The main thread stays clean while the workers dig through the mess.

The problem? Each Task starts with that 20k token overhead. Your “quick file search” just cost you 200k tokens before any actual work began. [Active multi-agent sessions consume 3-4x more tokens](https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor) than single-threaded operations. This is where [cost optimization strategies](https://amitkoth.com/ai-cost-optimization-strategies) become critical.

## Subagents - the misunderstood powerhouse

Subagents aren’t faster Tasks. They’re not even really “sub” anything.

[Subagents are specialized Claude instances](https://code.claude.com/docs/en/sub-agents) with their own system prompts, tool permissions, and persistent configurations. Think of them as department heads in your organization - the Security Reviewer, the Test Writer, the API Designer. They exist as Markdown files in your `.claude/agents/` folder, ready to be called into service.

Here’s what nobody mentions: subagents can’t spawn other subagents. [This limitation is by design](https://github.com/anthropics/claude-code/issues/4182), not a bug. When a subagent tries to use the Task tool, it gets nothing. No nested hierarchies, no recursive task decomposition. Just one level of delegation.

What they can do now: [background subagents run concurrently](https://code.claude.com/docs/en/sub-agents) while you continue working. Permissions get pre-approved before launch, and the subagent executes its work without blocking your main thread. It’s parallel execution without the communication overhead of Tasks.

But that constraint creates clarity. Your main Claude instance becomes an orchestrator, and subagents become specialists. The code reviewer doesn’t suddenly decide to refactor your entire codebase. It reviews code. That’s it.

The real power? Consistency. Configure a subagent once, use it across every project. Community-shared [security-auditor subagents](https://github.com/wshobson/agents) demonstrate how standardized configurations can catch common OWASP Top 10 vulnerabilities consistently. Same configuration, same results, every time.

## The decision matrix: when to use what

Forget the theory. Here’s a practical framework based on documented patterns and community experiences:

### Use Tasks when:

-   **Searching without a target**: “Find all database connections” across 1,000 files
-   **Parallel reads dominate**: Reading 50 config files to build a dependency map
-   **Context isolation matters**: Analyzing competitor codebases without contamination
-   **It’s truly one-off work**: You’ll never need this exact operation again
-   **Speed beats token cost**: You’ve got 2 hours, not 2 days

### Use Subagents when:

-   **Expertise requires consistency**: Code review with specific style guides
-   **Tool access needs restriction**: Reviewer can read, can’t write
-   **Workflows repeat predictably**: Every PR gets the same security check
-   **Teams need standardization**: Everyone uses the same test-writer agent
-   **Context persistence matters**: Maintaining conversation history across tasks

### Never use either when:

-   Working with 2-3 specific files → Use the main thread
-   Simple sequential operations → Keep it in primary context
-   Tasks need to communicate → Rethink your architecture
-   You need nested parallelism → Write a bash script instead

Here’s the brutal truth: if you’re spending more than 30 seconds deciding, you’re overthinking it. The performance difference for most operations is negligible. The token cost difference? That’s where you feel it.

## Real patterns from production and decision framework

Here are patterns that emerge from documented use cases where speed and cost both matter. Use this to inform your decision-making in real scenarios.

### The Repository Explorer Pattern

When exploring a new codebase, everyone’s instinct is to spawn one Task per directory. Wrong move. Here’s what works:

```
# DON'T: One task per directory (fails on cross-references)
"Explore src/, tests/, docs/ using 3 parallel tasks"

# DO: Feature-based exploration
"Use 4 parallel tasks:
- Auth system: find all auth/login/session code
- Data models: locate all database schemas
- API endpoints: map all routes and handlers
- Test coverage: analyze test patterns"
```

Each Task hunts for a concept, not a location. [This approach handles cross-directory dependencies](https://aicrossroads.substack.com/p/claude-code-subagents) that directory-based splitting misses entirely.

### The Code Review Pipeline

This is where subagents dominate. A typical effective setup includes three specialized agents:

1.  **style-checker**: Runs first, catches formatting/naming issues
2.  **security-reviewer**: OWASP Top 10, credential scanning, injection vectors
3.  **test-validator**: Ensures tests cover the changes

The key? They run sequentially, not in parallel. Each writes findings to a markdown file that the next one reads. No context pollution, no token explosion. The [sequential workflow with file-based communication](https://medium.com/@joe.njenga/how-im-using-claude-code-sub-agents-newest-feature-as-my-coding-army-9598e30c1318) beats parallel execution for complex reviews.

### The Hybrid Orchestration

For large refactoring, combine both:

1.  Main thread identifies all affected files
2.  Tasks (parallel) read current implementations
3.  Subagent (architect) designs the refactoring approach
4.  Tasks (parallel) implement changes in isolated files
5.  Subagent (test-writer) creates integration tests
6.  Main thread coordinates git operations

This pattern can significantly reduce refactoring time compared to sequential processing, though tokens typically increase 3-4x. Sometimes that trade-off is worth it.

### Limitations that matter

Both approaches have failure modes that’ll ruin your day if you don’t know about them.

#### Task Tool Gotchas

The worst one? No visibility into running Tasks. You fire off 10 parallel operations and then… wait. No progress bars, no intermediate output, nothing until they all complete or timeout. [GitHub issue #3013](https://github.com/anthropics/claude-code/issues/3013) has been requesting progress tracking for months.

Task results can be truncated. When a Task returns findings from 100 files, you might only see summaries. The full context doesn’t transfer back - just what the Task decides is important. Critical details like stack traces can be lost this way.

No error recovery within Tasks. If Task 7 of 10 fails, the others continue, but Task 7 won’t retry or provide detailed failure info. You get a generic “task failed” message.

#### Subagent Surprises

The worst surprise? Subagents can’t see each other’s work. You can’t have a designer agent pass specs to a coder agent directly. Everything routes through the main thread, adding latency and token overhead.

Configuration drift is real. That carefully tuned subagent you created six months ago? Its behavior subtly changes as Claude’s base model updates. Best practice is to version control agent configs and test them regularly.

The 20k token overhead isn’t negotiable. Even a subagent that just reads one file and returns “LGTM” costs you 20k tokens. For small tasks, staying in the main thread is 10x cheaper.

### The decision framework that works

Stop optimizing for elegance. Optimize for getting work done. Here’s a dead-simple decision process:

**Question 1**: Will I run this exact operation again?

-   Yes → Create a subagent
-   No → Continue to Question 2

**Question 2**: Do I need to search/read more than 10 files?

-   Yes → Use Tasks
-   No → Stay in main thread

**Question 3**: Must operations share context?

-   Yes → Stay in main thread
-   No → Use Tasks if parallel, subagent if specialized

That’s it. Three questions. Takes 5 seconds.

The teams that fail with Claude Code are the ones designing elaborate multi-agent choreographies before writing a single line of code. It’s similar to how [AI readiness assessments can lie to you](https://amitkoth.com/why-ai-readiness-assessment-lying) - over-engineering before understanding the real constraints. The ones that succeed? They start simple, measure performance, then optimize only the bottlenecks that matter.

Your token budget will thank you. Your deadlines will thank you. Most importantly, you’ll ship features instead of debugging agent communication protocols.

The real insight isn’t choosing between Tasks and subagents. It’s recognizing that the main thread - yes, boring, sequential, single-threaded you - is still the best orchestrator Claude Code has. Everything else is just a tool to help you move faster when you know exactly what you need.
