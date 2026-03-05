# RLM Claude Code Plugin -- Agent Teams Brainstorm

Brainstorm proposals for integrating Claude Code agent teams into the RLM plugin. Synthesized from the [RLM plugin brainstorm](BRAINSTORM.md) and the [agent teams research synthesis](../../claude-agent-teams/SYNTHESIS.md).

> **Target workspace:** Connect `ng-app-monolith` -- Nx 19.8, Angular 18, ~1.5-2M LOC, ~1,700 Angular components, 537 Nx projects.
> **Scope:** Nx Angular TypeScript workspace only (no .NET backend).
> **Brainstorm date:** 2026-03-03

## Table of Contents

- [The Fundamental Tension](#the-fundamental-tension)
- [Decision Framework: Teams vs. Sub-Calls](#decision-framework-teams-vs-sub-calls)
- [1. RLM Components That Should NOT Use Agent Teams](#1-rlm-components-that-should-not-use-agent-teams)
- [2. Proposals Where Agent Teams Add Value](#2-proposals-where-agent-teams-add-value)
  - [2a. /rlm:debug -- Adversarial Debugging Across Nx Boundaries](#2a-rlmdebug----adversarial-debugging-across-nx-boundaries)
  - [2b. /rlm:patterns -- Domain-Partitioned Pattern Audit](#2b-rlmpatterns----domain-partitioned-pattern-audit)
  - [2c. /rlm:review -- Multi-Lens Code Review](#2c-rlmreview----multi-lens-code-review)
  - [2d. /rlm:refactor -- Parallel Library Refactoring](#2d-rlmrefactor----parallel-library-refactoring)
  - [2e. /rlm:migrate -- Large-Scale Migration Execution](#2e-rlmmigrate----large-scale-migration-execution)
- [3. Hybrid Architecture: RLM + Agent Teams](#3-hybrid-architecture-rlm--agent-teams)
  - [3a. REPL-Equipped Teammates](#3a-repl-equipped-teammates)
  - [3b. Lead as RLM Orchestrator](#3b-lead-as-rlm-orchestrator)
  - [3c. Workspace Index as Shared Context](#3c-workspace-index-as-shared-context)
- [4. Agent Team Definitions](#4-agent-team-definitions)
  - [4a. debug-team -- Adversarial Debugging](#4a-debug-team----adversarial-debugging)
  - [4b. audit-team -- Pattern Audit](#4b-audit-team----pattern-audit)
  - [4c. review-team -- Multi-Lens Review](#4c-review-team----multi-lens-review)
  - [4d. refactor-team -- Parallel Refactoring](#4d-refactor-team----parallel-refactoring)
- [5. Quality Gates for Agent Teams](#5-quality-gates-for-agent-teams)
  - [5a. TaskCompleted Hook -- Verification Before Completion](#5a-taskcompleted-hook----verification-before-completion)
  - [5b. TeammateIdle Hook -- Progress Enforcement](#5b-teammateidle-hook----progress-enforcement)
- [6. Token Economics Analysis](#6-token-economics-analysis)
  - [6a. Cost Comparison: RLM Sub-Calls vs. Agent Teams](#6a-cost-comparison-rlm-sub-calls-vs-agent-teams)
  - [6b. Break-Even Analysis](#6b-break-even-analysis)
  - [6c. Cost Optimization Strategies](#6c-cost-optimization-strategies)
- [7. Workflow Examples](#7-workflow-examples)
- [8. Plugin Structure Additions](#8-plugin-structure-additions)
- [9. Open Questions](#9-open-questions)

---

## The Fundamental Tension

The RLM plugin's core value proposition is **token reduction** -- 2-9x savings by navigating code without loading it into context [[RLM brainstorm, section 11]]. Agent teams **multiply** token usage by 3-10x per the research corpus [[agent teams synthesis, section 6.1]]. These forces directly oppose each other.

This means agent teams should only be introduced where their unique capabilities -- adversarial reasoning, competing hypotheses, parallel ownership of independent file sets -- provide value that **cannot be replicated** by the cheaper RLM sub-call architecture (root LLM + isolated Haiku sub-calls).

The question is not "can agent teams do this?" but "does the 3-10x token multiplier buy something the REPL + Haiku sub-calls cannot?"

---

## Decision Framework: Teams vs. Sub-Calls

Use this decision tree when evaluating whether a plugin feature should use agent teams or the RLM sub-call architecture:

```
Does the task require agents to SHARE FINDINGS and CHALLENGE each other?
|-- No  --> Use RLM sub-calls (cheaper, faster)
`-- Yes --> Do agents need to EDIT DIFFERENT FILES simultaneously?
            |-- No  --> Use RLM sub-calls with verification subagent
            `-- Yes --> Do the files have CLEAR OWNERSHIP BOUNDARIES?
                        |-- No  --> Restructure the task or use sequential work
                        `-- Yes --> Does the task justify 3-10x token cost?
                                    |-- No  --> Use RLM sub-calls
                                    `-- Yes --> USE AGENT TEAMS
```

In practice, most RLM plugin operations follow the left branch (no inter-agent communication needed). The proposals below target the narrow set of operations that reach the right branch.

---

## 1. RLM Components That Should NOT Use Agent Teams

These components from the RLM brainstorm are inherently incompatible with agent teams. Documenting this prevents future over-engineering.

| Component                        | Why Not Agent Teams                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| **Workspace index** (Section 1)  | Zero LLM tokens -- pure Node.js scripts                                                     |
| **REPL engine** (Section 2)      | Sequential fill-solve loop; each iteration depends on the previous                          |
| **`/rlm:explore`** (Section 3a)  | REPL + Haiku sub-calls at ~16-20K tokens; agent teams would multiply to 50-200K             |
| **`/rlm:impact`** (Section 3b)   | Script + REPL at ~15K tokens; deterministic dependency traversal has no need for discussion |
| **`/rlm:analyze`** (Section 3c)  | Partition+map with Haiku sub-calls is already parallel and cheaper                          |
| **`/rlm:test-gen`** (Section 3d) | Haiku generates individual `it()` blocks; no inter-block coordination needed                |
| **`/rlm:search`** (Section 3e)   | Classification + deterministic search; too fast for team coordination overhead              |
| **`/rlm:trace`** (Section 3f)    | Data flow is inherently sequential (A -> B -> C); parallelization doesn't help              |
| **Commands** (Section 4)         | Zero LLM tokens by design                                                                   |
| **Hooks** (Section 6)            | Fast-path intercepts where team latency is counterproductive                                |

**Common thread:** These components either involve zero LLM tokens, inherently sequential logic, or mechanical tasks where Haiku sub-calls provide sufficient parallelism without the coordination overhead of a full team.

---

## 2. Proposals Where Agent Teams Add Value

### 2a. `/rlm:debug` -- Adversarial Debugging Across Nx Boundaries

**New skill** (not in the original RLM brainstorm).

**Why agent teams:** Debugging at monolith scale is the strongest use case identified in the agent teams research [[synthesis, section 3.2]]. Sequential investigation suffers from **anchoring bias** -- once one theory is explored, subsequent investigation is biased toward it. In a 537-project workspace, a bug that manifests in a feature component may originate in a shared data-access library, a store effect, or a route guard. A single agent exploring sequentially will anchor on the first plausible theory and may never consider alternatives.

**How it works:**

1. User describes the bug: "The level-up notification doesn't appear after achievement unlock"
2. Lead (Opus/Sonnet) uses the workspace index to identify the relevant Nx libraries:
   - `connect-ufa-level-up-feature-*` (UI layer)
   - `connect-ufa-level-up-data-access` (store/API layer)
   - `connect-shared-notification-*` (notification system)
3. Lead spawns 2-3 teammates, each investigating a different hypothesis:
   - **Teammate A** (Sonnet): "The store effect doesn't dispatch the notification action" -- investigates the ComponentStore effect chain in `data-access`
   - **Teammate B** (Sonnet): "The notification component doesn't render for this notification type" -- investigates the notification feature library
   - **Teammate C** (Sonnet): "The API response doesn't include the achievement data" -- investigates the API client and response handling
4. Each teammate has a REPL sandbox with the workspace index pre-loaded (see [3a. REPL-Equipped Teammates](#3a-repl-equipped-teammates))
5. Teammates share findings via direct messages: "I confirmed the store effect dispatches correctly -- the notification action payload is `{ type: 'achievement', ... }`"
6. Lead synthesizes findings, identifies the root cause, proposes the fix

**Why this needs agent teams, not sub-calls:** Sub-calls are fire-and-forget -- the Haiku sub-call cannot say "I found something unexpected, teammate B should check whether their component handles this edge case." The mailbox communication in agent teams enables this adaptive investigation pattern.

**File ownership:** Each teammate owns a different set of Nx libraries. The workspace's library naming convention (`libs/<product>/<application>/<domain>/<type>-<name>`) provides natural ownership boundaries.

**Token projection:**

| Approach                        | Tokens                                            | Quality                                                       |
| ------------------------------- | ------------------------------------------------- | ------------------------------------------------------------- |
| Single agent, sequential        | 60-120K (context rot by theory 3)                 | Anchoring bias, may miss root cause                           |
| RLM sub-calls (Haiku)           | 25-40K (cheap, but no inter-theory communication) | Theories investigated independently, no cross-pollination     |
| Agent team (3 Sonnet teammates) | 80-150K                                           | Competing hypotheses, shared findings, adaptive investigation |

**When to use:** Only for bugs that span multiple Nx library boundaries. For bugs isolated to a single library, `/rlm:explore` is cheaper and sufficient.

### 2b. `/rlm:patterns` -- Domain-Partitioned Pattern Audit

**Enhancement to existing RLM brainstorm proposal** (Section 3g).

The original brainstorm proposes 34 sequential batches of Haiku sub-calls for auditing 1,700 components. This works for mechanical pattern detection (regex-like scanning). Agent teams add value for the subset of audits that require **semantic judgment across domains**.

**When to use agent teams:** Audit questions like "Are the ComponentStore patterns in `cms/` consistent with the conventions in `ufa/`?" or "Which libraries deviate from the AGENTS.md testing patterns?" require comparing patterns across domains, not just detecting them within a domain.

**How it works:**

1. Lead partitions the workspace by product domain using the workspace index:
   - `connect/cms/*` (~120 components)
   - `connect/ufa/*` (~200 components)
   - `connect/shared/*` (~80 components)
   - Remaining domains as a fourth partition
2. Lead spawns 3-4 teammates, one per domain partition
3. Each teammate uses the REPL to scan their partition:
   - `files("libs/connect/cms/**/*.component.ts")` -> component list
   - `search("extends ComponentStore", ["libs/connect/cms/"])` -> stores
   - Haiku sub-calls classify each file against the audit criteria
4. Each teammate produces a structured findings report for their domain
5. Lead compares findings across domains, identifies cross-domain inconsistencies
6. Lead synthesizes the final audit report

**vs. pure Haiku sub-calls:** The Haiku approach scans files but cannot compare patterns across partitions. The audit question "are `cms/` stores consistent with `ufa/` stores?" requires a reasoning step that Haiku sub-calls cannot perform because they are isolated. The lead could do this comparison from the Haiku results, but the per-domain investigation benefits from deeper context that a teammate with a full REPL provides.

**When to fall back to Haiku sub-calls:** For mechanical audits where the answer is binary (e.g., "does this component use `OnPush`?"), the original Haiku sub-call approach from the RLM brainstorm is 5-10x cheaper and equally accurate.

**Token projection:**

| Approach                        | Tokens                                            | Suitable for                                         |
| ------------------------------- | ------------------------------------------------- | ---------------------------------------------------- |
| Haiku sub-calls (original)      | ~850K Haiku (isolated, ~$0.21) + ~3K conversation | Mechanical detection (OnPush, constructor injection) |
| Agent team (4 Sonnet teammates) | ~200-400K Sonnet + Haiku sub-calls within each    | Semantic comparison across domains                   |

### 2c. `/rlm:review` -- Multi-Lens Code Review

**New skill** (not in the original RLM brainstorm).

**Why agent teams:** The research identifies parallel code review with specialized lenses as a strong use case [[synthesis, section 3.1]]. A single reviewer suffers from attentional bias -- once focused on one aspect (e.g., performance), other aspects (e.g., pattern compliance) get less attention.

**How it works:**

1. User provides the review target: a set of changed files, a branch diff, or a specific library
2. Lead determines the relevant review lenses based on what changed:
   - **Angular patterns reviewer** (Sonnet): Checks against AGENTS.md conventions -- standalone components, OnPush, `inject()` over constructor injection, proper template control flow, ComponentStore patterns
   - **Testing reviewer** (Sonnet): Verifies test coverage, SIFERS pattern, Testing Library usage, proper mocking patterns
   - **Nx architecture reviewer** (Haiku): Checks library boundaries, import rules, public API exposure, no deep imports
3. Each reviewer operates on the same diff but with a specialized system prompt and focused concerns
4. Reviewers share findings when they discover cross-cutting issues: "The new component doesn't have OnPush, AND its test file uses `fixture.detectChanges()` instead of Testing Library"
5. Lead merges findings into a unified review

**File ownership:** All reviewers read the same files but do not edit anything -- this is a read-only operation, so the "no same-file edits" constraint does not apply.

**Token projection:**

| Approach                 | Tokens  | Coverage                                        |
| ------------------------ | ------- | ----------------------------------------------- |
| Single agent review      | 30-60K  | Attentional bias, may miss cross-cutting issues |
| Agent team (3 reviewers) | 90-180K | Specialized lenses, systematic coverage         |

**When to use:** For reviews spanning 5+ files or 3+ Nx libraries. For single-library changes, a single-agent review with the REPL is cheaper.

### 2d. `/rlm:refactor` -- Parallel Library Refactoring

**New skill** (not in the original RLM brainstorm).

**Why agent teams:** Large-scale refactoring across Nx libraries is a natural fit for agent teams because each library is an independent unit with its own public API. Two teammates modifying `connect-cms-analytics-feature` and `connect-ufa-navigation-feature` respectively have zero file overlap.

**How it works:**

1. User describes the refactoring goal: "Migrate all ComponentStores from `patchState` to updater methods" or "Replace `*ngIf` with `@if` in all templates"
2. Lead uses the workspace index to enumerate affected libraries:
   - REPL scans: `search("patchState", ["libs/"])` -> list of affected files grouped by library
3. Lead classifies affected libraries by complexity (number of occurrences, store complexity)
4. Lead spawns teammates, each assigned 3-5 libraries:
   - **Teammate A**: `connect-cms-*` libraries (8 stores)
   - **Teammate B**: `connect-ufa-*` libraries (12 stores)
   - **Teammate C**: `connect-shared-*` libraries (5 stores)
5. Each teammate works in a **git worktree** (`isolation: worktree`) to avoid file conflicts
6. Each teammate uses the REPL to navigate their assigned libraries, applies the refactoring, runs tests
7. Lead reviews results across worktrees, merges

**Why worktrees are essential:** The refactoring involves editing many files simultaneously across libraries. Without worktrees, teammates would conflict on `tsconfig.base.json`, shared test utilities, or accidentally edit a file assigned to another teammate. Worktree isolation eliminates this class of problems [[synthesis, section 8]].

**Token projection:**

| Approach                          | Tokens                                       | Parallelism                                       |
| --------------------------------- | -------------------------------------------- | ------------------------------------------------- |
| Single agent, sequential          | 100-300K (context rot, repeated orientation) | None                                              |
| Agent team (3 worktree teammates) | 150-350K                                     | 3x parallel, each library refactored in isolation |

**When to use:** For refactorings affecting 10+ Nx libraries. For fewer libraries, a single agent with the REPL is sufficient.

### 2e. `/rlm:migrate` -- Large-Scale Migration Execution

**New skill** (not in the original RLM brainstorm).

**Why agent teams:** Migrations at monolith scale (e.g., upgrading Angular 18 -> 19, replacing a deprecated library across 537 projects) require applying a consistent transformation across many independent libraries. The work is embarrassingly parallel -- each library migration is independent -- but the volume exceeds what a single agent can do before context rot degrades quality.

**How it works:**

1. User describes the migration: "Run `ng update` schematics and manually fix any libraries where the schematic fails"
2. Lead uses the workspace index + `nx affected` to identify the scope
3. Lead creates a task per library (or per batch of small libraries)
4. Lead spawns teammates in worktrees, each claiming tasks from the shared task list
5. Each teammate:
   - Runs the automated migration tool (`nx migrate`, schematic, codemod) on their assigned libraries
   - Runs `nx lint <project>` and `nx test <project>` to verify
   - Fixes any issues the automated tool missed
   - Marks the task as completed
6. Lead monitors progress, re-assigns failed tasks, validates cross-library consistency

**Wave-based execution:** Tasks are organized with dependencies -- shared/util libraries must migrate before feature libraries that depend on them. The task list's dependency tracking handles this automatically [[synthesis, section 7.2]].

**Quality gate:** A `TaskCompleted` hook runs `nx lint <project> && nx test <project>` before allowing task completion (see [Section 5a](#5a-taskcompleted-hook----verification-before-completion)).

**Token projection:**

| Approach                          | Tokens                                                      | Risk                                               |
| --------------------------------- | ----------------------------------------------------------- | -------------------------------------------------- |
| Single agent                      | 200-500K (severe rot, inconsistent quality past library 10) | High -- quality degrades as context fills          |
| Agent team (4 worktree teammates) | 300-600K                                                    | Low -- each teammate has clean context per library |

**When to use:** For migrations affecting 20+ libraries. The token cost is higher, but the quality consistency is worth it because migration errors in library N often go unnoticed until they cascade to library N+10.

---

## 3. Hybrid Architecture: RLM + Agent Teams

The key architectural insight: RLM and agent teams are not competing strategies. RLM reduces token usage **within** each agent. Agent teams multiply the number of agents. The optimal combination is **agent teams where each teammate is equipped with the RLM REPL**.

### 3a. REPL-Equipped Teammates

Each teammate spawned by the RLM plugin has access to the REPL sandbox with the workspace index pre-loaded. This means teammates navigate the codebase programmatically rather than burning tokens on Explore calls.

```
Traditional agent team teammate:
  Spawn -> Load CLAUDE.md (~5K) -> Explore workspace (~20K) -> Work (~30K)
  Total per teammate: ~55K tokens

RLM-equipped teammate:
  Spawn -> Load CLAUDE.md (~5K) -> Load workspace index (~8K) -> Work via REPL (~15K)
  Total per teammate: ~28K tokens
```

The REPL equipment roughly halves the per-teammate token cost, partially offsetting the 3-10x multiplier from using a team in the first place.

**Implementation:** The REPL sandbox (`repl-sandbox.mjs`) and workspace index (`workspace-index.json`) are loaded via the teammate's spawn prompt. The spawn prompt includes:

- Path to the workspace index
- REPL initialization instructions
- Domain-specific strategy hints (which libraries to focus on, which patterns to look for)

### 3b. Lead as RLM Orchestrator

The team lead operates in a special mode: it uses the REPL to **plan** the team's work before spawning teammates. This follows the "plan first, parallelize second" pattern from the agent teams research [[synthesis, section 12]].

```
1. Lead receives user request
2. Lead runs REPL to analyze the workspace:
   - Which libraries are affected?
   - What are the dependency chains?
   - How should work be partitioned?
3. Lead creates tasks with specific file ownership boundaries
4. Lead spawns teammates with focused spawn prompts
5. Teammates execute (each with their own REPL)
6. Lead synthesizes results
```

The REPL planning phase costs ~8-15K tokens. Without it, the lead would spend 30-50K tokens exploring the workspace before it could even define tasks for the team. The REPL pays for itself on the first planning step.

### 3c. Workspace Index as Shared Context

The workspace index (`workspace-index.json`) is the shared knowledge base for all teammates. Every teammate loads the same index, ensuring consistent understanding of:

- Project locations and types
- Dependency relationships
- Path aliases
- Component/store/service registries

This addresses the agent teams research finding that teammates need shared context to coordinate effectively [[synthesis, section 12]], but delivers it through a static file (~50-100KB) rather than through expensive conversation-based knowledge transfer.

---

## 4. Agent Team Definitions

### 4a. `debug-team` -- Adversarial Debugging

```yaml
team_name: rlm-debug
description: Adversarial debugging across Nx library boundaries

lead:
  model: sonnet # Or opus for complex bugs
  mode: default
  context:
    - workspace-index.json
    - REPL sandbox access

teammates:
  count: 2-3 # One per hypothesis/layer
  model: sonnet
  mode: default
  context:
    - workspace-index.json
    - REPL sandbox access
    - Assigned library paths
    - Hypothesis to investigate

task_structure:
  - type: investigate
    per_teammate: true
    description: 'Investigate hypothesis: {description}'
    done_criteria: 'Confirmed or ruled out with evidence (file:line references)'
  - type: synthesize
    owner: lead
    blocked_by: all investigate tasks
    description: 'Synthesize findings into root cause and fix proposal'
```

### 4b. `audit-team` -- Pattern Audit

```yaml
team_name: rlm-audit
description: Cross-domain pattern audit across workspace partitions

lead:
  model: sonnet
  mode: default
  context:
    - workspace-index.json
    - REPL sandbox access
    - Audit criteria

teammates:
  count: 3-4 # One per product domain
  model: sonnet
  mode: default # plan mode for destructive audits that propose changes
  context:
    - workspace-index.json
    - REPL sandbox access
    - Assigned domain partition
    - Audit criteria

task_structure:
  - type: scan
    per_teammate: true
    description: 'Audit {domain} against {criteria}'
    done_criteria: 'Structured findings with file:line references and severity'
  - type: compare
    owner: lead
    blocked_by: all scan tasks
    description: 'Compare patterns across domains, identify inconsistencies'
```

### 4c. `review-team` -- Multi-Lens Review

```yaml
team_name: rlm-review
description: Parallel code review with specialized lenses

lead:
  model: sonnet
  mode: default
  context:
    - workspace-index.json
    - Diff or file list to review

teammates:
  - name: patterns-reviewer
    model: sonnet
    focus: 'Angular patterns per AGENTS.md'
  - name: testing-reviewer
    model: sonnet
    focus: 'Test coverage and patterns per AGENTS.md'
  - name: architecture-reviewer
    model: haiku # Nx boundary checks are mechanical
    focus: 'Nx library boundaries, import rules, public API'

task_structure:
  - type: review
    per_teammate: true
    description: 'Review changes through {focus} lens'
    done_criteria: 'List of findings with severity, file:line, suggested fix'
  - type: merge
    owner: lead
    blocked_by: all review tasks
    description: 'Merge findings, deduplicate, prioritize'
```

### 4d. `refactor-team` -- Parallel Refactoring

```yaml
team_name: rlm-refactor
description: Parallel library refactoring with worktree isolation

lead:
  model: sonnet
  mode: default
  context:
    - workspace-index.json
    - REPL sandbox access
    - Refactoring specification

teammates:
  count: 3-4
  model: sonnet
  mode: default
  isolation: worktree # Each teammate gets its own worktree
  context:
    - workspace-index.json
    - REPL sandbox access
    - Assigned library list
    - Refactoring specification

task_structure:
  - type: refactor
    per_library: true # One task per library
    description: 'Apply {refactoring} to {library}'
    done_criteria: 'nx lint {library} && nx test {library} pass'
```

---

## 5. Quality Gates for Agent Teams

### 5a. `TaskCompleted` Hook -- Verification Before Completion

```yaml
event: TaskCompleted
```

When a teammate marks a task as completed, this hook runs verification before allowing the completion:

**For debugging tasks:** Verify that the teammate provided file:line references and a clear explanation (not just "I think the issue is X").

**For refactoring tasks:** Run `nx lint <project>` and `nx test <project>` on the affected libraries. Exit code 2 (reject completion) if either fails.

**For review tasks:** Verify that findings include severity, file:line references, and are not generic advice ("consider adding tests").

```bash
#!/bin/bash
# hooks/task-completed-verify.sh
TASK_TYPE=$(echo "$TASK_METADATA" | node -e "const d=require('fs').readFileSync(0,'utf8'); console.log(JSON.parse(d).type)")

case "$TASK_TYPE" in
  refactor)
    PROJECT=$(echo "$TASK_METADATA" | node -e "const d=require('fs').readFileSync(0,'utf8'); console.log(JSON.parse(d).project)")
    npx nx lint "$PROJECT" && npx nx test "$PROJECT"
    ;;
  investigate)
    # Check that the result contains file:line references
    echo "$TASK_RESULT" | rg -q '\.ts:\d+' || exit 2
    ;;
  review)
    # Check that findings are specific, not generic
    echo "$TASK_RESULT" | rg -q '\.ts:\d+' || exit 2
    ;;
esac
```

### 5b. `TeammateIdle` Hook -- Progress Enforcement

```yaml
event: TeammateIdle
```

Addresses the "early victory problem" from the agent teams research [[synthesis, section 7.6]]. When a teammate goes idle, check whether they actually completed meaningful work:

- If the teammate has no pending tasks and all assigned tasks are completed -> allow idle
- If the teammate has uncompleted tasks -> send feedback: "You still have {N} pending tasks. Check TaskList and continue."

---

## 6. Token Economics Analysis

### 6a. Cost Comparison: RLM Sub-Calls vs. Agent Teams

All projections use the RLM-equipped teammate baseline (section 3a), not vanilla teammates.

| Operation                  | RLM Sub-Calls Only            | Agent Team (RLM-equipped) | Multiplier | Justification                  |
| -------------------------- | ----------------------------- | ------------------------- | ---------- | ------------------------------ |
| Debug (3 hypotheses)       | 25-40K (no cross-pollination) | 80-150K                   | 3-4x       | Anchoring bias avoidance       |
| Pattern audit (semantic)   | ~850K Haiku (~$0.21)          | 200-400K Sonnet (~$1-2)   | 5-10x cost | Cross-domain comparison        |
| Pattern audit (mechanical) | ~850K Haiku (~$0.21)          | Not recommended           | --         | Haiku sub-calls are sufficient |
| Code review (3 lenses)     | 30-60K (single lens)          | 90-180K                   | 3x         | Attentional bias avoidance     |
| Refactoring (15 libraries) | 100-300K (rot by library 10)  | 150-350K                  | 1.2-1.5x   | Quality consistency            |
| Migration (30 libraries)   | 200-500K (rot by library 10)  | 300-600K                  | 1.5-2x     | Quality consistency            |

### 6b. Break-Even Analysis

Agent teams are worth the token multiplier when:

1. **Quality degrades in single-agent mode.** For refactoring and migration, the single agent's quality drops after ~10 libraries due to context rot. The agent team maintains consistent quality across all libraries because each teammate has a clean context. The break-even point is approximately 10-15 libraries -- below that, a single agent is cheaper and sufficient.

2. **Anchoring bias costs more than the team overhead.** For debugging, a single agent that anchors on the wrong theory and spends 60K tokens before realizing the error has already exceeded the agent team cost of investigating 3 theories in parallel for ~80K tokens total.

3. **Coverage cannot be achieved sequentially.** For multi-lens review, a single agent cannot maintain equal attention across patterns, testing, and architecture simultaneously. The agent team achieves systematic coverage that would require 2-3x the tokens if done sequentially (because the single agent would need to re-read files for each lens).

### 6c. Cost Optimization Strategies

Drawn from the agent teams research [[synthesis, section 6.2]], adapted for the RLM plugin:

1. **REPL-equip all teammates.** The workspace index + REPL sandbox roughly halves per-teammate orientation costs (section 3a).

2. **Sonnet lead + Sonnet workers (not Opus).** For the Nx-only workspace scope, Sonnet provides sufficient reasoning for code review, refactoring, and most debugging. Reserve Opus for the lead only when the debug scenario involves novel architectural problems.

3. **Haiku for mechanical lenses.** The Nx architecture reviewer in the review team (section 4c) uses Haiku because boundary checking is mechanical -- it does not require deep reasoning.

4. **3 teammates maximum for most operations.** The research shows diminishing returns beyond 5 teammates [[synthesis, section 12]]. For the Nx workspace, 3 teammates aligned to product domains (`cms`, `ufa`, `shared`) provides natural partitioning without coordination overhead.

5. **Shut down teams immediately after synthesis.** The lead should send shutdown requests as soon as the final synthesis is complete. Active but idle teammates consume tokens [[synthesis, section 6.2]].

6. **Plan first, parallelize second.** The lead always uses the REPL to analyze scope and create tasks before spawning teammates. This prevents the expensive failure mode of spawning teammates who discover the task is simpler than expected [[synthesis, section 12]].

---

## 7. Workflow Examples

### 7a. "Debug why the level-up notification doesn't show"

```
1. User invokes /rlm:debug "Level-up notification doesn't appear after achievement"

2. Lead REPL phase (Sonnet, ~10K tokens):
   - components.get("app-achievement-dialog") -> path
   - search("notification", ["libs/connect/ufa/level-up/"]) -> 8 matches
   - deps("connect-ufa-level-up-data-access") -> 3 direct dependents
   - Identifies 3 hypothesis boundaries:
     a. Store effect chain (data-access library)
     b. Notification rendering (shared notification library)
     c. API response shape (data-access API client)

3. Lead creates team + 3 tasks + spawns 3 teammates (~5K overhead):
   - Teammate A: "Investigate store effect chain in connect-ufa-level-up-data-access"
   - Teammate B: "Investigate notification rendering for achievement type"
   - Teammate C: "Investigate API response shape for achievement unlock endpoint"

4. Teammates investigate in parallel (~25K each = ~75K):
   - Each has workspace index + REPL
   - Each navigates their assigned libraries
   - Teammate B messages Teammate A: "The notification component expects a
     'celebrationType' field -- does the store effect include it?"
   - Teammate A responds: "The effect maps API response to { type: 'achievement' }
     but not { celebrationType: 'level-up' }"

5. Lead synthesizes (~5K):
   - Root cause: Store effect missing celebrationType mapping
   - Fix: Add celebrationType to the effect's tapResponse mapper
   - File: libs/connect/ufa/level-up/data-access/src/lib/achievement.store.ts:47

Total: ~95K tokens
vs. single agent: 60-120K tokens (with anchoring risk)
```

### 7b. "Are ComponentStore patterns consistent across product domains?"

```
1. User invokes /rlm:patterns --semantic "ComponentStore conventions consistency"

2. Lead REPL phase (Sonnet, ~8K tokens):
   - files("libs/**/*.store.ts") -> 53 stores
   - Groups by domain: cms (8), ufa (15), shared (12), other (18)
   - Creates 4 partitions

3. Lead spawns 4 teammates, one per partition (~5K overhead):
   - Each teammate scans their stores against AGENTS.md patterns:
     - Member ordering (inject -> selectors -> constructor -> effects -> updaters)
     - Selector naming ($ suffix for static, select prefix for parameterized)
     - Updater naming (set prefix for replacements)
     - Effect patterns (standalone pipe, tapResponse in inner pipe)
     - State interface (readonly properties, flat structure)

4. Teammates report findings (~20K each = ~80K):
   - cms: 6/8 compliant, 2 use setState instead of updaters
   - ufa: 12/15 compliant, 3 have deep nested state
   - shared: 11/12 compliant, 1 uses lifecycle hooks
   - other: 14/18 compliant, 4 have mixed issues

5. Lead compares across domains (~5K):
   - "cms and ufa both have setState violations -- likely copied from same example"
   - "shared is most compliant, ufa has the most nested state issues"
   - Produces grouped report by violation type, not by domain

Total: ~98K tokens
vs. Haiku sub-calls only: ~850K Haiku (~$0.21) but no cross-domain comparison
vs. single agent: Not feasible at 53 stores (context overflow)
```

### 7c. "Migrate all templates from \*ngIf to @if"

```
1. User invokes /rlm:migrate "*ngIf to @if control flow"

2. Lead REPL phase (Sonnet, ~10K tokens):
   - search("\\*ngIf", ["libs/"]) -> 340 matches across 180 files in 95 libraries
   - Groups by dependency order (shared/util first, then domain, then feature)
   - Creates 3 waves:
     Wave 1: shared/* and co/* (28 libraries, no downstream deps within wave)
     Wave 2: connect/*/data-access and connect/*/domain (35 libraries)
     Wave 3: connect/*/feature and connect/*/ui (32 libraries)

3. Lead spawns 3 teammates in worktrees, assigns Wave 1 tasks:
   - Teammate A: shared libraries (14 libraries)
   - Teammate B: co libraries (14 libraries)
   - Teammate C: idle (will pick up Wave 2 tasks)

4. Wave 1 execution (~30K per teammate = ~60K):
   - Each teammate migrates templates, runs nx lint + nx test per library
   - TaskCompleted hook verifies lint/test pass before allowing completion

5. Wave 2 unblocks, teammates claim tasks from shared list (~30K each = ~90K)

6. Wave 3 unblocks, final migration pass (~30K each = ~90K)

7. Lead validates cross-library consistency (~5K)

Total: ~255K tokens across 3 waves
vs. single agent: 200-500K tokens (quality degrades past wave 1, likely needs restart)
```

---

## 8. Plugin Structure Additions

New files added to the plugin structure from the [RLM brainstorm, section 12]:

```
.claude/plugins/rlm/
|-- ...                              # (existing structure from RLM brainstorm)
|-- skills/
|   |-- debug/                       # NEW: Adversarial debugging
|   |   `-- debug.md
|   |-- review/                      # NEW: Multi-lens code review
|   |   `-- review.md
|   |-- refactor/                    # NEW: Parallel library refactoring
|   |   `-- refactor.md
|   `-- migrate/                     # NEW: Large-scale migration
|       `-- migrate.md
|-- agents/
|   |-- ...                          # (existing agents from RLM brainstorm)
|   |-- debug-investigator.md        # NEW: Per-hypothesis debugger
|   |-- patterns-reviewer.md         # NEW: Angular patterns review lens
|   |-- testing-reviewer.md          # NEW: Test coverage review lens
|   `-- architecture-reviewer.md     # NEW: Nx boundary review lens
|-- hooks/
|   |-- ...                          # (existing hooks from RLM brainstorm)
|   |-- task-completed-verify.md     # NEW: Quality gate on task completion
|   `-- teammate-idle-progress.md    # NEW: Progress enforcement
`-- team-definitions/                # NEW: Agent team templates
    |-- debug-team.md
    |-- audit-team.md
    |-- review-team.md
    `-- refactor-team.md
```

---

## 9. Open Questions

### Architecture

1. **Team definitions as plugin components:** Claude Code plugins don't have a native `team-definitions/` component type. Should team templates be encoded as skills that call `TeamCreate` + `TaskCreate` + `Task`, or should they be standalone documentation files that the lead reads and follows?

2. **REPL sharing across teammates:** Should each teammate spawn its own REPL sandbox instance, or should they share a REPL with partitioned namespaces? Separate instances are simpler but duplicate the workspace index in memory. Shared instances risk state pollution between teammates.

3. **Worktree lifecycle for refactoring:** When a teammate finishes refactoring in a worktree, should the worktree be merged immediately (risk: incomplete migration) or held for lead review (risk: merge conflicts accumulate)?

4. **Delegate mode for the lead:** Should the lead be forced into delegate mode (coordination-only tools) to prevent it from implementing instead of delegating? The research recommends this [[synthesis, section 7.4]], but the RLM lead also needs REPL access for the planning phase.

### Scale-Specific

5. **Optimal teammate count for this workspace:** With 537 projects across ~6 product domains, is 3 teammates (partitioned by domain) or 4-5 teammates (partitioned by library type: feature, data-access, ui) more effective?

6. **Task granularity for migrations:** Should tasks be per-library (537 potential tasks) or per-batch (e.g., 10 libraries per task)? Per-library gives cleaner ownership but creates a task list management burden. Per-batch is more efficient but risks one large file blocking the whole batch.

7. **Cross-teammate REPL results:** When teammate A discovers something teammate B needs, should they send the raw finding via message, or store it in a shared handle store that teammate B can access via the REPL?

### Token Budget

8. **Hard token limits per team operation:** Should the plugin enforce maximum token budgets per team invocation (e.g., "debug team max 200K tokens, audit team max 500K tokens")? This prevents runaway costs but may cause premature termination of valuable investigations.

9. **Automatic downgrade to sub-calls:** If the lead's REPL planning phase determines the task is simpler than expected (e.g., only 3 libraries affected), should it automatically downgrade from agent team to RLM sub-calls? This would require a complexity threshold heuristic.

---

## Source Material References

| Reference                   | Document                                                |
| --------------------------- | ------------------------------------------------------- |
| RLM plugin brainstorm       | [[BRAINSTORM]](BRAINSTORM.md)                           |
| Agent teams synthesis       | [[SYNTHESIS]](../../claude-agent-teams/SYNTHESIS.md)    |
| Agent teams research corpus | [[corpus]](../../research/claude-agent-teams/README.md) |
