# Claude Code Agent Teams vs. Claude-Flow: A Real-World Bake-Off

> Source: [https://medium.com/@derekcashmore/claude-code-agent-teams-vs-claude-flow-a-real-world-bake-off-97e24f6ca9b9](https://medium.com/@derekcashmore/claude-code-agent-teams-vs-claude-flow-a-real-world-bake-off-97e24f6ca9b9)
> Author: Derek C. Ashmore
> Site: Medium

---

[

![Derek C. Ashmore](https://miro.medium.com/v2/resize:fill:64:64/1*yWcdKPuEGv_Ufydw49umrQ.jpeg)

](https://medium.com/@derekcashmore?source=post_page---byline--97e24f6ca9b9---------------------------------------)

5 min read

Feb 9, 2026

\--

Press enter or click to view image in full size

Anthropic recently introduced **Agent Teams** in Claude Code, a capability that enables multiple AI agents to collaborate on a single task, rather than forcing everything through a single monolithic agent.

Instead of one agent juggling research, synthesis, planning, and writing, work can be decomposed across a team. Each agent gets a narrower slice of the problem, allowing it to focus more deeply. As a side effect, your _effective_ instruction context grows with the number of agents involved.

If that sounds familiar, it should. I’m an avid user of [**Claude-Flow**](https://github.com/ruvnet/claude-flow), an open-source orchestrator that coordinates teams of Claude Code agents. While I currently use Claude-Flow regularly, I’m always looking ahead to what’s next. As a result, when I heard the Agent Teams announcement, I was inclined to compare it with what I currently use.

To understand how Anthropic’s native approach compares to an external orchestrator, I ran a bake-off using a methodology modeled after how many enterprises evaluate vendors during a Request for Proposal (RFP).

## Enabling Claude Code Agent Teams (It’s Really This Short)

Agent Teams are currently **experimental and disabled by default**. To enable them, you simply set an environment variable:

`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`

You can do this either in your shell environment or via your Claude Code settings.json, for example:

{  
 "env": {  
 "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"  
 }  
}

Once enabled, there’s no additional configuration required. You can literally start your prompt with:

`“Create an agent team to…”`

Claude will automatically create a coordinator agent and supporting agents based on the task scope. This simplicity is one of Agent Teams’ biggest strengths. As a user, you can focus on specifications and outcomes, not plumbing.

## The Bake-Off Methodology

Rather than giving each system ad hoc prompts, I evaluated both tools the way many corporations evaluate vendors: with **the same inputs, the same constraints, and shared clarifications**.

**Common Inputs**

Both Claude Code Agent Teams and Claude-Flow were given:

- **Identical instructions**  
  [https://github.com/Derek-Ashmore/technical-analysis-planning/blob/main/instructions/Instructions.md](https://github.com/Derek-Ashmore/technical-analysis-planning/blob/main/instructions/Instructions.md)
- **Identical application requirements**  
  [https://github.com/Derek-Ashmore/technical-analysis-planning/blob/main/requirements/Main.md](https://github.com/Derek-Ashmore/technical-analysis-planning/blob/main/requirements/Main.md)

These documents functioned like a Request for Proposal (RFP) package, as many companies use for vendors, a mix of business context, goals, constraints, and expectations.

**Shared Q&A Process**

As questions arose during research, any clarification provided to one system was **also made available to the other.** Both teams were allowed to **revise their research** accordingly.

This ensured neither system gained an informational advantage, mirroring how real-world procurement and architecture evaluations work.

**Outputs Compared**

After two rounds of research, I compared the resulting artifacts:

- **Agent Teams output**  
  [https://github.com/Derek-Ashmore/technical-analysis-planning/blob/claude-agent-teams/research/Research_v2.md](https://github.com/Derek-Ashmore/technical-analysis-planning/blob/claude-agent-teams/research/Research_v2.md)
- **Claude-Flow output**  
  [https://github.com/Derek-Ashmore/technical-analysis-planning/blob/claude-flow/research/Research_v2.md](https://github.com/Derek-Ashmore/technical-analysis-planning/blob/claude-flow/research/Research_v2.md)

## What Claude Code Agent Teams Does Well

**1\. Extremely Low Friction**

Agent Teams is _very_ easy to install and use. There’s no framework to install, no orchestration logic to design, and no configuration tuning required. Enabling it is as simple as setting a one-line environment variable. Creating a team is a one-line instruction.

This makes it immediately accessible to developers, architects, and analysts who want multi-agent capability without committing to a tooling ecosystem.

**2\. Cleaner Working Directory**

Agent Teams produce less operational litter. That is, Claude Code creates a Claude.md file on initialization, but no other operational files are created in the project folder.

Claude-Flow checks in runtime metrics and execution artifacts by default. That observability is valuable, but it does introduce noise unless you explicitly tune it down.

Agent Teams feels more ephemeral and closer to a thought process than a workflow engine.

## Where Agent Teams Currently Struggle

**3\. Overly Aggressive Write Permissions**

One annoying detail: Agent Teams asks for write permission on _everything_ by default. Files, directories, outputs; all of it. While this is standard behavior for Claude Code, it gets amplified when you’re using Agent Teams.

I eventually had to adjust the settings to allow all writes globally just to maintain momentum. This is fixable, but the default experience is more intrusive than necessary.

**4\. Less Extensive Research Output**

The biggest qualitative difference showed up in research depth. Both teams cited their academic sources for trading-system technical analysis, the focus of the application’s design, but Claude-flow had many more sources.

Claude-Flow’s output was **far more extensive**, pulling in more background material and exploring the problem space more thoroughly. It felt like a team instructed to exhaustively analyze the domain.

Agent Teams produced solid results, but they were noticeably thinner. This may reflect different defaults rather than raw capability, but it’s an important distinction for research-heavy tasks.

**5\. Token Throughput and Optimization**

This is anecdotal, but consistent with my experience so far. With Claude-Flow, I rarely hit throughput limits on my Claude Code plan. With Agent Teams, I hit that limit and had to wait the full five hours for a token allocation refill.

My **_suspicion_** is that Claude-Flow performs more aggressive token optimization across agents, whereas Agent Teams prioritizes simplicity and setup speed. For long-running or highly iterative research, this difference matters.

**6\. Ecosystem Flexibility**

Claude-Flow is explicitly extensible beyond Anthropic models. It can be adapted to work with other providers (for example, via OpenRouter or Codex). Agent Teams is, unsurprisingly, Anthropic-only. That’s fine for many users, but it’s a strategic limitation if you care about model diversity or future portability.

## A Practical Recommendation: Let One Agent Coordinate

Both systems allow you to micromanage individual agents. In practice, I recommend **not doing that**.

Instead, let the system establish a coordinator agent and focus on:

- Clear intent
- Strong constraints
- Explicit success criteria

You’ll get better results and avoid orchestrating work that the system is already designed to handle.

## Early Verdict

If I had to summarize the trade-offs:

**Claude Code Agent Teams**

- Extremely easy to enable and use
- Minimal setup
- Clean workspace
- Lighter research depth
- More likely to hit token limits

**Claude-Flow**

- More setup effort
- Much deeper research output
- Better token efficiency (in practice)
- Extensible beyond Anthropic
- More operational visibility (and noise)

Agent Teams feels like Anthropic’s attempt to make agentic workflows **mainstream and accessible**. Claude-Flow still feels like the tool for people who want **maximum depth, control, and extensibility**.

Either way, one conclusion is already clear: **Multi-agent workflows are no longer optional** for serious analytical and engineering work.

## Next Steps

This comparison is intentionally an interim snapshot, not a final verdict. My next step is to take both Claude Code Agent Teams and Claude-Flow through the remainder of the lifecycle: completing the architecture and design, and then proceeding into full implementation. In other words, I want to evaluate not just how these systems research and analyze requirements, but how well they support sustained delivery as complexity, code volume, and iteration increase.

I’m publishing these early observations because I didn’t want perfection to become the enemy of progress. This is the first release of Agent Teams, and I fully expect meaningful improvements as Anthropic iterates. Treat this article as a baseline. I’m very interested to see what happens when these agent teams are asked to build, evolve, and maintain a real system over time.
