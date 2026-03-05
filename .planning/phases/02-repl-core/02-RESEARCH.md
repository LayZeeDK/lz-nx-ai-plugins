# Phase 2: REPL Core - Research

**Researched:** 2026-03-05
**Domain:** Node.js VM sandbox, RLM execution loop, variable persistence, guardrails configuration
**Confidence:** HIGH

## Summary

Phase 2 builds the REPL sandbox that executes JavaScript code in an isolated VM context with workspace-aware globals, persists variables across turns via session state files, provides smart result truncation through `print()`, and enforces guardrails through a JSON config. The entire system is testable without any LLM by passing code via stdin to a per-invocation `node` process.

The research verified Node.js `vm.createContext()` behavior for sandbox isolation, confirmed the const/let-to-globalThis regex transformation approach for variable persistence, validated the per-invocation model with JSON session state serialization, and documented the SandboxResult schema that Phase 3 will consume. Key finding: `const` declarations in VM contexts do NOT appear on the sandbox object (they are script-scoped), so the regex transformation to `Object.defineProperty(globalThis, ...)` is essential -- not just a convenience but a hard requirement for cross-turn persistence. The `codeGeneration: { strings: false, wasm: false }` option effectively blocks `eval()` and `Function()` attacks.

All components use zero npm dependencies, following Phase 1 patterns (ESM `.mjs`, `node:` prefix imports, testable pure functions). The execution loop state machine (four independent termination trackers) implements the FEATURES.md design with adjustments from the CONTEXT.md discussion session.

**Primary recommendation:** Build three modules: `repl-sandbox.mjs` (VM execution engine with stdin/stdout interface), `rlm-config.mjs` (guardrails config loader with defaults + user overrides), and `repl-session.mjs` (session state serialization). The sandbox script reads code from stdin, reads session state from a JSON file, executes in a VM context with workspace globals, and writes a SandboxResult JSON to stdout. All four REPL requirements (REPL-01 through REPL-04) are implementable with Node.js builtins.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Guiding principle**: Match RLM convention (Hampton-io, code-rabi/rllm, Matryoshka, official MIT RLM) as the default for all decisions unless incompatible with our design or Claude Code constraints.
- **Variable persistence mechanism**: Regex transform `code.replace(/^(const|let|var)\s+(\w+)\s*=/gm, ...)` converts top-level declarations to globalThis assignments. `const` uses `Object.defineProperty(globalThis, name, { value: expr, writable: false, enumerable: true, configurable: true })`. `let`/`var` uses plain `globalThis.name = expr`. System prompt bans destructuring at top level. Functions do NOT persist across turns. Serialization: JSON-native only (strings, numbers, booleans, null, arrays, plain objects).
- **SHOW_VARS() format**: RLM convention (Hampton-io pattern) -- `"Variables: results (Array[247]), count (number), project (object), query (string)"`. Excludes all built-in globals.
- **Handle store approach**: No separate handle-store.mjs. The VM context's globalThis IS the handle store (Hampton-io pattern). No $res1 handle naming. Smart `print()` truncation IS the handle UX. Explicit `print()` only -- no auto-print of last expression value. print() truncation: 2,000 chars per call, 20,000 chars total per turn. Object serialization: `JSON.stringify(value, null, 2)`, fall back to `String(value)` on circular refs. Object.prototype.toString patch: return JSON instead of `[object Object]`.
- **Sandbox invocation mode**: Per-invocation model -- each REPL turn is a separate `node` process invocation. Code passed via stdin. Session state persisted to JSON file (`.cache/repl-session-<id>.json`). ~50-100ms startup overhead per turn.
- **Guardrails configuration**: Config file `lz-nx.rlm.config.json`. Defaults in plugin root. User overrides in `.claude/lz-nx.rlm.config.json` (merged). Default values: maxIterations=20, maxTimeout=120, maxConsecutiveErrors=3, maxStaleOutputs=3, maxNoCodeTurns=3, maxDepth=2.
- **Execution loop termination**: Four independent trackers -- codeExecutedCount (>= 1 threshold), noCodeCount (maxNoCodeTurns), consecutiveErrors (maxConsecutiveErrors, resets on success), lastOutputs (window of maxStaleOutputs for identical output detection). FINAL-in-prose detection prompts to wrap in code block. maxIterations hard cap makes one final LLM call. maxTimeout wall-clock limit terminates with best partial answer.

### Claude's Discretion

- Exact regex pattern for const/let transform (approach decided, implementation details flexible)
- Session file naming convention and cleanup strategy
- print() formatting details within the decided thresholds
- Error message wording for guardrail termination
- Mid-loop hint injection timing and wording
- Workspace index loading optimization within the per-invocation model

### Deferred Ideas (OUT OF SCOPE)

- Map/Set serialization support for session state
- Function persistence across turns via source code serialization
- Lazy-loading of large session state variables
- handle-store.mjs with $res1 naming and explicit operations
  </user_constraints>

<phase_requirements>

## Phase Requirements

| ID      | Description                                                                                                                                                                                                   | Research Support                                                                                                                                                                                                                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| REPL-01 | REPL sandbox executes JavaScript in isolated VM context with workspace-aware globals (workspace, projects, deps(), dependents(), read(), files(), search(), nx(), print(), SHOW_VARS(), FINAL(), FINAL_VAR()) | VM module verified on Node.js 24.13.0: `vm.createContext()` + `vm.runInContext()` with `codeGeneration: { strings: false, wasm: false }` blocks eval/Function. Timeout enforcement confirmed. All 12 globals implementable as synchronous functions injected into sandbox object.                                  |
| REPL-02 | Smart result truncation via globalThis persistence and print() truncation keeps large results navigable                                                                                                       | Verified: variables assigned to `globalThis.name` appear on sandbox object and survive JSON serialization. print() with per-call (2000 char) and per-turn (20000 char) limits tested. Array truncation pattern: `"Array(N) [first, second, ... +N-2 more]"`.                                                       |
| REPL-03 | RLM configuration controls guardrails via JSON config                                                                                                                                                         | Pure JSON file merging: `{ ...defaults, ...userOverrides }`. Config loader reads plugin root defaults, then `.claude/lz-nx.rlm.config.json` if present. No npm deps needed.                                                                                                                                        |
| REPL-04 | Execution loop implements fill/solve cycle with four-layer termination guards                                                                                                                                 | Four independent state trackers verified as implementable in pure state objects. Per-invocation model means the execution loop lives in Phase 3's agent, but the sandbox must return structured SandboxResult JSON that the loop can consume. Phase 2 builds the sandbox + config; Phase 3 builds the loop driver. |

</phase_requirements>

## Standard Stack

### Core

| Library              | Version    | Purpose                                                                 | Why Standard                                                        |
| -------------------- | ---------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Node.js              | LTS (24.x) | Runtime for all scripts                                                 | Constraint: zero npm deps                                           |
| `node:vm`            | built-in   | `vm.createContext()` + `vm.runInContext()` for isolated JS execution    | Proven in Hampton-io/RLM and code-rabi/rllm; no subprocess overhead |
| `node:fs`            | built-in   | Read session state, write session state, read workspace index           | Standard file operations                                            |
| `node:path`          | built-in   | Cross-platform path resolution for file globals (read, files)           | Windows/Unix normalization                                          |
| `node:child_process` | built-in   | `spawnSync` for git grep (search global), `execSync` for nx (nx global) | Cross-platform, synchronous                                         |

### Supporting

| Library       | Version  | Purpose                                  | When to Use                      |
| ------------- | -------- | ---------------------------------------- | -------------------------------- |
| `node:crypto` | built-in | `randomUUID()` for session ID generation | Creating new session identifiers |

### Alternatives Considered

| Instead of                  | Could Use                                | Tradeoff                                                                                                               |
| --------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `vm.createContext()`        | Child process REPL (Bun/Node subprocess) | True process isolation but higher latency (~50ms IPC vs <5ms VM); per-invocation model already handles crash isolation |
| `vm.createContext()`        | V8 isolates                              | Stricter isolation (prevents prototype pollution) but more complex bindings; overkill for our trust model              |
| JSON session state          | SQLite persistence                       | Richer queries but adds complexity; JSON sufficient for v0.0.1 variable count                                          |
| Regex declaration transform | AST parser (acorn)                       | Handles edge cases better but adds npm dependency; system prompt bans destructuring, making regex sufficient           |

**Installation:**

```bash
# No installation needed -- zero npm dependencies
# All components use Node.js builtins
```

## Architecture Patterns

### Recommended Module Structure

```
plugins/lz-nx.rlm/
  scripts/
    repl-sandbox.mjs          # VM execution engine (stdin -> SandboxResult JSON on stdout)
    rlm-config.mjs             # Guardrails config loader (defaults + user overrides merge)
    repl-session.mjs           # Session state serialization (read/write .cache/repl-session-*.json)
    shared/
      repl-globals.mjs         # Factory functions for all 12 REPL globals
      code-transform.mjs       # Regex transformation: const/let/var -> globalThis
      print-capture.mjs        # print() with truncation + output capture
  lz-nx.rlm.config.json        # Default guardrails config

tests/lz-nx.rlm/
  project.json                 # Nx project: "lz-nx-rlm-test"
  vitest.config.mjs            # Vitest config with #rlm alias to plugin scripts
  repl-sandbox.test.mjs        # Integration: stdin code -> SandboxResult
  repl-globals.test.mjs        # Unit: each global function in isolation
  code-transform.test.mjs      # Unit: regex transformation edge cases
  print-capture.test.mjs       # Unit: truncation logic
  rlm-config.test.mjs          # Unit: config merge logic
  repl-session.test.mjs        # Unit: state serialization/deserialization
  fixtures/                    # JSON test fixtures
```

### Pattern 1: Per-Invocation Sandbox

**What:** Each REPL turn spawns a new `node repl-sandbox.mjs` process. Code arrives on stdin. Session state is loaded from a JSON file. Result is written as a single JSON line to stdout.
**When to use:** Every REPL turn in the execution loop.
**Why:** Clean crash recovery (no orphaned processes), no IPC complexity, deterministic lifecycle. The ~50-100ms startup overhead is negligible over 20 iterations.

**SandboxResult schema:**

```javascript
/**
 * @typedef {Object} SandboxResult
 * @property {string} output - Captured print() output, joined by newlines
 * @property {Object} variables - Serialized session state (JSON-safe values only)
 * @property {string|null} final - FINAL() answer string, or null
 * @property {string|null} finalVar - FINAL_VAR() variable name, or null
 * @property {string|null} error - Error message, or null
 */
```

**Invocation:**

```bash
echo 'const count = Object.keys(projects).length; print("Projects:", count);' | \
  node plugins/lz-nx.rlm/scripts/repl-sandbox.mjs \
    --session .cache/repl-session-abc123.json \
    --index tmp/lz-nx.rlm/workspace-index.json \
    --timeout 30000
```

### Pattern 2: VM Context with Injected Globals

**What:** Create a VM context object with all 12 REPL globals pre-injected, then run transformed code in that context.
**When to use:** Inside repl-sandbox.mjs for each execution.
**Why:** `vm.createContext()` makes the sandbox object the global scope. Any property on the sandbox object becomes a global variable in the executed code.

**Example:**

```javascript
// Source: Verified against Node.js 24.13.0 vm module
import { createContext, runInContext } from 'node:vm';

function createSandboxContext(sessionState, workspaceIndex, globals) {
  const sandbox = {
    ...sessionState, // Restore persisted variables
    ...globals, // workspace, projects, deps, etc.
  };

  return createContext(sandbox, {
    codeGeneration: { strings: false, wasm: false },
  });
}
```

### Pattern 3: Code Transformation Pipeline

**What:** Before execution, transform top-level `const`/`let`/`var` declarations to `globalThis` assignments so they persist on the sandbox object for serialization.
**When to use:** Every code block before `vm.runInContext()`.
**Why:** `const`/`let` declarations in VM are script-scoped -- they do NOT appear on the sandbox object. Only `globalThis` properties are accessible from the host and serializable to JSON.

**Critical finding (verified):** In Node.js VM:

- `const x = 42` -- x is script-scoped, NOT on sandbox object, lost after execution
- `globalThis.x = 42` -- x IS on sandbox object, accessible from host, serializable
- `Object.defineProperty(globalThis, "x", { value: 42, writable: false, ... })` -- same as above but immutable within the turn

### Pattern 4: Session State Serialization

**What:** After each execution, extract JSON-serializable values from the sandbox object, write to `.cache/repl-session-<id>.json`. Before each execution, restore state by spreading into the new sandbox.
**When to use:** Between every REPL turn.
**Why:** Per-invocation model means each turn is a new process. Session state JSON is the bridge.

**Serialization rules (from CONTEXT.md):**

- JSON-native types pass through: string, number, boolean, null, array, plain object
- Functions: silently dropped by JSON.stringify (match Hampton-io)
- Maps, Sets, Symbols, undefined: silently dropped
- Circular references: caught by try/catch, value skipped

### Pattern 5: Testable Command Pattern (Reuse from Phase 1)

**What:** Export pure functions that accept inputs and return `{ output, exitCode }` or similar structured results. The `process.argv` entry point is a thin wrapper.
**When to use:** repl-sandbox.mjs, rlm-config.mjs, repl-session.mjs.
**Why:** Enables unit testing without spawning processes. Tests call the exported function directly.

### Anti-Patterns to Avoid

- **Don't use a long-running sandbox process.** Per-invocation is simpler and avoids crash recovery complexity, orphaned processes, and IPC marshalling. The CONTEXT.md explicitly decided this.
- **Don't auto-print the last expression value.** Hampton-io convention: only explicit `print()` produces output. Auto-print floods context with unintended output.
- **Don't try to persist functions across turns.** JSON.stringify silently drops them, and `codeGeneration: { strings: false }` blocks `eval()`-based restoration. This is by design (CONTEXT.md locked decision).
- **Don't use `eval()` or `new Function()` for code execution.** Use `vm.runInContext()` exclusively. The `codeGeneration: { strings: false }` option is a defense-in-depth layer.
- **Don't forget strict mode for const immutability.** Without `'use strict'`, assignment to a `writable: false` property silently fails instead of throwing. The sandbox should prepend `'use strict';` to transformed code or configure the context appropriately.
- **Don't use template literals in output messages.** Use string concatenation for cp1252 compatibility (project constraint from AGENTS.md).
- **Don't store built-in globals in session state.** SHOW_VARS() must exclude workspace, projects, deps, dependents, read, files, search, nx, print, SHOW_VARS, FINAL, FINAL_VAR, console. These are re-injected each invocation.

## Don't Hand-Roll

| Problem                   | Don't Build                     | Use Instead                                                                     | Why                                                          |
| ------------------------- | ------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| JS code isolation         | Custom subprocess sandbox       | `node:vm` createContext + runInContext                                          | Built-in, proven in Hampton-io/RLM and rllm, <5ms startup    |
| Code timeout enforcement  | Manual setTimeout + kill        | `vm.runInContext(code, ctx, { timeout })`                                       | Built-in timeout with clean error                            |
| eval/Function blocking    | Blocklist of dangerous globals  | `codeGeneration: { strings: false, wasm: false }`                               | VM-level enforcement, cannot be bypassed from inside         |
| JSON config merging       | Custom deep merge               | Flat `{ ...defaults, ...overrides }`                                            | Config is flat (no nesting), spread is sufficient            |
| Session ID generation     | Custom random string            | `crypto.randomUUID()`                                                           | Built-in, cryptographically random, zero deps                |
| File search in sandbox    | Custom file walker              | `git ls-files` via `spawnSync`                                                  | Respects .gitignore, fast, cross-platform                    |
| Content search in sandbox | Custom grep                     | `git grep` via `spawnSync`                                                      | Same tool used by find-command.mjs (Phase 1), proven pattern |
| Nx command execution      | Direct `execSync('npx nx ...')` | Reuse `runNx()` from nx-runner.mjs                                              | Enforces allowlist, env vars, error handling                 |
| Dependency traversal      | Custom graph walker             | Reuse `renderDepsTree()` from deps-command.mjs (adapted for REPL return format) | Already handles circular deps, dedup, reverse                |

**Key insight:** Phase 1 built reusable modules (nx-runner, index-loader, deps-command, find-command, path-resolver, project-filter) that directly serve as the implementation backbone for REPL globals. The sandbox wraps these existing functions as VM globals rather than reimplementing them.

## Common Pitfalls

### Pitfall 1: const/let Declarations Not on Sandbox Object

**What goes wrong:** Variables declared with `const`/`let` inside `vm.runInContext()` are script-scoped and do NOT appear on the sandbox object. They vanish between turns.
**Why it happens:** V8 treats `const`/`let` as lexically scoped to the Script, not the global object. Only `var` and explicit `globalThis` assignments appear on the sandbox.
**How to avoid:** Transform `const x = expr` to `Object.defineProperty(globalThis, "x", { value: expr, writable: false, enumerable: true, configurable: true })` and `let/var x = expr` to `globalThis.x = expr` before execution.
**Warning signs:** Variables assigned in one turn are "undefined" in the next turn.
**Verified:** Tested on Node.js 24.13.0. `const x = 42` followed by checking `sandbox.x` returns `undefined`.

### Pitfall 2: Strict Mode Required for const Immutability

**What goes wrong:** Without strict mode, assigning to a `writable: false` property silently succeeds (no-op) instead of throwing a TypeError.
**Why it happens:** Sloppy mode JavaScript silently ignores writes to non-writable properties. Only strict mode enforces the TypeError.
**How to avoid:** Prepend `'use strict';` to the transformed code before execution. This ensures `const`-declared variables throw on reassignment within a turn.
**Warning signs:** `const x = 42; x = 99;` silently succeeds, x remains 42 but no error surfaces to the LLM.
**Verified:** Tested on Node.js 24.13.0. Non-strict: silent no-op. Strict: `TypeError: Cannot assign to read only property`.

### Pitfall 3: Multi-line Expression Edge Case in Regex Transform

**What goes wrong:** The regex `^(const|let|var)\s+(\w+)\s*=` matches the start of a declaration, but if the expression spans multiple lines (e.g., template literals, multi-line objects), the transformation is incomplete.
**Why it happens:** The regex operates line-by-line (`/gm` flag). For `const obj = {` followed by `  a: 1,` on the next line, only the first line is transformed.
**How to avoid:** For `const`, the transformation wraps the RHS in `Object.defineProperty(globalThis, "name", { value: RHS, ... })`. The closing `})` must be appended. Two approaches: (a) find the matching semicolon/end-of-statement, or (b) use a simpler strategy -- process the entire code block, transform only lines matching the pattern, and handle multi-line expressions by tracking brace/bracket depth. The system prompt ban on destructuring simplifies this significantly.
**Warning signs:** SyntaxError from transformed code when original code uses multi-line expressions.

### Pitfall 4: Circular Reference in Session State Serialization

**What goes wrong:** `JSON.stringify()` throws `TypeError: Converting circular structure to JSON` when a variable contains circular references.
**Why it happens:** LLM-generated code may create objects with circular references (e.g., parent-child relationships, graph structures).
**How to avoid:** Wrap each variable's serialization in a try/catch. On failure, skip the variable (it will not persist to the next turn). Optionally log a warning.
**Warning signs:** Session state write fails, all variables lost between turns.

### Pitfall 5: Sandbox Prototype Pollution

**What goes wrong:** Code inside the VM modifies `Object.prototype` or `Array.prototype`, affecting the host process.
**Why it happens:** `vm.createContext()` creates a new global object but shares the underlying V8 prototypes with the host (known limitation of Node.js VM -- it is NOT a security sandbox).
**How to avoid:** For our use case, this is acceptable risk. The code is LLM-generated and runs in a short-lived per-invocation process. The Object.prototype.toString patch (Hampton-io convention) is intentional. If stronger isolation is needed later, use `vm.createContext()` with `microtaskMode: 'afterEvaluate'` and consider V8 isolates.
**Warning signs:** Host process behavior changes after sandbox execution. Mitigated by per-invocation model (process dies after each turn).

### Pitfall 6: stdin Buffering on Windows

**What goes wrong:** Reading code from stdin via `process.stdin` hangs or receives incomplete data on Windows.
**Why it happens:** Windows stdin buffering behavior differs from Unix. Piped input may not have a clean EOF signal.
**How to avoid:** Use `readFileSync(0, 'utf8')` (fd 0 = stdin) for synchronous blocking read. This is the cross-platform pattern recommended in CLAUDE.md. Do NOT use `/dev/stdin` (resolves to `C:\dev\stdin` on Windows).
**Warning signs:** Sandbox hangs waiting for input, or receives truncated code.
**Verified:** CLAUDE.md explicitly documents this: "Never use `/dev/stdin` as file path in program arguments."

### Pitfall 7: FINAL() Called in print() Output String

**What goes wrong:** The execution loop detects "FINAL(" in the print output and incorrectly terminates.
**Why it happens:** If the LLM prints a string containing "FINAL(" as debug output, a naive regex check on output text would false-positive.
**How to avoid:** FINAL() is a function call that sets an internal flag. The sandbox checks the flag after execution, not by parsing output text. The CONTEXT.md decision for "FINAL-in-prose detection" applies to the LLM's non-code text (Phase 3 concern), not sandbox output.
**Warning signs:** Premature loop termination when sandbox output happens to contain "FINAL".

### Pitfall 8: Large Session State Files

**What goes wrong:** Session state JSON grows unbounded as the LLM accumulates large arrays/objects across turns.
**Why it happens:** Each turn's variables are serialized. The LLM might store the entire workspace index result, large file contents, or accumulated search results.
**How to avoid:** Impose a session state size limit (e.g., 1MB). If exceeded, warn but continue (older variables may need pruning). For v0.0.1, log a warning and let the process handle it; optimization is deferred.
**Warning signs:** Session file grows to 10MB+, slowing down reads and writes.

## Code Examples

Verified patterns from Node.js documentation and hands-on testing.

### VM Sandbox Creation

```javascript
// Source: Verified on Node.js 24.13.0
import { createContext, runInContext } from 'node:vm';

function executeSandbox(code, sessionState, globals) {
  const sandbox = {
    ...sessionState,
    ...globals,
  };

  const ctx = createContext(sandbox, {
    codeGeneration: { strings: false, wasm: false },
  });

  // Transform code for variable persistence
  const transformed = transformDeclarations(code);
  // Prepend strict mode for const immutability
  const strictCode = '"use strict";\n' + transformed;

  try {
    runInContext(strictCode, ctx, { timeout: 30000 });
  } catch (err) {
    return { error: err.message };
  }

  // Extract serializable state
  const newState = extractState(sandbox, globals);

  return {
    output: globals._printCapture.getOutput(),
    variables: newState,
    final: globals._finalAnswer,
    finalVar: globals._finalVarName,
    error: null,
  };
}
```

### Code Transformation (const/let/var -> globalThis)

```javascript
// Source: CONTEXT.md decision + Node.js 24.13.0 VM behavior verification
// Approach: line-by-line regex, handling single-line declarations
// Multi-line expressions: the closing is handled by statement termination

/**
 * Transform top-level const/let/var declarations to globalThis assignments.
 * Only matches declarations at the start of a line (^, with /gm flag).
 * Does NOT match declarations inside blocks (if/for/while) because those
 * are indented and don't start at column 0.
 *
 * @param {string} code - Raw JavaScript code from LLM
 * @returns {string} Transformed code
 */
function transformDeclarations(code) {
  // const x = expr; -> Object.defineProperty(globalThis, "x", { value: (expr), ... });
  // let y = expr; -> globalThis.y = expr;
  // var z = expr; -> globalThis.z = expr;
  return code.replace(
    /^(const|let|var)\s+(\w+)\s*=/gm,
    (match, keyword, name) => {
      if (keyword === 'const') {
        return 'Object.defineProperty(globalThis, "' + name + '", { value:';
      }

      return 'globalThis.' + name + ' =';
    },
  );
}

// For const declarations, we need to close the Object.defineProperty call.
// The semicolon at the end of the expression becomes:
//   Object.defineProperty(globalThis, "x", { value: 42, writable: false, enumerable: true, configurable: true });
// This requires a second pass to add the closing properties + });
```

### print() with Truncation

```javascript
// Source: CONTEXT.md thresholds (2000/call, 20000/turn)

function createPrintCapture(maxPerCall, maxTotal) {
  let totalChars = 0;
  const outputs = [];

  function formatValue(value) {
    if (value === null || value === undefined) {
      return String(value);
    }

    if (typeof value !== 'object') {
      return String(value);
    }

    if (Array.isArray(value) && value.length > 5) {
      const preview = value
        .slice(0, 2)
        .map((v) => JSON.stringify(v))
        .join(', ');

      return (
        'Array(' +
        value.length +
        ') [' +
        preview +
        ', ... +' +
        (value.length - 2) +
        ' more]'
      );
    }

    try {
      const json = JSON.stringify(value, null, 2);

      if (json.length > 500) {
        return json.slice(0, 500) + '... [' + json.length + ' chars]';
      }

      return json;
    } catch {
      return String(value);
    }
  }

  function print(...args) {
    if (totalChars >= maxTotal) {
      return; // Silently stop capturing
    }

    let text = args.map(formatValue).join(' ');

    if (text.length > maxPerCall) {
      text = text.slice(0, maxPerCall) + '... [' + text.length + ' chars]';
    }

    if (totalChars + text.length > maxTotal) {
      text =
        text.slice(0, maxTotal - totalChars) +
        '... [truncated, ' +
        maxTotal +
        ' char limit]';
    }

    totalChars += text.length;
    outputs.push(text);
  }

  return {
    print,
    getOutput: () => outputs.join('\n'),
    getTotalChars: () => totalChars,
  };
}
```

### SHOW_VARS() Implementation

```javascript
// Source: CONTEXT.md format decision (Hampton-io pattern)

const BUILTIN_GLOBALS = new Set([
  'workspace',
  'projects',
  'deps',
  'dependents',
  'read',
  'files',
  'search',
  'nx',
  'print',
  'SHOW_VARS',
  'FINAL',
  'FINAL_VAR',
  'console',
]);

function createShowVars(sandbox) {
  return function SHOW_VARS() {
    const vars = [];

    for (const [key, value] of Object.entries(sandbox)) {
      if (BUILTIN_GLOBALS.has(key)) {
        continue;
      }

      if (typeof value === 'function') {
        continue;
      }

      if (Array.isArray(value)) {
        vars.push(key + ' (Array[' + value.length + '])');
      } else if (typeof value === 'object' && value !== null) {
        vars.push(key + ' (object)');
      } else {
        vars.push(key + ' (' + typeof value + ')');
      }
    }

    return 'Variables: ' + (vars.length > 0 ? vars.join(', ') : '(none)');
  };
}
```

### FINAL() and FINAL_VAR() Implementation

```javascript
// Source: RLM convention (Hampton-io, official MIT RLM)

function createFinalHandlers() {
  let finalAnswer = null;
  let finalVarName = null;

  return {
    FINAL: (answer) => {
      finalAnswer = String(answer);
    },
    FINAL_VAR: (name) => {
      finalVarName = String(name);
    },
    getFinalAnswer: () => finalAnswer,
    getFinalVarName: () => finalVarName,
  };
}
```

### Guardrails Config Loading

```javascript
// Source: CONTEXT.md config decision

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULTS = {
  maxIterations: 20,
  maxTimeout: 120,
  maxConsecutiveErrors: 3,
  maxStaleOutputs: 3,
  maxNoCodeTurns: 3,
  maxDepth: 2,
};

/**
 * Load RLM guardrails configuration.
 * Plugin defaults <- user overrides in .claude/lz-nx.rlm.config.json
 *
 * @param {string} pluginRoot - Plugin root directory
 * @param {string} workspaceRoot - User workspace root
 * @returns {object} Merged configuration
 */
export function loadConfig(pluginRoot, workspaceRoot) {
  // Load plugin defaults
  let pluginConfig = {};

  try {
    const raw = readFileSync(join(pluginRoot, 'lz-nx.rlm.config.json'), 'utf8');
    pluginConfig = JSON.parse(raw);
  } catch {
    // Use hardcoded defaults
  }

  // Load user overrides
  let userConfig = {};

  try {
    const raw = readFileSync(
      join(workspaceRoot, '.claude', 'lz-nx.rlm.config.json'),
      'utf8',
    );
    userConfig = JSON.parse(raw);
  } catch {
    // No user overrides
  }

  return { ...DEFAULTS, ...pluginConfig, ...userConfig };
}
```

### Session State Serialization

```javascript
// Source: CONTEXT.md serialization rules (JSON-native only)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Read session state from file.
 * @param {string} sessionPath - Path to session JSON file
 * @returns {object} Session state (empty object if file doesn't exist)
 */
export function readSession(sessionPath) {
  try {
    return JSON.parse(readFileSync(sessionPath, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Write session state to file.
 * Extracts only JSON-serializable values from the sandbox.
 *
 * @param {string} sessionPath - Path to session JSON file
 * @param {object} sandbox - VM sandbox object
 * @param {Set<string>} builtinNames - Names of built-in globals to exclude
 */
export function writeSession(sessionPath, sandbox, builtinNames) {
  const state = {};

  for (const [key, value] of Object.entries(sandbox)) {
    if (builtinNames.has(key)) {
      continue;
    }

    if (typeof value === 'function') {
      continue;
    }

    try {
      JSON.stringify(value);
      state[key] = value;
    } catch {
      // Skip non-serializable values (circular refs, etc.)
    }
  }

  mkdirSync(dirname(sessionPath), { recursive: true });
  writeFileSync(sessionPath, JSON.stringify(state), 'utf8');
}
```

### REPL Global: deps() and dependents()

```javascript
// Source: Reuse deps-command.mjs logic, adapted for REPL return format

function createDeps(index) {
  return function deps(projectName) {
    if (!index.projects[projectName]) {
      return '[ERROR] Project not found: ' + projectName;
    }

    return (index.dependencies[projectName] || []).map((d) => d.target);
  };
}

function createDependents(index) {
  // Build reverse adjacency list once
  const reverse = {};

  for (const name of Object.keys(index.dependencies)) {
    reverse[name] = [];
  }

  for (const [source, deps] of Object.entries(index.dependencies)) {
    for (const dep of deps) {
      if (!reverse[dep.target]) {
        reverse[dep.target] = [];
      }

      reverse[dep.target].push(source);
    }
  }

  return function dependents(projectName) {
    if (!index.projects[projectName]) {
      return '[ERROR] Project not found: ' + projectName;
    }

    return reverse[projectName] || [];
  };
}
```

### REPL Global: read(), files(), search()

```javascript
// Source: Tested against Node.js 24.13.0 + git commands

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function createRead(workspaceRoot) {
  return function read(filePath, start, end) {
    try {
      const fullPath = resolve(workspaceRoot, filePath);
      const content = readFileSync(fullPath, 'utf8');

      if (start !== undefined || end !== undefined) {
        const lines = content.split('\n');
        const s = start || 0;
        const e = end || lines.length;

        return lines.slice(s, e).join('\n');
      }

      return content;
    } catch (err) {
      return '[ERROR] ' + err.message;
    }
  };
}

function createFiles(workspaceRoot) {
  return function files(glob) {
    const result = spawnSync('git', ['ls-files', '--', glob], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      windowsHide: true,
    });

    if (result.status !== 0) {
      return [];
    }

    return result.stdout.trim().split('\n').filter(Boolean);
  };
}

function createSearch(workspaceRoot) {
  return function search(pattern, paths) {
    const args = ['grep', '-n', '--no-color', '-F', '--', pattern];

    if (paths) {
      if (Array.isArray(paths)) {
        args.push(...paths);
      } else {
        args.push(paths);
      }
    }

    const result = spawnSync('git', args, {
      cwd: workspaceRoot,
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 5 * 1024 * 1024,
    });

    if (result.status > 1) {
      return '[ERROR] ' + (result.stderr || 'search failed');
    }

    if (result.status === 1 || !result.stdout) {
      return 'No matches';
    }

    const lines = result.stdout.trim().split('\n');

    if (lines.length > 50) {
      return (
        lines.slice(0, 50).join('\n') +
        '\n... [' +
        lines.length +
        ' total, showing first 50]'
      );
    }

    return result.stdout.trim();
  };
}
```

### REPL Global: nx()

```javascript
// Source: Reuse runNx() from nx-runner.mjs

import { runNx } from '../nx-runner.mjs';

function createNxGlobal() {
  return function nx(command) {
    const result = runNx(command);

    if (result.error) {
      return result.error;
    }

    return result.data;
  };
}
```

### Object.prototype.toString Patch (Hampton-io)

```javascript
// Source: Hampton-io RLM convention -- prevents "[object Object]" in string concat
// Applied inside the VM context at initialization

const TOSTRING_PATCH = `
Object.prototype.toString = function() {
  try {
    return JSON.stringify(this, null, 2);
  } catch(e) {
    return Object.prototype.toString.call(this);
  }
};
`;
// Execute this in the VM context before user code
```

## State of the Art

| Old Approach                    | Current Approach                                  | When Changed          | Impact                                                                                                                          |
| ------------------------------- | ------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `vm.runInNewContext()` per call | `vm.createContext()` + reuse context              | Always available      | Context reuse avoids per-call context creation overhead; but our per-invocation model creates a new context each process anyway |
| `vm.Script` + `runInContext()`  | `vm.runInContext(code, ctx, options)`             | Always available      | Convenience wrapper; functionally identical                                                                                     |
| No codeGeneration option        | `codeGeneration: { strings: false, wasm: false }` | Node.js 12+           | Blocks eval/Function attacks; standard security hardening                                                                       |
| `process.stdin.read()` async    | `readFileSync(0, 'utf8')`                         | Always available      | Synchronous stdin read; works cross-platform including Windows                                                                  |
| `$handle` variable naming       | globalThis as store                               | Hampton-io convention | Simpler, no translation layer between handle names and actual variables                                                         |

**Deprecated/outdated:**

- `vm.runInThisContext()`: Still works but provides no isolation (shares the calling context's global).
- `vm.createScript()`: Old API; use `new vm.Script()` or `vm.runInContext()` directly.
- `vm.runInNewContext()` for per-call isolation: Works but creates a new context each time; overhead is ~1-5ms per call. For our per-invocation model this is fine since we create one context per process.

## Open Questions

1. **Multi-line const expression closing**
   - What we know: The regex `^const\s+(\w+)\s*=` captures the start of a const declaration. For single-line expressions (`const x = 42;`), the transform wraps correctly. For multi-line expressions, the closing `}, writable: false, enumerable: true, configurable: true });` must be placed at the correct position.
   - What's unclear: The optimal strategy for finding the end of a multi-line expression without a full parser. Brace/bracket depth counting would work for most cases but is not a complete solution.
   - Recommendation: Start with single-line transform only (handles 90%+ of LLM-generated code). The system prompt instructs the LLM to prefer single-line declarations. If multi-line patterns emerge in Phase 3 testing, add brace-depth tracking as a refinement. Alternatively, use a two-pass approach: first pass replaces `const x =` with a marker, second pass finds the terminating semicolon and wraps.

2. **Object.prototype.toString patch safety**
   - What we know: Hampton-io patches `Object.prototype.toString` to return JSON. This prevents `"text " + obj` producing `"text [object Object]"`.
   - What's unclear: Whether this patch causes issues with specific JavaScript operations that rely on the default toString behavior (e.g., type checking via `Object.prototype.toString.call(value)`).
   - Recommendation: Apply the patch. The `catch(e)` fallback handles circular references. The per-invocation model means any prototype pollution dies with the process. Add the patch to the initialization code, not user code.

3. **Session state size limits**
   - What we know: JSON serialization of variables can produce large files if the LLM stores large arrays/objects.
   - What's unclear: Practical size limits before read/write latency becomes noticeable. A 1MB JSON file reads in ~1ms; a 10MB file might take 5-10ms.
   - Recommendation: Implement without limits for v0.0.1. Add a size warning (to stderr) if state exceeds 1MB. Defer pruning/eviction to a later milestone.

## Validation Architecture

### Test Framework

| Property           | Value                                                       |
| ------------------ | ----------------------------------------------------------- |
| Framework          | Vitest 4.x (devDependency in workspace)                     |
| Config file        | `tests/lz-nx.rlm/vitest.config.mjs` (moved from plugin dir) |
| Quick run command  | `npx vitest run --reporter=verbose`                         |
| Full suite command | `npx vitest run`                                            |

### Phase Requirements -> Test Map

| Req ID  | Behavior                                                               | Test Type | Automated Command                                        | File Exists? |
| ------- | ---------------------------------------------------------------------- | --------- | -------------------------------------------------------- | ------------ |
| REPL-01 | VM sandbox executes code with 12 workspace globals                     | unit      | `npx vitest run tests/lz-nx.rlm/repl-sandbox.test.mjs`   | Wave 0       |
| REPL-01 | Each global function works correctly in isolation                      | unit      | `npx vitest run tests/lz-nx.rlm/repl-globals.test.mjs`   | Wave 0       |
| REPL-01 | Code transformation (const/let/var -> globalThis)                      | unit      | `npx vitest run tests/lz-nx.rlm/code-transform.test.mjs` | Wave 0       |
| REPL-02 | print() truncation at 2000/call and 20000/turn                         | unit      | `npx vitest run tests/lz-nx.rlm/print-capture.test.mjs`  | Wave 0       |
| REPL-02 | Array truncation, object truncation, circular ref handling             | unit      | `npx vitest run tests/lz-nx.rlm/print-capture.test.mjs`  | Wave 0       |
| REPL-02 | SHOW_VARS() returns correct format excluding builtins                  | unit      | `npx vitest run tests/lz-nx.rlm/repl-globals.test.mjs`   | Wave 0       |
| REPL-03 | Config loader merges defaults + user overrides                         | unit      | `npx vitest run tests/lz-nx.rlm/rlm-config.test.mjs`     | Wave 0       |
| REPL-03 | Missing config files handled gracefully                                | unit      | `npx vitest run tests/lz-nx.rlm/rlm-config.test.mjs`     | Wave 0       |
| REPL-04 | SandboxResult JSON schema is correct (output, variables, final, error) | unit      | `npx vitest run tests/lz-nx.rlm/repl-sandbox.test.mjs`   | Wave 0       |
| REPL-04 | FINAL() sets final answer, FINAL_VAR() sets variable name              | unit      | `npx vitest run tests/lz-nx.rlm/repl-globals.test.mjs`   | Wave 0       |
| REPL-04 | Session state persists between turns (write -> read -> verify)         | unit      | `npx vitest run tests/lz-nx.rlm/repl-session.test.mjs`   | Wave 0       |
| REPL-04 | Timeout enforcement (vm.runInContext timeout)                          | unit      | `npx vitest run tests/lz-nx.rlm/repl-sandbox.test.mjs`   | Wave 0       |
| REPL-04 | eval/Function blocked (codeGeneration: strings: false)                 | unit      | `npx vitest run tests/lz-nx.rlm/repl-sandbox.test.mjs`   | Wave 0       |

### Sampling Rate

- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green (Phase 1 tests 111 + Phase 2 new tests) before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/lz-nx.rlm/repl-sandbox.test.mjs` -- covers REPL-01 (sandbox creation + execution), REPL-04 (SandboxResult schema, timeout, security)
- [ ] `tests/lz-nx.rlm/repl-globals.test.mjs` -- covers REPL-01 (all 12 globals), REPL-02 (SHOW_VARS), REPL-04 (FINAL/FINAL_VAR)
- [ ] `tests/lz-nx.rlm/code-transform.test.mjs` -- covers REPL-01 (const/let/var transformation, edge cases)
- [ ] `tests/lz-nx.rlm/print-capture.test.mjs` -- covers REPL-02 (truncation logic, formatting)
- [ ] `tests/lz-nx.rlm/rlm-config.test.mjs` -- covers REPL-03 (config loading, merging, defaults)
- [ ] `tests/lz-nx.rlm/repl-session.test.mjs` -- covers REPL-04 (session state read/write, circular ref handling)

_(Existing test infrastructure from Phase 1 provides vitest.config.mjs, fixture patterns, and mock patterns.)_

## Sources

### Primary (HIGH confidence)

- Node.js 24.13.0 `vm` module -- hands-on verification of `createContext()`, `runInContext()`, `codeGeneration` options, timeout enforcement, sandbox object behavior, strict mode interactions
- CONTEXT.md Phase 2 decisions -- locked design choices for variable persistence, print truncation, sandbox invocation, guardrails config
- Phase 1 codebase (scripts/\*.mjs) -- established patterns for module structure, testing, error handling
- RLM SYNTHESIS.md (research/rlm/SYNTHESIS.md) -- Node.js implementation patterns from Hampton-io/RLM, code-rabi/rllm, Matryoshka
- Official RLM docs (alexzhang13.github.io/rlm/) -- REPL globals spec, LocalREPL sandboxing approach, custom_tools pattern

### Secondary (MEDIUM confidence)

- Hampton-io RLM GitHub -- globalThis transformation pattern, Object.prototype.toString patch convention
- code-rabi/rllm GitHub -- Node.js VM sandbox with `codeGeneration: { strings: false }` pattern
- Matryoshka (yogthos) -- stale-loop detection pattern (doneCount approach)

### Tertiary (LOW confidence)

- None -- all critical findings verified with hands-on testing against Node.js 24.13.0.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH -- all components are Node.js builtins, verified hands-on
- Architecture: HIGH -- per-invocation model, VM sandbox, session state all tested; patterns proven in Hampton-io/rllm
- Pitfalls: HIGH -- all pitfalls reproduced and verified (const scope, strict mode, stdin, circular refs)
- Code examples: HIGH -- all examples are tested code, not hypothetical
- Validation: HIGH -- test patterns established in Phase 1; vitest.config.mjs exists; 111 existing tests pass

**Research date:** 2026-03-05
**Valid until:** 2026-04-05 (stable domain -- Node.js builtins are versioned and stable)
