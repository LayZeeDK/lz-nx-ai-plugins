# RLM Claude Code Plugin -- Use Case Brainstorm

Brainstorm proposals for a Recursive Language Model (RLM) Claude Code plugin. Synthesized from [RLM research](../rlm/SYNTHESIS.md), [prompt engineering research](../prompt-engineering/SYNTHESIS.md), and [Nx CLI research](../nx/nx-cli.md).

> **Target workspace:** Connect `ng-app-monolith` -- Nx 19.8, Angular 18, ~1.5-2M LOC, ~1,700 Angular components, 537 Nx projects.
> **Brainstorm date:** 2026-03-02

## Table of Contents

- [Why RLM for This Workspace](#why-rlm-for-this-workspace)
- [1. Workspace Index -- The Foundation Layer](#1-workspace-index----the-foundation-layer)
  - [1a. workspace-indexer.mjs](#1a-workspace-indexermjs----nodejs-script)
  - [1b. SessionStart Hook](#1b-sessionstart-hook----auto-index-on-session-start)
  - [1c. path-resolver.mjs](#1c-path-resolvermjs----import-path-resolution)
  - [1d. Component and Service Registries](#1d-component-and-service-registries)
- [2. RLM REPL Environment -- The Core Engine](#2-rlm-repl-environment----the-core-engine)
  - [2a. repl-sandbox.mjs](#2a-repl-sandboxmjs----nodejs-vm-sandbox)
  - [2b. Handle-Based Result Storage](#2b-handle-based-result-storage)
  - [2c. rlm-config.mjs](#2c-rlm-configmjs----configuration--guardrails)
- [3. Skills -- User-Invokable Workflows](#3-skills----user-invokable-workflows)
  - [3a. /rlm:explore](#3a-rlmexplore----rlm-powered-codebase-exploration)
  - [3b. /rlm:impact](#3b-rlmimpact----nx-aware-impact-analysis)
  - [3c. /rlm:analyze](#3c-rlmanalyze----large-context-analysis)
  - [3d. /rlm:test-gen](#3d-rlmtest-gen----pattern-compliant-test-generation)
  - [3e. /rlm:search (smart-search)](#3e-rlmsearch----smart-search-with-model-routing)
  - [3f. /rlm:trace](#3f-rlmtrace----cross-boundary-data-flow-tracing)
  - [3g. /rlm:patterns](#3g-rlmpatterns----pattern-audit-across-the-monolith)
- [4. Commands -- Quick Deterministic Operations](#4-commands----quick-deterministic-operations)
  - [4a. /rlm:nx-deps](#4a-rlmnx-deps----dependency-visualization)
  - [4b. /rlm:nx-find](#4b-rlmnx-find----project-aware-file-search)
  - [4c. /rlm:nx-alias](#4c-rlmnx-alias----path-alias-lookup)
  - [4d. /rlm:status](#4d-rlmstatus----session-metrics)
- [5. Agents -- Specialized Workers](#5-agents----specialized-workers)
  - [5a. haiku-searcher](#5a-haiku-searcher----lightweight-search-agent)
  - [5b. haiku-classifier](#5b-haiku-classifier----task-complexity-router)
  - [5c. repl-executor](#5c-repl-executor----rlm-execution-loop-agent)
- [6. Hooks -- Automated Behaviors](#6-hooks----automated-behaviors)
  - [6a. PreCompact -- Knowledge Preservation](#6a-precompact----knowledge-preservation)
  - [6b. PreToolUse -- Search Optimization](#6b-pretooluse----search-optimization)
  - [6c. PostToolUse -- Result Caching](#6c-posttooluse----result-caching)
  - [6d. SessionStart -- Strategy Hints](#6d-sessionstart----strategy-hints-injection)
- [7. Context Rot Prevention -- Cross-Cutting Strategies](#7-context-rot-prevention----cross-cutting-strategies)
  - [7a. REPL Isolation -- Core Anti-Rot Mechanism](#7a-repl-isolation----core-anti-rot-mechanism)
  - [7b. Tiered Context Management](#7b-tiered-context-management)
  - [7c. Compaction-Aware REPL History](#7c-compaction-aware-repl-history)
  - [7d. Progressive Disclosure for Nx Workspace](#7d-progressive-disclosure-for-nx-workspace)
- [8. Node.js Scripts -- Deterministic Operations](#8-nodejs-scripts----deterministic-operations)
  - [8a. Complete Script Inventory](#8a-complete-script-inventory)
  - [8b. nx-runner.mjs](#8b-nx-runnermjs----safe-nx-cli-wrapper)
  - [8c. tsc Integration](#8c-tsc-integration-for-type-aware-search)
- [9. Model Routing Summary](#9-model-routing-summary)
- [10. Workflow Examples](#10-workflow-examples)
- [11. Token Savings Projections](#11-token-savings-projections)
- [12. Plugin Structure Proposal](#12-plugin-structure-proposal)
- [13. Open Questions](#13-open-questions)

---

## Why RLM for This Workspace

At ~1.5-2M LOC and ~4 tokens per line, this codebase is roughly **6-8 million tokens**. Claude's 200K context holds ~3% of it. Even Sonnet's 1M window covers only ~15%. The RLM paper's central thesis -- "navigate, don't read" -- targets exactly this scale mismatch.

Two fundamental problems compound at this scale:

1. **Context rot** -- performance degradation as context length increases, even within the advertised window. The RULER benchmark shows effective context is often only ~50% of the advertised window. In a 200K context, degradation begins around ~100K tokens -- a single exploration session can reach this [[RLM synthesis, section 1]].
2. **Token waste** -- traditional exploration of a 537-project workspace burns 20-50K tokens just to locate relevant code before any real work begins. Each Explore task carries ~20K tokens of overhead [[prompt engineering synthesis, section 5]].

RLM addresses both by externalizing the codebase as a navigable variable. The LLM never loads the full context; it generates code to navigate it. Intermediate results live in a REPL sandbox and are discarded after each query. Only distilled answers enter the conversation.

The paradigm shift: from "how do we fit more code into context?" to "how do we navigate code without loading it?"

### Why the Connect monolith amplifies the problem

- **537 Nx projects** means even "which library contains this component?" requires cross-project search
- **~1,700 Angular components** means finding a specific component's interaction pattern can touch 5-10 libraries
- **Deep dependency chains** (feature -> data-access -> domain -> shared) mean impact analysis cascades across many projects
- **Strict patterns** (AGENTS.md: ComponentStore conventions, Testing Library, SIFERS, etc.) mean code generation needs to reference multiple example files

Traditional Claude Code workflows at this scale:
- Spawn Explore agent (20K system tokens) -> multiple git grep calls (3-5K each) -> read files (2-5K each) -> answer
- A single "find where X is implemented" query: 35-70K tokens
- A session with 5-10 such queries: 175-700K tokens, severe context rot by query 5

RLM-managed workflows:
- Workspace index lookup (0 LLM tokens) -> REPL navigation (isolated, discarded) -> distilled answer (2-5K tokens)
- Same query: 12-20K tokens
- Same 10-query session: 50-80K tokens, context stays clean

---

## 1. Workspace Index -- The Foundation Layer

### Problem

Every session starts cold. Claude spends 5-15 tool calls (10-30K tokens) just understanding the workspace structure before doing real work.

### RLM principle applied

Principle 1 (Symbolic Handle to Prompt) -- externalize the workspace as a navigable variable, not something to read cover-to-cover.

### 1a. `workspace-indexer.mjs` -- Node.js Script

A deterministic script that builds a compact JSON index of the entire workspace. No LLM involved.

```
Input:  nx show projects --json, nx graph --print, tsconfig.base.json, package.json
Output: .claude/workspace-index.json (~50-100KB structured representation)
```

**Core data:**

| Data | Source | Purpose |
|------|--------|---------|
| Project names -> source roots, types, tags | `nx show projects --json` | Route searches to specific project roots |
| Dependency edges (adjacency list) | `nx graph --print` | Impact analysis, dependency tracing |
| Path aliases | `tsconfig.base.json` | Import path resolution |
| Target availability per project | `nx show project <name>` | Know which projects have build/test/lint/serve/e2e |
| File counts and last-modified per project root | `fast-glob` + `fs.stat` | Incremental index rebuild |

**Scale-specific data (for 1,700-component monolith):**

| Data | Build Method | Purpose | Approximate Size |
|------|--------------|---------|-----------------|
| Component registry (selector -> file path) | Regex scan of `@Component({ selector: '...' })` | Find components without searching 537 projects | ~80KB |
| Store registry (store class -> file path) | Regex scan of `extends ComponentStore` | Trace state management | ~15KB |
| Route map (route path -> lazy-loaded library) | Parse `app.routes.ts` + `loadChildren` | Understand routing structure | ~10KB |
| Service registry (providedIn root -> file path) | Regex scan of `providedIn: 'root'` | Find singleton services | ~20KB |

**Token savings:** Replaces the typical "let me explore the workspace" phase (5-10 Explore/Bash calls at ~3-5K tokens each = 15-50K) with a single Read call on a structured index (~4-8K tokens for the summary).

**Component registry example:**

```javascript
// Instead of: git grep "selector: 'app-achievement-dialog'" across 2M LOC
// The REPL does:
let loc = components.get("app-achievement-dialog")
// -> { path: "libs/connect/ufa/level-up/feature-achievement-dialog/src/lib/...",
//      project: "connect-ufa-level-up-feature-achievement-dialog" }
```

Zero search tokens. Deterministic. Under 1ms.

### 1b. `SessionStart` Hook -- Auto-Index on Session Start

```yaml
event: SessionStart
script: node ${CLAUDE_PLUGIN_ROOT}/scripts/workspace-indexer.mjs
```

Runs the indexer at the start of every session. The script checks file modification times and only rebuilds if `nx.json`, `tsconfig.base.json`, or any `project.json` changed since last index. With 1,700 components, full regex scanning might take 5-10 seconds; incremental rebuild (only changed files via `git diff`) keeps it fast.

### 1c. `path-resolver.mjs` -- Import Path Resolution

A companion script that answers "what's the import path for X?" deterministically.

```bash
node scripts/path-resolver.mjs --symbol "UserService" --project "connect-shared-users-data-access"
# Output: @consensus/connect/shared/users/data-access
```

Parses `tsconfig.base.json` path aliases and cross-references with the workspace index. Eliminates the common pattern of Claude searching multiple files to find the correct import path.

### 1d. Component and Service Registries

**Building the component registry:** A Node.js script using `fast-glob` + regex extraction from `@Component({ selector: '...' })` decorators. The decorator pattern is consistent enough for regex across the codebase. Alternatively, `tsc` program API for precise extraction if regex proves brittle.

**Building the store registry:** Scan for `extends ComponentStore<` patterns. The AGENTS.md convention that store files end in `.store.ts` makes glob-based discovery efficient: `libs/**/*.store.ts`.

**Building the service registry:** Scan for `@Injectable({ providedIn: 'root' })`. Combined with the dependency graph, this enables rapid "where is this service and who uses it?" queries.

---

## 2. RLM REPL Environment -- The Core Engine

### Problem

Codebase analysis tasks (impact analysis, pattern search, dependency tracing) require many sequential tool calls. Each call adds round-trip latency and token overhead. The LLM must verbalize every intermediate step.

### RLM principles applied

All three: symbolic handle (workspace as variable), variables as output (results stored in REPL, not generated into context), symbolic recursion (code-driven loops over projects/files).

### 2a. `repl-sandbox.mjs` -- Node.js VM Sandbox

The REPL environment using Node.js `vm.createContext()` following the Hampton-io/RLM and code-rabi/rllm patterns [[RLM synthesis, section 15]].

**REPL globals:**

| Global | Purpose | Implementation |
|--------|---------|----------------|
| `workspace` | The workspace index as navigable object | Loaded from `workspace-index.json` |
| `projects` | Shorthand for `workspace.projects` (Map) | Direct reference |
| `components` | Component selector -> file path registry | Loaded from index |
| `stores` | Store class -> file path registry | Loaded from index |
| `services` | Service -> file path registry | Loaded from index |
| `deps(name)` | Get dependency tree for a project | Walks adjacency list |
| `dependents(name)` | Get reverse dependency tree | Walks reverse adjacency list |
| `read(path, start?, end?)` | Read file content (or slice) | `fs.readFileSync` with bounds |
| `files(glob)` | Find files matching pattern | `fast-glob` or Node.js `fs.glob` |
| `search(pattern, paths?)` | Search file contents (git grep primary, Node.js built-in fallback) | `child_process.spawnSync('git', ['grep', ...], { shell: false })` |
| `nx(command)` | Run Nx CLI command, return parsed output | `execSync('npx nx ...')` + JSON parse |
| `llm_query(prompt, model?)` | Sub-LLM call (routes to Haiku/Sonnet) | Claude API via subagent |
| `llm_batch(prompts, model?)` | Parallel sub-LLM calls | Concurrent subagents |
| `FINAL(answer)` | Mark final answer (string) | Sets completion flag |
| `FINAL_VAR(name)` | Mark final answer (from variable) | Sets completion flag + variable ref |
| `print(...args)` | Capture output (truncated at 2K chars) | Appended to turn history |
| `SHOW_VARS()` | List user-created variables | Enumerates `globalThis` additions |

**Sandbox security:**

- `vm.createContext({ codeGeneration: { strings: false, wasm: false } })` blocks `eval()` attacks
- Restricted builtins: no `process`, `require`, `child_process` except via the controlled `nx()` and `search()` wrappers
- `globalThis` transformation for persistent state across iterations
- Timeout per execution block (5 seconds default)

**Execution loop:**

```typescript
for (let i = 0; i < maxIterations; i++) {
  const response = await llm.complete(messages)       // Root LLM generates code
  const code = parseCodeBlocks(response, 'repl')      // Extract ```repl blocks
  const result = await sandbox.execute(code)           // Run in VM (<5ms)
  const final = sandbox.getFinalAnswer()
  if (final) return final                              // Done
  messages.push(formatResult(result))                  // Append truncated output
}
```

**Why Node.js VM, not Python:**

- No subprocess overhead (<5ms startup vs 100-500ms for Python subprocess)
- True async/await support via Promise-based callbacks
- Memory isolation via V8 contexts
- State persistence via `globalThis` transformation
- Already proven in Hampton-io/RLM and code-rabi/rllm [[RLM synthesis, section 15]]
- Natural fit for a TypeScript/Angular workspace

### 2b. Handle-Based Result Storage

Following the Matryoshka pattern [[RLM synthesis, section 15]] -- large results stored in a Map, only handles passed to the LLM:

```
// Instead of dumping 537 project objects into context (~50K tokens):
// Return: "$projects: Map(537) [connect, connect-e2e, assets, ...]" (~100 tokens)

// The LLM then navigates:
let p = projects.get("connect-shared-users-data-access")
print(p.targets)  // Only the data it needs enters context
```

**Token savings estimate:** For a 537-project workspace, handle storage saves ~97% tokens on large result sets (per Matryoshka benchmarks). A full project listing would be ~50K tokens raw vs. ~200 tokens as a handle with preview.

### 2c. `rlm-config.mjs` -- Configuration & Guardrails

```javascript
{
  maxIterations: 20,           // Max REPL turns per invocation
  maxDepth: 2,                 // Max recursion depth for rlm_query
  maxTimeout: 120_000,         // 2 minute wall clock
  maxErrors: 3,                // Consecutive REPL errors before abort
  compaction: true,            // Auto-summarize when REPL history grows
  compactionThresholdPct: 0.75,
  defaultSubModel: 'haiku',    // Sub-LLM calls default to Haiku
  rootModel: 'sonnet',         // Root LLM defaults to Sonnet
  verbose: false,
  benchmark: false             // When true, log token counts for RLM vs non-RLM comparison
}
```

**Token benchmarking** (opt-in, for comparing RLM vs. non-RLM approaches):

```javascript
class TokenBenchmark {
  // Logs per-operation token counts for later analysis.
  // Not a budget enforcer -- purely for measuring whether RLM
  // actually reduces tokens vs. baseline Claude Code workflows.
  record(operation, { model, inputTokens, outputTokens, depth, iterations }) {
    this.log.push({ timestamp: Date.now(), operation, model, inputTokens, outputTokens, depth, iterations })
  }
  summarize() {
    // Group by operation type, compare against baseline estimates
    // Output: "explore: 14K avg (baseline ~45K), impact: 12K avg (baseline ~70K)"
  }
}
```

The guardrails that matter are `maxIterations`, `maxDepth`, `maxErrors`, and `maxTimeout` — these prevent runaway REPL loops, not cost overruns. Token benchmarking is separate and opt-in, useful for validating that RLM actually delivers the projected reductions.

---

## 3. Skills -- User-Invokable Workflows

### 3a. `/rlm:explore` -- RLM-Powered Codebase Exploration

**Trigger:** User asks open-ended questions about the codebase ("Where is X handled?", "How does Y work?", "What depends on Z?")

**How it works:**

1. Loads the workspace index as `workspace` variable in the REPL
2. Root LLM (Sonnet) enters **filling phase** [[RLM synthesis, section 4]]: peeks at project structure, uses `search()` and `files()` to locate relevant code
3. Transitions to **solving phase**: reads specific files, synthesizes answer
4. Sub-calls to Haiku for mechanical summarization of individual files

**vs. current Explore agent:** The standard Explore agent gets a fresh 200K context and uses sequential tool calls. Each tool call is a full API round-trip. The RLM approach executes navigation code locally in <5ms per iteration, only making LLM calls when semantic understanding is needed.

**Token savings projection for "find where X is implemented":**

| Approach | System overhead | Work tokens | Total |
|----------|----------------|-------------|-------|
| Current (Explore agent) | ~20K | 5-10 calls x 3-5K | 35-70K |
| RLM (Sonnet root) | ~8K | 3-5 iterations x 2K + 1-2 Haiku sub-calls x 1K | 16-20K |

### 3b. `/rlm:impact` -- Nx-Aware Impact Analysis

**Trigger:** "What's affected if I change X?", "Impact of modifying library Y?"

**How it works:**

1. Node.js script runs `nx affected --base=HEAD~1 --print` (or custom base) -> affected project list
2. Root LLM receives affected list as REPL variable
3. Generates code to trace dependency chains: `dependents("connect-shared-users-data-access")` -> discovers downstream projects
4. Sub-calls (Haiku) classify each affected project by risk level (direct dependency vs. transitive)
5. Outputs structured impact report

**Nx CLI integration in REPL:**

```javascript
let affected = nx("affected -t build --base=main --print")  // JSON output
let graph = deps("connect-shared-users-data-access")
print(`Direct dependents: ${graph.direct.length}`)
print(`Transitive: ${graph.transitive.length}`)
```

### 3c. `/rlm:analyze` -- Large Context Analysis

**Trigger:** Analyzing files/contexts that exceed comfortable context window, multi-file analysis across many libraries.

**How it works:**

1. Target content externalized as `context` variable (never loaded into LLM window)
2. Root LLM peeks at structure: `context.slice(0, 2000)`
3. Partition + Map strategy [[RLM synthesis, section 5]]: chunks content, dispatches Haiku sub-calls for each chunk
4. Aggregation: Root LLM synthesizes Haiku results into final answer

**Use cases within Connect:**

- Analyzing all ComponentStore patterns across 50+ store files
- Reviewing all route configurations across the workspace
- Auditing all API client usage patterns
- Finding all instances of deprecated patterns (NgModules, constructor injection, etc.)

### 3d. `/rlm:test-gen` -- Pattern-Compliant Test Generation

**Trigger:** "Write tests for X", "Add test coverage for Y"

**How it works:**

1. Loads source file + AGENTS.md test patterns as REPL context
2. **Filling phase:** Peeks at component structure, identifies dependencies, finds existing test patterns in the same library via `search()` and `files()`
3. **Solving phase:** Generates test following exact patterns:
   - Testing Library for components (query by role/label)
   - SIFERS pattern for setup
   - TestBed + jest.spyOn for services
   - ComponentStore testing patterns per AGENTS.md
4. Sub-calls (Haiku): Generate individual `it()` blocks in parallel

**Why RLM helps here:** Test generation needs the source file AND knowledge of testing patterns AND examples from nearby tests. Loading all three into a single context burns tokens; RLM navigates between them programmatically.

### 3e. `/rlm:search` -- Smart Search with Model Routing

**Trigger:** Auto-invoked when Claude would otherwise use Explore or multiple search commands.

**How it works:**

1. Haiku classifies search intent:
   - **Symbol search** -> use workspace index path aliases + component/store/service registries
   - **Pattern search** -> `git grep` scoped to relevant Nx projects via workspace index
   - **Semantic search** -> RLM exploration with Sonnet root
2. Returns results as handle references (file path + line numbers), not full file contents
3. Claude reads only the specific lines needed

**Model routing:**

```
Search classification (Haiku: ~200 tokens)
|-- Symbol lookup -> Node.js script (0 tokens)
|-- Pattern search -> git grep via Bash (0 LLM tokens)
`-- Semantic search -> RLM with Sonnet root (~8-15K tokens)
```

**vs. current pattern:** Claude currently does 3-5 sequential `git grep` or Explore calls, often with overly broad patterns, reading full files when it only needs 10 lines. The smart search pre-filters via the workspace index and returns surgical results.

### 3f. `/rlm:trace` -- Cross-Boundary Data Flow Tracing

**Trigger:** "How does data flow from API to UI for X?", "Trace the data path for Y"

Particularly valuable in a monolith with hundreds of libraries. When data flows through multiple library boundaries (API client -> store -> component -> template), tracing it manually requires reading 5-10 files across 3-5 libraries.

**How it works:**

1. User specifies a starting point (e.g., a DTO field, a store selector, an API endpoint)
2. REPL traverses the flow using the registries:
   - `search("UserAchievement")` scoped to data-access libraries -> finds API client
   - `deps("connect-ufa-level-up-data-access")` -> finds consuming stores
   - Component registry reverse lookup -> finds which components use those stores
3. Sub-calls (Haiku) verify each link in the chain by reading the specific binding
4. Returns the full data flow chain with file:line references

**Why this needs RLM:** A linear trace through 5 boundaries means reading 5+ files and making 5+ search calls. In conversation context, that's 25-50K tokens of intermediate results that degrade attention. In the REPL, those intermediates never enter the conversation -- only the final traced path does.

### 3g. `/rlm:patterns` -- Pattern Audit Across the Monolith

**Trigger:** "Which components still use constructor injection?", "Which stores violate naming conventions?", "Audit OnPush usage"

At 1,700 components, pattern consistency is a real challenge.

**How it works:**

1. REPL uses `files("libs/**/*.component.ts")` -> ~1,700 files
2. Batches files into chunks of 50
3. Haiku sub-calls scan each chunk for the target pattern (mechanical regex-like detection)
4. Results aggregated by project/domain
5. Returns structured audit report

**Why Haiku, not regex:** Some patterns are syntactic (regex-friendly: `constructor(` injection), but others are semantic (does this component correctly use OnPush?). Haiku handles both with minimal token overhead per file. At ~500 tokens per component scan, 1,700 components = ~850K Haiku input tokens — but these are isolated sub-call tokens that never enter the main conversation. The conversation only sees the aggregated result (~2-5K tokens).

---

## 4. Commands -- Quick Deterministic Operations

### 4a. `/rlm:nx-deps` -- Dependency Visualization

```bash
# Node.js script reads workspace index, prints formatted tree
node scripts/deps-tree.mjs connect-shared-users-data-access --depth=2

connect-shared-users-data-access
|-- connect-shared-users-feature-user-selection (direct)
|-- connect-cms-access-control-feature (direct)
|   `-- connect-cms-sidenav-feature (transitive)
|-- connect-ufa-navigation-feature (direct)
|   `-- connect (transitive, app)
`-- ... (47 more)
```

Zero LLM tokens. Pure script.

### 4b. `/rlm:nx-find` -- Project-Aware File Search

```bash
# Routes to optimal search strategy based on pattern type
/rlm:nx-find "ComponentStore" --project connect-cms-level-up*
/rlm:nx-find "useValue: mockService" --type test
/rlm:nx-find "@Input" --tag scope:shared
```

Node.js script that:

1. Resolves project filter to source roots via workspace index
2. Runs `git grep` scoped to those roots
3. Returns formatted results with project context

### 4c. `/rlm:nx-alias` -- Path Alias Lookup

```bash
/rlm:nx-alias libs/connect/shared/users/data-access
# -> @consensus/connect/shared/users/data-access

/rlm:nx-alias @consensus/co/util-rxjs
# -> libs/co/util-rxjs/src/index.ts
```

Purely deterministic -- reads `tsconfig.base.json` and resolves.

### 4d. `/rlm:status` -- Session Metrics

Displays current session metrics for benchmarking RLM effectiveness:

- Token usage by model tier (Haiku / Sonnet / Opus) — actual vs. estimated baseline without RLM
- REPL iterations used per query
- Context utilization percentage (how full is the conversation window?)
- Cache hit rate (workspace index, search cache)
- Token reduction ratio (RLM tokens / estimated baseline tokens)

Useful for validating that the plugin is actually reducing tokens compared to standard Claude Code workflows.

---

## 5. Agents -- Specialized Workers

### 5a. `haiku-searcher` -- Lightweight Search Agent

```yaml
subagent_type: haiku-searcher
model: haiku
tools: [Bash(git grep *), Glob, Read]
```

A Haiku-powered agent specialized for mechanical search tasks. When the root LLM needs to search for something, it spawns this agent instead of doing the search itself (saving Sonnet/Opus tokens on mechanical work).

**Prompt pattern (from prompt engineering research [[section 2]]):**

```xml
<task>Find all files containing PATTERN in PROJECT_PATHS</task>
<constraints>
  - Return only file paths and line numbers
  - Maximum 20 results
  - Do NOT explain or summarize
  - Do NOT suggest improvements
</constraints>
<anti_goals>
  - Do NOT read file contents beyond the matching line
  - Do NOT analyze the code
</anti_goals>
```

### 5b. `haiku-classifier` -- Task Complexity Router

A Haiku agent that classifies incoming tasks by complexity to route to the right model/strategy:

```
Input: "Find where UserService is injected across the workspace"
Output: { strategy: "pattern-search", model: "haiku", estimated_tokens: 3000 }

Input: "Refactor the campaign store to use the new API response format"
Output: { strategy: "rlm-analyze", model: "sonnet", estimated_tokens: 25000 }

Input: "Debug why the level-up notification doesn't appear after achievement unlock"
Output: { strategy: "deep-analysis", model: "opus", estimated_tokens: 50000 }
```

**Token savings:** ~200-500 tokens for classification vs. potentially 20K+ tokens wasted on using the wrong strategy.

### 5c. `repl-executor` -- RLM Execution Loop Agent

The agent that runs the RLM execution loop. Separated from the root conversation to isolate the REPL context and prevent it from polluting the main conversation's context window.

```yaml
subagent_type: general-purpose
model: sonnet  # or configurable
```

This agent receives:

1. The user's query
2. The workspace index as context
3. REPL sandbox access
4. Guardrails (max iterations, depth, timeout, error threshold)

It runs the fill -> solve loop and returns only the final answer to the main conversation. All intermediate iterations (peek, search, sub-call) stay in the agent's context and are discarded after.

**Context rot prevention:** This is a key anti-rot mechanism. The main conversation never sees the 10-20 intermediate REPL iterations. It only receives the distilled final answer.

---

## 6. Hooks -- Automated Behaviors

### 6a. `PreCompact` -- Knowledge Preservation

```yaml
event: PreCompact
```

Before context compaction occurs, this hook:

1. Extracts key findings from the current session (files modified, patterns discovered, decisions made)
2. Saves them to `.claude/rlm-state/session-context.json`
3. On the next turn after compaction, the compact summary + saved findings restore continuity

**Why this matters:** The prompt engineering research [[section 3]] identifies context loss during compaction as a major source of repeated work. This hook preserves the information that compaction would summarize away.

### 6b. `PreToolUse` -- Search Optimization

```yaml
event: PreToolUse
tool: Task  # Intercept Explore-type tasks
```

When Claude is about to spawn an Explore task, this hook checks whether the query could be answered with fewer tokens:

1. Check workspace index for direct answers (project location, dependencies, targets)
2. If answerable from index, return the answer directly (0 tokens for subagent)
3. If not, let the Explore task proceed but inject the workspace index as pre-loaded context

### 6c. `PostToolUse` -- Result Caching

```yaml
event: PostToolUse
tool: Bash  # After git grep, nx commands
```

Caches frequently-used search results and Nx command outputs in `.claude/rlm-state/cache/`. Subsequent identical queries return cached results without re-executing. TTL based on file modification times.

### 6d. `SessionStart` -- Strategy Hints Injection

```yaml
event: SessionStart
```

Based on the RLM research finding that **strategy hints significantly improve performance** (Prime Intellect ablations [[RLM synthesis, section 13]]), this hook injects workspace-specific strategy hints into the session:

```
Strategy hints for Connect ng-app-monolith (Nx 19.8, Angular 18):

- Library naming: libs/<product>/<application>/<domain>/<type>-<name>
- Products: academy, coaching, connect, shared, co, legacy
- Types: feature (smart components), ui (presentable), data-access (API/state),
  domain (models), util (pure functions), test-util, styles, assets
- Components are in feature/ and ui/ libraries
- State management is in data-access/ libraries using NgRx ComponentStore
- Stores are in .store.ts files alongside their component
- API clients are in data-access/ libraries
- Path aliases follow @consensus/<product>/<domain>/<type>
- Tests use @testing-library/angular, Jest, SIFERS pattern
- 537 projects, ~1,700 components -- always use workspace index first
- Never attempt to read more than 3-5 files per REPL iteration
- Prefer git grep (via spawnSync, shell: false) scoped to specific project roots over global search
```

---

## 7. Context Rot Prevention -- Cross-Cutting Strategies

### 7a. REPL Isolation -- Core Anti-Rot Mechanism

The RLM REPL is the primary defense against context rot. All intermediate analysis results live in the REPL sandbox, not in the conversation.

| Without RLM | With RLM |
|-------------|----------|
| Search results (5K tokens) added to conversation | Search executed in REPL, only handle returned (~50 tokens) |
| File contents (3K tokens) read into context | File read in REPL, only relevant lines extracted (~200 tokens) |
| Dependency graph (10K tokens) dumped to conversation | Graph traversed in REPL code, only answer returned (~100 tokens) |
| After 10 operations: ~80K tokens of accumulated noise | After 10 operations: ~3K tokens of distilled results |

The conversation stays clean. The REPL is the scratch space that gets discarded.

**Session trajectory comparison:**

```
Traditional session on 1.5-2M LOC codebase:
Turn 1-3:   Fresh context, good performance        [0-30K tokens used]
Turn 4-8:   Exploration accumulates results         [30-80K tokens used]
Turn 9-12:  Context rot begins, model starts        [80-130K tokens used]
            forgetting earlier findings
Turn 13-15: Severe degradation, repeated searches   [130-180K tokens used]
Turn 16+:   Compaction triggered, key findings lost  [reset to ~40K]

RLM-managed session:
Turn 1:     Workspace index loaded                  [8K tokens, stable]
Turn 2-N:   Each query runs in isolated REPL        [8K base + 0 accumulation]
            Only final answers enter conversation   [+2-5K per answer]
Turn 20+:   Context still clean at ~50-60K          [well below rot threshold]
```

### 7b. Tiered Context Management

```
Tier 1: Workspace Index (~8K tokens, always loaded)
  - Project structure, path aliases, dependency graph summary
  - Loaded once per session, refreshed only on workspace changes

Tier 2: Active Context (~20-40K tokens, session-scoped)
  - Files currently being edited
  - Recent search results (handles only)
  - Current task description

Tier 3: REPL Scratch Space (isolated, discarded after use)
  - Full file contents during analysis
  - Intermediate search results
  - Dependency traversal state
  - Sub-LLM call results
```

### 7c. Compaction-Aware REPL History

When the REPL's own history grows large (approaching `compactionThresholdPct`), the system auto-summarizes via an LLM call before continuing:

```
[Iterations 1-8 compacted]
Summary: Identified 47 projects depending on users-data-access.
12 are direct imports, 35 transitive. High-risk: connect app (root),
navigation-feature (routing), sidenav (layout).

[Iteration 9 continues with clean context]
```

This mirrors the RLM paper's compaction mode [[RLM synthesis, section 6]] and prevents the REPL itself from experiencing context rot during long analyses.

### 7d. Progressive Disclosure for Nx Workspace

Instead of loading full workspace state, the plugin implements progressive disclosure:

1. **Session start:** Load project count, app names, top-level library domains (~2K tokens)
2. **On first query about a domain:** Load that domain's projects and dependencies (~1-3K tokens)
3. **On specific file query:** Load only that file's content via REPL (~0 conversation tokens, REPL-only)

This keeps the main conversation context lean throughout the session.

---

## 8. Node.js Scripts -- Deterministic Operations

### 8a. Complete Script Inventory

| Script | Purpose | LLM Tokens | Trigger |
|--------|---------|------------|---------|
| `workspace-indexer.mjs` | Build workspace JSON index (537 projects + registries) | 0 | SessionStart hook |
| `path-resolver.mjs` | Resolve tsconfig path aliases | 0 | Import resolution |
| `deps-tree.mjs` | Print dependency tree from Nx graph | 0 | `/rlm:nx-deps` command |
| `affected-analyzer.mjs` | Parse `nx affected` output | 0 | `/rlm:impact` skill |
| `repl-sandbox.mjs` | Node.js VM REPL environment | 0 (host) | `/rlm:explore`, `/rlm:analyze` |
| `handle-store.mjs` | Handle-based result storage | 0 | REPL infrastructure |
| `token-benchmark.mjs` | Token counting for RLM vs. baseline comparison | 0 | All RLM operations (opt-in) |
| `cache-manager.mjs` | Result caching with file-mtime TTL | 0 | PostToolUse hook |
| `nx-runner.mjs` | Safe Nx CLI command wrapper | 0 | REPL `nx()` global |
| `file-scanner.mjs` | Fast file counting/sizing for index | 0 | Workspace indexer |

### 8b. `nx-runner.mjs` -- Safe Nx CLI Wrapper

Wraps Nx CLI commands with:

- Allowlisted commands (only read operations: `show`, `graph`, `list`, `report`, `affected --print`)
- JSON output parsing
- Timeout protection (30s default)
- Caching of expensive operations (`nx graph --print` takes 3-5s on large workspaces, cached for 5 minutes)

```javascript
// In REPL
let affected = nx("show projects --affected --json")
// Executes: npx nx show projects --affected --json
// Returns: parsed JSON array of project names
```

### 8c. `tsc` Integration for Type-Aware Search

For more precise queries, the REPL can invoke `tsc --declaration --emitDeclarationOnly` on specific libraries to get type information, or use existing `.d.ts` files in `dist/` if available from a recent build.

```javascript
// In REPL -- find all implementations of an interface
let libs = nx("show projects --type lib --json")
let implementors = libs.filter(p =>
  search(`implements UserService`, [`libs/${p}/src`]).length > 0
)
```

---

## 9. Model Routing Summary

| Operation | Model | Rationale |
|-----------|-------|-----------|
| Workspace indexing | None (Node.js) | Pure data transformation |
| Search classification | Haiku | Bounded, mechanical decision |
| Pattern search execution | None (git grep) | Deterministic |
| Individual file summarization | Haiku | Bounded, mechanical |
| REPL root orchestration | Sonnet | Moderate reasoning, code generation |
| Complex analysis synthesis | Sonnet | Multi-step reasoning |
| Deep debugging / architecture | Opus | Complex judgment, first-try critical |
| Test generation sub-calls | Haiku | Template-filling per test case |
| Impact risk classification | Haiku | Bounded classification |
| Pattern audit per component | Haiku | Mechanical scanning |
| Data flow trace verification | Haiku | Link-by-link confirmation |

**Token projection for typical session:**

| Session type | Current (baseline) | With RLM plugin | Reduction |
|--------------|--------------------|-----------------|-----------|
| Single exploration query | 35-70K tokens | 12-20K tokens | 2-5x |
| 10-query session | 175-700K tokens (rot by query 5) | 50-80K tokens (clean throughout) | 3-9x |
| Full pattern audit (1,700 components) | Not feasible (exceeds context) | ~850K Haiku tokens (isolated, never in conversation) | N/A |

The pattern audit is a special case: 850K tokens sounds large, but those are Haiku sub-call tokens in isolated contexts that never enter the main conversation. The conversation itself only receives the ~2-5K token summary.

---

## 10. Workflow Examples

### 10a. "Where is the achievement unlock notification triggered?"

**Without RLM (current):**

```
1. Explore agent spawned (~20K system tokens)
2. git grep "achievement" -- "libs/" (returns 200+ matches, ~10K tokens)
3. Reads 5-6 files to narrow down (~15K tokens)
4. Returns answer (~2K tokens)
Total: ~47K tokens, 4-6 tool calls
```

**With RLM plugin:**

```
1. Workspace index already loaded (~0 additional tokens, cached)
2. REPL executes (Sonnet root):
   - components.get("app-achievement-dialog") -> file path (instant)
   - search("achievement.*notification", libs_paths) -> 12 matches (git grep, <1s)
   - Filters to .store.ts and .effects.ts files -> 4 matches
   - read() on those 4 files, extracts relevant sections
   - FINAL(summary with file:line references)
3. Main conversation receives distilled answer
Total: ~12K tokens (8K Sonnet root + 4K file reads in REPL)
```

### 10b. "What's the impact of changing the UserService API?"

**Without RLM:**

```
1. Manual nx affected analysis
2. Multiple Explore tasks to trace dependencies
3. Reading multiple files to understand coupling
Total: ~60-80K tokens across multiple agent spawns
```

**With RLM plugin:**

```
1. affected-analyzer.mjs: nx affected --print -> project list (0 LLM tokens)
2. deps-tree.mjs: dependency graph traversal (0 LLM tokens)
3. REPL (Sonnet root):
   - Iterates affected projects, categorizes by risk
   - Haiku sub-calls classify each project's coupling strength
   - FINAL(impact report with risk levels)
Total: ~15K tokens (8K Sonnet + 7x Haiku at 1K each)
```

### 10c. "Generate a ComponentStore for the new feature"

**Without RLM:**

```
1. Claude reads AGENTS.md patterns (~5K tokens)
2. Reads 2-3 example stores (~9K tokens)
3. Generates store (~3K tokens)
Total: ~17K tokens (all Opus)
```

**With RLM plugin:**

```
1. REPL (Sonnet root):
   - files("libs/**/*.store.ts") -> finds 50+ stores
   - Haiku sub-call: "Pick the 3 best examples matching [feature description]"
   - read() the 3 examples in REPL
   - Generates store following patterns
   - FINAL(generated code)
Total: ~10K tokens (6K Sonnet + 2K Haiku + 2K file reads)
```

### 10d. "Which components still use constructor injection?"

**Without RLM:**

```
Not feasible at scale. git grep gives false positives. Manual review of
1,700 components would consume the entire context window.
```

**With RLM plugin (/rlm:patterns):**

```
1. files("libs/**/*.component.ts") -> 1,700 paths (instant)
2. Batch into 34 chunks of 50 files
3. 34 parallel Haiku sub-calls: "Which of these files use constructor injection?"
4. Aggregate results by domain/product
Total: ~850K Haiku tokens (isolated sub-calls, never in conversation)
Conversation impact: ~2-5K tokens (summary only)
Output: Structured report with violating files grouped by library
```

---

## 11. Token Savings Projections

| Operation | Without Plugin (current) | With Plugin | Savings |
|-----------|------------------------|-------------|---------|
| "Find component X" | 20-40K (Explore + multi-grep) | 0-200 (index lookup) | ~99% |
| "What depends on library Y" | 30-60K (Explore + graph tracing) | 2-5K (deps-tree.mjs + handle) | 85-95% |
| "How does feature Z work" | 50-100K (Explore + multi-file reads) | 15-25K (RLM with targeted reads) | 50-75% |
| "Write tests for component W" | 30-50K (read patterns + examples + generate) | 10-18K (REPL finds examples + Haiku) | 50-70% |
| "Impact of changing service V" | 60-100K (multi-agent exploration) | 8-15K (script + REPL + Haiku) | 75-90% |
| "Pattern audit across workspace" | Not feasible (exceeds context) | ~850K Haiku (isolated) + ~3K conversation | N/A |
| "Trace data flow A -> B -> C" | 40-60K (multi-file reads in context) | 10-15K (REPL traversal + Haiku verify) | 70-80% |
| 10-query exploration session | 175-700K (severe rot by query 5) | 50-80K (clean context throughout) | 60-90% |

---

## 12. Plugin Structure Proposal

```
.claude/plugins/rlm/
|-- plugin.json                    # Plugin manifest
|-- commands/
|   |-- nx-deps.md                 # /rlm:nx-deps - Dependency tree
|   |-- nx-find.md                 # /rlm:nx-find - Project-aware search
|   |-- nx-alias.md                # /rlm:nx-alias - Path alias lookup
|   `-- status.md                  # /rlm:status - Session metrics
|-- skills/
|   |-- explore/                   # RLM-powered codebase exploration
|   |   |-- explore.md
|   |   `-- strategy-hints.md
|   |-- impact/                    # Nx-aware impact analysis
|   |   `-- impact.md
|   |-- analyze/                   # Large context analysis
|   |   `-- analyze.md
|   |-- test-gen/                  # Pattern-compliant test generation
|   |   `-- test-gen.md
|   |-- trace/                     # Cross-boundary data flow tracing
|   |   `-- trace.md
|   |-- patterns/                  # Pattern audit across monolith
|   |   `-- patterns.md
|   `-- smart-search/              # Auto-invoked search optimization
|       `-- smart-search.md
|-- agents/
|   |-- haiku-searcher.md          # Lightweight search worker
|   |-- haiku-classifier.md        # Task complexity router
|   `-- repl-executor.md           # RLM execution loop agent
|-- hooks/
|   |-- session-start-index.md     # Auto-build workspace index
|   |-- session-start-hints.md     # Inject strategy hints
|   |-- pre-compact-preserve.md    # Save context before compaction
|   |-- pre-tool-use-optimize.md   # Search optimization intercept
|   `-- post-tool-use-cache.md     # Result caching
`-- scripts/
    |-- workspace-indexer.mjs      # Build workspace JSON index
    |-- path-resolver.mjs          # tsconfig alias resolution
    |-- deps-tree.mjs              # Dependency tree printer
    |-- affected-analyzer.mjs      # nx affected parser
    |-- repl-sandbox.mjs           # Node.js VM REPL
    |-- handle-store.mjs           # Handle-based result storage
    |-- token-benchmark.mjs        # Token counting for RLM vs. baseline comparison
    |-- cache-manager.mjs          # Result caching with file-mtime TTL
    |-- nx-runner.mjs              # Safe Nx CLI wrapper
    `-- file-scanner.mjs           # Fast file counting/sizing
```

---

## 13. Open Questions

### Architecture

1. **REPL language:** Should the REPL execute JavaScript (natural for Node.js VM) or offer a constrained S-expression DSL (lower entropy, works with weaker models, per Matryoshka research [[RLM synthesis, section 15]])?

2. **Sub-LLM routing:** Should `llm_query()` calls always use Haiku, or should the REPL expose model selection? The research shows depth-based routing (capable root, lightweight sub-calls) is optimal [[RLM synthesis, section 9]].

3. **Persistence scope:** Should REPL state persist across invocations within a session (like the RLM `persistent=True` mode), or start fresh each time?

4. **Workspace index format:** Full JSON (more data, more tokens when loaded) vs. SQLite (zero tokens, queried via script) vs. hybrid (summary JSON + SQLite for detail)?

5. **Nx MCP integration:** The workspace already has an Nx MCP server configured. Should the plugin leverage MCP tools, or bypass them for the more token-efficient script approach?

6. **Trajectory logging:** Should the plugin log REPL trajectories for debugging/optimization, and if so, where?

### Scale-Specific

7. **Component registry build time:** With 1,700 components, regex scanning might take 5-10 seconds. Should the index be built incrementally (only rescan changed files) or fully rebuilt each time? Git diff can identify changed files.

8. **REPL file read limits:** With potentially large files (some Angular components 500+ lines), should the REPL's `read()` function default to truncated output (first 100 lines) with explicit `read(path, start, end)` for targeted reads?

9. **Parallel sub-calls:** The reference RLM implementation is sequential. For a 1,700-component audit, sequential Haiku calls would be slow. Should the REPL support `llm_batch()` for parallel sub-calls from the start?

10. **Offline vs. online index:** Should the component/store/service registries be built from static analysis (fast, no build required) or from compiled output like `.d.ts` files (more accurate, requires build)?

---

## Source Material References

| Reference | Document |
|-----------|----------|
| RLM paper | [[paper]](../rlm/paper-arxiv--recursive-language-models.md) |
| RLM synthesis | [[SYNTHESIS]](../rlm/SYNTHESIS.md) |
| Prompt engineering synthesis | [[PE-SYNTHESIS]](../prompt-engineering/SYNTHESIS.md) |
| Nx CLI research | [[NX-CLI]](../nx/nx-cli.md) |
| Hampton-io/RLM (Node.js VM) | [repo-hampton](D:/projects/github/hampton-io/RLM) |
| code-rabi/rllm (Node.js VM) | [repo-rllm](D:/projects/github/code-rabi/rllm) |
| Matryoshka (handle storage) | [repo-matryoshka](D:/projects/github/yogthos/Matryoshka) |
| rand/rlm-claude-code (guardrails, depth control) | [repo-rand](D:/projects/github/rand/rlm-claude-code) |
| Prime Intellect (strategy hints) | [[blog-pi]](../rlm/blog-prime-intellect--recursive-language-models-the-paradigm-of-2026.md) |
