# Feature Landscape

**Domain:** RLM-powered Nx monorepo navigation plugin for Claude Code
**Researched:** 2026-03-03
**Confidence:** HIGH (core features), HIGH (API contracts from source analysis), MEDIUM (termination brittleness mitigations)

---

## Deep-Dive: REPL Globals API Contracts

### Evidence Base

API contracts derived from source code analysis of four implementations:

- **Official RLM** (Python, alexzhang13/rlm) -- canonical reference
- **hampton-io/RLM** (TypeScript, Node.js VM) -- closest to our target
- **code-rabi/rllm** (TypeScript, Node.js VM) -- simpler variant
- **yogthos/Matryoshka** (TypeScript, S-expression + JS sandbox) -- handle storage pioneer

Confidence: HIGH for all contracts below. Source code was read directly, not summarized from docs.

### Core Data Globals

#### `workspace` -- Workspace Index Object

| Property   | Type                    | Notes                                                                                                                            |
| ---------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Input      | N/A (preloaded)         | Loaded from `workspace-index.json` at REPL init                                                                                  |
| Return     | `WorkspaceIndex` object | `{ projects: Map<string, ProjectInfo>, deps: AdjacencyList, aliases: Map<string, string>, meta: { projectCount: number, ... } }` |
| Mutability | Read-only               | Should be frozen via `Object.freeze()` or getter-only proxy                                                                      |
| Async      | No                      | Synchronous access                                                                                                               |
| Error      | N/A                     | Always available; if index missing, REPL should refuse to start                                                                  |

**Contract:** The workspace index is the RLM `context` equivalent. In the official RLM, `context` is a string; here it is a structured object. This is a key differentiator -- the LLM navigates a graph, not flat text.

**Implementation note from hampton-io:** The `context` global is set directly on the VM context object (`sandbox.context = contextString`). For our structured workspace, we set `sandbox.workspace = workspaceIndex` identically.

#### `projects` -- Project Map Shorthand

| Property | Type                       | Notes                                                           |
| -------- | -------------------------- | --------------------------------------------------------------- | ------------------------------------------- |
| Input    | N/A                        | Direct reference to `workspace.projects`                        |
| Return   | `Map<string, ProjectInfo>` | Keys are project names, values are `{ root: string, type: 'app' | 'lib', tags: string[], targets: string[] }` |
| Async    | No                         |                                                                 |

**Contract:** Syntactic sugar. `projects.get("my-lib")` is identical to `workspace.projects.get("my-lib")`. All 537 project entries are stored as a Map. The Map is the handle itself -- the LLM sees `Map(537)` in print output, not 537 serialized objects.

### Navigation Globals (Synchronous)

#### `deps(name: string): DependencyTree`

| Property              | Type                                                                            | Notes                                                                |
| --------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Input                 | `string` -- project name                                                        |                                                                      |
| Return                | `{ direct: string[], transitive: string[], depth: Map<string, number> }`        |                                                                      |
| Async                 | No                                                                              | Pure graph traversal on in-memory adjacency list                     |
| Error on invalid name | Returns `{ direct: [], transitive: [], depth: new Map() }` with warning printed | Do not throw -- the LLM should see the empty result and self-correct |
| Complexity            | O(V+E) BFS                                                                      | Cached after first call for same name                                |

**Contract from official RLM pattern:** Navigation globals should return data, not throw. The LLM sees the output and decides what to do next. Throwing breaks the execution loop's async IIFE wrapper and wastes an iteration.

#### `dependents(name: string): DependencyTree`

Identical contract to `deps()` but traverses the reverse adjacency list (who depends on this project, not what this project depends on).

### File System Globals (Synchronous)

#### `read(path: string, start?: number, end?: number): string`

| Property              | Type                                                                                  | Notes                                |
| --------------------- | ------------------------------------------------------------------------------------- | ------------------------------------ |
| Input                 | `path: string` -- relative to workspace root                                          |                                      |
| Input (optional)      | `start: number` -- line number (1-based)                                              |                                      |
| Input (optional)      | `end: number` -- line number (1-based, inclusive)                                     |                                      |
| Return                | `string` -- file content or slice                                                     |                                      |
| Async                 | No                                                                                    | `fs.readFileSync` under the hood     |
| Error on missing file | Returns `"[ERROR] File not found: <path>"` string                                     | Do not throw                         |
| Error on binary file  | Returns `"[ERROR] Binary file: <path>"` string                                        |                                      |
| Truncation            | If content > 10,000 chars and no start/end, truncate with `"... [N chars truncated]"` | Prevents accidental context flooding |

**Contract note:** Both hampton-io and rllm truncate output. Hampton-io truncates `print()` output at 20,000 chars; the official RLM truncates at `max_character_length=20000` in `format_iteration()`. Our `read()` should truncate aggressively (10K) because the LLM should use `read(path, start, end)` for targeted reads.

#### `files(glob: string): string[]`

| Property | Type                                                          | Notes                                           |
| -------- | ------------------------------------------------------------- | ----------------------------------------------- |
| Input    | `string` -- glob pattern (e.g., `"libs/**/*.store.ts"`)       |                                                 |
| Return   | `string[]` -- matching file paths, relative to workspace root |                                                 |
| Async    | No                                                            | Uses `fs.globSync` (Node.js 22.17+) or fallback |
| Error    | Returns empty array on invalid glob                           |                                                 |
| Limit    | Cap at 500 results with `"... [N more files]"` warning        |                                                 |

#### `search(pattern: string, paths?: string[]): SearchResult[]`

| Property         | Type                                                   | Notes                                                                                                                        |
| ---------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Input            | `pattern: string` -- regex or literal string           |                                                                                                                              |
| Input (optional) | `paths: string[]` -- restrict to these directories     |                                                                                                                              |
| Return           | `Array<{ file: string, line: number, match: string }>` |                                                                                                                              |
| Async            | No                                                     | `child_process.spawnSync('git', ['grep', '-n', ...], { shell: false })` (Node.js built-in fallback for non-git environments) |
| Error            | Returns empty array on invalid pattern or no matches   |                                                                                                                              |
| Limit            | Cap at 100 results                                     |                                                                                                                              |

**Contract from Matryoshka's `grep()`:** Returns structured objects with `{ match, line, lineNum }`. Our `search()` follows the same pattern. The structured return lets the LLM reference specific lines without re-reading files.

### Nx Integration Global (Synchronous)

#### `nx(command: string): string | object`

| Property                 | Type                                                                                             | Notes                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| Input                    | `string` -- Nx CLI command (without `nx` prefix)                                                 |                                           |
| Return                   | `string` (raw output) or parsed `object` if `--json` flag present                                |                                           |
| Async                    | No                                                                                               | `child_process.execSync` with 30s timeout |
| Allowlist                | `show`, `graph`, `list`, `report`, `affected --print`                                            |                                           |
| Error on blocked command | Returns `"[ERROR] Command not allowed: <command>. Allowed: show, graph, list, report, affected"` |                                           |
| Error on timeout         | Returns `"[ERROR] Command timed out after 30s"`                                                  |                                           |
| Caching                  | `nx graph --print` cached for 5 minutes (expensive, 3-5s on large workspaces)                    |                                           |

### LLM Sub-Call Global (Async)

#### `llm_query(prompt: string, model?: string): Promise<string>`

| Property         | Type                                                                         | Notes |
| ---------------- | ---------------------------------------------------------------------------- | ----- |
| Input            | `prompt: string` -- the question for the sub-LLM                             |       |
| Input (optional) | `model: string` -- ignored in v0.0.1 (always routes to haiku-searcher agent) |       |
| Return           | `Promise<string>` -- the sub-LLM's response                                  |       |
| Async            | **YES** -- must be awaited                                                   |       |
| Error            | Returns `"[ERROR] LLM query failed: <message>"` string (does not throw)      |       |
| Timeout          | 30s per call                                                                 |       |

**Critical architecture constraint: No subagent nesting.**

Claude Code does not support spawning a subagent from within a subagent. The `repl-executor` agent IS already a subagent of the main conversation. Therefore, `llm_query()` cannot spawn the `haiku-searcher` agent as a nested subagent.

**Architecture for llm_query() given this constraint:**

The three viable approaches, ranked by complexity:

**Option A: Direct Bash tool call (RECOMMENDED for v0.0.1)**
The `repl-executor` agent has access to the Bash tool. `llm_query()` invokes `claude` CLI or a Node.js script that makes a direct API call to Claude (Haiku) via the Anthropic SDK. This bypasses the subagent system entirely.

```
repl-executor agent (Sonnet)
  |
  +-- REPL sandbox executes code
       |
       +-- llm_query("summarize this")
            |
            +-- Node.js script calls Anthropic API directly
                (haiku model, simple prompt, returns string)
```

Pros: Simple, no nesting. Cons: Requires an Anthropic API key or Claude CLI token accessible from the Node.js script.

**Option B: Inline tool_use block**
The `repl-executor` agent generates a `tool_use` block (Bash call to a script) that the execution loop intercepts and resolves before the next REPL iteration. The sub-call result is injected back into the sandbox.

Pros: Uses the agent's existing tool permissions. Cons: Breaks the REPL execution flow -- the `llm_query()` call cannot be synchronously resolved within the VM sandbox.

**Option C: Defer llm_query() to a later milestone**
Ship v0.0.1 without `llm_query()`. The REPL has all deterministic globals (`deps`, `read`, `search`, `files`, `nx`). The root Sonnet model does all reasoning within the REPL loop. Sub-LLM delegation is a later milestone feature once the foundation proves value.

Pros: Simplest. Cons: Loses the Haiku cost optimization (all reasoning is Sonnet tokens).

**Recommendation:** Option C for v0.0.1. The explore skill can validate the RLM approach using only deterministic globals + Sonnet reasoning. `llm_query()` adds significant complexity (API key management, async resolution across VM boundary, error handling for external calls) that should be deferred until the core loop works.

Evidence: Hampton-io's `llm_query()` implementation requires a complex `PendingQuery` queue system with `executeWithQueryProcessing()` that polls pending queries in a loop while the VM executes. Code-rabi/rllm wraps it more simply but still needs the full async IIFE pattern. Both are non-trivial to get right, and both operate in contexts where the caller controls the LLM client directly -- not through a subagent system.

### Answer Termination Globals

#### `FINAL(answer: string): void`

| Property    | Type                                                            | Notes |
| ----------- | --------------------------------------------------------------- | ----- |
| Input       | `string` -- the final answer text                               |       |
| Return      | The input string (for chaining, but return value is irrelevant) |       |
| Side effect | Sets internal `__FINAL_ANSWER__` variable                       |       |
| Async       | No                                                              |       |

**Contract from all implementations:**

- Hampton-io: `FINAL` sets `this.variables['__FINAL_ANSWER__']` to the stringified value. The executor checks `sandbox.getVariable('__FINAL_ANSWER__')` after each code block execution.
- Code-rabi/rllm: `giveFinalAnswer({ message, data? })` validates with Zod schema. Must be called inside a code block.
- Official RLM (Python): `find_final_answer()` uses regex `r"^\s*FINAL\((.*)\)\s*$"` to parse from text. Can also be called as a function in the REPL.
- Matryoshka: Uses `<<<FINAL>>>...<<<END>>>` delimiters in text, outside code blocks.

**Our contract:** `FINAL()` is a function callable ONLY inside `repl` code blocks. It sets an internal flag that the execution loop checks after each code block. If set, the loop terminates and returns the value to the conversation.

#### `FINAL_VAR(name: string): void`

| Property                    | Type                                                                                     | Notes |
| --------------------------- | ---------------------------------------------------------------------------------------- | ----- |
| Input                       | `string` -- name of a REPL variable to return as the answer                              |       |
| Return                      | The variable name (irrelevant)                                                           |       |
| Side effect                 | Sets internal `__FINAL_VAR_NAME__` variable                                              |       |
| Error if variable not found | Official RLM: returns `"Variable 'X' not found"` and does NOT terminate (loop continues) |       |

**Critical edge case from official RLM:** If `FINAL_VAR("myResult")` is called but `myResult` doesn't exist in the REPL, the official implementation returns `None` from `find_final_answer()`, causing the loop to continue rather than terminating with an error. This is deliberate -- it gives the LLM a chance to create the variable and try again.

**Our contract:** Same behavior. `FINAL_VAR()` records the variable name. The execution loop looks up the variable. If not found, it appends a message like `"Variable 'myResult' not found. Create it first, then call FINAL_VAR again."` and continues the loop. This matches the official RLM's robustness.

#### `print(...args: unknown[]): void`

| Property      | Type                                                                                                     | Notes |
| ------------- | -------------------------------------------------------------------------------------------------------- | ----- |
| Input         | Variadic -- any number of arguments                                                                      |       |
| Return        | `void`                                                                                                   |       |
| Side effect   | Appends stringified output to the REPL turn output                                                       |       |
| Truncation    | Output capped at 2,000 chars per `print()` call, 20,000 chars total per turn                             |       |
| Serialization | Objects serialized via `JSON.stringify(value, null, 2)`. Falls back to `String(value)` on circular refs. |       |

**Implementation note from hampton-io:** They patch `Object.prototype.toString` to return JSON instead of `[object Object]`. This prevents the common bug where `"text " + someObject` produces `"text [object Object]"`. We should apply the same patch.

#### `SHOW_VARS(): string`

| Property  | Type                                                                  | Notes |
| --------- | --------------------------------------------------------------------- | ----- |
| Input     | None                                                                  |       |
| Return    | `string` -- formatted list of user-created variables                  |       |
| Filtering | Excludes all built-in globals (`workspace`, `projects`, `deps`, etc.) |       |
| Format    | `"Variables: myResult (string), matches (Array[15]), ..."`            |       |

---

## Deep-Dive: Handle-Based Result Storage

### What the Handle Store Solves

When the LLM calls `projects` (537 entries) or `files("libs/**/*.ts")` (potentially thousands of paths), dumping the full result into the REPL output would consume 10-50K tokens. The handle store intercepts large results and returns a compact stub instead.

### How It Works in Practice (Matryoshka Pattern)

**Matryoshka (yogthos/Matryoshka)** pioneered this in the RLM context. Its approach:

1. Results from operations are stored in named bindings (`RESULTS`, `_1`, `_2`, etc.)
2. Array results automatically bind to `RESULTS` for chaining
3. Scalar results bind only to `_N` (preserving the previous `RESULTS` array)
4. The LLM sees summaries: `"Array[47] - first: { ... }, last: { ... }"`
5. The LLM operates on the handle via code: `RESULTS.filter(...)`, `RESULTS[0]`, etc.

From Matryoshka's `nucleus-engine.ts` (line 244-266):

```typescript
if (Array.isArray(solverResult.value)) {
  solverBindings.set('RESULTS', solverResult.value);
} else {
  // Scalar result - only bind to _N, preserve RESULTS
}
```

**Hampton-io/RLM** uses a simpler approach -- `store(name, value)` and `get(name)` functions for explicit persistence, plus the `const/let -> globalThis` transformation:

```typescript
const transformedCode = code.replace(
  /\b(const|let)\s+(\w+)\s*=/g,
  'globalThis.$2 =',
);
```

This makes all top-level variable declarations persist across code blocks automatically. No explicit handle store needed -- the VM context IS the store.

### Our Handle Store Protocol

**Trigger:** Any return value that would serialize to > 500 tokens when printed.

**What the stub looks like:**

```
$projects: Map(537) [connect, connect-e2e, assets, shared-util-rxjs, ... +532 more]
$searchResults: Array(47) [{ file: "libs/connect/...", line: 12 }, ... +46 more]
$depTree: { direct: 12, transitive: 35, total: 47 }
```

**How the LLM references a handle in subsequent code:**

```javascript
// The Map/Array IS the handle -- it lives in the VM context
// The LLM navigates it via code:
let p = projects.get('connect-shared-users-data-access');
print(p.targets); // Only the specific data it needs enters the output

// For search results stored as a variable:
let relevant = searchResults.filter((r) => r.file.includes('data-access'));
print(relevant.length); // "3"
print(relevant[0]); // Only first result printed
```

**Implementation:** The handle store is not a separate Map. It IS the VM context's `globalThis`. Variables persist across code blocks via the `const/let -> globalThis` transformation (hampton-io pattern). The `print()` function applies smart serialization:

1. Primitives: print as-is
2. Arrays > 5 elements: `"Array(N) [first, second, ... +N-2 more]"`
3. Maps > 5 entries: `"Map(N) [key1, key2, ... +N-2 more]"`
4. Objects > 500 chars serialized: truncated with `"... [N chars]"`

This means the "handle store" is not a separate component -- it is the combination of:

- `globalThis` persistence across code blocks (hampton-io pattern)
- Smart truncation in `print()` output
- The `SHOW_VARS()` function to list what's in the store

### Token Savings Estimate

| Scenario                  | Raw output tokens | Handle output tokens | Savings |
| ------------------------- | ----------------- | -------------------- | ------- |
| 537 projects listed       | ~50,000           | ~200 (stub)          | 99.6%   |
| 1,700 file paths          | ~17,000           | ~150 (stub)          | 99.1%   |
| Dependency tree (47 deps) | ~2,000            | ~100 (summary)       | 95%     |
| Single project detail     | ~200              | ~200 (no truncation) | 0%      |

---

## Deep-Dive: Fill/Solve Execution Loop Termination

### How the Loop Works

All four implementations follow the same pattern:

````
for iteration in range(maxIterations):
    response = llm.complete(messages)        # Root LLM generates text + code
    codeBlocks = extractCode(response)       # Parse ```repl blocks
    for code in codeBlocks:
        result = sandbox.execute(code)       # Run in VM
        if sandbox.hasFinalAnswer():
            return sandbox.getFinalAnswer()  # DONE
    messages.append(response + result)       # Append for next iteration
````

### What "Brittleness in Answer Termination" Means Concretely

The RLM paper (Section 16.5) flags this as limitation #5. From the implementations, three specific failure modes emerge:

**Failure Mode 1: FINAL() in prose, not code**

The LLM writes `FINAL("the answer")` as plain text instead of inside a code block. The text parser may or may not catch this depending on the regex.

- **Official RLM:** `find_final_answer()` uses `r"^\s*FINAL\((.*)\)\s*$"` with `re.MULTILINE`, which catches FINAL at the start of any line in the full response -- prose or code.
- **Hampton-io:** Checks for `__FINAL_ANSWER__` variable (set by function call) first, then falls back to text parsing. The system prompt explicitly says "FINAL() MUST ALWAYS be called inside a code block."
- **Code-rabi/rllm:** Uses `giveFinalAnswer({ message, data? })` with Zod validation -- if the LLM writes it in prose, it is not executed and the Zod schema never runs. The loop continues.
- **Matryoshka:** Uses `<<<FINAL>>>...<<<END>>>` delimiters which are explicitly designed to be in prose (outside code blocks). Different paradigm.

**Prevention for our plugin:**

1. Make `FINAL()` a function in the VM context (like hampton-io). It ONLY works when executed as code.
2. After parsing the LLM response, check for `FINAL(` in non-code text. If found, append a user message: `"FINAL() must be inside a \`\`\`repl code block. Please wrap it in code."`
3. Do NOT regex-parse FINAL from prose. This eliminates the ambiguity entirely.

**Failure Mode 2: Premature FINAL without evidence**

The LLM calls `FINAL("I think the answer is X")` on iteration 1 without actually examining the workspace. This happens especially with strong models that are confident but wrong.

- **Official RLM:** The system prompt includes a safeguard for iteration 0: `"You have not interacted with the REPL environment yet. Your next action should be to look through..."`
- **Matryoshka:** Tracks `codeExecuted` boolean. Rejects any `<<<FINAL>>>` if no code has been run: `"You tried to answer without reading the document."`
- **Code-rabi/rllm:** On max iterations, explicitly prompts: `"You've reached the maximum iterations. Please provide your best final answer now."`

**Prevention for our plugin:**

1. Track a `codeExecutedCount` counter. If `FINAL()` is called and `codeExecutedCount < 2`, reject with: `"You must explore the workspace before answering. Use deps(), search(), or read() first."`
2. The system prompt should include the iteration-0 safeguard from the official RLM.

**Failure Mode 3: Infinite "thinking" without code**

The LLM responds with reasoning text but no code blocks, endlessly. No code means no FINAL, so the loop runs to `maxIterations`.

- **Hampton-io:** If no code and no FINAL, appends: `"Please write code to explore the context or provide your final answer using FINAL('answer')."`
- **Matryoshka:** Tracks `noCodeCount`. After 3 consecutive no-code responses, auto-terminates with the last meaningful output.
- **Official RLM:** Relies on `max_iterations` as the hard stop, then calls `_default_answer()` which asks the LLM for a final answer in one more call.

**Prevention for our plugin:**

1. If no code block extracted from the response, append a prompt: `"Write code in a ```repl block to explore the workspace. Available: deps(), search(), read(), files(), projects."`
2. Track consecutive no-code turns. After 3, auto-request: `"You have not written code in 3 turns. Provide your best answer now using FINAL() in a code block, or write code to continue exploring."`
3. Hard cap at `maxIterations` (20). On expiry, make one final LLM call requesting just the answer.

**Failure Mode 4: Error loop**

The LLM writes code that errors, fixes it incorrectly, errors again, in an infinite cycle.

- **Official RLM:** Tracks `_consecutive_errors`. Raises `ErrorThresholdExceededError` after `max_errors` consecutive failures. Returns `_best_partial_answer`.
- **Matryoshka:** Tracks `doneCount` for repeated unhelpful outputs. After 3 stuck iterations, auto-terminates.
- **Hampton-io:** Errors are caught inside the async IIFE wrapper and reported as stderr, but no error counter exists.

**Prevention for our plugin:**

1. Track `consecutiveErrors` counter. Reset to 0 on any successful execution.
2. After `maxErrors` (default 3) consecutive errors, terminate with: `"Execution stopped after 3 consecutive errors. Last error: <message>."` Return the best partial answer if any.

### Complete Termination State Machine

```
START
  |
  v
[Iteration N] --> LLM generates response
  |
  +-- Has code blocks?
  |     |
  |     +-- YES --> Execute each code block
  |     |     |
  |     |     +-- FINAL() called?
  |     |     |     |
  |     |     |     +-- YES, codeExecutedCount >= 2 --> RETURN answer [DONE]
  |     |     |     +-- YES, codeExecutedCount < 2 --> Reject, continue loop
  |     |     |     +-- NO --> Append result, continue
  |     |     |
  |     |     +-- Execution error?
  |     |           |
  |     |           +-- consecutiveErrors >= maxErrors --> RETURN partial [DONE]
  |     |           +-- consecutiveErrors < maxErrors --> Append error, continue
  |     |
  |     +-- NO --> noCodeCount++
  |           |
  |           +-- FINAL() in prose text?
  |           |     +-- YES --> Prompt to use code block, continue
  |           |
  |           +-- noCodeCount >= 3 --> Force final answer request
  |           +-- noCodeCount < 3 --> Prompt to write code, continue
  |
  +-- N >= maxIterations? --> Make one final "give answer now" call --> RETURN [DONE]
  |
  +-- Elapsed > maxTimeout? --> RETURN best partial answer [DONE]
```

---

## Table Stakes (Users Expect These)

Features users expect from any RLM-powered codebase navigation tool. Missing these means the plugin provides no value over vanilla Claude Code.

| Feature                                              | Why Expected                                                                                                                                                                                             | Complexity | Notes                                                                                                                                                                                                       |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Workspace index** (project graph as JSON)          | Every Nx AI integration starts here. Nx's own skills and MCP server expose the project graph. Without it, the plugin is blind.                                                                           | MEDIUM     | Build from `nx show projects --json`, `nx graph --print`, `tsconfig.base.json`. ~50-100KB for 537 projects. Pure Node.js, zero LLM tokens.                                                                  |
| **REPL sandbox** (Node.js VM with workspace globals) | The defining RLM capability. Without a REPL, there is no context externalization -- the plugin is just another skill file. Every serious RLM plugin (rand, brainqub3, Hampton-io, rllm) implements this. | HIGH       | `vm.createContext()` with controlled globals. <5ms startup. Security: `codeGeneration: { strings: false, wasm: false }`. `const/let -> globalThis` transformation for state persistence across code blocks. |
| **Handle-based result storage** (smart truncation)   | Large results (537 project objects, 1,700 file paths) must not dump into LLM context.                                                                                                                    | LOW        | NOT a separate Map store. The VM context IS the store (globalThis persistence). Smart `print()` truncation provides the "handle" UX. The LLM navigates via code, not by reading raw dumps.                  |
| **Execution loop** (fill/solve cycle)                | The core RLM execution pattern. Root LLM generates code, sandbox executes, results appended, loop until `FINAL()`. Without this loop, the REPL is just a one-shot tool.                                  | HIGH       | 5-20 iterations typical. Needs `maxIterations` (20), `maxErrors` (3), `maxTimeout` (120s) guardrails. Four termination failure modes documented above with specific mitigations.                            |
| **Deterministic commands** (deps, find, alias)       | Zero-LLM-token operations for common queries. Users want instant answers for "what depends on X", "where is file Y", "what alias maps to Z".                                                             | LOW        | Node.js scripts wrapping workspace index and `tsconfig.base.json`. Three commands: `/deps`, `/find`, `/alias`.                                                                                              |
| **Nx CLI wrapper** (allowlisted read-only commands)  | The REPL needs safe access to Nx CLI for `nx show`, `nx graph`. Must allowlist read-only commands and block mutations.                                                                                   | LOW        | Allowlist: `show`, `graph`, `list`, `report`, `affected --print`. Block: `run`, `build`, `generate`, `migrate`. Timeout: 30s. Cache expensive operations.                                                   |
| **RLM configuration/guardrails**                     | Without guardrails, RLM loops can run indefinitely. Only rand/rlm-claude-code implements explicit budget controls among existing plugins.                                                                | LOW        | `maxIterations` (20), `maxDepth` (2), `maxTimeout` (120s), `maxErrors` (3). JSON config file.                                                                                                               |
| **Explore skill** (RLM-powered codebase Q&A)         | The primary user-facing capability. "Where is X?", "How does Y work?", "What depends on Z?" -- answered via the REPL fill/solve loop.                                                                    | HIGH       | Loads workspace index into REPL, root LLM (Sonnet) navigates with deterministic globals. Sub-LLM calls deferred to a later milestone.                                                                       |

## Differentiators (Competitive Advantage)

Features that set this plugin apart from generic RLM plugins and Nx's own AI skills.

| Feature                                       | Value Proposition                                                                                                                                              | Complexity | Notes                                                                                                                               |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Nx-native workspace model**                 | No existing RLM plugin understands Nx project graphs, dependency edges, path aliases, or project tags. Generic RLM plugins treat codebases as flat file trees. | MEDIUM     | REPL globals include `deps(name)`, `dependents(name)`, project tags, targets. The workspace model is Nx-specific.                   |
| **Cross-platform Node.js-only**               | Most RLM plugins require Python, Rust, Docker, or external services. This plugin needs only Node.js LTS.                                                       | LOW        | Zero native modules. Works on macOS, Linux, Windows (Git Bash).                                                                     |
| **Context rot prevention by design**          | REPL isolation means intermediate results never enter the main conversation. A 10-query session stays at ~50-60K tokens instead of 175-700K.                   | --         | Architectural, not a discrete feature. Every REPL interaction is isolated; only `FINAL()` answers enter conversation context.       |
| **Progressive workspace disclosure**          | Instead of loading the full workspace index (~8K tokens), load only project counts and top-level domains at session start (~2K), then expand on demand.        | LOW        | Tier 1: domain summary. Tier 2: domain detail on first query. Tier 3: file content via REPL only.                                   |
| **Strategy hints** (model-specific REPL tips) | Prime Intellect's research shows strategy hints significantly improve RLM performance. Without hints, models sometimes underperform vs. base LLM.              | LOW        | Workspace-specific hints injected into REPL system prompt: library naming conventions, domain structure, preferred search patterns. |
| **Robust termination** (multi-layer)          | No existing Claude Code RLM plugin implements comprehensive termination handling. Most rely solely on `maxIterations`.                                         | MEDIUM     | Code-only FINAL, premature-answer rejection, no-code detection, error counting, timeout. See termination state machine above.       |

## Anti-Features (Commonly Requested, Often Problematic)

Features that seem valuable but create problems. Documenting these prevents scope creep.

| Feature                             | Why Requested                                                                           | Why Problematic                                                                                                                                                                       | Alternative                                                                                                                                                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **llm_query() in v0.0.1**           | Sub-LLM calls are core to the RLM paradigm. Hampton-io and official RLM implement them. | Requires solving async VM boundary (complex PendingQuery system), API key management, and cannot use subagent nesting in Claude Code. The `repl-executor` is already a subagent.      | Defer to a later milestone. v0.0.1 validates the REPL approach with Sonnet-only reasoning + deterministic globals. If Sonnet can navigate the workspace without sub-calls, the architecture is sound.                  |
| **Persistent cross-session memory** | 3 of 8 existing RLM plugins implement this. Seems natural.                              | Massive complexity (SQLite, graph schemas, lifecycle management). The workspace index already provides structural memory deterministically. Git is the cross-session memory for code. | The workspace index IS the persistent memory -- rebuilt from Nx CLI output each session.                                                                                                                               |
| **Angular-specific registries**     | The target workspace has 1,700 Angular components. Registries enable instant lookups.   | Locks v0.0.1 to Angular, limiting the plugin to one framework.                                                                                                                        | Defer to a later milestone. v0.0.1 uses `search()` and `files()` for framework-agnostic patterns.                                                                                                                      |
| **MCP server integration**          | 4 of 8 existing RLM plugins use MCP.                                                    | MCP adds tool definitions to the system prompt (consuming context tokens). Nx's own blog explains why they deleted most MCP tools in favor of skills.                                 | Use skills and Node.js scripts. The REPL sandbox provides richer interaction than MCP tool calls.                                                                                                                      |
| **Hooks in v0.0.1**                 | Automate workspace indexing, intercept searches, cache results.                         | Hooks add invisible behavior that is hard to debug. v0.0.1 should prove value through explicit skill invocation before adding automation.                                             | Defer to a later milestone. Users manually invoke `/explore`, `/deps`, `/find`.                                                                                                                                        |
| **Separate handle-store.mjs**       | BRAINSTORM.md proposes a dedicated handle store script.                                 | Over-engineering. The VM context's `globalThis` IS the handle store (hampton-io pattern). Smart `print()` truncation IS the handle UX. No separate Map needed.                        | Implement smart truncation in `print()` and `const/let -> globalThis` transform in `repl-sandbox.mjs`. No separate script.                                                                                             |
| **S-expression DSL**                | Matryoshka uses S-expressions. Reduced entropy for smaller models.                      | JavaScript is natural for TS/Nx workspaces. Claude (Sonnet/Opus) generates JavaScript fluently.                                                                                       | Use JavaScript REPL. Decision already made in PROJECT.md.                                                                                                                                                              |
| **Semantic/vector search**          | Zilliz claude-context claims ~40% token reduction via semantic search.                  | Requires external embedding model, vector database, and index build time. `git grep` + workspace index covers the workspace navigation use cases.                                     | Use `git grep` via `spawnSync` with `shell: false` in the REPL's `search()` global (Node.js built-in fallback for non-git environments). See `.planning/quick/1-research-and-analyze-git-grep-and-altern/ANALYSIS.md`. |
| **Token benchmarking in v0.0.1**    | Validates that RLM actually reduces tokens.                                             | Premature optimization measurement. Building benchmarking infrastructure before the core REPL loop works is overhead.                                                                 | Defer to a later milestone. Validate savings manually first.                                                                                                                                                           |

## Feature Dependencies

```
[Workspace Index]
    |
    +--requires--> [REPL Sandbox]
    |                   |
    |                   +--requires--> [Execution Loop]
    |                   |                   |
    |                   |                   +--requires--> [Explore Skill]
    |                   |
    |                   +--includes--> [Handle Store (globalThis + smart print)]
    |                   |
    |                   +--includes--> [RLM Config/Guardrails]
    |                   |
    |                   +--includes--> [Termination State Machine]
    |
    +--requires--> [Nx CLI Wrapper]
    |                   |
    |                   +--enhances--> [REPL Sandbox] (nx() global)
    |
    +--requires--> [Deterministic Commands] (deps, find, alias)

[Strategy Hints]
    +--enhances--> [Execution Loop] (better model behavior)

[Progressive Disclosure]
    +--enhances--> [Workspace Index] (selective loading)

[llm_query()] -- DEFERRED to a later milestone
    +--enhances--> [Execution Loop] (sub-LLM delegation)
```

### Dependency Notes

- **Workspace Index is the foundation.** Every other feature depends on it.
- **Handle Store is NOT a separate component.** It is `globalThis` persistence + smart `print()` truncation, both part of `repl-sandbox.mjs`.
- **Termination State Machine is part of the execution loop.** Not a separate component -- it is the loop's control flow.
- **Deterministic Commands are independent of REPL.** They read the workspace index directly via Node.js scripts. Can ship alongside or before the REPL.
- **llm_query() is deferred.** The explore skill works without sub-LLM calls -- Sonnet does all reasoning in the REPL loop.

## MVP Definition

### Launch With (v0.0.1)

Minimum viable product -- what is needed to validate that RLM navigation actually reduces tokens and improves exploration quality in an Nx monorepo.

- [ ] **Workspace indexer** -- Node.js script building JSON index from Nx CLI output
- [ ] **Path resolver** -- Bidirectional tsconfig path alias resolution
- [ ] **REPL sandbox** -- Node.js VM with workspace-aware globals (`workspace`, `projects`, `deps()`, `dependents()`, `read()`, `files()`, `search()`, `nx()`, `FINAL()`, `FINAL_VAR()`, `print()`, `SHOW_VARS()`)
- [ ] **Handle-based result storage** -- globalThis persistence + smart print() truncation (part of REPL sandbox, not a separate component)
- [ ] **RLM configuration** -- Guardrails: `maxIterations`, `maxDepth`, `maxTimeout`, `maxErrors`
- [ ] **Nx CLI wrapper** -- Allowlisted read-only commands with timeout and caching
- [ ] **Execution loop with robust termination** -- Fill/solve cycle with code-only FINAL, premature-answer rejection, no-code detection, error counting, timeout
- [ ] **Explore skill** -- RLM-powered codebase exploration via fill/solve loop (Sonnet-only, no sub-LLM calls)
- [ ] **repl-executor agent** -- Drives the RLM execution loop as a subagent (isolated context)
- [ ] **Deterministic commands** -- `/deps` (dependency tree), `/find` (project-scoped search), `/alias` (path alias lookup)

**Explicitly NOT in v0.0.1:**

- `llm_query()` -- deferred, subagent nesting constraint makes this non-trivial
- `haiku-searcher` agent -- deferred, no `llm_query()` to route to
- Hooks -- deferred, prove value through explicit invocation first
- Token benchmarking -- deferred, validate manually

### Add After Validation (Later Milestone)

- [ ] **llm_query()** via direct Anthropic API call (Option A from architecture analysis)
- [ ] **haiku-searcher agent** as the `llm_query()` target
- [ ] **Sub-LLM model routing** (Sonnet root, Haiku sub-calls)
- [ ] **SessionStart hook** (auto-index)
- [ ] **Strategy hints injection**
- [ ] **Impact analysis skill** (`/impact`)

### Future Consideration (Later Milestones)

- [ ] **Angular-specific registries**
- [ ] **Agent teams**
- [ ] **Additional skills** (analyze, test-gen, trace, patterns, search)
- [ ] **Token benchmarking / status command**
- [ ] **Generic RLM engine extraction**

## Feature Prioritization Matrix

| Feature                      | User Value | Implementation Cost | Risk   | Priority |
| ---------------------------- | ---------- | ------------------- | ------ | -------- |
| Workspace indexer            | HIGH       | MEDIUM              | LOW    | P0       |
| Path resolver                | MEDIUM     | LOW                 | LOW    | P0       |
| REPL sandbox (VM + globals)  | HIGH       | HIGH                | MEDIUM | P0       |
| globalThis persistence       | HIGH       | LOW                 | LOW    | P0       |
| Smart print() truncation     | HIGH       | LOW                 | LOW    | P0       |
| Execution loop + termination | HIGH       | HIGH                | HIGH   | P0       |
| RLM config/guardrails        | MEDIUM     | LOW                 | LOW    | P0       |
| Nx CLI wrapper               | HIGH       | LOW                 | LOW    | P0       |
| Explore skill                | HIGH       | MEDIUM              | MEDIUM | P0       |
| repl-executor agent          | HIGH       | MEDIUM              | MEDIUM | P0       |
| Deterministic commands       | HIGH       | LOW                 | LOW    | P0       |
| llm_query()                  | MEDIUM     | HIGH                | HIGH   | P1       |
| haiku-searcher agent         | MEDIUM     | MEDIUM              | MEDIUM | P1       |
| Strategy hints               | MEDIUM     | LOW                 | LOW    | P1       |
| Impact analysis skill        | MEDIUM     | MEDIUM              | LOW    | P2       |
| SessionStart hook            | MEDIUM     | LOW                 | LOW    | P2       |
| Token benchmarking           | LOW        | MEDIUM              | LOW    | P2       |
| Angular registries           | MEDIUM     | HIGH                | MEDIUM | P3       |
| Agent teams                  | LOW        | HIGH                | HIGH   | P3       |

**Priority key:**

- P0: Must have for v0.0.1 -- validates the core RLM hypothesis
- P1: Should have for a later milestone -- adds sub-LLM delegation
- P2: Nice to have -- automation and measurement
- P3: Future milestone

## Sources

### Reference Implementation Source Code (directly read)

- **Official RLM (Python):** `D:/projects/github/alexzhang13/rlm/rlm/` -- `core/rlm.py`, `utils/parsing.py`, `utils/prompts.py`
- **hampton-io/RLM (TypeScript):** `D:/projects/github/hampton-io/RLM/src/` -- `sandbox/vm-sandbox.ts`, `executor.ts`, `prompts/system.ts`, `rlm.ts`
- **code-rabi/rllm (TypeScript):** `D:/projects/github/code-rabi/rllm/src/` -- `sandbox.ts`, `rlm.ts`, `prompts.ts`
- **yogthos/Matryoshka (TypeScript):** `D:/projects/github/yogthos/Matryoshka/src/` -- `sandbox.ts`, `rlm.ts`, `engine/nucleus-engine.ts`

### Research Corpus (local)

- `research/rlm/SYNTHESIS.md` -- RLM theory, architecture, 8 existing Claude Code plugin implementations
- `research/claude-plugin/BRAINSTORM.md` -- Detailed plugin design with token projections

### Nx AI Integration (verified)

- [Enhance Your AI Coding Agent | Nx](https://nx.dev/docs/features/enhance-ai)
- [Why we deleted (most of) our MCP tools | Nx Blog](https://nx.dev/blog/why-we-deleted-most-of-our-mcp-tools)

---

> **Correction (2026-03-05):** The feature table (line 419) describes the workspace index as "Pure Node.js, zero LLM tokens." This is accurate for the script itself. However, the broader assumption that Claude Code commands consume "zero LLM tokens" (reflected throughout the planning documents) was incorrect. `disable-model-invocation: true` prevents Claude from _automatically_ invoking commands but does not bypass model processing when users invoke them. The "zero LLM" framing was influenced by the RLM reference implementations where the REPL sandbox calls script functions as direct VM globals — genuinely zero model involvement. The Claude Code command invocation path is different. See CLI-01 in REQUIREMENTS.md.

_Feature research for: RLM-powered Nx monorepo navigation -- REPL globals, handle store, execution loop, llm_query architecture_
_Researched: 2026-03-03_
_Source analysis confidence: HIGH -- all contracts derived from direct source code reading, not secondary documentation_
