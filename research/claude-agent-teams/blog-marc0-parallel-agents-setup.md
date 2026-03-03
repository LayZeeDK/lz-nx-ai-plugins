# Claude Code Agent Teams: Multiple AI Agents, One Repo

> Source: [https://www.marc0.dev/en/blog/claude-code-agent-teams-multiple-ai-agents-working-in-parallel-setup-guide-1770317684454](https://www.marc0.dev/en/blog/claude-code-agent-teams-multiple-ai-agents-working-in-parallel-setup-guide-1770317684454)
> Author: Marco Patzelt
> Site: Marco Patzelt Portfolio

---
## What Are Claude Code Agent Teams?

One Claude Code session is good. Five working the same codebase in parallel, messaging each other, debating hypotheses—that's a multi-agent swarm with actual coordination.

Agent Teams shipped with Opus 4.6. You set one environment variable (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`), tell Claude to spin up teammates, and they self-organize via a shared task list. No manual orchestration. No copy-pasting between terminals.

Here's the complete setup guide, the use cases worth the token cost, and the limitations nobody else mentions.

> [](https://imgur.com/a/Kty4Aqs)

### How Agent Teams Work

A team has three parts:

1.  **Team Lead**: Your main Claude Code session. Creates the team, spawns teammates, assigns tasks, synthesizes results.
2.  **Teammates**: Separate Claude Code instances. Each gets its own context window, loads project context (`CLAUDE.md`, MCP servers, skills), and works independently.
3.  **Shared Task List**: Central work items with three states: _pending_, _in progress_, _completed_. Tasks can depend on each other—blocked work unblocks automatically when dependencies finish.

The difference from subagents: **teammates talk to each other**.

A subagent reports back to the main agent. That's it. Agent team members message directly, challenge each other's findings, and self-coordinate. This isn't a basic multi-agent setup—it's true [Agentic Orchestration](https://www.marc0.dev/en/blog/the-end-of-static-middleware-why-i-am-switching-to-agentic-orchestration-1766751496725).

## Agent Teams vs Subagents vs Multi-Agent Swarms

This is the decision that matters. Wrong choice = wasted tokens. If you've read about the [Agent Swarm Trap](https://www.marc0.dev/en/blog/the-agent-swarm-trap-why-context-wins-over-complexity-1766752838655), you know why picking the right coordination pattern is everything.

| Feature | Subagents | Agent Teams | Multi-Agent Swarm |
| --- | --- | --- | --- |
| **Communication** | Reports back to caller only | Teammates message each other | Broadcast / shared state |
| **Coordination** | Main agent manages everything | Shared task list, self-coordination | Emergent (often chaotic) |
| **Context** | Own window, results summarized | Own window, fully independent | Varies by framework |
| **Token Cost** | Lower | ~5x per teammate | Varies wildly |
| **Best For** | Focused tasks, only result matters | Complex work needing discussion | Research, not production |

**Use subagents when:** You need quick, focused workers that report back. _"Go research X and tell me what you find."_

**Use agent teams when:** Workers need to share findings, challenge each other, and coordinate autonomously. _"Investigate this bug from three angles and debate which theory is correct."_

**Skip the swarm fantasies:** If you're thinking about chaining 20 agents with no coordination—don't. Context > complexity. Agent Teams give you the multi-agent benefit with actual structure.

## Setup: CLAUDE\_CODE\_EXPERIMENTAL\_AGENT\_TEAMS

Agent Teams are experimental. One setting to enable them.

### Option 1: settings.json (Recommended)

Open your Claude Code settings and add:

```
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

This persists across sessions. Set it once, forget it.

### Option 2: Environment Variable

```
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
```

Add this to your `.bashrc`, `.zshrc`, or shell profile if you want it permanent. Without this flag, agent team features are completely hidden.

### Option 3: Per-Session

```
CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 claude
```

Good for testing without committing.

### Spawning Your First Team

Once enabled, tell Claude in natural language:

> I'm refactoring the auth module. Create an agent team:
> 
> -   One teammate on the backend JWT logic
> -   One on the frontend session handling
> -   One writing integration tests

Claude spawns the team, creates a shared task list, and starts coordinating. No YAML configs. No boilerplate. Just describe what you need.

## Display Modes: How to See Your Team

Two options:

**In-process (default):** All teammates run inside your terminal. `Shift+Up/Down` to select a teammate. `Enter` to view their session. `Escape` to interrupt. Works everywhere—VS Code terminal, iTerm, any shell.

**Split panes:** Each teammate gets its own terminal pane. See everyone's output simultaneously. Requires `tmux` or `iTerm2`. Does **not** work in VS Code integrated terminal.

Set it in `settings.json`:

```
{
  "teammateMode": "in-process"
}
```

Or per session: `claude --teammate-mode in-process`.

Start with in-process. It works everywhere. Switch to split panes once you're comfortable.

## Use Cases Worth the Token Cost

Not everything needs a team. These setups justify the 5x token overhead. Same philosophy as my [Claude Code Architecture](https://www.marc0.dev/en/blog/claude-code-architecture-how-i-replaced-an-entire-agency-with-one-repo-1769869795518)—scale where it matters.

### 1\. Parallel Code Review (3 Reviewers, 3 Lenses)

One reviewer gravitates toward one type of issue. Three catch what one misses.

Create an agent team for PR #142:

-   **Security Reviewer**: Token handling, input validation, auth flows.
-   **Performance Reviewer**: N+1 queries, memory leaks, unnecessary renders.
-   **Test Reviewer**: Coverage gaps, edge cases, flaky test patterns.

The lead synthesizes all findings into one review. Three perspectives, one output. This alone justifies learning the feature.

### 2\. Debugging with Competing Hypotheses

The killer use case. Single agents find _one_ plausible explanation and stop. Multiple agents arguing with each other find the _right_ explanation.

Spawn 3-5 teammates. Each investigates a different hypothesis. They message each other to disprove theories. Consensus emerges through debate, not through one agent guessing.

Example prompt:

> Production API is returning 500s intermittently. Create a debugging team:
> 
> -   Hypothesis 1: Database connection pool exhaustion
> -   Hypothesis 2: Race condition in the caching layer
> -   Hypothesis 3: Memory leak in the request handler Have them share evidence and argue which theory fits the logs.

Parallel investigation with adversarial debate. Surfaces the strongest theory.

### 3\. Multi-Module Feature Work

Feature spans frontend, backend, and tests. Each teammate owns a layer. No file conflicts.

-   **Teammate 1**: Backend API endpoints & database schema.
-   **Teammate 2**: Frontend components & state management.
-   **Teammate 3**: E2E tests & integration tests.

They coordinate via the shared task list. Backend teammate finishes the API → test teammate picks up automatically.

## Pro Tips

**Require plan approval for risky tasks.** Teammates work in read-only plan mode until the lead approves. Don't let them push to main without review.

**Use delegate mode.** When the lead starts coding instead of coordinating → press `Shift+Tab` to lock it into orchestration mode (spawning, messaging, task management). Leads should lead, not code.

**Give teammates specific context.** They load `CLAUDE.md` automatically but don't inherit the lead's conversation history. Put task-specific details in the spawn prompt—file paths, constraints, what "done" looks like.

**Avoid file conflicts.** Two teammates editing the same file = overwrites. Structure work so each teammate owns different files. If they need to touch the same file, sequence the tasks with dependencies.

**Start read-only.** Your first agent team run should be a code review, not a parallelized refactor. Learn the coordination patterns before you let multiple agents write code simultaneously.

## Troubleshooting & Common Issues

### "Agent Teams option doesn't appear"

The `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` flag isn't set. Check with:

```
echo $CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS
```

Should output `1`. If using `settings.json`, make sure it's in the `env` block, not at root level.

### "Teammate seems stuck"

Task status can lag. The lead might think a task is still pending when the teammate already started. Give it 10-15 seconds. If truly stuck, message the teammate directly through the lead.

### "Split panes not working"

Split pane mode requires `tmux` or `iTerm2`. It does **not** work in:

-   VS Code integrated terminal
-   Windows Terminal
-   Ghostty

Use `--teammate-mode in-process` instead.

### "Can't resume a session with teammates"

Known limitation. `/resume` and `/rewind` don't restore in-process teammates. The lead may try to message teammates that no longer exist. Start a fresh session.

### "Teammates editing the same file"

No built-in file locking. Two teammates writing to the same file = last write wins. Solution: structure tasks so each teammate owns different files.

## Limitations

No sugarcoating:

-   **No session resumption**: `/resume` and `/rewind` don't restore teammates. Fresh sessions only.
-   **Token cost is real**: A 5-person team burns ~5x the tokens of a single session. For routine tasks, this isn't worth it.
-   **One team per session**: Clean up before starting a new team. Teammates can't spawn their own teams (no nested multi-agent chains).
-   **Split panes need tmux/iTerm2**: Not every terminal supports it.
-   **Task status can lag**: Coordination isn't instant. Complex dependency chains may need manual nudging.

### Cleanup

When done: **always clean up the team through the lead**.

The lead checks for active teammates and fails if any are still running. Shut them down first:

> "Ask the researcher teammate to shut down."

Then: _"Clean up the team."_

If a tmux session hangs: `tmux kill-session -t <session-name>`.

## The Verdict

Agent Teams are the most interesting feature in the Opus 4.6 release—and the most expensive.

For code reviews, adversarial debugging, and multi-module features: the parallel exploration finds things a single agent misses. The competing hypotheses pattern alone is worth learning.

For sequential tasks or same-file edits: stick with subagents or a single session. The overhead isn't justified.

This is another step toward why [Static Middleware is Dead](https://www.marc0.dev/en/blog/the-magnitude-9-earthquake-why-static-middleware-is-dead-and-what-replaces-it-1766787577135). Start with a read-only task—a code review—before you commit to parallelized implementation.
