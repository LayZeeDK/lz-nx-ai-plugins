# Claude Code Agent Teams: Research Synthesis

Synthesis of the [research corpus](./README.md) on Claude Code's agent teams feature, covering official documentation, Anthropic engineering posts, and community experience reports.

Captured: 2026-03-03

---

## 1. What Agent Teams Are

Agent teams let multiple Claude Code instances work together as a coordinated team. One session acts as the **team lead**, orchestrating work. The others are **teammates** -- independent Claude Code sessions, each with their own context window, that communicate through direct messaging and coordinate through a shared task list ([agent-teams.md]).

The architecture has four components:

| Component     | Role                                                                   |
| ------------- | ---------------------------------------------------------------------- |
| **Team lead** | Creates the team, spawns teammates, assigns tasks, synthesizes results |
| **Teammates** | Separate Claude Code instances working on assigned tasks               |
| **Task list** | Shared work items with dependency tracking and auto-unblocking         |
| **Mailbox**   | Messaging system for peer-to-peer communication between agents         |

Teams and their state are stored locally at `~/.claude/teams/{team-name}/config.json` and `~/.claude/tasks/{team-name}/` ([agent-teams.md], [blog-alexop-from-tasks-to-swarms.md]).

Agent teams are **experimental** and disabled by default. Enable with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in settings.json or shell environment ([agent-teams.md]).

## 2. Agent Teams vs Subagents

The corpus consistently identifies this as the critical architectural decision ([features-overview.md], [blog-claudefast-complete-guide.md], [blog-codewithseb-subagents-performance.md]).

| Dimension         | Subagents                                              | Agent Teams                                         |
| ----------------- | ------------------------------------------------------ | --------------------------------------------------- |
| **Context**       | Own window; results return to caller                   | Own window; fully independent                       |
| **Communication** | Report results back to main agent only (hub-and-spoke) | Teammates message each other directly (mesh)        |
| **Coordination**  | Main agent manages all work                            | Shared task list with self-coordination             |
| **Best for**      | Focused tasks where only the result matters            | Complex work requiring discussion and collaboration |
| **Token cost**    | Lower: results summarized back to main context         | Higher: each teammate is a separate Claude instance |

The claudefast guide offers a useful analogy: "subagents are contractors you send on separate errands. Agent Teams is a project team sitting in the same room" ([blog-claudefast-complete-guide.md]).

**Use subagents when** workers don't need to communicate with each other -- research lookups, code review, file analysis.

**Use agent teams when** workers need to share findings, challenge each other's assumptions, and coordinate autonomously -- adversarial debugging, cross-layer features, parallel code review with different lenses ([agent-teams.md], [blog-addy-osmani-claude-code-swarms.md]).

Alexander Opalic frames this as an evolution from solo sessions (Level 0) to subagents (Level 1: "fire-and-forget workers") to agent teams (Level 2: "AI coordinates itself"). Each level trades human control for compute throughput ([blog-alexop-from-tasks-to-swarms.md]).

## 3. When Agent Teams Add Value

The corpus converges on four strong use cases:

### 3.1 Research and review (parallel investigation)

Multiple teammates investigate different aspects simultaneously, then share and challenge each other's findings. A parallel code review with one teammate on security, one on performance, and one on test coverage finds issues a single reviewer misses due to attentional bias ([agent-teams.md], [blog-addy-osmani-claude-code-swarms.md], [blog-marc0-parallel-agents-setup.md]).

### 3.2 Debugging with competing hypotheses

The strongest use case identified across the corpus. Sequential investigation suffers from **anchoring bias** -- once one theory is explored, subsequent investigation is biased toward it. Multiple independent investigators running adversarial debates converge on root causes faster ([agent-teams.md], [blog-addy-osmani-claude-code-swarms.md], [blog-marc0-parallel-agents-setup.md]).

### 3.3 New modules/features (parallel ownership)

Changes that span frontend, backend, and tests, each owned by a different teammate. Clean file ownership boundaries prevent conflicts. The API teammate can message the UI teammate directly when type definitions are ready -- no round-trip through the main agent ([blog-alexop-from-tasks-to-swarms.md], [blog-claudefast-complete-guide.md]).

### 3.4 Cross-layer coordination

Full-stack features where each layer (API, UI, tests) has different context requirements. Instead of one agent context-switching between layers, three agents work with full focus on their domain ([agent-teams.md], [blog-sitepoint-agent-teams-guide.md]).

### 3.5 When NOT to use agent teams

The corpus is equally clear about poor fits:

- **Sequential tasks** where each step depends on the previous ([blog-building-multi-agent-systems.md])
- **Same-file edits** -- two teammates editing the same file leads to overwrites ([agent-teams.md])
- **Simple, focused tasks** where a single session is faster and cheaper ([blog-codewithseb-subagents-performance.md])
- **Tightly coupled components** requiring constant back-and-forth ([blog-building-multi-agent-systems.md])

Anthropic's own guidance: "Start with the simplest approach that works, and add complexity only when evidence supports it" ([blog-building-multi-agent-systems.md]).

## 4. Anthropic's Multi-Agent Design Philosophy

Anthropic's blog post on multi-agent systems identifies three scenarios where multiple agents consistently outperform a single agent ([blog-building-multi-agent-systems.md]):

1. **Context pollution** degrades performance -- subagents provide isolation with clean context per task
2. **Tasks can run in parallel** -- parallel agents explore a larger search space
3. **Specialization improves tool selection** -- focused toolsets and system prompts per domain

The post introduces **context-centric decomposition** as the key design principle: divide work by context boundaries, not by type of work. A feature + its tests should stay with one agent (shared context), while independent research paths can be parallelized (isolated contexts). Problem-centric decomposition (one agent writes features, another writes tests, a third reviews) creates a "telephone game" with context loss at each handoff.

The **verification subagent pattern** is highlighted as consistently effective: a dedicated agent whose sole job is testing the main agent's work. It succeeds because verification requires minimal context transfer -- the verifier only needs the artifact and success criteria, not the full implementation history ([blog-building-multi-agent-systems.md]).

## 5. The C Compiler Case Study

The most ambitious publicly documented agent team project: 16 parallel Claude agents writing a Rust-based C compiler from scratch, capable of compiling the Linux 6.9 kernel ([blog-anthropic-building-c-compiler.md]).

**Scale**: ~2,000 Claude Code sessions over two weeks, 2 billion input tokens, 140 million output tokens, ~$20,000 total cost. The resulting compiler is 100,000 lines of Rust, compiles Linux on x86/ARM/RISC-V, and passes 99% of compiler test suites including GCC torture tests.

**Key lessons**:

- **Write extremely high-quality tests.** The agents solve whatever problem the verifier defines. If the verifier is imprecise, agents solve the wrong problem. Test improvement was an ongoing effort throughout the project.
- **Design for Claude, not for humans.** The test harness should not pollute context with thousands of useless bytes. Log important information to files. Pre-compute summary statistics. Include instructions for agents to maintain progress files and READMEs.
- **Address time blindness.** Claude cannot tell time and will spend hours running tests without making progress. Print incremental progress infrequently, use deterministic random subsampling (`--fast` flag) so each agent covers different files.
- **Make parallelism easy.** When distinct failing tests exist, parallelization is trivial. When all agents converge on the same bottleneck (e.g., compiling the Linux kernel is one giant task), use an oracle technique -- compare against a known-good compiler to isolate failures to individual files, enabling per-file parallelism.
- **Specialize agents.** Dedicated agents for duplicate code coalescing, performance optimization, code quality, and documentation. Not all agents work on the core problem.
- **Use a simple lock mechanism.** Agents claim tasks by writing lock files to `current_tasks/`. Git's synchronization forces the second agent to pick a different task on conflict.

## 6. Token Economics and Cost Management

### 6.1 Token cost multipliers

The corpus reports varying cost multipliers depending on the source:

| Source                     | Reported multiplier                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------- |
| Anthropic official docs    | "significantly more tokens" / "roughly proportional to team size" ([agent-teams.md], [costs.md])          |
| claudefast guide           | "3-4x for 3 teammates" ([blog-claudefast-complete-guide.md])                                              |
| alexop blog (measured)     | Solo: ~200k, 3 subagents: ~440k, 3-person team: ~800k ([blog-alexop-from-tasks-to-swarms.md])             |
| marc0 blog                 | "~5x per teammate" ([blog-marc0-parallel-agents-setup.md])                                                |
| codewithseb blog           | "~15x more tokens than chat" for multi-agent vs single chat ([blog-codewithseb-subagents-performance.md]) |
| Anthropic multi-agent blog | "3-10x more tokens" than single-agent for equivalent tasks ([blog-building-multi-agent-systems.md])       |
| Anthropic costs page       | "~7x more tokens in plan mode" for agent teams ([costs.md])                                               |

### 6.2 Cost optimization strategies

The corpus converges on several patterns:

- **Opus lead + Sonnet workers.** Use the most capable model for coordination, cheaper models for execution. This is the pattern used in Anthropic's own research system and in the C compiler project ([blog-codewithseb-subagents-performance.md], [blog-alexop-from-tasks-to-swarms.md]).
- **Keep teams small.** 3-5 teammates for most workflows. "Three focused teammates often outperform five scattered ones" ([agent-teams.md]).
- **5-6 tasks per teammate** keeps everyone productive without excessive context switching ([agent-teams.md], [blog-addy-osmani-claude-code-swarms.md]).
- **Shut down teams promptly.** Active teammates consume tokens even when idle ([costs.md]).
- **Keep spawn prompts focused.** Teammates load CLAUDE.md, MCP servers, and skills automatically. Everything in the spawn prompt adds to context from the start ([costs.md]).
- **Plan first, parallelize second.** Use plan mode (~10k tokens) to get a reviewed plan before committing to a full team (500k+). This is the most cost-effective pattern across the corpus ([blog-alexop-from-tasks-to-swarms.md]).

### 6.3 Cost comparison (codewithseb benchmarks)

| Agent Config | Time | Cost  | Accuracy |
| ------------ | ---- | ----- | -------- |
| Haiku        | 8s   | $0.03 | 60%      |
| Sonnet       | 45s  | $0.24 | 85%      |
| Opus         | 2min | $1.20 | 95%      |

Use Haiku for high-volume pattern-matching (searching, linting), Sonnet for balanced reasoning (default worker), Opus for architecture and novel problems ([blog-codewithseb-subagents-performance.md]).

## 7. Orchestration Patterns

### 7.1 The seven team primitives

Alexander Opalic identifies the complete tool set underlying agent teams ([blog-alexop-from-tasks-to-swarms.md]):

1. `TeamCreate` -- create team directory and config
2. `TaskCreate` -- define a unit of work (JSON file on disk)
3. `TaskUpdate` -- claim and complete work (status + owner fields)
4. `TaskList` -- find available work (shared coordination mechanism)
5. `Task` (with `team_name`) -- spawn a teammate
6. `SendMessage` -- direct messages, broadcasts, shutdown requests/responses
7. `TeamDelete` -- remove team config and task files

Every team session follows three phases: **Setup** (create team, define tasks, spawn teammates) -> **Execution** (teammates loop: list tasks, claim, work, complete, report) -> **Teardown** (shutdown requests, acknowledgements, delete).

### 7.2 Task lifecycle

Tasks move through three states: **pending** -> **in_progress** -> **completed**. Tasks can depend on other tasks -- blocked tasks auto-unblock when dependencies complete. File locking prevents race conditions on task claiming ([agent-teams.md], [blog-alexop-from-tasks-to-swarms.md]).

Dependencies enable **wave-based execution**: Wave 1 runs all tasks with no dependencies in parallel, Wave 2 runs tasks unblocked by Wave 1, and so on ([blog-alexop-from-tasks-to-swarms.md]).

### 7.3 Plan approval pattern

For risky work, teammates can be required to plan before implementing. The teammate works in read-only plan mode until the lead approves their approach. If rejected, they revise and resubmit. The lead's judgment can be influenced with criteria: "only approve plans that include test coverage" or "reject plans that modify the database schema" ([agent-teams.md], [blog-addy-osmani-claude-code-swarms.md]).

### 7.4 Delegate mode

Restricts the lead to coordination-only tools (spawning, messaging, task management). This prevents a common problem: the lead getting distracted and implementing tasks itself instead of waiting for teammates ([blog-addy-osmani-claude-code-swarms.md], [blog-marc0-parallel-agents-setup.md]).

### 7.5 Quality gate hooks

Two hook events for enforcing quality ([agent-teams.md]):

- `TeammateIdle` -- runs when a teammate is about to go idle. Exit code 2 sends feedback and keeps the teammate working.
- `TaskCompleted` -- runs when a task is being marked complete. Exit code 2 prevents completion and sends feedback.

### 7.6 Verification subagent pattern

Consistently identified as the most reliable multi-agent pattern. A dedicated verifier tests the main agent's work using black-box validation. The verifier doesn't need implementation context -- only the artifact, success criteria, and tools to verify. Beware the **early victory problem**: verifiers tend to run one or two tests, observe them pass, and declare success. Mitigate with explicit instructions ("run the COMPLETE test suite"), negative tests, and comprehensive check requirements ([blog-building-multi-agent-systems.md]).

## 8. Git Worktree Integration

Worktrees solve the fundamental parallel-agent filesystem conflict: multiple agents editing the same files in the same working directory ([blog-claudefast-worktree-guide.md], [blog-dandoescode-parallel-worktrees.md]).

### 8.1 Claude Code native support

Since Claude Code v2.1.49 (Feb 2026), the `--worktree` flag (or `-w`) creates an isolated worktree at `.claude/worktrees/{name}/` with its own branch ([blog-claudefast-worktree-guide.md]).

```
# Named worktree
claude --worktree feature-payments

# Multiple parallel sessions
claude -w feature-payments  # Terminal 1
claude -w bugfix-auth       # Terminal 2
```

### 8.2 Subagent isolation

Custom agents can use `isolation: worktree` in frontmatter to always run in a temporary worktree. Worktrees with no changes are automatically cleaned up; those with changes persist for review ([sub-agents.md], [blog-claudefast-worktree-guide.md]).

### 8.3 Key gotchas

- Add `.claude/worktrees/` to `.gitignore` ([blog-dandoescode-parallel-worktrees.md])
- You cannot check out the same branch in two worktrees simultaneously ([blog-dandoescode-parallel-worktrees.md])
- Stashes are shared across worktrees (they live in the git object store). Avoid stashing when using worktrees -- the whole point is that you don't need to stash anymore ([blog-dandoescode-parallel-worktrees.md])

## 9. Limitations and Rough Edges

The corpus consistently reports these limitations:

| Limitation                                         | Impact                                                                                           | Mitigation                                                                                                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **No session resumption** for in-process teammates | `/resume` and `/rewind` don't restore teammates. Lead may message teammates that no longer exist | Spawn fresh teammates after resuming ([agent-teams.md])                                                                                     |
| **Task status can lag**                            | Teammates sometimes fail to mark tasks completed, blocking dependent tasks                       | Check manually and nudge the lead or update status ([agent-teams.md])                                                                       |
| **One team per session**                           | Clean up before starting a new team                                                              | Design work to fit one team lifecycle ([agent-teams.md])                                                                                    |
| **No nested teams**                                | Teammates cannot spawn their own teams. Only the lead manages the team                           | Deliberate design to prevent infinite recursion and runaway costs ([agent-teams.md])                                                        |
| **Lead implements instead of delegating**          | The lead gets distracted and does work itself                                                    | Use delegate mode (`Shift+Tab`) or explicitly instruct "wait for teammates" ([blog-addy-osmani-claude-code-swarms.md])                      |
| **File conflicts**                                 | No built-in file locking between teammates                                                       | Structure work so each teammate owns different files. Use worktrees for isolation ([agent-teams.md], [blog-marc0-parallel-agents-setup.md]) |
| **Split panes require tmux/iTerm2**                | Not supported in VS Code terminal, Windows Terminal, or Ghostty                                  | Use in-process mode (default, works everywhere) ([agent-teams.md])                                                                          |
| **Permissions propagate from lead**                | All teammates start with lead's permission settings. Can't set per-teammate modes at spawn time  | Change individual modes after spawning ([agent-teams.md])                                                                                   |
| **Shutdown can be slow**                           | Teammates finish their current request before shutting down                                      | Expected behavior, budget for it ([agent-teams.md])                                                                                         |
| **Token throughput limits**                        | Agent teams hit API rate limits faster                                                           | Budget for rate limits; use Sonnet for workers ([blog-derek-ashmore-agent-teams-vs-claude-flow.md])                                         |

## 10. Third-Party Ecosystem

The corpus documents several external tools and orchestrators:

| Tool                            | Approach                                          | Notes                                                                                                                                                               |
| ------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claude-Flow**                 | External orchestrator for Claude Code agent teams | More setup effort but deeper research output, better token efficiency, extensible beyond Anthropic models ([blog-derek-ashmore-agent-teams-vs-claude-flow.md])      |
| **Gas Town**                    | Steve Yegge's "Kubernetes for AI agents"          | Structured agent hierarchy with "mayor" agent. Better for solo devs, more agents in parallel ([blog-shipyard-multi-agent-orchestration.md])                         |
| **Multiclaude**                 | Dan Lorenc's multi-agent orchestrator             | "Brownian ratchet" philosophy: auto-merge if CI passes. Supports team review in "multiplayer" mode ([blog-shipyard-multi-agent-orchestration.md])                   |
| **Compound Engineering Plugin** | Every Inc's Claude Code plugin                    | Adds `/workflows:plan`, `/workflows:review`, `/workflows:compound` cycle. Philosophy: 80% planning/review, 20% execution ([blog-addy-osmani-claude-code-swarms.md]) |
| **ClaudeFast Code Kit**         | Pre-configured agent definitions                  | 18 specialist agents with 5-tier complexity routing between subagents and agent teams ([blog-claudefast-complete-guide.md])                                         |

### 10.1 Agent Teams vs Claude-Flow (bake-off)

Derek Ashmore ran a structured comparison using identical RFP-style inputs ([blog-derek-ashmore-agent-teams-vs-claude-flow.md]):

**Agent Teams strengths**: Extremely low friction setup (one env var), clean workspace (no operational artifacts), immediately accessible.

**Claude-Flow strengths**: Much deeper research output, better token efficiency in practice, extensible beyond Anthropic models, more operational visibility.

**Verdict**: Agent Teams is Anthropic's attempt to make agentic workflows mainstream and accessible. Claude-Flow is for users who want maximum depth, control, and extensibility.

## 11. Common Mistakes

The codewithseb blog identifies five token-wasting patterns from production usage ([blog-codewithseb-subagents-performance.md]):

1. **Using subagents for implementation** -- Subagents work best for research and returning summaries, not for end-to-end feature building.
2. **Giving all tools to every agent** -- Causes agents to overstep authority, redundant execution, and context pollution. Restrict to minimum needed tools.
3. **Descriptive agent names** -- Claude Code infers behavior from names like `code-reviewer`, silently overriding your custom instructions. Use non-descriptive names like `cr-alpha`.
4. **Ignoring context compaction** -- User preferences and warnings are lost after compaction. Put critical constraints in CLAUDE.md to persist across compaction.
5. **Parallel file edits without coordination** -- No built-in mechanism to prevent agents from editing the same files simultaneously. Use explicit file ownership rules or worktree isolation.

## 12. Best Practices: Consensus Across Sources

These practices appear consistently across 3+ independent sources:

### Start with research and review

Begin with tasks that have clear boundaries and don't require writing code -- reviewing a PR from three angles, researching a library, investigating a bug with competing theories ([agent-teams.md], [blog-addy-osmani-claude-code-swarms.md], [blog-marc0-parallel-agents-setup.md]).

### Plan first, parallelize second

Use plan mode to explore and produce a step-by-step plan. Review and adjust. Then hand the plan to a team for parallel execution. The plan provides a checkpoint before committing expensive team tokens ([blog-alexop-from-tasks-to-swarms.md], [blog-claudefast-complete-guide.md]).

### Give teammates specific context

Teammates load CLAUDE.md automatically but don't inherit the lead's conversation history. Include task-specific details in the spawn prompt: file paths, constraints, what "done" looks like ([agent-teams.md], [blog-addy-osmani-claude-code-swarms.md], [blog-marc0-parallel-agents-setup.md]).

### Structure file ownership

Two teammates editing the same file leads to overwrites. Break work so each teammate owns a different set of files. Same boundary-setting as with a human team ([agent-teams.md], [blog-addy-osmani-claude-code-swarms.md], [blog-codewithseb-subagents-performance.md]).

### Use Opus lead + Sonnet workers

The most cost-effective model allocation: expensive model for coordination and synthesis, cheaper model for execution tasks. This is the pattern Anthropic uses internally ([blog-codewithseb-subagents-performance.md], [blog-alexop-from-tasks-to-swarms.md], [blog-anthropic-building-c-compiler.md]).

### Keep teams small (3-5 teammates)

Diminishing returns beyond 5 teammates. Coordination overhead increases. Three focused teammates often outperform five scattered ones. 5-6 tasks per teammate keeps everyone productive ([agent-teams.md], [blog-addy-osmani-claude-code-swarms.md]).

### Pre-approve permissions

Pre-approve common operations in permission settings before spawning teammates. This eliminates the flood of permission prompts that can slow a new team to a crawl ([blog-claudefast-complete-guide.md], [blog-derek-ashmore-agent-teams-vs-claude-flow.md]).

### Invest in CLAUDE.md for team context

A well-structured CLAUDE.md with module boundaries, verification commands, and operational context reduces per-teammate exploration costs. Three teammates reading a clear CLAUDE.md is far cheaper than three teammates exploring the codebase independently ([blog-claudefast-complete-guide.md], [blog-addy-osmani-claude-code-swarms.md]).

## 13. Industry Context

The release of agent teams in Claude Code (Feb 5, 2026, alongside Opus 4.6) was part of a broader industry convergence ([blog-towardsai-agent-teams-comparison.md]):

- Moonshot AI released Kimi K2.5 with **Agent Swarm** (Jan 27, 2026) -- trainable orchestrator, 100 sub-agents, ~1,500 tool calls
- OpenAI launched Codex desktop with parallel agents (Feb 2, 2026)
- VS Code 1.109 shipped multi-agent support (Feb 5, 2026)
- Google Jules was running 15 concurrent tasks
- Cognition's Devin adopted Opus 4.6 under the hood

The consensus across community sources: multi-agent workflows are moving from experimental to essential for complex engineering work. The core skill shift is from writing code to **decomposing problems into structures that agent teams can execute** ([blog-addy-osmani-claude-code-swarms.md], [blog-sitepoint-agent-teams-guide.md]).

## 14. Applicability to Connect

For a full-stack Angular + .NET monorepo like Connect, agent teams are particularly relevant for:

- **Cross-layer features** spanning Connect.API (C#), Connect BFF, and ng-app-monolith (Angular) -- each layer owned by a different teammate
- **Parallel code review** with specialized lenses (security, performance, Angular patterns, .NET patterns)
- **Debugging with competing hypotheses** across the BFF/API/frontend stack
- **Large-scale refactoring** across Nx libraries with clear module boundaries

Key constraints for Connect:

- **No split panes on Windows Terminal** -- use in-process mode
- **GitLab CI integration** -- agent teams are local-only; CI validation remains separate
- **Nx library boundaries** provide natural file ownership divisions for teammates
- **Cost awareness** -- agent teams on Claude Team plan may hit rate limits quickly with multiple teammates

---

## Source Index

All references point to files in the [research corpus](./).

| Reference                                              | File                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------ |
| [agent-teams.md]                                       | Official agent teams documentation                           |
| [sub-agents.md]                                        | Official subagents documentation                             |
| [costs.md]                                             | Official cost management documentation                       |
| [features-overview.md]                                 | Official feature comparison and decision matrix              |
| [blog-building-multi-agent-systems.md]                 | Anthropic: When and how to use multi-agent systems           |
| [blog-anthropic-building-c-compiler.md]                | Anthropic: Building a C compiler with parallel Claudes       |
| [blog-addy-osmani-claude-code-swarms.md]               | Addy Osmani: Claude Code Swarms overview                     |
| [blog-claudefast-complete-guide.md]                    | claudefast: Complete 2026 guide to agent teams               |
| [blog-claudefast-worktree-guide.md]                    | claudefast: Worktree guide for parallel sessions             |
| [blog-codewithseb-subagents-performance.md]            | codewithseb: 90% performance gain with Opus+Sonnet pattern   |
| [blog-alexop-from-tasks-to-swarms.md]                  | alexop: Architecture walkthrough from tasks to swarms        |
| [blog-dandoescode-parallel-worktrees.md]               | dandoescode: Parallel coding with git worktrees              |
| [blog-derek-ashmore-agent-teams-vs-claude-flow.md]     | Derek Ashmore: Agent Teams vs Claude-Flow bake-off           |
| [blog-devto-multi-agent-orchestration-10-instances.md] | dev.to: Running 10+ Claude instances in parallel             |
| [blog-shipyard-multi-agent-orchestration.md]           | Shipyard: Multi-agent orchestration patterns                 |
| [blog-sitepoint-agent-teams-guide.md]                  | SitePoint: Running a team of AI developers                   |
| [blog-marc0-parallel-agents-setup.md]                  | marc0: Practical setup guide for agent teams                 |
| [blog-towardsai-agent-teams-comparison.md]             | Towards AI: Claude agent teams vs Kimi K2.5 (paywall)        |
| [blog-joe-njenga-tried-agent-teams.md]                 | Joe Njenga: First-hand experience report (paywall)           |
| [blog-devgenius-claude-code-team-setup.md]             | Dev Genius: How the Claude Code team uses the tool (paywall) |
