# Claude Code Agent Teams - Research Corpus

Research corpus on Claude Code's **agent teams** feature (multi-agent orchestration),
covering official documentation, Anthropic blog posts, and community/ecosystem articles.

Captured: 2026-03-03

## Official Documentation

| File | Source | Description |
|------|--------|-------------|
| [agent-teams.md](agent-teams.md) | [code.claude.com](https://code.claude.com/docs/en/agent-teams) | Primary agent teams documentation - setup, usage, best practices |
| [sub-agents.md](sub-agents.md) | [code.claude.com](https://code.claude.com/docs/en/sub-agents) | Subagents documentation - the single-session alternative to agent teams |
| [costs.md](costs.md) | [code.claude.com](https://code.claude.com/docs/en/costs) | Cost management including agent team token costs section |
| [features-overview.md](features-overview.md) | [code.claude.com](https://code.claude.com/docs/en/features-overview) | Feature comparison including subagent vs agent team decision matrix |

## Anthropic Blog Posts

| File | Source | Description |
|------|--------|-------------|
| [blog-building-multi-agent-systems.md](blog-building-multi-agent-systems.md) | [claude.com/blog](https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them) | Anthropic's guide on when/how to use multi-agent systems - decision framework, orchestrator-subagent pattern, common pitfalls |
| [blog-anthropic-building-c-compiler.md](blog-anthropic-building-c-compiler.md) | [anthropic.com/engineering](https://www.anthropic.com/engineering/building-c-compiler) | Case study: 16 parallel Claude agents building a C compiler (2000 sessions, ~$20K, compiled Linux 6.9 kernel) |

## Community & Ecosystem Articles

### Setup Guides & Overviews

| File | Source | Description |
|------|--------|-------------|
| [blog-addy-osmani-claude-code-swarms.md](blog-addy-osmani-claude-code-swarms.md) | [addyosmani.com](https://addyosmani.com/blog/claude-code-agent-teams/) | Addy Osmani's overview of agent teams with setup examples |
| [blog-claudefast-complete-guide.md](blog-claudefast-complete-guide.md) | [claudefa.st](https://claudefa.st/blog/guide/agents/agent-teams) | Complete 2026 guide covering setup, comparison with subagents, orchestration patterns |
| [blog-sitepoint-agent-teams-guide.md](blog-sitepoint-agent-teams-guide.md) | [sitepoint.com](https://www.sitepoint.com/anthropic-claude-code-agent-teams/) | SitePoint guide on running a team of AI developers |
| [blog-marc0-parallel-agents-setup.md](blog-marc0-parallel-agents-setup.md) | [marc0.dev](https://www.marc0.dev/en/blog/claude-code-agent-teams-multiple-ai-agents-working-in-parallel-setup-guide-1770317684454) | Practical setup guide for multiple AI agents in one repo |

### Deep Dives & Architecture

| File | Source | Description |
|------|--------|-------------|
| [blog-alexop-from-tasks-to-swarms.md](blog-alexop-from-tasks-to-swarms.md) | [alexop.dev](https://alexop.dev/posts/from-tasks-to-swarms-agent-teams-in-claude-code/) | Detailed architecture walkthrough - from task management to full swarm orchestration |
| [blog-codewithseb-subagents-performance.md](blog-codewithseb-subagents-performance.md) | [codewithseb.com](https://www.codewithseb.com/blog/claude-code-sub-agents-multi-agent-systems-guide) | 90% performance gain with subagents - Opus lead + Sonnet workers pattern |
| [blog-devto-multi-agent-orchestration-10-instances.md](blog-devto-multi-agent-orchestration-10-instances.md) | [dev.to](https://dev.to/bredmond1019/multi-agent-orchestration-running-10-claude-instances-in-parallel-part-3-29da) | Running 10+ Claude instances in parallel - Part 3 of series |
| [blog-shipyard-multi-agent-orchestration.md](blog-shipyard-multi-agent-orchestration.md) | [shipyard.build](https://shipyard.build/blog/claude-code-multi-agent/) | Multi-agent orchestration patterns for Claude Code in 2026 |

### Comparisons & Real-World Experience

| File | Source | Description |
|------|--------|-------------|
| [blog-derek-ashmore-agent-teams-vs-claude-flow.md](blog-derek-ashmore-agent-teams-vs-claude-flow.md) | [Medium](https://medium.com/@derekcashmore/claude-code-agent-teams-vs-claude-flow-a-real-world-bake-off-97e24f6ca9b9) | Real-world bake-off comparing native agent teams vs Claude-Flow |
| [blog-towardsai-agent-teams-comparison.md](blog-towardsai-agent-teams-comparison.md) | [Towards AI](https://pub.towardsai.net/inside-claude-codes-agent-teams-and-kimi-k2-5-s-agent-swarm-0106f2467bd2) | Comparison of Claude agent teams vs Kimi K2.5 agent swarm (preview only - paywall) |
| [blog-joe-njenga-tried-agent-teams.md](blog-joe-njenga-tried-agent-teams.md) | [Medium](https://medium.com/@joe.njenga/i-tried-new-claude-code-agent-teams-and-discovered-new-way-to-swarm-28a6cd72adb8) | First-hand experience report with agent teams (preview only - paywall) |
| [blog-devgenius-claude-code-team-setup.md](blog-devgenius-claude-code-team-setup.md) | [Dev Genius](https://blog.devgenius.io/the-claude-code-team-just-revealed-their-setup-pay-attention-4e5d90208813) | How the Claude Code team themselves use the tool (preview only - paywall) |

### Git Worktree Integration

| File | Source | Description |
|------|--------|-------------|
| [blog-claudefast-worktree-guide.md](blog-claudefast-worktree-guide.md) | [claudefa.st](https://claudefa.st/blog/guide/development/worktree-guide) | Worktree guide for running parallel sessions without conflicts |
| [blog-dandoescode-parallel-worktrees.md](blog-dandoescode-parallel-worktrees.md) | [dandoescode.com](https://www.dandoescode.com/blog/parallel-vibe-coding-with-git-worktrees) | Parallel coding with git worktrees and Claude Code |

## Key Concepts

### Agent Teams vs Subagents

- **Subagents**: Run within a single session, report results back to caller only, lower token cost, best for focused tasks
- **Agent teams**: Independent sessions with own context windows, peer-to-peer messaging, shared task list, higher token cost, best for collaborative work

### When to Use Agent Teams

1. Research and review (parallel investigation)
2. New modules/features (each teammate owns a piece)
3. Debugging with competing hypotheses
4. Cross-layer coordination (frontend/backend/tests)

### Cost Considerations

- Each teammate is a separate Claude instance with its own context window
- Token usage scales roughly proportional to team size (3-4x for 3 teammates)
- Use Sonnet for teammates to balance capability and cost
- Keep teams small and shut down when done

### Git Worktree Integration

- Native `--worktree` flag since Claude Code v2.1.49 (Feb 2026)
- Each agent gets isolated filesystem state via `.claude/worktrees/`
- Subagents can use `isolation: worktree` in frontmatter
- Add `.claude/worktrees/` to `.gitignore`
