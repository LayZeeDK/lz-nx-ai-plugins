# Architecture Research

**Domain:** RLM-powered Nx Claude Code plugin -- component integration, data flow, error boundaries
**Researched:** 2026-03-03
**Confidence:** HIGH

## System Overview

```
+------------------------------------------------------------------+
|  USER LAYER                                                      |
|  /explore "question"  |  /deps project  |  /find pattern         |
|                       |                 |                        |
|  SKILL.md instructs   |  Command .md    |  Command .md           |
|  Claude to spawn      |  runs script    |  runs script           |
|  repl-executor agent  |  via Bash tool  |  via Bash tool         |
+----------+------------+--------+--------+--------+--------+------+
           |                     |                 |
           v                     |                 |
+----------+------------------+  |                 |
|  AGENT LAYER                |  |                 |
|                             |  |                 |
|  repl-executor (Sonnet)     |  |                 |
|  - Generates ```repl code   |  |                 |
|  - Calls Bash to invoke     |  |                 |
|    repl-sandbox.mjs         |  |                 |
|  - Parses SandboxResult     |  |                 |
|  - Loops until FINAL()      |  |                 |
|                             |  |                 |
+----------+------------------+  |                 |
           |                     |                 |
           v                     v                 v
+----------+---------------------+-----------------+---------------+
|  SCRIPT LAYER (Node.js, 0 LLM tokens)                            |
|                                                                  |
|  repl-sandbox.mjs    workspace-indexer.mjs    nx-runner.mjs      |
|  handle-store.mjs    path-resolver.mjs        rlm-config.mjs     |
|                                                                  |
+----------+-------------------------------------------------------+
           |
           v
+----------+-------------------------------------------------------+
|  EXTERNAL LAYER                                                  |
|  Nx CLI (child_process)  |  filesystem (fs)  |  git (git grep)   |
+------------------------------------------------------------------+
```

## Data Flow: Complete Path for `/explore "question"`

This is the exact sequence of data crossing each boundary, with formats specified.

### Step 1: User invokes skill

```
User types: /lz-nx.rlm:explore "Where is the UserService defined?"

Claude reads: plugins/lz-nx.rlm/skills/explore/SKILL.md
  -> Injects skill instructions into conversation context
  -> Instructions tell Claude to spawn the repl-executor agent

Data crossing boundary: $ARGUMENTS string -> Claude's context
Format: Plain text string
```

### Step 2: Claude spawns repl-executor agent

```
Claude uses the Agent tool to spawn repl-executor.

Data crossing boundary:
  IN:  Prompt containing the user's question + workspace index path
  OUT: (later) The agent's final text response

The agent receives:
  - System prompt from agents/repl-executor.md
  - User message with the query and index location
  - Tools: Bash, Read (restricted set)
  - Model: sonnet

Format: Claude Agent tool protocol (internal, not controllable)
```

### Step 3: Agent loads workspace index

```
repl-executor uses Bash tool:
  node scripts/workspace-indexer.mjs --check

If index is stale or missing:
  node scripts/workspace-indexer.mjs --build

Agent then uses Read tool:
  Read: plugins/lz-nx.rlm/.cache/workspace-index.json

Data crossing boundary: JSON file -> agent context
Format: WorkspaceIndex JSON (~50-100KB)
Size impact: Consumed as agent context tokens (~15-25K tokens for 537 projects)
```

### Step 4: Agent generates REPL code and invokes sandbox

```
Agent generates JavaScript in a ```repl fenced block:

  ```repl
  let libs = Object.keys(workspace.projects)
    .filter(name => name.includes('user'))
  print(libs)
```

Agent invokes via Bash tool:
  node scripts/repl-sandbox.mjs --index .cache/workspace-index.json

  The code is passed via stdin (not CLI argument, to avoid shell escaping):
  echo '<CODE>' | node scripts/repl-sandbox.mjs --index .cache/workspace-index.json

Data crossing boundary (Agent -> Script):
  IN: JavaScript source code (stdin) + index path (CLI arg)
  Format: UTF-8 text on stdin, CLI flag for index path

Data crossing boundary (Script -> Agent):
  OUT: SandboxResult as JSON on stdout
  Format: JSON object (see schema below)
```

### Step 5: SandboxResult schema

The REPL sandbox always returns this structure on stdout:

```javascript
// SandboxResult -- the contract between repl-sandbox.mjs and the agent
{
  "stdout": "connect-shared-users-data-access\nconnect-shared-users-feature",
  "error": null,              // or error message string
  "locals": {                 // variables created during execution
    "libs": ["connect-shared-users-data-access", "..."]
  },
  "handles": {                // new handles created this turn
    "$res1": "Array(47) [connect-shared-users-data-access, ...]"
  },
  "final": null,              // or the FINAL() answer string
  "executionTimeMs": 3,
  "iterationHint": null       // or "error_recovery" | "no_output" | "max_output"
}
```

### Step 6: Agent parses result and decides next action

```
Agent receives SandboxResult JSON as Bash tool output.

Decision tree:
  if result.final != null:
    Return result.final as the agent's response -> Step 9
  if result.error != null:
    Increment consecutive error count
    if consecutiveErrors >= 3: abort with error summary -> Step 9
    Generate fix code -> Step 4
  if result.stdout is empty:
    Generate probing code -> Step 4
  else:
    Reset consecutive error count
    Analyze output, generate next code -> Step 4

Data crossing boundary: JSON stdout -> agent's message history
Format: Agent appends raw output (truncated to 2KB) as context
Truncation: If result.stdout > 2048 chars, truncated with "[truncated]" marker
```

### Step 7: Iteration loop

```
Steps 4-6 repeat up to maxIterations (default: 20).

Each iteration:
  - Agent sends ONE Bash call to repl-sandbox.mjs
  - Sandbox executes code, returns SandboxResult
  - Agent appends assistant message (code) + user message (result) to its history
  - Agent generates next code block

State persistence between iterations:
  - The sandbox process is invoked fresh each iteration
  - BUT the workspace index is re-read from the same JSON file
  - AND variables from previous turns are serialized in a session state file
    (.cache/repl-session-<id>.json) that the sandbox loads on startup
```

### Step 8: FINAL answer detection

```
The LLM calls FINAL("answer string") inside REPL code:

  ```repl
  let answer = `UserService is defined in:
  - libs/connect/shared/users/data-access/src/lib/user.service.ts
  It is provided in root and used by 12 projects.`
  FINAL(answer)
```

Sandbox sets result.final to the answer string.
Agent sees result.final != null and returns it.

Data format: Plain text string (the distilled answer)
```

### Step 9: Agent returns to main conversation

```
The repl-executor agent's response becomes the Agent tool output
in the main conversation.

Data crossing boundary: Agent response -> main conversation
Format: Plain text (the FINAL answer)
Token impact: Only the distilled answer enters the conversation (~200-1000 tokens)
             All intermediate iterations stay in the agent's context (discarded)
```

## Data Flow: Deterministic Commands

Commands bypass the agent layer entirely.

```
/lz-nx.rlm:deps my-project
  |
  v
Command markdown (deps.md):
  !`node ${CLAUDE_PLUGIN_ROOT}/scripts/deps-tree.mjs my-project`
  |
  v
deps-tree.mjs:
  1. Reads .cache/workspace-index.json
  2. Walks adjacency list from "my-project"
  3. Formats tree as text
  4. Writes to stdout
    |
    v
    Output displayed directly to user (0 LLM tokens)

Data formats:
  IN: project name as CLI argument
  OUT: Formatted dependency tree as text on stdout
```

## REPL Sandbox Communication Protocol

### Per-Invocation Model (Recommended for v0.0.1)

Each REPL turn is a separate `node` process invocation. This is simpler than a persistent process and avoids IPC complexity.

```
Agent                          repl-sandbox.mjs
  |                                  |
  |--- Bash: node repl-sandbox.mjs --|
  |    stdin: { code, sessionId }    |
  |                                  |
  |                        1. Load workspace index from JSON
  |                        2. Load session state (variables from prior turns)
  |                        3. Create vm.createContext with globals
  |                        4. Transform const/let -> globalThis
  |                        5. Wrap in async IIFE
  |                        6. Execute via vm.Script.runInContext
  |                        7. Capture stdout, error, locals
  |                        8. If large results, store in handles
  |                        9. Save session state (variables for next turn)
  |                       10. Write SandboxResult JSON to stdout
  |                                  |
  |<-- stdout: SandboxResult JSON ---|
  |                                  |
  (process exits)
```

### Session State Persistence

Between per-invocation sandbox calls, state persists via a session file:

```javascript
// .cache/repl-session-<id>.json
{
  "sessionId": "explore-1709478234",
  "variables": {
    "libs": ["connect-shared-users-data-access", "..."],
    "results": "$res1"  // handle reference
  },
  "handles": {
    "$res1": { "type": "Array", "count": 47, "data": [...] }
  },
  "turnCount": 3,
  "createdAt": "2026-03-03T12:30:34Z"
}
```

Why per-invocation (not persistent process):
1. Claude Code's Bash tool starts a fresh shell for each call -- no IPC channel
2. No orphaned processes if the agent crashes
3. Simpler error recovery (process crash = clean next invocation)
4. Session state is explicit (JSON file) rather than implicit (process memory)

The cost is ~50-100ms startup overhead per turn (Node.js process launch + JSON parse). Over 20 iterations, that is 1-2 seconds total -- acceptable for a workflow that takes 30-120 seconds.

### Handle Store Data Flow

```
REPL code: let results = search("UserService", allPaths)
  |
  v
search() function inside sandbox:
  1. Calls git grep via child_process.execSync
  2. Parses output: [{file, line, content}, ...]
  3. If results.length > 10:
       handle = handleStore.store(results)
       return handleStore.stub(handle)
       // Returns: "$res1: Array(47) [libs/connect/shared/users/...]"
  4. If results.length <= 10:
       return JSON.stringify(results)
       // Returns full data inline
  |
  v
LLM sees compact stub (~50 tokens) not full data (~5000 tokens)
  |
  v
Next turn: LLM writes: let subset = handle.preview("$res1", 5)
  -> Returns first 5 items from stored handle
  -> Still only ~200 tokens in context

Handle operations (all server-side, return stubs or new handles):
  handle.preview(h, n)    -> first N items (returns data inline)
  handle.filter(h, pred)  -> new handle with filtered items
  handle.count(h)         -> number
  handle.describe(h)      -> { count, fields, sample }
```

## llm_query() Architecture: The Subagent Nesting Constraint

### The Problem

Claude Code subagents cannot spawn other subagents. The repl-executor is already a subagent. Therefore `llm_query()` inside the REPL cannot use the Agent tool to spawn a haiku-searcher.

### Recommended Solution: Deferred to a Later Milestone (Option C)

For the first milestone, **do not implement `llm_query()`**. The repl-executor agent handles all reasoning itself between REPL turns. The REPL provides only deterministic operations.

**Why this is sufficient:**

1. The core value proposition (workspace navigation without context rot) works without sub-LLM calls
2. The agent already uses Sonnet, which is capable enough for the semantic analysis that `llm_query()` would delegate to Haiku
3. The fill/solve loop pattern still works -- the agent writes code to search/read/filter, then reasons about results in its own context
4. Avoids API key management complexity in v0.0.1

**What is lost:**

1. No cost optimization from routing mechanical tasks to Haiku (~3x cheaper)
2. Agent burns Sonnet tokens on tasks Haiku could handle
3. No parallel sub-LLM processing for batch operations (pattern audits)

### Future Implementation: Direct API Script (Option A, for a Later Milestone)

When `llm_query()` is added later, implement as a script:

```
REPL code: let answer = await llm_query("Summarize this function", codeSnippet)
  |
  v
llm_query() inside sandbox:
  1. Writes query to temp file: .cache/llm-query-<id>.json
     { "prompt": "...", "context": "...", "model": "haiku" }
  2. Calls: child_process.execSync('node scripts/llm-query.mjs --input .cache/llm-query-<id>.json')
  3. llm-query.mjs reads the input, calls Anthropic API directly
  4. Returns response as string
  |
  v
REPL code receives answer as string, continues execution

Requirements:
  - ANTHROPIC_API_KEY environment variable (Claude Code sets this)
  - @anthropic-ai/sdk as an optional dependency (or raw HTTP fetch)
  - Rate limiting and timeout in the script
```

### Why NOT Option B (Pending-Query Protocol)

The pending-query protocol (repl-executor processes `[LLM_QUERY: ...]` markers from sandbox output) was considered but rejected because:

1. It couples the agent's prompt engineering to a custom protocol
2. The agent would need to parse structured markers from sandbox output, handle them, and re-invoke the sandbox with results -- adding 2-3 extra Bash calls per `llm_query()`
3. It burns Sonnet tokens on Haiku-grade work (the agent IS the model doing the work)
4. When `llm_query()` calls are the bottleneck in a turn, Option A (direct API call) is faster and cheaper

## Error Boundaries

### Boundary 1: REPL Sandbox Crash

```
Trigger: vm.Script throws (syntax error, runtime error, timeout)
Detection: repl-sandbox.mjs catches all errors
Recovery:
  1. SandboxResult.error is set to the error message
  2. SandboxResult.stdout contains any output captured before crash
  3. SandboxResult.locals contains any variables set before crash
  4. Process exits normally (exit code 0) -- error is in the JSON, not the exit code
  5. Agent sees the error and generates corrective code

Agent-level guardrail:
  - consecutiveErrors counter increments on error
  - After 3 consecutive errors, agent aborts with error summary
  - Any successful execution resets the counter to 0

Example error flow:
  Turn 3: Code throws "TypeError: workspace.projects is not iterable"
  Turn 4: Agent sees error, fixes: "let names = Object.keys(workspace.projects)"
  Turn 4: Succeeds -> consecutiveErrors reset to 0
```

### Boundary 2: Nx CLI Timeout

```
Trigger: nx-runner.mjs command exceeds timeout (30s default)
Detection: child_process.execSync throws with code ETIMEDOUT
Recovery:
  1. nx-runner catches the timeout error
  2. Returns: { error: "Nx command timed out after 30000ms: nx graph --print", data: null }
  3. REPL global function (nx()) surfaces this as a thrown error in sandbox
  4. Sandbox catches it, returns in SandboxResult.error
  5. Agent can retry with a simpler command or skip

Degradation: If nx is completely unavailable:
  - Workspace indexer fails at build time (before any REPL session)
  - Commands like /deps still work if a cached index exists
  - The error message tells the user to run the indexer manually
```

### Boundary 3: Workspace Index Stale or Missing

```
Trigger: workspace-index.json does not exist or is outdated
Detection: workspace-indexer.mjs --check compares file mtime against
           nx.json, tsconfig.base.json, and project.json files

Recovery strategy:
  Missing:
    1. repl-executor agent runs: node scripts/workspace-indexer.mjs --build
    2. If build fails (no Nx workspace), agent reports error to user
    3. Skill instructs agent to check for index first

  Stale (>5 minutes old or files changed):
    1. Agent can rebuild: node scripts/workspace-indexer.mjs --build
    2. Or proceed with stale index (most queries are structure-based, not time-sensitive)
    3. SandboxResult can include a warning: "Index is 2 hours old"

  Corrupted (invalid JSON):
    1. workspace-indexer.mjs --build overwrites the file
    2. If JSON.parse fails in the sandbox, error surfaces normally

Graceful degradation:
  Without index, the REPL globals still work but are slower:
    - projects: falls back to runtime `nx show projects --json` (~3s)
    - deps(): falls back to runtime `nx graph --print` (~5s)
    - These are cached in-memory for the session after first call
```

### Boundary 4: FINAL() Never Called

```
Trigger: Agent reaches maxIterations (20) without calling FINAL()
Detection: Iteration counter in agent's execution loop

Recovery:
  1. Agent receives SandboxResult with final: null for 20 turns
  2. After maxIterations, agent MUST produce a response:
     - Summarize what was found in the REPL session
     - Include explicit note: "[Exploration reached maximum iterations without
       a definitive answer. Partial findings above.]"
  3. This is handled by the skill's instructions to the agent, not by code

Prevention (in agent prompt):
  - "You MUST call FINAL(answer) before iteration 20"
  - "If you cannot answer definitively, call FINAL with partial findings"
  - "Call FINAL with 'I could not determine X because Y' rather than looping"

Why this matters:
  If the agent just stops responding, the main conversation sees
  the agent's last message as the response -- which may be raw REPL output,
  not a useful answer. The skill instructions must make FINAL() mandatory.
```

### Boundary 5: Sandbox Process Crash (Node.js Crash, OOM)

```
Trigger: Node.js process dies (segfault, OOM, uncaught exception outside try/catch)
Detection: Bash tool returns non-zero exit code with stderr

Recovery:
  1. Agent sees Bash tool error output (not a SandboxResult JSON)
  2. Agent can retry (the per-invocation model means the next call is a fresh process)
  3. If crash persists, agent reports to user

This is rare because:
  - vm.createContext isolates memory within a single V8 context
  - OOM at the process level requires >4GB memory (Node.js default heap)
  - Uncaught exceptions outside the sandbox are programming bugs, not runtime issues
```

### Boundary 6: Wall Clock Timeout

```
Trigger: Overall explore session exceeds maxTimeout (120s default)
Detection: NOT automatically enforced -- Claude Code sessions don't have
           explicit timers. This is a soft guardrail.

Implementation:
  1. The skill's instructions tell the agent to track elapsed time
  2. Each SandboxResult includes executionTimeMs
  3. Agent sums total execution time and compares against maxTimeout
  4. If exceeded, agent calls FINAL with partial results

Alternative (stronger enforcement):
  A wrapper script could enforce wall clock:
    timeout 120 node scripts/repl-sandbox.mjs ...
  But this kills the process abruptly, losing session state.
  Prefer the soft guardrail in v0.0.1.
```

### Error Boundary Summary Table

| Boundary | Detection | Recovery | Severity |
|----------|-----------|----------|----------|
| REPL syntax/runtime error | `SandboxResult.error` | Agent generates fix code | LOW -- self-healing |
| REPL timeout (per block) | vm.Script timeout option | Error in SandboxResult | LOW -- retry with simpler code |
| Nx CLI timeout | execSync ETIMEDOUT | Return error, agent retries | MEDIUM -- may need fallback |
| Nx CLI not available | execSync ENOENT | Report to user | HIGH -- plugin non-functional |
| Index missing | File not found | Rebuild (10-30s) | MEDIUM -- delays first query |
| Index stale | Mtime check | Rebuild or use stale | LOW -- usually acceptable |
| Index corrupted | JSON.parse error | Rebuild | LOW -- overwrite fixes it |
| FINAL() not called | Iteration counter | Force partial answer | MEDIUM -- degraded output |
| Process crash (OOM) | Non-zero exit code | Retry (fresh process) | LOW -- rare |
| Wall clock timeout | Agent tracks elapsed | Force FINAL with partial | MEDIUM -- soft guardrail |

## Workspace Index Sharing Strategy

### The Question

How should the workspace index be shared between the REPL sandbox (invoked per-turn by the agent) and the deterministic commands (invoked directly by the user)?

### Recommended: JSON File on Disk, Read on Demand

```
workspace-indexer.mjs --build
  |
  v
.cache/workspace-index.json  (the single source of truth)
  |
  +---- repl-sandbox.mjs reads on each invocation
  |       -> Parses JSON, injects as `workspace` global
  |       -> Cost: ~10-20ms for 100KB JSON parse
  |
  +---- deps-tree.mjs reads on invocation
  |       -> Parses JSON, walks adjacency list
  |
  +---- find-files.mjs reads on invocation
  |       -> Parses JSON, resolves project roots
  |
  +---- path-resolver.mjs reads on invocation
          -> Parses JSON, resolves aliases
```

### Why NOT Pass as Argument

The workspace index is ~50-100KB. Passing it as a CLI argument (`node repl-sandbox.mjs --index-data '{...}'`) would:
1. Hit shell argument length limits on Windows (32KB for cmd.exe, 8KB for CreateProcess)
2. Require shell escaping of JSON (fragile)
3. Appear in process listings (`ps aux`)

### Why NOT Cache in Memory Across Invocations

Each REPL turn is a separate process (per-invocation model). There is no shared memory between processes. Options that were considered:

1. **Shared memory (mmap)**: Cross-platform complexity, unnecessary for 100KB
2. **Named pipe/socket**: Requires a background server process -- adds IPC complexity
3. **Environment variable**: Size limited (32KB on Windows)
4. **Temp file (what we do)**: Simple, cross-platform, fast enough

### Index Location

```
plugins/lz-nx.rlm/.cache/workspace-index.json

Why .cache/ (not .claude/rlm-state/):
  - The index is derived data, not user state
  - .cache/ can be safely deleted and rebuilt
  - .cache/ is gitignored by convention
  - Multiple plugins might want their own caches

The .cache/ directory is relative to the plugin root (${CLAUDE_PLUGIN_ROOT}/.cache/),
NOT to the target workspace. This keeps plugin state isolated.
```

### Index Freshness Protocol

```
1. Commands (deps, find, alias):
     Read index from disk. If missing, error with message:
     "Workspace index not found. Run: /lz-nx.rlm:explore to build it."

2. Explore skill (via repl-executor agent):
     Check index freshness before starting REPL loop:
       node scripts/workspace-indexer.mjs --check
     Returns JSON: { "stale": true/false, "reason": "tsconfig.base.json changed" }
     If stale, rebuild:
       node scripts/workspace-indexer.mjs --build

3. Rebuild triggers:
     - Any project.json modified since last build
     - tsconfig.base.json modified since last build
     - nx.json modified since last build
     - Index file missing
     - Manual: user can force with node scripts/workspace-indexer.mjs --build --force
```

## Component Dependency Graph and Build Order

```
Build order follows arrows (dependency direction):

  rlm-config.mjs          (no dependencies -- pure config with defaults)
       |
       v
  nx-runner.mjs            (depends on rlm-config for timeout values)
       |
       v
  workspace-indexer.mjs    (depends on nx-runner for Nx CLI calls)
       |
       v
  path-resolver.mjs        (depends on workspace index schema)
       |
       v
  handle-store.mjs         (no dependencies -- pure data structure)
       |
       v
  repl-sandbox.mjs         (depends on: handle-store, workspace-indexer output,
       |                     nx-runner, path-resolver, rlm-config)
       v
  agents/repl-executor.md  (depends on: repl-sandbox.mjs being functional)
       |
       v
  skills/explore/SKILL.md  (depends on: repl-executor agent)
       |
       v
  commands/deps.md         (depends on: workspace-indexer output only)
  commands/find.md         (depends on: workspace-indexer output, nx-runner)
  commands/alias.md        (depends on: path-resolver)
```

### New vs. Modified Components

All components are new (greenfield plugin). No existing code to modify.

| Component | Type | File Count | Complexity | Dependencies |
|-----------|------|------------|------------|--------------|
| rlm-config.mjs | Script | 1 | LOW | None |
| nx-runner.mjs | Script | 1 | LOW | rlm-config |
| workspace-indexer.mjs | Script | 1 | MEDIUM | nx-runner |
| path-resolver.mjs | Script | 1 | LOW | workspace index |
| handle-store.mjs | Script | 1 | MEDIUM | None |
| repl-sandbox.mjs | Script | 1 | HIGH | handle-store, nx-runner, all globals |
| repl-executor.md | Agent | 1 | HIGH | repl-sandbox.mjs |
| explore/SKILL.md | Skill | 1 | MEDIUM | repl-executor agent |
| deps.md | Command | 1 | LOW | workspace index |
| find.md | Command | 1 | LOW | workspace index, nx-runner |
| alias.md | Command | 1 | LOW | path-resolver |
| plugin.json | Config | 1 | LOW | None |

### Recommended Build Phases

```
Phase 1: Foundation Scripts
  Build: rlm-config.mjs, nx-runner.mjs, workspace-indexer.mjs, path-resolver.mjs
  Test: Unit tests with mock Nx CLI output
  Milestone: `node scripts/workspace-indexer.mjs --build` produces valid JSON index

Phase 2: REPL Core
  Build: handle-store.mjs, repl-sandbox.mjs
  Test: Execute JavaScript code with workspace globals, verify SandboxResult format
  Milestone: `echo 'print(Object.keys(workspace.projects).length)' | node scripts/repl-sandbox.mjs`

Phase 3: Agent Integration
  Build: agents/repl-executor.md, skills/explore/SKILL.md
  Test: End-to-end explore workflow with real questions
  Milestone: /lz-nx.rlm:explore "How many projects are there?" returns correct answer

Phase 4: Deterministic Commands
  Build: commands/deps.md, commands/find.md, commands/alias.md
  Test: Each command produces correct output
  Milestone: All three commands work on target workspace
```

**Why commands come AFTER agent integration (Phase 4 not Phase 3):**

The previous research suggested commands before agents (to provide immediate user value). However, the explore skill is the primary validation target for the RLM approach. If the REPL + agent integration does not work, the project's core thesis is unvalidated. Commands are trivial wrappers over the workspace index -- they will work if the index works. The riskiest integration (agent driving REPL) should be validated as early as possible.

## Anti-Patterns

### Anti-Pattern 1: Passing Code as CLI Arguments

**What people do:** `node repl-sandbox.mjs --code "let x = workspace.projects"`
**Why it's wrong:** Shell escaping breaks on quotes, backticks, newlines, and special characters. LLM-generated code routinely contains all of these.
**Do this instead:** Pass code via stdin. The sandbox reads from fd 0.

### Anti-Pattern 2: Persistent REPL Process

**What people do:** Start a long-lived Node.js process that accepts code over IPC (socket, named pipe, HTTP).
**Why it's wrong:** Claude Code's Bash tool has no mechanism to send data to a running process. Each Bash call is a new shell invocation. The persistent process also creates cleanup problems (orphaned processes, port conflicts, crash recovery).
**Do this instead:** Per-invocation model with session state persisted to a JSON file between turns.

### Anti-Pattern 3: Returning Raw SandboxResult to User

**What people do:** Let the agent's raw response (containing SandboxResult JSON) leak to the main conversation.
**Why it's wrong:** The main conversation sees implementation details (variable names, handle IDs, execution times) instead of a distilled answer.
**Do this instead:** The skill instructions MUST tell the agent to always call FINAL() with a human-readable answer. The main conversation should only see the final answer.

### Anti-Pattern 4: Loading Full Index into Agent Prompt

**What people do:** Include the entire workspace-index.json (100KB, ~25K tokens) in the agent's initial prompt.
**Why it's wrong:** Burns 25K tokens of agent context on data the REPL can access directly. The agent should know the index EXISTS and where it is, not its full contents.
**Do this instead:** Agent knows the index path. The REPL sandbox loads it as the `workspace` global. The agent uses REPL code to query it. Only the agent's initial prompt should include a brief summary (project count, top-level structure) for orientation.

### Anti-Pattern 5: Using Agent Tool Output as Structured Data

**What people do:** Try to parse the agent's response as JSON to extract structured data.
**Why it's wrong:** Agent responses are natural language text, not structured data. The Agent tool does not guarantee response format.
**Do this instead:** The agent returns a natural language answer via FINAL(). If structured data is needed, use deterministic commands (deps, find, alias) that return structured output directly via Bash.

## Integration Points

### Internal Boundaries

| Boundary | Communication | Data Format | Error Handling |
|----------|---------------|-------------|----------------|
| Skill -> Agent | Agent tool (Claude internal) | Natural language prompt | Agent failure returns error text |
| Agent -> Sandbox | Bash tool -> stdin/stdout | Code in, SandboxResult JSON out | Non-zero exit = process crash |
| Sandbox -> Handle Store | In-process function call | JavaScript objects | Throws on invalid handle |
| Sandbox -> nx-runner | In-process function call | Command string in, parsed JSON out | Throws on timeout/error |
| Sandbox -> filesystem | In-process fs.readFileSync | File path in, string/Buffer out | Throws on missing file |
| Sandbox -> git | child_process.execSync | Pattern string in, parsed matches out | Returns empty on no matches |
| Command -> workspace index | fs.readFileSync + JSON.parse | File path in, JSON object out | Error if index missing |
| Indexer -> Nx CLI | child_process.execSync | Nx command in, JSON stdout out | Throws on timeout/failure |

### External Dependencies

| External | How Used | Failure Mode | Graceful Degradation |
|----------|----------|--------------|----------------------|
| Nx CLI | workspace-indexer, nx-runner | Missing or incompatible version | Plugin non-functional (Nx is a hard dependency) |
| Git | search() REPL global | Missing git binary | search() unavailable; other globals still work |
| Filesystem | read() REPL global, index I/O | Permission errors, missing files | Error surfaces in SandboxResult |
| Claude API | Subagent spawning (Agent tool) | Rate limits, network errors | Claude Code handles retries internally |

## Scalability Considerations

| Concern | 10 projects | 100 projects | 537+ projects |
|---------|-------------|--------------|---------------|
| Index build time | <1s | ~3s | 10-30s (full), <2s (incremental) |
| Index file size | ~2KB | ~10KB | ~50-100KB |
| Index parse time | <1ms | ~5ms | ~15ms |
| search() scope | Global OK | Scope to project roots | Must scope to project roots |
| Agent context usage | ~5K tokens (index summary) | ~8K tokens | ~15-25K tokens (summary only) |
| Handle store entries | Rarely needed | Occasionally | Frequently (search returns 100+ results) |
| Session state file | <1KB | ~5KB | ~20KB (with handles) |

### First Bottleneck: Index Build Time

For 537 projects, `nx show project <name>` per project takes 10-30 seconds total. Mitigation: incremental rebuild using `git diff` to detect changed `project.json` files. Reduces to <2 seconds for typical changes.

### Second Bottleneck: Agent Context Growth

Each REPL turn adds ~1-3KB to the agent's message history (assistant code + user result). After 20 turns, that is 20-60KB. At 537 projects, the workspace summary in the agent's initial prompt adds another 15-25KB. Total agent context can approach 80-100K tokens for complex queries.

Mitigation: Output truncation (2KB per turn), handle store (large results compressed to stubs), and the maxIterations guardrail (20 turns max).

## Sources

### Implementation References (analyzed source code)

- Hampton-io/RLM VMSandbox: `D:/projects/github/hampton-io/RLM/src/sandbox/vm-sandbox.ts` -- pending query queue, async IIFE wrapping, const/let transformation, SandboxResult interface
- Hampton-io/RLM Executor: `D:/projects/github/hampton-io/RLM/src/executor.ts` -- execution loop, FINAL detection (function-call + text-parse dual path), sub-query handling, formatExecutionResult
- code-rabi/rllm Sandbox: `D:/projects/github/code-rabi/rllm/src/sandbox.ts` -- SandboxResult with stdout/stderr/locals/error, variable capture via context key enumeration, wrapped error reporting for LLM self-correction
- Matryoshka HandleRegistry: `D:/projects/github/yogthos/Matryoshka/src/persistence/handle-registry.ts` -- handle creation, stub generation, buildContext for LLM
- Matryoshka HandleOps: `D:/projects/github/yogthos/Matryoshka/src/persistence/handle-ops.ts` -- server-side filter/map/sort/preview operations that chain on handles
- brainqub3/claude_code_RLM: `D:/projects/github/brainqub3/claude_code_RLM/ImplementMe.txt` -- Claude Code skill+subagent pattern, persistent REPL via Python pickle, chunk-based sub-LLM handoff
- rand/rlm-claude-code: `D:/projects/github/rand/rlm-claude-code/agents/rlm-orchestrator.md` -- depth-based model cascade, FINAL protocol, REPL variable access patterns
- rand/rlm-claude-code hooks: `D:/projects/github/rand/rlm-claude-code/hooks/hooks.json` -- SessionStart init, PreCompact trajectory save, complexity classification

### Architectural Constraints (Claude Code)

- Subagents cannot spawn other subagents (confirmed in brainqub3 ImplementMe.txt and PROJECT.md)
- Agent tool communication is natural language, not structured data
- Bash tool starts fresh shell per invocation (no persistent process communication)
- Skills inject instructions into the conversation context (not executable code)
- Commands use `!` backtick syntax for direct script execution

### Prior Research

- RLM Synthesis: `research/rlm/SYNTHESIS.md` -- Sections 3 (architecture), 8 (REPL environments), 15 (Node.js patterns), 16 (limitations)
- Plugin Brainstorm: `research/claude-plugin/BRAINSTORM.md` -- Sections 2 (REPL design), 5 (agent architecture), 12 (plugin structure)
- Previous Architecture: `.planning/research/ARCHITECTURE.md` (this file, prior version) -- layered system, component boundaries, build order

---
*Architecture research for: RLM-powered Nx Claude Code plugin*
*Researched: 2026-03-03*
