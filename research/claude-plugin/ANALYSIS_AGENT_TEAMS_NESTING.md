# Agent Teams as Solution to the Subagent Nesting Constraint

Analysis of whether Claude Code agent teams can solve the subagent nesting constraint that blocks `llm_query()` in the RLM plugin's REPL sandbox.

> **Context:** The RLM plugin requires `repl-executor` (a subagent) to call `llm_query()`, which needs to spawn `haiku-searcher` (another subagent). Subagents cannot spawn other subagents. This analysis evaluates agent teams as a workaround and recommends an implementation approach for v0.0.1.
>
> **Analysis date:** 2026-03-04

## TL;DR

- Agent teams **flatten** the nesting constraint by making `repl-executor` and `haiku-searcher` peer teammates rather than parent-child subagents. The main session acts as team lead, orchestrating both.
- However, agent teams introduce a **synchronous-to-asynchronous mismatch**: the REPL's `llm_query(prompt)` expects a blocking return value, but teammate messaging is asynchronous. This transforms the sequential fill/solve loop into an event-driven state machine -- a fundamental architecture change.
- Agent teams **multiply tokens 3-10x** [SYNTHESIS, section 6.1], directly opposing the RLM plugin's core value of 2-5x token _reduction_ [PROJECT.md]. An RLM explore using agent teams could net-increase tokens compared to a single Explore subagent.
- **Recommendation: Ship v0.0.1 without `llm_query()` (approach 4c).** The REPL already has deterministic globals (`search()`, `files()`, `read()`, `deps()`) that handle the vast majority of workspace navigation without any LLM sub-calls. Validate the core RLM thesis first; add `llm_query()` later only if empirical evidence shows it is needed.
- The `haiku-searcher` requirement should **remain deferred** in PROJECT.md. The "subagent nesting constraint" note should be updated to reference this analysis.
- If `llm_query()` is eventually needed, **approach 4a** (main session drives the REPL loop directly) is the simplest path that avoids the nesting problem entirely.

---

## Table of Contents

- [1. Problem Statement](#1-problem-statement)
- [2. Can Agent Teams Solve This?](#2-can-agent-teams-solve-this)
  - [2a. What Agent Teams Enable](#2a-what-agent-teams-enable)
  - [2b. What Agent Teams Do NOT Solve](#2b-what-agent-teams-do-not-solve)
- [3. Token Cost Tension](#3-token-cost-tension)
- [4. Alternative Approaches](#4-alternative-approaches)
  - [4a. Main Session Drives the REPL Loop Directly](#4a-main-session-drives-the-repl-loop-directly)
  - [4b. Single Agent with Internal Search](#4b-single-agent-with-internal-search)
  - [4c. Hybrid: Deferred llm_query() with Deterministic Fallbacks](#4c-hybrid-deferred-llm_query-with-deterministic-fallbacks)
  - [4d. Agent Teams for High-Value Scenarios Only](#4d-agent-teams-for-high-value-scenarios-only)
- [5. Recommendation](#5-recommendation)
- [6. Impact on ROADMAP and PROJECT.md](#6-impact-on-roadmap-and-projectmd)
- [Source Materials](#source-materials)

---

## 1. Problem Statement

The RLM plugin's architecture requires a depth-2 agent call chain:

```
main session -> repl-executor (subagent) -> haiku-searcher (subagent)
```

This chain is blocked by a hard constraint in Claude Code:

> "Subagents cannot spawn other subagents."
> -- [sub-agents.md], line 46 (Plan subagent description), line 207 (Agent tool restriction note)

The `repl-executor` subagent drives the RLM fill/solve loop in an isolated context window. During the "fill phase," the REPL code may call `llm_query(prompt)`, which is designed to route mechanical search tasks to `haiku-searcher` -- a Haiku-powered subagent specialized for bounded search operations [BRAINSTORM.md, section 5a]. Since `repl-executor` is itself a subagent, it cannot spawn `haiku-searcher`. The nesting depth is only 2, but the constraint is binary: nesting depth > 1 is not supported.

This constraint led to the current deferral in PROJECT.md:

> "`haiku-searcher` agent handles mechanical search tasks as the `llm_query()` target for REPL sub-calls (deferred to a later milestone -- subagent nesting constraint)"
> -- [PROJECT.md], Active Requirements

The question: can agent teams provide a viable workaround?

---

## 2. Can Agent Teams Solve This?

### 2a. What Agent Teams Enable

Agent teams restructure the hierarchy from nested parent-child to flat peer-to-peer:

**Before (subagent nesting -- blocked):**

```
main session
  └── repl-executor (subagent)
        └── haiku-searcher (subagent)  <-- BLOCKED: depth 2
```

**After (agent teams -- flat):**

```
main session (team lead)
  ├── repl-executor (teammate)
  └── haiku-searcher (teammate)
```

In the agent team model:

1. The **main session** creates a team and spawns both `repl-executor` and `haiku-searcher` as peer teammates [agent-teams.md, Architecture section].
2. Communication happens via **SendMessage** instead of subagent spawning. When `repl-executor` needs a search, it messages `haiku-searcher` directly through the mailbox system [agent-teams.md, Context and communication section].
3. Neither teammate needs to spawn the other -- they are **siblings**, not parent-child. The team lead (main session) orchestrates both.
4. The "no nested teams" constraint [agent-teams.md, line 338] prevents _teammates_ from spawning their own teams, but this is irrelevant here because neither teammate needs to create a team. They only need to exchange messages.

This architecture technically eliminates the nesting constraint. Both agents exist at depth 1 from the main session and communicate laterally.

### 2b. What Agent Teams Do NOT Solve

While agent teams eliminate the nesting constraint, they introduce three new problems that are arguably worse:

#### Problem 1: Synchronous-to-Asynchronous Mismatch

The REPL fill/solve loop is **synchronous**. The execution model looks like this:

```javascript
// Inside repl-executor's fill/solve loop
for (let i = 0; i < maxIterations; i++) {
  const code = await llm.generateCode(messages); // LLM generates REPL code
  const result = sandbox.execute(code); // Runs in VM -- may call llm_query()
  if (sandbox.getFinalAnswer()) return finalAnswer;
  messages.push(formatResult(result));
}
```

When REPL code calls `llm_query("find all stores in cms/")`, the expectation is a **blocking call** that returns a string result inline:

```javascript
// Inside the REPL sandbox (user-generated code)
let stores = llm_query('find all ComponentStore files in libs/connect/cms/');
// 'stores' is immediately available as a string
let storeCount = stores.split('\n').length;
print(`Found ${storeCount} stores in CMS domain`);
```

Agent team messaging is **asynchronous**. When `repl-executor` sends a message to `haiku-searcher`, it does not receive a synchronous return value. Instead:

1. `repl-executor` sends a message via `SendMessage`
2. `repl-executor` goes idle (or continues other work)
3. `haiku-searcher` receives the message, performs the search, sends a response
4. `repl-executor` receives the response in its mailbox

This means `llm_query(prompt)` cannot be a synchronous function call that returns a value inline. The REPL code would need to **yield** after each `llm_query()` call and **resume** when the response arrives. This transforms the sequential fill/solve loop into an **event-driven state machine**:

```
// Conceptual (NOT actual API -- illustrative of the complexity)
REPL iteration 1: execute code up to llm_query() -> yield, send message
  [wait for haiku-searcher response]
REPL iteration 1 (resumed): inject response, continue execution
  [may hit another llm_query() -> yield again]
```

This is a fundamental architecture change. The RLM paper's execution model and both reference implementations (Hampton-io/RLM, code-rabi/rllm) assume synchronous REPL execution [BRAINSTORM.md, section 2a]. Converting to async would require:

- Coroutine or generator-based REPL execution (pausing mid-code-block)
- Message queue management within the REPL sandbox
- State serialization/restoration across yields
- Timeout handling for teammate non-response

This is feasible but represents a significant increase in complexity for the REPL core -- the component already identified as highest-risk in PROJECT.md.

#### Problem 2: "No Nested Teams" Still Applies

The "no nested teams" constraint means:

> "Teammates cannot spawn their own teams or teammates. Only the lead can manage the team."
> -- [agent-teams.md], Limitations section

This means the team lead (main session) **must** be the one creating and managing the team. If the main session is the team lead, the `repl-executor` teammate cannot itself create sub-teams or spawn additional agents. The architecture is strictly flat -- one level of teammates under one lead.

This works for the two-agent case (`repl-executor` + `haiku-searcher`), but does not scale if future requirements need deeper nesting (e.g., `haiku-searcher` needing its own sub-workers).

#### Problem 3: Team Lifecycle Overhead

Agent teams are designed for sustained parallel work sessions, not for rapid fire-and-forget sub-calls. Each team requires:

1. **Team creation** (`TeamCreate`) -- sets up directory structure, config file
2. **Task creation** (`TaskCreate`) -- defines work items
3. **Teammate spawning** (`Task` with `team_name`) -- each teammate loads CLAUDE.md, MCP servers, skills
4. **Mailbox management** -- message delivery between teammates
5. **Team shutdown** -- graceful shutdown requests, acknowledgements
6. **Team cleanup** (`TeamDelete`) -- removes team config and task files

For the RLM explore skill, a typical query takes 3-5 REPL iterations [BRAINSTORM.md, section 3a, token projections table]. If each iteration might call `llm_query()` once, that is 3-5 messages between teammates. The team lifecycle overhead (creation, spawning, shutdown, cleanup) would dwarf the actual work -- like renting an office building for a five-minute meeting.

---

## 3. Token Cost Tension

The RLM plugin's core value proposition is **token reduction**:

> "Claude can navigate and understand a large Nx workspace without burning context on intermediate exploration results."
> -- [PROJECT.md], Core Value

The projected savings are 2-5x for single queries and 3-9x for multi-query sessions [BRAINSTORM.md, section 11]:

| Operation                | Without RLM     | With RLM      | Savings |
| ------------------------ | --------------- | ------------- | ------- |
| Single exploration query | 35-70K tokens   | 12-20K tokens | 2-5x    |
| 10-query session         | 175-700K tokens | 50-80K tokens | 3-9x    |

Agent teams **multiply** token usage:

| Source                 | Reported multiplier                                           |
| ---------------------- | ------------------------------------------------------------- |
| Anthropic official     | "3-10x more tokens" [SYNTHESIS, section 6.1]                  |
| alexop blog (measured) | Solo ~200K, 3-person team ~800K (4x) [SYNTHESIS, section 6.1] |
| Anthropic costs page   | "~7x more tokens in plan mode" [SYNTHESIS, section 6.1]       |

These forces directly oppose each other. Consider the token math for a single explore query:

| Approach                  | Token estimate | Calculation                                                                       |
| ------------------------- | -------------- | --------------------------------------------------------------------------------- |
| Standard Explore (no RLM) | 35-70K         | Baseline [BRAINSTORM.md, section 3a]                                              |
| RLM with Haiku sub-calls  | 16-20K         | 8K Sonnet root + 3-5 iterations x 2K + 1-2 Haiku x 1K [BRAINSTORM.md, section 3a] |
| RLM with agent team       | 50-200K        | 16-20K base x 3-10x team multiplier                                               |

An RLM plugin using agent teams for basic exploration could **net-increase** tokens compared to simply using a single Explore subagent without RLM at all. The token savings from RLM navigation would be wiped out by the agent team coordination overhead.

The BRAINSTORM_AGENT_TEAMS.md document already identifies this tension:

> "The RLM plugin's core value proposition is token reduction -- 2-9x savings by navigating code without loading it into context. Agent teams multiply token usage by 3-10x. These forces directly oppose each other."
> -- [BRAINSTORM_AGENT_TEAMS.md], "The Fundamental Tension" section

That document restricts agent teams to specific high-value scenarios (debug, audit, review, refactor, migrate) -- **not** core exploration. The `llm_query()` use case falls squarely in the "core exploration" category where agent teams are explicitly marked as inappropriate.

---

## 4. Alternative Approaches

### 4a. Main Session Drives the REPL Loop Directly

Instead of delegating to a `repl-executor` subagent, the main session itself runs the REPL fill/solve loop.

**How it works:** The main session generates REPL code, executes it in the sandbox, and iterates. Since the main session is the root (not a subagent), it CAN spawn subagents. When REPL code calls `llm_query()`, it routes to `haiku-searcher` as a standard subagent -- no nesting problem.

```
main session (runs REPL loop directly)
  └── haiku-searcher (subagent, spawned on llm_query())
```

| Aspect                  | Assessment                                              |
| ----------------------- | ------------------------------------------------------- |
| Nesting problem         | Eliminated -- main session is root, can spawn subagents |
| Synchronous flow        | Preserved -- subagent returns result to caller          |
| Architecture complexity | Lowest -- no teams, no async messaging                  |
| Token cost              | Lowest -- no team overhead                              |

**Cons:**

- REPL iterations **pollute the main conversation context**. The entire purpose of `repl-executor` is to isolate REPL iterations in a separate context window so intermediate code, output, and navigation steps never enter the main conversation. Without this isolation, 10-20 REPL iterations worth of code and output accumulate in the main context, causing the very context rot that RLM is designed to prevent.
- **Mitigation:** The main session could use `/compact` or auto-compaction after the REPL loop to clean up intermediate context. However, compaction is lossy -- it may discard findings that the user's follow-up questions depend on.

**Verdict:** Simplest architecture, but sacrifices the core context-isolation benefit that justifies `repl-executor` as a subagent.

### 4b. Single Agent with Internal Search

Remove `llm_query()` from the REPL sandbox entirely. The `repl-executor` subagent uses its own reasoning (Sonnet) for any queries that would have gone to `haiku-searcher`.

**How it works:** The REPL globals (`search()`, `files()`, `read()`, `deps()`) handle mechanical search deterministically. For any semantic understanding tasks, the `repl-executor` subagent reasons about the results itself rather than delegating to Haiku.

| Aspect                  | Assessment                                                          |
| ----------------------- | ------------------------------------------------------------------- |
| Nesting problem         | Eliminated -- no haiku-searcher at all                              |
| Architecture complexity | Simplest -- single subagent, no coordination                        |
| Token cost              | Slightly higher per-iteration (Sonnet > Haiku for mechanical tasks) |
| Context isolation       | Preserved -- repl-executor is still a subagent                      |

**Key insight:** The original RLM paper uses `llm_query()` for sub-problems that need LLM reasoning [BRAINSTORM.md, section 2a]. But the Nx workspace use case may not need LLM-powered sub-queries. Most "search" tasks can be handled by the deterministic `search()` global (git grep) without any LLM:

```javascript
// These do NOT need an LLM:
let stores = search('extends ComponentStore', ['libs/connect/cms/']);
let deps = deps('connect-shared-users-data-access');
let files = files('libs/**/*.store.ts');
let content = read(
  'libs/connect/cms/analytics/data-access/src/lib/analytics.store.ts',
);

// Only this arguably needs an LLM:
let answer = llm_query(
  'Summarize the state management pattern used in this store',
);
```

The question is whether that last case -- semantic summarization during navigation -- occurs frequently enough to justify the architectural complexity of `llm_query()`.

**Cons:**

- Sonnet is ~8x more expensive than Haiku per token [SYNTHESIS, section 6.3]. For mechanical search tasks (finding files, grepping patterns), using Sonnet is wasteful.
- However, if the REPL globals handle most mechanical work, the Sonnet cost only applies to the reasoning/synthesis steps that need a capable model anyway.

**Verdict:** Good default. The cost premium of Sonnet over Haiku for occasional reasoning steps is negligible compared to the architectural complexity of supporting `llm_query()`.

### 4c. Hybrid: Deferred llm_query() with Deterministic Fallbacks

Ship v0.0.1 without `llm_query()`. The `repl-executor` uses only deterministic globals for exploration. Add `llm_query()` later only if empirical testing shows it is needed.

**How it works:** This is the current plan as expressed in PROJECT.md and ROADMAP.md. The REPL sandbox provides `search()`, `files()`, `read()`, `deps()`, `dependents()`, `nx()`, `print()`, `FINAL()`, `FINAL_VAR()`, and `SHOW_VARS()` [PROJECT.md, REPL Sandbox Design]. None of these require LLM sub-calls. The `repl-executor` subagent generates REPL code using these globals, iterates through fill/solve, and returns a FINAL answer.

| Aspect                  | Assessment                                                   |
| ----------------------- | ------------------------------------------------------------ |
| Nesting problem         | Not applicable -- no llm_query() in v0.0.1                   |
| Architecture complexity | Lowest for v0.0.1                                            |
| Token cost              | Lowest -- deterministic globals are zero LLM tokens          |
| Risk                    | Lowest -- validates core RLM thesis before adding complexity |
| Context isolation       | Preserved -- repl-executor is still a subagent               |

**Pros:**

- **Ship faster.** The REPL core (Phase 2) and agent integration (Phase 3) are already the highest-risk components. Adding `llm_query()` support increases risk and timeline.
- **Validate the core thesis first.** The fundamental question is: "Does the RLM REPL approach reduce tokens compared to standard exploration?" This can be answered with deterministic globals alone. If the answer is "no," then `llm_query()` is irrelevant because the whole approach needs rework.
- **Avoid premature complexity.** The sync/async mismatch (section 2b) is a real architectural challenge. Adding it before proving the basic approach works is premature optimization.
- **Deterministic globals cover most use cases.** The workspace index, git grep via `search()`, and targeted `read()` handle the vast majority of codebase navigation tasks. The RLM paper's `llm_query()` was designed for general-purpose data exploration; the Nx workspace has structured metadata (project graph, path aliases, dependency edges) that deterministic queries handle efficiently.

**Cons:**

- Some queries that need **semantic understanding** (not just pattern matching) will fail or require more REPL iterations. Example: "Which stores in the cms domain violate the AGENTS.md naming conventions?" -- this requires understanding naming conventions, not just finding stores.
- The `repl-executor` (Sonnet) can still reason about results from deterministic globals. It just cannot offload bounded sub-tasks to Haiku. This means Sonnet handles everything, which is slightly more expensive per-token but avoids the coordination overhead entirely.

**Verdict:** Recommended for v0.0.1. Aligns with the existing PROJECT.md and ROADMAP.md plans. Minimizes risk and validates the core approach first.

### 4d. Agent Teams for High-Value Scenarios Only

Keep the core explore skill using subagents (no `llm_query()`). Add agent teams only for the specific scenarios already identified in BRAINSTORM_AGENT_TEAMS.md: debug, review, refactor, migrate.

**How it works:** The explore skill uses `repl-executor` as a standard subagent with deterministic globals. Separately, the plugin offers team-based skills (`/rlm:debug`, `/rlm:review`, `/rlm:refactor`, `/rlm:migrate`) where the token multiplier is justified by the value of parallel investigation, adversarial reasoning, or parallel library modification.

| Aspect                  | Assessment                                                                 |
| ----------------------- | -------------------------------------------------------------------------- |
| Nesting problem         | Not applicable -- explore uses subagent, teams are separate skills         |
| Architecture complexity | Moderate -- two modes (subagent for explore, teams for specific scenarios) |
| Token cost              | Optimized per use case                                                     |
| Context isolation       | Preserved for explore; team skills have their own isolation model          |

**Key insight from BRAINSTORM_AGENT_TEAMS.md:** The decision framework explicitly routes most RLM operations to the "use RLM sub-calls (cheaper, faster)" path. Only debug, audit, review, refactor, and migrate reach the "USE AGENT TEAMS" endpoint [BRAINSTORM_AGENT_TEAMS.md, Decision Framework].

This approach does NOT solve the `llm_query()` nesting problem -- it sidesteps it by not using `llm_query()` in the explore path, and using agent teams where they genuinely add value (competing hypotheses, parallel library ownership).

**Verdict:** Correct long-term architecture. The team-based skills are already deferred to "a later milestone" in PROJECT.md. Not relevant for v0.0.1.

---

### Comparison Table

| Approach                                   | Nesting Solved? | Sync Flow? | Context Isolation? |  Token Overhead  |  v0.0.1 Viable?  |
| ------------------------------------------ | :-------------: | :--------: | :----------------: | :--------------: | :--------------: |
| **Agent teams for llm_query()**            |       Yes       | No (async) |        Yes         | 3-10x multiplier |        No        |
| **4a. Main session drives REPL**           |       Yes       |    Yes     | No (pollutes main) |       Low        |     Possible     |
| **4b. Single agent, no haiku-searcher**    |       N/A       |    Yes     |        Yes         | Slightly higher  |       Yes        |
| **4c. Deferred llm_query() (recommended)** |       N/A       |    Yes     |        Yes         |      Lowest      |       Yes        |
| **4d. Teams for high-value only**          |       N/A       |    Yes     |        Yes         |    Optimized     | Future milestone |

---

## 5. Recommendation

### For v0.0.1: Approach 4c -- Deferred llm_query() with Deterministic Fallbacks

**Ship without `llm_query()`.** The REPL sandbox's deterministic globals (`search()`, `files()`, `read()`, `deps()`, `dependents()`, `nx()`) cover the workspace navigation use cases that the RLM explore skill targets. The `repl-executor` subagent (Sonnet) provides the reasoning layer; deterministic globals provide the data access layer. No LLM sub-calls are needed for this architecture.

**The `haiku-searcher` requirement should remain deferred.** The subagent nesting constraint is real, but it is not a blocker because `llm_query()` is not needed for v0.0.1.

### Conditions for Revisiting

Revisit this decision if empirical testing of the v0.0.1 explore skill reveals any of these signals:

1. **Excessive REPL iterations.** If queries consistently require 15+ iterations (near the `maxIterations` guardrail of 20) because the `repl-executor` cannot delegate bounded sub-tasks, then `llm_query()` may reduce iteration count.
2. **Semantic understanding gaps.** If common user queries require understanding code semantics (not just finding code), and the `repl-executor`'s own reasoning about `search()` results is insufficient, then LLM sub-calls may be needed.
3. **Token savings below threshold.** If the explore skill does NOT achieve at least 1.5x token reduction compared to the standard Explore subagent, then the REPL approach needs rework -- and `llm_query()` might be part of the solution (or might be irrelevant if the whole approach fails).

### If llm_query() Is Eventually Needed

If revisiting the decision, **approach 4a (main session drives the REPL loop)** is the simplest path. It eliminates the nesting problem entirely by making the main session the REPL driver, which can spawn `haiku-searcher` as a standard subagent. The context-isolation trade-off can be mitigated with compaction or by limiting the number of REPL iterations before returning a result.

**Do NOT use agent teams for `llm_query()`.** The synchronous-to-asynchronous mismatch (section 2b) and the token cost tension (section 3) make agent teams a poor fit for high-frequency, low-latency sub-calls within the REPL loop.

---

## 6. Impact on ROADMAP and PROJECT.md

### PROJECT.md

**The `haiku-searcher` requirement should remain deferred.** The current wording is accurate:

> "`haiku-searcher` agent handles mechanical search tasks as the `llm_query()` target for REPL sub-calls (deferred to a later milestone -- subagent nesting constraint)"

**Suggested wording update** to reference this analysis:

> "`haiku-searcher` agent handles mechanical search tasks as the `llm_query()` target for REPL sub-calls (deferred -- subagent nesting constraint; see `research/claude-plugin/ANALYSIS_AGENT_TEAMS_NESTING.md` for evaluation of agent teams as workaround and alternative approaches)"

**The `llm_query()` REPL global** should remain listed in the REPL Sandbox Design table in PROJECT.md as a documented global, but with a note that it is not implemented in v0.0.1. This preserves it as a future extension point without committing to implementation.

### ROADMAP.md

**Phase 3 description needs no change.** The current description focuses on `repl-executor` and the explore skill, which do not depend on `llm_query()`:

> "repl-executor subagent driving the REPL loop and the explore skill validating the RLM token-savings thesis"

The success criteria for Phase 3 also do not reference `llm_query()` or `haiku-searcher`. No changes needed.

### Phase 2 (REPL Core)

**`llm_query()` should remain as a documented extension point but NOT be implemented.** The REPL sandbox design in PROJECT.md lists `llm_query(prompt, model?)` as a global. For Phase 2 implementation:

- The global should be defined in the sandbox but should throw a clear error: `"llm_query() is not available in v0.0.1. Use search(), files(), and read() for codebase navigation."`
- This preserves forward compatibility: when `llm_query()` is implemented later, REPL code that uses it will work without sandbox API changes.
- The `repl-executor` agent's system prompt should NOT reference `llm_query()` -- it should only describe the available deterministic globals. This prevents the LLM from generating code that calls an unimplemented function.

### "Agent teams features" in Out of Scope

The current PROJECT.md Out of Scope section already includes:

> "Agent teams features (debug, review, refactor, migrate) -- deferred to later milestone; requires proven foundation"

This is correct and should remain. Agent teams are the right tool for those specific scenarios [BRAINSTORM_AGENT_TEAMS.md], but they are not the right tool for `llm_query()` within the REPL loop.

---

## Source Materials

| Reference                   | Path                                               | Relevance                                                              |
| --------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------- |
| [PROJECT.md]                | `.planning/PROJECT.md`                             | Active requirements, REPL sandbox design, haiku-searcher deferral      |
| [ROADMAP.md]                | `.planning/ROADMAP.md`                             | Phase structure, success criteria                                      |
| [BRAINSTORM.md]             | `research/claude-plugin/BRAINSTORM.md`             | RLM plugin design, token projections, execution loop                   |
| [BRAINSTORM_AGENT_TEAMS.md] | `research/claude-plugin/BRAINSTORM_AGENT_TEAMS.md` | Agent teams integration proposals, decision framework, token economics |
| [agent-teams.md]            | `research/claude-agent-teams/agent-teams.md`       | Official agent teams documentation, architecture, limitations          |
| [sub-agents.md]             | `research/claude-agent-teams/sub-agents.md`        | Subagent nesting constraint, configuration options                     |
| [SYNTHESIS.md]              | `research/claude-agent-teams/SYNTHESIS.md`         | Research synthesis, token cost multipliers, best practices             |
