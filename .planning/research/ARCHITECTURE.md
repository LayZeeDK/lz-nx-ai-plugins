# Architecture Patterns

**Domain:** RLM-powered Nx Claude Code plugin
**Researched:** 2026-03-03

## Recommended Architecture

The plugin is a layered system with five major components. Each component has clear boundaries, communicates through defined interfaces, and can be built incrementally. The architecture follows a "scripts at the bottom, agents at the top" principle: deterministic Node.js scripts provide the foundation, the REPL sandbox provides the execution environment, and Claude Code agents drive the LLM-powered workflows.

```
+----------------------------------------------------------------+
|  USER LAYER (Claude Code conversation)                         |
|  Skills (/explore, /deps, /find, /alias)                       |
|  Commands (zero-LLM deterministic operations)                  |
+---------------------------+------------------------------------+
                            |
+---------------------------v------------------------------------+
|  AGENT LAYER                                                   |
|  repl-executor (Sonnet) -- drives the RLM fill/solve loop     |
|  haiku-searcher (Haiku) -- mechanical search sub-calls         |
+---------------------------+------------------------------------+
                            |
+---------------------------v------------------------------------+
|  REPL SANDBOX (Node.js vm.createContext)                        |
|  Workspace globals: workspace, projects, deps(), read(),       |
|  search(), files(), nx(), llm_query(), FINAL(), SHOW_VARS()    |
|  Handle store for large result sets                            |
+---------------------------+------------------------------------+
                            |
+---------------------------v------------------------------------+
|  FOUNDATION SCRIPTS (deterministic Node.js, 0 LLM tokens)     |
|  workspace-indexer.mjs  path-resolver.mjs  nx-runner.mjs       |
|  handle-store.mjs  rlm-config.mjs                              |
+---------------------------+------------------------------------+
                            |
+---------------------------v------------------------------------+
|  EXTERNAL (Nx CLI, filesystem, git)                            |
+----------------------------------------------------------------+
```

### Component Boundaries

| Component | Responsibility | Communicates With | Data Format |
|-----------|---------------|-------------------|-------------|
| **Foundation Scripts** | Build workspace index, resolve paths, wrap Nx CLI, manage config | Nx CLI (via child_process), filesystem | JSON files, structured objects |
| **Handle Store** | Store large results, return lightweight stubs to LLM | REPL sandbox (in-process), foundation scripts | Handle strings (`$res1`, `$res2`), Map entries |
| **REPL Sandbox** | Execute LLM-generated JavaScript in isolated VM context | Handle store (in-process), foundation scripts (via injected globals), agents (via llm_query callback) | SandboxResult objects (stdout, stderr, locals, error) |
| **Agent Layer** | Drive RLM execution loop, perform mechanical search | REPL sandbox (via execute()), Claude API (via subagent spawning) | Message arrays, final answer strings |
| **User Layer** | Skills and commands exposed to user | Agent layer (via subagent delegation), foundation scripts (via Bash tool) | Markdown-formatted results, $ARGUMENTS input |

### Data Flow

**Skill invocation flow (e.g., `/lz-nx.rlm:explore "Where is X?"`):**

```
1. User types /lz-nx.rlm:explore "Where is X?"
2. Claude reads SKILL.md, decides to spawn repl-executor agent
3. repl-executor agent receives query + workspace index path
4. Agent loads workspace index as REPL `workspace` variable
5. Agent generates JavaScript code in ```repl blocks
6. REPL sandbox executes code via vm.runInContext()
7. If code calls llm_query() -> spawns haiku-searcher subagent
8. REPL returns stdout/stderr/locals to agent
9. Agent appends truncated output as user message, generates next code
10. Loop continues until FINAL(answer) or max iterations
11. Final answer returned to main conversation
12. Main conversation displays distilled result to user
```

**Command flow (e.g., `/lz-nx.rlm:deps my-project`):**

```
1. User types /lz-nx.rlm:deps my-project
2. Command markdown invokes: node scripts/deps-tree.mjs my-project
3. Script reads workspace-index.json
4. Script walks adjacency list, formats tree
5. Output displayed directly (0 LLM tokens)
```

**Handle store flow (large result sets):**

```
1. REPL code: let results = search("pattern", allPaths)
2. search() returns 500 matches -> stored in handle store
3. LLM sees: "$res1: Array(500) [first match preview...]" (~50 tokens)
4. LLM navigates: let subset = handle.filter("$res1", item => ...)
5. filter() operates server-side, returns new handle "$res2"
6. LLM inspects: handle.preview("$res2", 5) -> first 5 items
7. Only materialized data enters LLM context
```

## Component Detail: REPL Sandbox

The REPL sandbox is the architectural centerpiece. It provides the isolated execution environment where LLM-generated code manipulates the workspace without polluting the conversation context.

### Design Decision: `vm.createContext` with Defense in Depth

**Use Node.js `vm.createContext`** because it provides the right trade-off for this use case:

- The code running in the sandbox is **LLM-generated, not user-submitted**. The threat model is "LLM writes buggy code" not "adversary crafts escape payload."
- Sub-5ms startup, no subprocess overhead, true async/await support.
- Already proven in Hampton-io/RLM and code-rabi/rllm implementations.
- Natural fit for JavaScript workspace (TypeScript monorepo).

**The `node:vm` module is explicitly NOT a security sandbox** -- Node.js documentation says so. However, security sandboxing against adversarial input is not the threat model here. The LLM generates code; we control what globals are available; we add defense-in-depth mitigations.

**Defense-in-depth mitigations (mandatory):**

| Mitigation | Purpose | Implementation |
|-----------|---------|----------------|
| `codeGeneration: { strings: false, wasm: false }` | Block `eval()` and WASM compilation attacks | vm.createContext option |
| Restricted global scope | No `process`, `require`, `child_process`, `fs` exposed directly | Explicit allowlist of globals |
| Controlled wrappers only | File/search/nx access only through sandboxed functions with validation | Injected functions that validate inputs |
| Execution timeout per block | Prevent infinite loops from hanging the session | `vm.Script.runInContext({ timeout })` |
| Output truncation | Prevent context blowup from verbose output | Truncate stdout to configurable limit (2KB default) |
| Max consecutive errors | Abort if sandbox enters error loop | Counter in execution loop |
| Max iterations | Hard stop on REPL turns | Counter in execution loop |

**When to upgrade to stronger isolation:**

If the plugin is ever extended to run user-provided code (not LLM-generated), or if it processes untrusted workspace content that could influence code generation, then upgrade to `isolated-vm` (V8 isolates with separate heaps) or QuickJS-in-WASM (`@sebastianwessel/quickjs`). Both provide real security boundaries at the cost of complexity and performance.

**Confidence:** HIGH. The vm.createContext approach is used by both Node.js RLM implementations (Hampton-io, code-rabi) and is appropriate for the LLM-generated-code threat model. The security concerns documented in CVE-2026-22709 and related vm2 escapes apply to adversarial sandbox escape scenarios, not to controlled LLM output.

### Variable Persistence Pattern

LLM-generated code uses `const` and `let` declarations that are block-scoped inside the async IIFE wrapper. To persist variables across REPL turns, use the transformation pattern from Hampton-io:

```javascript
// LLM writes:
const results = search("pattern")

// Transformer converts to:
globalThis.results = search("pattern")
```

This ensures variables created in one REPL turn are accessible in subsequent turns. The Hampton-io implementation uses a regex replacement: `code.replace(/\b(const|let)\s+(\w+)\s*=/g, 'globalThis.$2 =')`. The Matryoshka implementation uses a more sophisticated AST-level extraction that separates declarations from assignments.

**Recommendation:** Use the regex approach for v1 (simpler, proven). Switch to AST-based extraction if destructuring or complex declarations become common.

### Async LLM Query Bridge

The sandbox needs to call `llm_query()` which is async (it spawns a Claude subagent). The Node.js `vm` module does not natively support awaiting promises that resolve via external callbacks. Both Hampton-io and code-rabi solve this with a **pending query queue**:

```typescript
// Inside sandbox, llm_query() creates a Promise and queues it
const llm_query = (prompt) => new Promise((resolve, reject) => {
  pendingQueries.push({ prompt, resolve, reject });
});

// Outside sandbox, executor processes the queue concurrently
async function executeWithQueryProcessing(executionPromise) {
  while (isExecuting || pendingQueries.length > 0) {
    while (pendingQueries.length > 0) {
      const query = pendingQueries.shift();
      const result = await callSubagent(query.prompt);
      query.resolve(result);
    }
    await sleep(10); // Allow more queries to queue
  }
}
```

This pattern enables true async/await inside the REPL while keeping LLM calls external to the sandbox.

**Confidence:** HIGH. Both Hampton-io and code-rabi use this exact pattern.

## Component Detail: Handle Store

### Design Decision: In-Memory Map (Not SQLite)

For v1, use an in-memory `Map<string, unknown[]>` instead of SQLite:

- Simpler implementation (no native module dependency).
- Fast enough for session-scoped data (no persistence needed across sessions).
- JSON workspace index is already in memory as a REPL variable.
- Matryoshka uses SQLite because it persists data across sessions; this plugin does not need that in v1.

**Handle naming convention:** `$res1`, `$res2`, ... (auto-incrementing). Follows Matryoshka convention.

**Handle stub format:** `"$res1: Array(537) [connect, connect-e2e, assets, ...]"` -- type, count, preview of first items. This is what the LLM sees instead of the full data.

### Operations on Handles

Borrowing from Matryoshka's `HandleOps` pattern, the handle store should support server-side operations that return new handles:

| Operation | Input | Output | Purpose |
|-----------|-------|--------|---------|
| `store(data)` | `unknown[]` | Handle string | Create handle from data |
| `get(handle)` | Handle string | `unknown[]` or null | Retrieve full data |
| `stub(handle)` | Handle string | String | Get LLM-friendly stub |
| `preview(handle, n)` | Handle + count | `unknown[]` | First N items |
| `filter(handle, predicate)` | Handle + JS predicate string | New handle | Filter items |
| `count(handle)` | Handle string | Number | Count items |

**Key insight from Matryoshka:** Operations chain on handles server-side. The LLM never needs to see the full dataset. `filter("$res1", "item.type === 'lib'")` creates `$res2` with only matching items, and the LLM only sees the stub.

**Confidence:** MEDIUM. The in-memory Map is simpler than SQLite but loses data on sandbox reset. This is acceptable for v1 where sessions are ephemeral. If cross-session persistence is added later, migrate to SQLite.

## Component Detail: Agent Layer

### Inter-Component Communication

Claude Code plugins have a specific communication model between components:

**Skills -> Agents:** Skills are markdown files that inject instructions into the conversation. When a skill needs to delegate work, it instructs Claude to spawn a subagent using the Agent tool. The skill's text becomes part of Claude's context, guiding it on when and how to use the subagent.

**Agents -> REPL:** The repl-executor agent uses the Bash tool to invoke `node scripts/repl-sandbox.mjs` with code passed as arguments or via stdin. Alternatively, the agent can use the Bash tool to execute a persistent REPL process that accepts code blocks over IPC. The simpler approach (per-invocation) is recommended for v1.

**Agents -> Agents:** Claude Code subagents cannot spawn other subagents (architectural constraint). This means `llm_query()` inside the REPL cannot spawn a haiku-searcher subagent directly. Instead, `llm_query()` must be implemented as a Bash call to a script that invokes Claude's API directly, or the repl-executor agent processes `llm_query()` requests itself by reading pending queries from the sandbox output and handling them in its own context.

**Hooks -> Scripts:** Hooks invoke Node.js scripts via shell commands. Hook input arrives as JSON on stdin. Hook output is JSON on stdout. Hooks can inject `additionalContext` into the conversation or block actions with `decision: "block"`.

### The repl-executor Agent Pattern

The repl-executor is the most critical agent. It drives the RLM fill/solve loop:

```markdown
---
name: repl-executor
description: Drives the RLM execution loop for workspace exploration.
  Use when the user invokes /lz-nx.rlm:explore or similar RLM skills.
tools: Bash, Read
model: sonnet
---

You are an RLM execution agent. Your conversation context is externalized
as navigable variables in a JavaScript REPL.

## Available REPL Globals
- workspace: The workspace index (projects, deps, aliases)
- projects: Shorthand for workspace.projects
- deps(name): Dependency tree for a project
- dependents(name): Reverse dependency tree
- read(path, start?, end?): Read file content
- files(glob): Find files matching pattern
- search(pattern, paths?): Search file contents (git grep)
- nx(command): Run allowlisted Nx CLI command
- llm_query(prompt): Sub-LLM call for semantic work
- FINAL(answer): Mark final answer
- print(...args): Capture output

## Execution Protocol
1. Write JavaScript code in ```repl blocks
2. Each block executes in the REPL, output returned
3. Navigate the workspace programmatically -- DO NOT load full files
4. Use llm_query() for semantic work on small chunks
5. Call FINAL(answer) when done

## Guardrails
- Max 20 iterations per query
- Max 3 consecutive errors before abort
- 2-minute wall clock timeout
- Output truncated at 2KB per turn
```

### llm_query() Implementation Strategy

Because subagents cannot spawn other subagents, `llm_query()` requires a workaround. Three options analyzed:

**Option A: Script-based API call (RECOMMENDED for v1)**
The REPL's `llm_query()` function calls a Node.js script via `child_process.execSync` that makes a direct Claude API call using the Anthropic SDK. The script is thin: it reads a prompt from stdin, calls the API with a Haiku model, and returns the response to stdout.

- Pros: Simple, no subagent nesting, full control over model choice.
- Cons: Requires API key management (can use `ANTHROPIC_API_KEY` from environment).
- Confidence: MEDIUM. Depends on API key availability in the Claude Code plugin environment.

**Option B: Pending-query protocol**
The repl-executor agent parses sandbox output for `[LLM_QUERY: ...]` markers, handles them itself, and feeds results back into the next sandbox execution.

- Pros: No external API call needed, uses the agent's own model.
- Cons: Adds complexity to the execution loop, burns Sonnet tokens on Haiku-grade tasks.
- Confidence: MEDIUM. More complex but avoids API key dependency.

**Option C: Deferred to v1.1**
Ship v1 without `llm_query()`. The repl-executor agent handles all semantic reasoning itself between REPL turns. The REPL provides only deterministic operations (search, read, deps, files).

- Pros: Simplest v1, no API key management, no subagent nesting issues.
- Cons: Loses the "cheap sub-call" optimization. All reasoning uses the root model (Sonnet).
- Confidence: HIGH. This is the simplest path and validates the core architecture without the sub-call complexity.

**Recommendation:** Start with Option C for the first milestone. The core value proposition (workspace navigation without context rot) works without `llm_query()`. Add Option A in a subsequent milestone once the execution loop is proven.

## Component Detail: Foundation Scripts

### workspace-indexer.mjs

Builds the JSON workspace index from Nx CLI output. This is the single most important script because it converts an opaque 537-project workspace into a navigable data structure.

**Input sources:**
- `nx show projects --json` -> project names and metadata
- `nx graph --print` -> dependency adjacency list
- `tsconfig.base.json` -> path aliases
- `nx show project <name>` (per project) -> targets, tags, source root

**Output:** `workspace-index.json` (~50-100KB for large workspaces)

**Schema:**
```typescript
interface WorkspaceIndex {
  version: number;
  generated: string; // ISO timestamp
  root: string; // workspace root path
  projects: Record<string, ProjectEntry>;
  deps: Record<string, string[]>; // adjacency list
  reverseDeps: Record<string, string[]>; // reverse adjacency
  aliases: Record<string, string>; // tsconfig path aliases
  stats: { projectCount: number; fileCount: number; };
}

interface ProjectEntry {
  name: string;
  root: string; // source root relative to workspace
  type: "app" | "lib" | "e2e";
  tags: string[];
  targets: string[]; // available build targets
}
```

**Performance:** Full index build for 537 projects takes ~10-30 seconds (dominated by per-project `nx show project` calls). Incremental rebuild using git diff to detect changed `project.json` files reduces this to <2 seconds for typical changes.

### nx-runner.mjs

Safe wrapper for Nx CLI commands. Enforces an allowlist of read-only operations.

**Allowlisted commands:**
- `show projects` (with flags: `--json`, `--affected`, `--type`, `--tag`)
- `show project <name>` (per-project metadata)
- `graph --print` (dependency graph as JSON)
- `report` (workspace report)

**Blocked:** Any command that modifies the workspace (`build`, `test`, `lint`, `serve`, `generate`, `migrate`, `run`).

**Timeout:** 30 seconds per command. `nx graph --print` on large workspaces can take 3-5 seconds.

**Caching:** Results cached in memory with 5-minute TTL. `nx graph --print` output is stable within a session.

### rlm-config.mjs

Configuration with sensible defaults and override capability:

```javascript
const DEFAULT_CONFIG = {
  maxIterations: 20,
  maxDepth: 1, // No recursive sub-RLMs in v1
  maxTimeout: 120_000, // 2 minutes
  maxConsecutiveErrors: 3,
  outputTruncation: 2048, // 2KB per turn
  sandboxTimeout: 5_000, // 5s per code block
};
```

Config loaded from `.claude/rlm-config.json` if present, merged with defaults.

## Patterns to Follow

### Pattern 1: Execution Loop with Error Recovery

**What:** The core REPL loop that drives the fill/solve cycle.
**When:** Every RLM invocation.

```typescript
async function executeRLMLoop(
  query: string,
  sandbox: Sandbox,
  config: RLMConfig
): Promise<string> {
  const messages: Message[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: formatQuery(query, sandbox.getWorkspaceStats()) },
  ];

  let consecutiveErrors = 0;

  for (let i = 0; i < config.maxIterations; i++) {
    // 1. Get LLM response
    const response = await llm.complete(messages);
    const code = parseCodeBlocks(response, "repl");

    // 2. No code? Prompt the LLM to act
    if (!code) {
      messages.push({ role: "assistant", content: response });
      messages.push({
        role: "user",
        content: "Write code to explore the workspace or call FINAL(answer).",
      });
      continue;
    }

    // 3. Execute code in sandbox
    const result = await sandbox.execute(code);

    // 4. Check for final answer
    const finalAnswer = sandbox.getFinalAnswer();

    if (finalAnswer) {
      return finalAnswer;
    }

    // 5. Handle errors with recovery
    if (result.error) {
      consecutiveErrors++;

      if (consecutiveErrors >= config.maxConsecutiveErrors) {
        return `[ERROR] Aborted after ${consecutiveErrors} consecutive errors. Last error: ${result.error}`;
      }

      messages.push({ role: "assistant", content: response });
      messages.push({
        role: "user",
        content: `Error: ${result.error}\nFix the error and try again.`,
      });
      continue;
    }

    // 6. Success -- reset error counter, append result
    consecutiveErrors = 0;
    messages.push({ role: "assistant", content: response });
    messages.push({
      role: "user",
      content: truncate(result.stdout, config.outputTruncation),
    });
  }

  return "[ERROR] Max iterations reached without FINAL answer.";
}
```

**Key resilience patterns applied:**
- **Error routing back to LLM:** Errors are appended as user messages so the LLM can self-correct (the dominant pattern across all implementations).
- **Consecutive error counter:** Prevents infinite error loops.
- **No-code nudging:** If the LLM generates text without code, prompt it to act.
- **Output truncation:** Prevents a single execution from bloating the message history.

### Pattern 2: Handle-Based Result Compression

**What:** Store large results in handles, pass only stubs to the LLM.
**When:** Any REPL function that returns more than ~50 items.

```typescript
// In sandbox globals
const handleStore = new HandleStore();

function search(pattern: string, paths?: string[]): string {
  const rawResults = gitGrep(pattern, paths); // May return hundreds of matches

  if (rawResults.length <= 10) {
    return JSON.stringify(rawResults, null, 2); // Small enough to inline
  }

  // Store in handle, return stub
  const handle = handleStore.store(rawResults);
  return handleStore.stub(handle);
  // Returns: "$res1: Array(247) [libs/connect/shared/users/...]"
}
```

### Pattern 3: Graceful Degradation

**What:** Plugin features are optimizations, not requirements. All tasks remain possible without them.
**When:** Any component failure.

| Failure | Degradation | User Impact |
|---------|-------------|-------------|
| Workspace index missing/stale | Fall back to `nx show projects` at query time | Slower first query (~10s), then cached |
| REPL sandbox error | Return error to conversation, suggest manual Explore | User can still explore normally |
| Nx CLI unavailable | Disable Nx-specific features, basic file search still works | No dependency analysis |
| Handle store overflow | Truncate results inline instead of storing | More tokens in context but still functional |

## Anti-Patterns to Avoid

### Anti-Pattern 1: Loading Full Files into LLM Context

**What:** Using `read(path)` without line bounds and returning full file content to the conversation.
**Why bad:** A single 500-line file is ~2000 tokens. Ten files is 20K tokens of context pollution -- exactly what RLM is designed to prevent.
**Instead:** Always use `read(path, startLine, endLine)` for targeted extraction. Use `search()` to find relevant lines first, then read only those ranges.

### Anti-Pattern 2: Subagent Spawning Subagents

**What:** Attempting to have `repl-executor` spawn `haiku-searcher` as a nested subagent.
**Why bad:** Claude Code subagents cannot spawn other subagents. This is an architectural constraint, not a bug.
**Instead:** Use direct API calls for sub-LLM queries (Option A), or handle all reasoning in the root agent (Option C). The `llm_query()` function must be implemented outside the subagent spawning mechanism.

### Anti-Pattern 3: Unbounded REPL Output

**What:** Allowing `print()` or function return values to dump unlimited data into the message history.
**Why bad:** REPL output is appended as user messages to the agent's context. Large outputs cause the same context rot that RLM is designed to prevent -- but inside the agent's own context window.
**Instead:** Truncate all output at a configurable limit (2KB default). Use handle store for large results. The Matryoshka pattern of returning stubs instead of full data is the correct approach.

### Anti-Pattern 4: Trusting vm.createContext for Security

**What:** Relying on `node:vm` to prevent malicious code execution.
**Why bad:** `node:vm` is explicitly not a security mechanism. CVE-2026-22709 and the long history of vm2 escapes demonstrate this. Even with `codeGeneration: { strings: false, wasm: false }`, prototype chain attacks can escape the sandbox.
**Instead:** Accept that `vm.createContext` provides scope isolation, not security isolation. The defense is: (1) control what code enters the sandbox (LLM-generated only), (2) restrict available globals, (3) add timeouts and output limits. If the threat model changes to include untrusted input, upgrade to `isolated-vm` or container-based isolation.

## Scalability Considerations

| Concern | At 10 projects | At 100 projects | At 537+ projects |
|---------|---------------|-----------------|------------------|
| Workspace index size | ~2KB JSON | ~10KB JSON | ~50-100KB JSON |
| Index build time | <1s | ~3s | 10-30s (full), <2s (incremental) |
| REPL `projects` variable | Inline OK | Inline OK | Use handle store (Map with 537 entries) |
| `search()` scope | Global OK | Scope to project roots | Must scope to project roots (otherwise 1000s of matches) |
| `deps()` traversal | Trivial | Fast | Still fast (adjacency list lookup, not graph traversal) |
| Per-session memory | ~5MB | ~15MB | ~50MB (index + handle store) |

## Suggested Build Order

Build order follows the dependency chain: lower layers first, since upper layers depend on them.

```
Phase 1: Foundation
  1. rlm-config.mjs (configuration, no dependencies)
  2. nx-runner.mjs (Nx CLI wrapper, depends on config for timeouts)
  3. workspace-indexer.mjs (depends on nx-runner)
  4. path-resolver.mjs (depends on workspace index)

Phase 2: REPL Core
  5. handle-store.mjs (in-memory Map, no dependencies)
  6. repl-sandbox.mjs (depends on handle-store, workspace-indexer output)
     - vm.createContext with workspace globals
     - execute() with timeout, error capture, output truncation
     - Variable persistence via globalThis transformation

Phase 3: Agent Integration
  7. repl-executor agent (depends on repl-sandbox)
     - Execution loop with error recovery
     - FINAL answer detection
     - Output truncation and message formatting
  8. explore skill (depends on repl-executor)
     - SKILL.md with instructions and argument handling

Phase 4: Commands
  9. /deps command (depends on workspace-indexer)
  10. /find command (depends on workspace-indexer, nx-runner)
  11. /alias command (depends on path-resolver)

Phase 5: Enhancements (deferred)
  12. llm_query() via direct API call (Option A)
  13. haiku-searcher agent
  14. Hooks (SessionStart index, PreCompact preservation)
```

**Rationale for this ordering:**
- Phases 1-2 are testable without any LLM involvement. Pure Node.js scripts with unit tests.
- Phase 3 is the first point where LLM interaction occurs. The execution loop can be tested with a mock LLM before connecting to Claude.
- Phase 4 delivers immediate user value (zero-LLM commands) while the RLM loop is being refined.
- Phase 5 adds optimizations that require the core to be stable first.

## Sources

### Implementation References (analyzed source code)

- Hampton-io/RLM VMSandbox: `D:/projects/github/hampton-io/RLM/src/sandbox/vm-sandbox.ts` -- vm.createContext with pending query queue, variable persistence, tool registry
- Hampton-io/RLM Executor: `D:/projects/github/hampton-io/RLM/src/executor.ts` -- execution loop, FINAL detection, sub-query handling, cost tracking
- Hampton-io/RLM CostTracker: `D:/projects/github/hampton-io/RLM/src/cost-tracker.ts` -- budget enforcement, depth-based tracking
- code-rabi/rllm Sandbox: `D:/projects/github/code-rabi/rllm/src/sandbox.ts` -- vm.createContext with restricted globals, llm_query bridge, execution timeout
- Matryoshka HandleRegistry: `D:/projects/github/yogthos/Matryoshka/src/persistence/handle-registry.ts` -- handle creation, stub generation, context building
- Matryoshka HandleOps: `D:/projects/github/yogthos/Matryoshka/src/persistence/handle-ops.ts` -- filter, map, sort, preview on handles
- Matryoshka Sandbox: `D:/projects/github/yogthos/Matryoshka/src/sandbox.ts` -- declaration extraction, REPL state persistence, sub-call limiting
- rand/rlm-claude-code Hooks: `D:/projects/github/rand/rlm-claude-code/hooks/hooks.json` -- SessionStart init, PreCompact trajectory save, complexity classification
- rand/rlm-claude-code Agent: `D:/projects/github/rand/rlm-claude-code/agents/rlm-orchestrator.md` -- depth-based model cascade, REPL protocol

### Official Documentation

- [Claude Code Plugins](https://code.claude.com/docs/en/plugins) -- plugin structure, manifest, skills, agents, hooks
- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks) -- hook events, JSON input/output, decision control
- [Claude Code Subagents](https://code.claude.com/docs/en/sub-agents) -- agent definition, tool restrictions, model selection, hook integration
- [Node.js VM Documentation](https://nodejs.org/api/vm.html) -- explicit disclaimer: "not a security mechanism"

### Security Research

- [CVE-2026-22709: Critical vm2 Sandbox Escape](https://thehackernews.com/2026/01/critical-vm2-nodejs-flaw-allows-sandbox.html) -- Promise handler bypass in vm2 (January 2026)
- [Snyk: Security Concerns of JavaScript Sandbox with Node.js VM Module](https://snyk.io/blog/security-concerns-javascript-sandbox-node-js-vm-module/) -- prototype chain escapes, RCE risks
- [DEV Community: node:vm Is Not a Sandbox](https://dev.to/dendrite_soup/nodevm-is-not-a-sandbox-stop-using-it-like-one-2f74) -- common misuse patterns
- [isolated-vm: Secure & isolated JS environments](https://github.com/laverdet/isolated-vm) -- V8 isolate-based alternative
- [@sebastianwessel/quickjs: QuickJS in WASM](https://github.com/sebastianwessel/quickjs) -- WASM-based sandbox alternative
- [Node.js January 2026 Security Releases](https://nodejs.org/en/blog/vulnerability/december-2025-security-releases) -- CVE-2025-55131 vm module memory leak

### Resilience Patterns

- [4 Fault Tolerance Patterns Every AI Agent Needs](https://dev.to/klement_gunndu/4-fault-tolerance-patterns-every-ai-agent-needs-in-production-jih) -- error classification, LLM-as-error-handler
- [Handling Timeouts and Retries in LLM Systems](https://dasroot.net/posts/2026/02/handling-timeouts-retries-llm-systems/) -- adaptive timeouts, circuit breakers
- [Retries, Fallbacks, and Circuit Breakers in LLM Apps](https://portkey.ai/blog/retries-fallbacks-and-circuit-breakers-in-llm-apps/) -- provider outage handling

### Existing Research

- RLM Synthesis: `research/rlm/SYNTHESIS.md` -- Sections 3, 8, 15 (architecture, REPL environments, Node.js patterns)
- Plugin Brainstorm: `research/claude-plugin/BRAINSTORM.md` -- Sections 2, 12 (REPL design, plugin structure)
- Codebase Architecture: `.planning/codebase/ARCHITECTURE.md` -- current repo state analysis
