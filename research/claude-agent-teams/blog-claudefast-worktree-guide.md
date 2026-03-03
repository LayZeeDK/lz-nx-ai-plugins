# Claude Code Worktrees: Run Parallel Sessions Without Conflicts

> Source: [https://claudefa.st/blog/guide/development/worktree-guide](https://claudefa.st/blog/guide/development/worktree-guide)
> Author: Abdullah Mobayad
> Site: Claude Fast

---
Use Claude Code git worktree support to run parallel AI sessions. Guide to the --worktree flag, subagent isolation, and Desktop mode.

**Problem**: You're running a Claude Code session on a feature branch and need to fix a production bug. You either stash your work, lose context, or open a second terminal and fight merge conflicts when both sessions edit the same files.

**Quick Win**: Start a new Claude Code session in its own worktree:

This creates an isolated working directory at `.claude/worktrees/bugfix-123/` with its own branch `worktree-bugfix-123`. Your original session stays untouched. No stashing. No conflicts. Two fully independent Claude sessions running in parallel.

If you've used Claude Code's [sub-agent patterns](https://claudefa.st/blog/guide/agents/sub-agent-best-practices) or [background agents](https://claudefa.st/blog/guide/agents/async-workflows), you've probably hit the wall: multiple agents editing the same files at the same time. One agent writes to `src/auth.ts` while another rewrites the same module. The result is merge conflicts, half-applied changes, or worse.

Git worktrees solve this at the filesystem level. Each worktree is a separate checkout of your repository with its own branch, its own working directory, and its own index. Claude Code v2.1.50 adds first-class support for creating, managing, and cleaning up worktrees directly from the CLI, Desktop app, and even inside custom agents.

The simplest way to use worktrees is the `--worktree` flag when launching Claude Code.

### [Named worktrees](https://claudefa.st/#named-worktrees)

Each worktree gets its own directory under `.claude/worktrees/` and a dedicated branch. You can run as many as your disk can hold.

### [Auto-named worktrees](https://claudefa.st/#auto-named-worktrees)

Useful for quick throwaway sessions where you don't care about the branch name.

### [Multiple parallel sessions](https://claudefa.st/#multiple-parallel-sessions)

Three isolated sessions, three branches, zero conflicts. Each session has full access to your codebase history but operates on completely separate file trees.

### [Mid-session worktree creation](https://claudefa.st/#mid-session-worktree-creation)

You don't need the flag at launch. During any session, just ask:

Claude creates the worktree and switches your session into it. This is useful when you realize mid-conversation that your changes should be isolated.

The Claude Code Desktop app takes worktrees further with automatic isolation for every new session.

Each session gets its own worktree stored in `.claude/worktrees/` by default. You can customize this location in Desktop Settings along with a branch prefix for organizing Claude-created branches. When you're done with a session, use the archive icon to remove the worktree and its branch.

This means every Desktop session is safe by default. No accidental overwrites between sessions, no coordination needed.

This is where worktrees become genuinely powerful. When Claude spawns sub-agents for [task distribution](https://claudefa.st/blog/guide/agents/task-distribution), each sub-agent can get its own worktree.

### [Asking Claude to isolate agents](https://claudefa.st/#asking-claude-to-isolate-agents)

The simplest approach:

Claude will spawn each sub-agent in its own worktree. When agents finish, worktrees with no changes are automatically cleaned up. Worktrees with changes persist for your review.

### [Why this matters for parallel execution](https://claudefa.st/#why-this-matters-for-parallel-execution)

Without worktree isolation, parallel sub-agents are limited to reading files or writing to non-overlapping paths. That's a fragile constraint. One agent drifting into another's file territory causes silent conflicts.

With worktree isolation, each agent has the entire codebase to itself. Agent A can rewrite `src/auth.ts` while Agent B rewrites the same file with a different approach. You review both branches and pick the winner (or merge them).

This pattern is especially valuable for batched code migrations. Need to update 50 files from one API pattern to another? Spawn 5 agents, each handling 10 files in their own worktree. They all run in parallel without stepping on each other. The built-in [`/batch` command](https://claudefa.st/blog/guide/mechanics/simplify-batch-commands) uses exactly this pattern, spinning up worktree-isolated agents to run parallel codebase migrations with a single prompt.

If you build [custom agents](https://claudefa.st/blog/guide/agents/custom-agents) in `.claude/agents/`, you can configure them to always use worktree isolation:

The `isolation: worktree` frontmatter tells Claude to create a fresh worktree every time this agent runs. The agent works in complete isolation, and the worktree auto-cleans if it makes no changes.

This is the pattern the [ClaudeFast Code Kit](https://claudefa.st/) uses for its 18 specialist agents. When the `/team-build` command dispatches multiple agents in parallel, each gets worktree isolation so they can work on overlapping domains without conflict. The result is true parallel execution across your entire codebase.

If your team uses Mercurial, Perforce, or SVN instead of Git, worktree mode still works through custom hooks. Configure `WorktreeCreate` and `WorktreeRemove` hooks in your settings to replace the default git behavior with your VCS-specific isolation logic.

When these hooks are configured, the `--worktree` flag and in-session worktree requests will call your hooks instead of running git commands. The rest of the workflow stays the same.

Worktree cleanup depends on whether the session made changes:

-   **No changes**: The worktree and its branch are automatically removed when the session ends
-   **Changes exist**: Claude prompts you to keep or remove the worktree

Add `.claude/worktrees/` to your `.gitignore` to keep worktree directories out of version control:

If you accumulate stale worktrees, you can list and prune them with standard git commands:

| Scenario | Use Worktree? | Why |
| --- | --- | --- |
| Quick single-file fix | No | Overhead isn't worth it |
| Feature work while fixing a bug | Yes | Keeps feature and bugfix branches clean |
| Multi-agent parallel execution | Yes | Prevents file conflicts between agents |
| Code migration across many files | Yes | Split work across isolated agents |
| Exploring experimental approaches | Yes | Throwaway worktrees with auto-cleanup |
| Single focused session | No | Regular checkout is fine |

The rule of thumb: if you'd normally create a separate branch to avoid conflicts, use a worktree instead. You get the branch isolation plus a separate working directory.

-   Use [Remote Control](https://claudefa.st/blog/guide/development/remote-control-guide) to manage worktree sessions from your phone
-   Set up [version control workflows](https://claudefa.st/blog/guide/development/git-integration) for commits, branches, and PRs
-   Learn [parallel and sequential patterns](https://claudefa.st/blog/guide/agents/sub-agent-best-practices) for effective agent dispatch
-   Run [background agents](https://claudefa.st/blog/guide/agents/async-workflows) to keep building while agents work
-   Build [custom agents](https://claudefa.st/blog/guide/agents/custom-agents) with built-in worktree isolation
-   Master [multi-agent orchestration](https://claudefa.st/blog/guide/agents/agent-teams) for complex projects
-   Understand the [terminal as main thread](https://claudefa.st/blog/guide/mechanics/terminal-main-thread) to coordinate it all
-   Review [sandboxing and security isolation](https://claudefa.st/blog/guide/sandboxing-guide) for safe agent execution

Worktrees turn Claude Code from a single-threaded assistant into a parallel development environment. Launch isolated sessions, dispatch isolated agents, and merge results when you're ready.
