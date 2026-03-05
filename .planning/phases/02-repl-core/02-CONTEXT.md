# Phase 2: REPL Core - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Isolated JavaScript sandbox with workspace-aware globals, variable persistence across turns, smart result truncation via print(), guardrails config, and the fill/solve execution loop with robust termination. Testable without any LLM by passing code via stdin. The agent integration and explore skill are Phase 3.

</domain>

<decisions>
## Implementation Decisions

### Guiding principle

- Match RLM convention (Hampton-io, code-rabi/rllm, Matryoshka, official MIT RLM) as the default for all decisions unless incompatible with our design or Claude Code constraints.

### Variable persistence mechanism

- Regex transform: `code.replace(/^(const|let|var)\s+(\w+)\s*=/gm, ...)` converts top-level declarations to globalThis assignments
- `const` declarations use `Object.defineProperty(globalThis, name, { value: expr, writable: false, enumerable: true, configurable: true })` to preserve immutability within a turn while allowing redefinition across turns
- `let`/`var` declarations use plain `globalThis.name = expr` (mutable)
- System prompt ban on destructuring at top level: "Do not use destructuring in top-level declarations -- assign to a single variable, then access properties." The regex cannot handle recursive destructuring grammar.
- Functions do NOT persist across turns (match RLM convention). JSON.stringify silently drops functions, and `codeGeneration: { strings: false }` blocks eval-based restoration. Functions work within a single turn via normal VM context behavior.
- Serialization: JSON-native only (strings, numbers, booleans, null, arrays, plain objects). Functions, Maps, Sets, Symbols, undefined, and circular references are silently dropped. Matches Hampton-io behavior. Map/Set support can be added in a later milestone if benefits are uncovered.

### SHOW_VARS() format

- RLM convention (Hampton-io pattern): name + type + count for collections
- Format: `"Variables: results (Array[247]), count (number), project (object), query (string)"`
- The LLM uses print() to inspect specific values
- Excludes all built-in globals (workspace, projects, deps, etc.)

### Handle store approach (FEATURES.md overrides PROJECT.md)

- No separate handle-store.mjs script. The VM context's globalThis IS the handle store (Hampton-io pattern).
- No $res1 handle naming, no store/get/filter API. The LLM navigates large data using native JavaScript (array.filter(), array.slice(), etc.) on persisted globalThis variables.
- Smart print() truncation IS the handle UX:
  - Primitives: print as-is
  - Arrays > 5 elements: `"Array(N) [first, second, ... +N-2 more]"`
  - Objects > 500 chars serialized: truncated with `"... [N chars]"`
- Explicit print() only -- no auto-print of last expression value (match Hampton-io)
- print() truncation: 2,000 chars per call, 20,000 chars total per turn
- Object serialization: JSON.stringify(value, null, 2), fall back to String(value) on circular refs
- Object.prototype.toString patch: return JSON instead of `[object Object]` (match Hampton-io)
- PROJECT.md's handle-store.mjs listing is a documentation artifact from earlier brainstorm -- FEATURES.md explicitly flags it as over-engineering

### Sandbox invocation mode

- Per-invocation model: each REPL turn is a separate `node` process invocation (architecture research recommendation, Anti-Pattern 2 avoidance)
- Code passed via stdin (not CLI args -- Anti-Pattern 1 avoidance)
- Session state persisted to JSON file between turns (`.cache/repl-session-<id>.json`)
- Session state contains serialized globalThis variables (no handle references -- follows FEATURES.md approach)
- ~50-100ms startup overhead per turn, 1-2s total over 20 iterations -- acceptable
- Clean crash recovery: no orphaned processes, no IPC complexity

### Guardrails configuration

- Config file: `lz-nx.rlm.config.json`
- Defaults ship in plugin root (`plugins/lz-nx.rlm/lz-nx.rlm.config.json`)
- User overrides in `.claude/lz-nx.rlm.config.json` (merged over defaults)
- Default values:
  ```json
  {
    "maxIterations": 20,
    "maxTimeout": 120,
    "maxConsecutiveErrors": 3,
    "maxStaleOutputs": 3,
    "maxNoCodeTurns": 3,
    "maxDepth": 2
  }
  ```

### Execution loop termination (FEATURES.md state machine + adjustments)

- Four independent trackers for four failure modes:
  - `codeExecutedCount` (number): guards against premature FINAL. Threshold: >= 1 (lowered from FEATURES.md's >= 2 to match Matryoshka convention). Also used for diagnostics and mid-loop hints.
  - `noCodeCount` (counter): guards against infinite thinking without code. After maxNoCodeTurns consecutive no-code turns, force final answer request.
  - `consecutiveErrors` (counter): guards against error loops. After maxConsecutiveErrors consecutive errors, terminate with best partial answer. Resets to 0 on any successful execution.
  - `lastOutputs` (array, window of maxStaleOutputs): guards against stale loops. If N consecutive turns produce identical stdout, terminate. Matches Matryoshka's doneCount approach.
- FINAL-in-prose detection: if FINAL() appears in non-code text, prompt to wrap in code block. Do NOT regex-parse FINAL from prose (match Hampton-io intent, stricter than official RLM).
- maxIterations hard cap: on expiry, make one final LLM call requesting just the answer.
- maxTimeout wall-clock limit: terminate with best partial answer.

### Claude's Discretion

- Exact regex pattern for const/let transform (the approach is decided, exact implementation details are flexible)
- Session file naming convention and cleanup strategy
- print() formatting details within the decided thresholds
- Error message wording for guardrail termination
- Mid-loop hint injection timing and wording
- Workspace index loading optimization within the per-invocation model

</decisions>

<specifics>
## Specific Ideas

- FEATURES.md is the authoritative design doc for Phase 2, overriding earlier PROJECT.md brainstorm where they conflict (specifically: no separate handle-store.mjs, no $res1 handles, globalThis IS the store)
- The workspace index is plain objects (Record<string, ...>), not Maps -- matches what Phase 1 actually built
- `projects` global is a shorthand for `workspace.projects` (plain object property access, not Map.get())
- Object.prototype.toString patch from Hampton-io prevents `"text " + someObject` producing `"text [object Object]"`
- FINAL() is a function callable ONLY inside repl code blocks (match Hampton-io). It sets an internal flag checked after each code block execution.
- FINAL_VAR(name) records the variable name; if variable not found, the loop continues with a hint message rather than terminating (match official RLM robustness)
- No-code response handling: append prompt with available globals to nudge the LLM back to exploration

</specifics>

<code_context>

## Existing Code Insights

### Reusable Assets

- `shared/index-loader.mjs`: loadIndex(workspaceRoot) with auto-build/rebuild -- directly usable for loading workspace index into sandbox
- `nx-runner.mjs`: safe Nx CLI wrapper with allowlisting -- wrap as the `nx()` REPL global
- `path-resolver.mjs`: bidirectional alias resolution -- could power an `alias()` REPL global if needed
- `shared/output-format.mjs`: ASCII formatting helpers (info, success, error) -- reuse for sandbox status messages
- `shared/project-filter.mjs`: project glob matching -- reusable for scoping operations in REPL globals
- Test infrastructure: Vitest with fixtures pattern established in Phase 1

### Established Patterns

- ESM `.mjs` with `node:` prefix imports, zero npm dependencies
- Testable command pattern: export pure functions separate from process.argv entry point
- `[OK]`, `[ERROR]`, `[WARN]`, `[INFO]` ASCII prefix tags for console output
- `execSync`/`spawnSync` for CLI wrapping with explicit maxBuffer and timeout
- JSDoc for exported functions with @typedef for data structures

### Integration Points

- Workspace index at `tmp/lz-nx.rlm/workspace-index.json` -- sandbox loads this on each invocation
- Session state at `.cache/repl-session-<id>.json` -- sandbox reads/writes between invocations
- Config at `plugins/lz-nx.rlm/lz-nx.rlm.config.json` (defaults) and `.claude/lz-nx.rlm.config.json` (user overrides)
- `git grep` via `spawnSync` with `shell: false` for the search() REPL global (quick task #1 decision)
- Phase 3 will consume the sandbox via `node repl-sandbox.mjs` with code on stdin, reading SandboxResult JSON from stdout

</code_context>

<deferred>
## Deferred Ideas

- Map/Set serialization support for session state -- add in later milestone if benefits uncovered
- Function persistence across turns via source code serialization -- complexity vs. benefit tradeoff unfavorable for v0.0.1
- Lazy-loading of large session state variables -- optimization for if session state size becomes a problem
- handle-store.mjs with $res1 naming and explicit operations -- FEATURES.md determined this is over-engineering for v0.0.1

</deferred>

---

_Phase: 02-repl-core_
_Context gathered: 2026-03-05_
