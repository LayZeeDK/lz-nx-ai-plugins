# From Tasks to Swarms: Agent Teams in Claude Code | alexop.dev

> Source: [https://alexop.dev/posts/from-tasks-to-swarms-agent-teams-in-claude-code/](https://alexop.dev/posts/from-tasks-to-swarms-agent-teams-in-claude-code/)
> Author: Alexander Opalic

---

In my [previous post](https://alexop.dev/posts/spec-driven-development-claude-code-in-action/) Spec-Driven Development with Claude Code in Action A practical workflow for tackling large refactors with Claude Code using parallel research subagents, written specs, and the new task system for context-efficient implementation. claude-codeailocal-first +1 Feb 1, 2026 I covered spec-driven development with Claude Code—using the task system to break large refactors into subagent-driven work. Subagents are powerful, but they have one fundamental limitation: they can only report back to the parent. They can’t talk to each other.

Agent teams remove that limitation. They’re a new experimental feature in Claude Code where multiple sessions coordinate as a team—with a shared task list, direct messaging between teammates, and a team lead that orchestrates the whole thing.

## Table of Contents[#](https://alexop.dev/#table-of-contents)

Open Table of Contents

- [The Evolution: From Subagents to Agent Teams](https://alexop.dev/#the-evolution-from-subagents-to-agent-teams)
- [Subagents vs Agent Teams](https://alexop.dev/#subagents-vs-agent-teams)
- [The Seven Team Primitives](https://alexop.dev/#the-seven-team-primitives)
  - [TeamCreate — Start a Team](https://alexop.dev/#teamcreate--start-a-team)
  - [TaskCreate — Define a Unit of Work](https://alexop.dev/#taskcreate--define-a-unit-of-work)
  - [TaskUpdate — Claim and Complete Work](https://alexop.dev/#taskupdate--claim-and-complete-work)
  - [TaskList — Find Available Work](https://alexop.dev/#tasklist--find-available-work)
  - [Task (with team_name) — Spawn a Teammate](https://alexop.dev/#task-with-team_name--spawn-a-teammate)
  - [SendMessage — Talk to Each Other](https://alexop.dev/#sendmessage--talk-to-each-other)
  - [TeamDelete — Clean Up](https://alexop.dev/#teamdelete--clean-up)
  - [How They Fit Together](https://alexop.dev/#how-they-fit-together)
- [The Team Lead’s Control Layer](https://alexop.dev/#the-team-leads-control-layer)
- [Task Lifecycle in a Team](https://alexop.dev/#task-lifecycle-in-a-team)
- [Use Case: Building a Large Feature](https://alexop.dev/#use-case-building-a-large-feature)
- [Real Example: QA Swarm Against My Blog](https://alexop.dev/#real-example-qa-swarm-against-my-blog)
  - [What the Lead Did](https://alexop.dev/#what-the-lead-did)
  - [What the Files Look Like](https://alexop.dev/#what-the-files-look-like)
  - [How the Agents Reported Back](https://alexop.dev/#how-the-agents-reported-back)
  - [The Lead’s Synthesis](https://alexop.dev/#the-leads-synthesis)
  - [The Full Lifecycle](https://alexop.dev/#the-full-lifecycle)
- [The Cost Trade-off](https://alexop.dev/#the-cost-trade-off)
  - [When Teams Are Worth It](https://alexop.dev/#when-teams-are-worth-it)
- [Getting Started](https://alexop.dev/#getting-started)
  - [Recipe: Plan First, Parallelize Second](https://alexop.dev/#recipe-plan-first-parallelize-second)
  - [Display Modes](https://alexop.dev/#display-modes)
- [The Abstraction Ladder](https://alexop.dev/#the-abstraction-ladder)
- [Conclusion](https://alexop.dev/#conclusion)

## The Evolution: From Subagents to Agent Teams[#](https://alexop.dev/#the-evolution-from-subagents-to-agent-teams)

This is the progression of delegation in Claude Code. Each step gives the AI more autonomy and less handholding:

Level 0: Solo SessionYou + ClaudeContext fills up fastLevel 1: Subagents (Task System)Main AgentS1S2S3results back to mainSubagents can't coordinateLevel 2: Agent TeamsTeam LeadT1T2T3Shared Task ListAI coordinates itself

Each level adds more AI autonomy and coordination capability

Experimental feature

Agent teams are disabled by default. Enable them by adding `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` to your `settings.json` or environment.

## Subagents vs Agent Teams[#](https://alexop.dev/#subagents-vs-agent-teams)

The critical difference is communication. Subagents are fire-and-forget workers. Agent teams are collaborators.

SUBAGENTS(one-way reporting)Main AgentS1S2S3Results go backto main onlyS1 can't see S2's findingsS2 can't ask S3 for helpMain does all synthesisAGENT TEAMS(full communication)Lead AgentT1T2T3Shared findingsChallenge eachother's workT1 reads T2's findingsT2 asks T3 for helpLead synthesizes ORdelegates synthesis

Subagents report back to main only. Agent teams share findings and coordinate directly.

|                   | Subagents                  | Agent Teams                            |
| ----------------- | -------------------------- | -------------------------------------- |
| **Context**       | Own window, results return | Own window, fully independent          |
| **Communication** | Report to main only        | Message each other directly            |
| **Coordination**  | Main manages everything    | Shared task list, self-claim           |
| **Token cost**    | Lower                      | Higher—each teammate is a full session |
| **Best for**      | Focused tasks, research    | Complex work needing collaboration     |

## The Seven Team Primitives[#](https://alexop.dev/#the-seven-team-primitives)

Agent teams aren’t magic. They’re built from seven tools that Claude can call. Understanding these tools is the key to understanding how teams actually work under the hood.

TEAM PRIMITIVESSETUPWORKCOMMUNICATETEARDOWNTeamCreateTaskCreateTaskUpdateTaskListSendMessageTeamDeleteconfig.json\+ task dirtask files ondisk (JSON)messagesbetween anytwo agentscleanupall files

Each primitive maps to a tool call. Together they form the coordination layer.

Here’s each one, with the real calls from my QA session.

### TeamCreate — Start a Team[#](https://alexop.dev/#teamcreate--start-a-team)

Creates the team directory and config file. This is always the first call.

```
// Tool call
TeamCreate({ "team_name": "blog-qa", "description": "QA team testing the blog" })

// Creates on disk:
// ~/.claude/teams/blog-qa/config.json
// ~/.claude/tasks/blog-qa/
```

The `team_name` is the namespace that links everything together—tasks, messages, and the config file all live under it.

### TaskCreate — Define a Unit of Work[#](https://alexop.dev/#taskcreate--define-a-unit-of-work)

Each task is a JSON file on disk. The lead creates these before spawning any teammates.

```
// Tool call
TaskCreate({
  "subject": "QA: Core pages respond with 200 and valid HTML",
  "description": "Fetch all major pages at localhost:4321 and verify
    they return HTTP 200. Test: /, /posts, /tags, /notes, /tils,
    /search, /projects, /404 (should be 404), /rss.xml...",
  "activeForm": "Testing core page responses"
})

// Creates: ~/.claude/tasks/blog-qa/1.json
```

The `description` is what the teammate actually reads to know what to do. It’s essentially a prompt for the agent. The more detail you pack in here (or the lead packs in), the better the agent performs.

### TaskUpdate — Claim and Complete Work[#](https://alexop.dev/#taskupdate--claim-and-complete-work)

Teammates use this to change task status. It’s how work moves through the pipeline.

```
// Teammate claims a task
TaskUpdate({ "taskId": "1", "status": "in_progress", "owner": "qa-pages" })

// Teammate finishes
TaskUpdate({ "taskId": "1", "status": "completed" })
```

The status field prevents two agents from working on the same thing. When a task is `in_progress` with an owner, other agents skip it.

### TaskList — Find Available Work[#](https://alexop.dev/#tasklist--find-available-work)

Returns all tasks with their current status. Teammates call this after completing a task to find what’s next.

```
// Tool call
TaskList()

// Returns:
// { id: "1", subject: "Core pages...",  status: "completed",   owner: "qa-pages" }
// { id: "2", subject: "Blog posts...",  status: "in_progress", owner: "qa-posts" }
// { id: "3", subject: "Links...",       status: "pending",     owner: ""         }
```

This is the shared coordination mechanism. No centralized scheduler—each teammate polls `TaskList`, finds unowned pending tasks, and claims one.

### Task (with team_name) — Spawn a Teammate[#](https://alexop.dev/#task-with-team_name--spawn-a-teammate)

The existing `Task` tool gets a `team_name` parameter that turns a regular subagent into a team member. Once spawned, the teammate can see the shared task list and message other teammates.

```
// Tool call
Task({
  "description": "QA: Core page responses",
  "subagent_type": "general-purpose",
  "name": "qa-pages",
  "team_name": "blog-qa",
  "model": "sonnet",
  "prompt": "You are a QA agent testing a blog at localhost:4321.
    Your task is Task #1: verify all core pages respond correctly..."
})
```

Notice the `model: "sonnet"` — the lead ran on Opus but spawned all teammates on Sonnet. This is a common cost optimization pattern: expensive model for coordination, cheaper model for execution.

### SendMessage — Talk to Each Other[#](https://alexop.dev/#sendmessage--talk-to-each-other)

This is what makes teams different from subagents. Any teammate can message any other teammate directly.

```
// Teammate → Lead: report findings
SendMessage({
  "type": "message",
  "recipient": "team-lead",
  "content": "Task #1 complete. 16/16 pages pass. No issues found.",
  "summary": "All core pages pass"
})

// Lead → Teammate: request shutdown
SendMessage({
  "type": "shutdown_request",
  "recipient": "qa-pages",
  "content": "All tasks complete, shutting down team."
})

// Teammate → Lead: acknowledge shutdown
SendMessage({
  "type": "shutdown_response",
  "request_id": "shutdown-123",
  "approve": true
})
```

`SendMessage` supports several message types: `message` for direct messages, `broadcast` to reach all teammates at once, `shutdown_request`/`shutdown_response` for graceful teardown, and `plan_approval_response` for quality gates.

### TeamDelete — Clean Up[#](https://alexop.dev/#teamdelete--clean-up)

Removes the team config and all task files from disk. Called after all teammates have shut down.

```
// Tool call
TeamDelete()

// Removes:
// ~/.claude/teams/blog-qa/
// ~/.claude/tasks/blog-qa/
```

### How They Fit Together[#](https://alexop.dev/#how-they-fit-together)

Every team session follows the same tool sequence:

SETUPTeamCreate("blog-qa")TaskCreate × NTask(team_name) × Ncreate team + dirsdefine all workspawn teammatesEXECUTIONEach teammate runs this loop independentlyTaskList()TaskUpdate(claim)do workTaskUpdate(complete)SendMessage(report)more tasks?yesnogo idleTEARDOWNshutdown_request × Nshutdown_response × NTeamDelete()clean up files

Every team session follows this three-phase tool sequence

Each teammate is a full Claude Code session with its own context window. They load the same project context (CLAUDE.md, MCP servers, skills) but don’t inherit the lead’s conversation history. The task files on disk and `SendMessage` are the only coordination channels—there’s no shared memory.

## The Team Lead’s Control Layer[#](https://alexop.dev/#the-team-leads-control-layer)

What makes agent teams more than “just parallel subagents” is the team lead. The lead is an abstraction layer that gives AI more control over coordination:

TEAM LEADOBSERVEWho's idleWho's stuckWhat's doneCOORDINATEBreak work into tasksAssign to teammatesManage dependenciesReassign if stuckSpawn replacementsENFORCEPlan approvalQuality gatesSYNTHESIZECollect findingsResolve conflictsReport to youShut down teamWith delegate mode: lead ONLY coordinatesWithout: lead may also implement tasks itself

The team lead observes, coordinates, enforces quality, and synthesizes results. In delegate mode it only coordinates—otherwise it may implement too.

## Task Lifecycle in a Team[#](https://alexop.dev/#task-lifecycle-in-a-team)

PENDINGIN_PROGRESSCOMPLETEDTeammate self-claimsOR lead assignsTeammateworks on itDependent tasksunblock automatically

Tasks move through three states. Teammates self-claim or get assigned by the lead.

DEPENDENCY-AWARE EXECUTIONWave 1 (no deps)T1T2T3donedonedoneWave 2 (blocked)T4T5donedoneWave 3T6doneFile locking prevents two teammates from claiming the same task.

Tasks execute in waves based on dependency chains. File locking prevents double-claiming.

## Use Case: Building a Large Feature[#](https://alexop.dev/#use-case-building-a-large-feature)

When you ask Claude Code to implement something big, agent teams let it parallelize the work the way a real engineering team would:

› Prompt

Create an agent team to build the new dashboard feature. One teammate on the API layer, one on the frontend components, one on the test suite. Use Sonnet for each teammate.

LEAD: Plans the feature splitReads specCreates 12 tasksIdentifies 3 tracksAPI TeammateT1: SchemaT2: EndpointsT3: Auth"API types areready at /types"msgUI TeammateT4: LayoutT5: ChartsT6: State"Got it, importing"Test TeammateT7: API testsT8: UI testsT9: E2E"Tests needAPI running"Lead synthesizesFinal PR ready

The lead breaks work into tracks. Teammates self-coordinate via direct messages.

The key difference from subagents: when the API teammate finishes the type definitions, it messages the UI teammate directly. No round-trip through the main agent. The test teammate can ask the API teammate to spin up a dev server. They self-coordinate.

## Real Example: QA Swarm Against My Blog[#](https://alexop.dev/#real-example-qa-swarm-against-my-blog)

This isn’t a hypothetical. I ran this against my own blog before a production deploy. Here’s the exact prompt I used:

That’s it. Claude took over from there.

### What the Lead Did[#](https://alexop.dev/#what-the-lead-did)

The lead verified the site was running (`curl` returned 200), created a team called `blog-qa`, then broke the work into 5 tasks and spawned 5 agents—all using Sonnet to keep costs down:

LEAD1\. TeamCreate("blog-qa")2\. Created 5 tasks with descriptions3\. Spawned 5 agents, each on a taskqa-pagesqa-postsqa-linksqa-seoqa-a11y

### What the Files Look Like[#](https://alexop.dev/#what-the-files-look-like)

When `TeamCreate` runs, it writes two things to disk. Here’s what they actually look like:

```
// ~/.claude/teams/blog-qa/config.json
{
  "members": [
    { "name": "qa-pages", "agentId": "abc-123", "agentType": "general-purpose" },
    { "name": "qa-posts", "agentId": "def-456", "agentType": "general-purpose" },
    { "name": "qa-links", "agentId": "ghi-789", "agentType": "general-purpose" },
    { "name": "qa-seo",   "agentId": "jkl-012", "agentType": "general-purpose" },
    { "name": "qa-a11y",  "agentId": "mno-345", "agentType": "general-purpose" }
  ]
}
```

And the tasks lived as individual files under `~/.claude/tasks/blog-qa/`. Each task had a subject, a detailed description telling the agent exactly what to check, and a status field:

```
// ~/.claude/tasks/blog-qa/1.json
{
  "id": "1",
  "subject": "QA: Core pages respond with 200 and valid HTML",
  "description": "Fetch all major pages on the blog at localhost:4321 and verify
    they return HTTP 200 with valid HTML content. Test: /, /posts, /tags, /notes,
    /tils, /search, /projects, /talks, /goals, /prompts, /404 (should be 404),
    /robots.txt, /rss.xml, /llms.txt, /llms-full.txt. Also check that the HTML
    contains expected elements (title, nav, footer).",
  "status": "completed",
  "owner": "qa-pages"
}
```

The lead created these 5 tasks:

| #   | Task                           | Agent      | What It Checked                                  |
| --- | ------------------------------ | ---------- | ------------------------------------------------ |
| 1   | Core page responses            | `qa-pages` | 16 URLs return correct HTTP status codes         |
| 2   | Blog post rendering            | `qa-posts` | 83 posts have h1, meta tags, working images      |
| 3   | Navigation & link integrity    | `qa-links` | 146 internal URLs for broken links               |
| 4   | RSS, sitemap, SEO metadata     | `qa-seo`   | RSS validity, robots.txt, og:tags, JSON-LD       |
| 5   | Accessibility & HTML structure | `qa-a11y`  | Heading hierarchy, ARIA, theme toggle, lang attr |

### How the Agents Reported Back[#](https://alexop.dev/#how-the-agents-reported-back)

Each agent finished independently and sent a structured report back via `SendMessage`. Here’s what `qa-pages` sent:

```
## Task #1 Complete: Core Page Response Testing

### Summary: ALL PAGES PASS

| URL         | Expected | Actual | Result |
|-------------|----------|--------|--------|
| /           | 200      | 200    | PASS   |
| /posts      | 200      | 200    | PASS   |
| /tags       | 200      | 200    | PASS   |
| /notes      | 200      | 200    | PASS   |
| /404        | 404      | 404    | PASS   |
| /rss.xml    | 200      | 200    | PASS   |
| /llms.txt   | 200      | 200    | PASS   |
  ...16 URLs tested, 0 failures.
```

Meanwhile `qa-posts` tested all 83 blog posts and found 2 with broken OG images. `qa-seo` found the `og:type` meta tag was missing. `qa-a11y` caught that `<html>` had `class="false"` (a boolean stringified as a class name) and a heading hierarchy issue.

### The Lead’s Synthesis[#](https://alexop.dev/#the-leads-synthesis)

Once all 5 agents reported back, the lead compiled a single prioritized report:

```
## QA Report — alexop.dev

5 agents | 146+ URLs tested | 83 blog posts checked

### Issues by Severity

MAJOR (4):
  1. <html class="false"> — boolean stringified as CSS class
  2. <h2> before <h1> — newsletter banner breaks heading order
  3. Theme toggle button missing from DOM
  4. Theme hardcoded to dark only

MEDIUM (2):
  5. og:type meta tag missing on all pages
  6. 2 blog posts with broken OG images

MINOR (4):
  7-10. Various small accessibility gaps
```

Then the lead sent `shutdown_request` to each agent, they acknowledged, and `TeamDelete` cleaned up the files.

### The Full Lifecycle[#](https://alexop.dev/#the-full-lifecycle)

YOU"QA my blog at localhost:4321"LEADTeamCreate → 5 TaskCreate → 5 Task(spawn)← all run in parallelpagespostslinksseoa11y16/16 pass83 posts2 bad OG146 URLs1 404 devRSS ok,no og:type<htmlclass=false>Lead synthesizes10 issues, prioritizedshutdown_request × 5TeamDeleteDone.

The full lifecycle from prompt to prioritized QA report

The whole thing—from prompt to final report—took about 3 minutes. Each agent used `curl` to fetch pages and parse the HTML. No browser automation, no test framework. Just 5 Claude sessions hammering a dev server in parallel.

## The Cost Trade-off[#](https://alexop.dev/#the-cost-trade-off)

Agent teams are token-heavy. Every teammate is a full Claude Code session with its own context window.

SOLO SESSION3 SUBAGENTS3-PERSON TEAM200kmainS1S2S3leadT1T2T3~200k tokens~440k tokens~800k tokensCheapest.Good for small tasks.Middle ground.Focused parallel work.Most expensive.Full collaboration.80k each200k each

More agents = more tokens = more cost. Each teammate is a full context window.

The math is simple: more agents = more tokens = more cost. Use teams when the coordination benefit justifies it. For routine tasks, a single session or subagents are more cost-effective.

### When Teams Are Worth It[#](https://alexop.dev/#when-teams-are-worth-it)

WHICH APPROACH?Small bug fix?Solo sessionyesnoJust report back?SubagentsyesnoMulti-file feature?Subagents + tasksyesnoWorkers need to talk?Agent teamyesjust you + Clauderesearch, explore, checkparallel with shared listcross-layer, QA, debate

Start simple — only reach for teams when workers genuinely need to coordinate

## Getting Started[#](https://alexop.dev/#getting-started)

Enable agent teams:

```
// .claude/settings.json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

Then tell Claude what you want:

› Prompt

Create an agent team to refactor the authentication module. One teammate on the backend logic, one on the frontend hooks, one running tests continuously. Require plan approval before any teammate makes changes.

### Recipe: Plan First, Parallelize Second[#](https://alexop.dev/#recipe-plan-first-parallelize-second)

The most effective pattern I’ve found isn’t jumping straight into a team. It’s a two-step approach: **plan first with plan mode, then hand the plan to a team for parallel execution.**

Here’s the workflow:

**Step 1 — Get a plan.** Start with plan mode (`/plan` or tell Claude to plan). Let it explore the codebase, identify files, and produce a step-by-step implementation plan. Review it. Adjust it. This is cheap—plan mode only reads files.

› Prompt

Plan the refactor of our authentication module. I want to split the monolithic auth.ts into separate files for JWT handling, session management, and middleware. Show me the plan before doing anything.

Claude produces something like:

```
Plan:
1. Create src/auth/jwt.ts — extract token signing/verification
2. Create src/auth/sessions.ts — extract session logic
3. Create src/auth/middleware.ts — extract Express middleware
4. Update src/auth/index.ts — re-export public API
5. Update 12 import sites across the codebase
6. Update tests in src/auth/__tests__/
```

**Step 2 — Parallelize the plan with a team.** Once you approve the plan, tell Claude to execute it as a team. The key insight: the plan already has the task breakdown. You’re just telling Claude to run independent tracks in parallel instead of sequentially.

› Prompt

Now execute this plan using an agent team. Parallelize where possible— steps 1-3 can run in parallel since they’re independent extractions. Step 4-5 depends on 1-3. Step 6 depends on everything. Use Sonnet for the teammates.

The lead sees the dependency graph and spawns teammates accordingly:

```
Wave 1 (parallel):  jwt.ts + sessions.ts + middleware.ts  → 3 teammates
Wave 2 (after wave 1): index.ts barrel + update imports   → 1-2 teammates
Wave 3 (after wave 2): update tests                       → 1 teammate
```

This works because plan mode gives you the checkpoint to review before spending tokens on a full team. Without the plan step, the team lead has to figure out the task breakdown itself—which it can do, but you lose the chance to steer it. With the plan, you’ve already shaped the work. The team just executes it faster.

💪 Why this beats jumping straight to a team

Plan mode costs ~10k tokens. A team that goes in the wrong direction costs 500k+. Spending a few seconds reviewing a plan saves you from expensive course corrections mid-swarm.

### Display Modes[#](https://alexop.dev/#display-modes)

In-Process (default)All in one terminalShift+Up/Down switch teammatesCtrl+T task listCtrl+J toggle agentWorks everywhere.

Works everywhere. All teammates share a single terminal.

Split Panes (tmux / iTerm2)LeadTeammate BTeammate ASee all output at once. Requires tmux or iTerm2.

See all output at once. Requires tmux or iTerm2.

## The Abstraction Ladder[#](https://alexop.dev/#the-abstraction-ladder)

More AI AutonomyMore Human ControlAgent TeamsAI coordinates multiple AI sessionsYou: set goals, review resultsSubagents + Task SystemAI delegates to workers, tracks progressYou: approve spec, monitor tasksSolo SessionAI does what you tell itYou: direct every step

Each level trades control for compute

Each level trades control for compute. Solo sessions give you full control but limited throughput. Agent teams give you maximum compute but you’re trusting the AI to coordinate itself. The sweet spot depends on your task.

## Conclusion[#](https://alexop.dev/#conclusion)

- Agent teams let multiple Claude Code sessions **communicate with each other**, not just report to a parent
- A team lead orchestrates, observes, and synthesizes—another abstraction layer where AI manages AI
- Best use cases: **large features** (parallel tracks), **QA swarms** (multiple testing perspectives), **competing hypotheses** (debate and converge)
- The trade-off is real: more agents = more tokens = more cost
- **Best recipe**: plan first with plan mode (cheap), then hand the plan to a team for parallel execution (expensive but fast). The plan gives you a checkpoint before committing tokens.
- Start with subagents for focused work, graduate to teams when workers need to coordinate
- For background on the task system that teams build on, see my [spec-driven development post](https://alexop.dev/posts/spec-driven-development-claude-code-in-action/) Spec-Driven Development with Claude Code in Action A practical workflow for tackling large refactors with Claude Code using parallel research subagents, written specs, and the new task system for context-efficient implementation. claude-codeailocal-first +1 Feb 1, 2026
