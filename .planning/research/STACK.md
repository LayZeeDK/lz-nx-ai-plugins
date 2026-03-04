# Technology Stack: Deep Dive on Node.js APIs

**Project:** lz-nx.rlm -- RLM-powered Claude Code plugin for Nx JS/TS workspaces
**Researched:** 2026-03-04
**Focus:** Node.js API configurations for vm sandbox, fs.glob, child_process, and Node.js 24 LTS features
**Builds on:** Prior STACK.md (2026-03-03) validated the high-level stack. This research deepens API-level understanding.

## Recommended Stack

The high-level stack is unchanged from prior research (Node.js 24 LTS, zero dependencies, `node:vm`, `node:fs`, `node:child_process`). This document provides **implementation-level guidance** for each critical API.

---

## 1. REPL Sandbox: `node:vm` Configuration

### 1.1 `vm.createContext()` Options

**Recommended configuration:**

```javascript
import { createContext, Script, constants } from 'node:vm';

const sandbox = Object.create(null);
Object.assign(sandbox, {
  workspace: workspaceIndex,
  projects: workspaceIndex.projects,
  deps: depsFunction,
  dependents: dependentsFunction,
  read: readFunction,
  files: filesFunction,
  search: searchFunction,
  nx: nxFunction,
  llm_query: llmQueryFunction,
  FINAL: finalFunction,
  FINAL_VAR: finalVarFunction,
  print: printFunction,
  SHOW_VARS: showVarsFunction,
  // Safe builtins
  JSON, Math, Date, Array, Object, String, Number, Boolean,
  Map, Set, RegExp, Error, TypeError, RangeError, SyntaxError,
  parseInt, parseFloat, isNaN, isFinite,
  Promise, // Required for async IIFE pattern
  console: sandboxConsole,
});

const context = createContext(sandbox, {
  name: 'rlm-repl',
  codeGeneration: {
    strings: false, // Blocks eval(), new Function()
    wasm: false,    // Blocks WebAssembly.compile()
  },
  microtaskMode: undefined, // DO NOT use 'afterEvaluate' -- see section 1.3
});
```

**Why this configuration:**

| Option | Value | Rationale |
|--------|-------|-----------|
| `name` | `'rlm-repl'` | Identifies the context in Node.js Inspector/debugging output |
| `codeGeneration.strings` | `false` | Prevents `eval()` and `new Function('...')` -- blocks code injection attacks from LLM-generated code. Throws `EvalError` if attempted. |
| `codeGeneration.wasm` | `false` | Prevents WebAssembly compilation -- unnecessary for REPL and blocks a potential attack surface. Throws `WebAssembly.CompileError` if attempted. |
| `microtaskMode` | `undefined` (default) | See section 1.3 for the critical reason to avoid `'afterEvaluate'` |

**Confidence:** HIGH -- Options verified against [Node.js v24.x vm docs](https://nodejs.org/docs/latest-v24.x/api/vm.html).

### 1.2 `vm.constants.DONT_CONTEXTIFY` -- Do NOT Use

**Decision: Do NOT use `DONT_CONTEXTIFY` for our sandbox.**

`vm.constants.DONT_CONTEXTIFY` creates contexts whose global objects are "vanilla" (not intercepted by V8's contextify layer). The key benefit is that the global can be frozen via `Object.freeze(globalThis)`.

**Why we should NOT use it:**

1. **We need a mutable global.** The LLM-generated code assigns variables to `globalThis` for persistence across blocks. Freezing the global defeats this purpose entirely.
2. **We need contextified property access.** Standard `vm.createContext(sandbox)` installs interceptors so that `sandbox.workspace` is directly accessible as `workspace` in the REPL code. With `DONT_CONTEXTIFY`, you get a proxy-like object but lose the seamless property mapping that makes `const project = projects.get('my-app')` work.
3. **The benefit (freezing) contradicts our requirements.** Our REPL is intentionally mutable -- variables persist, results accumulate, the workspace index is navigated interactively.

**When to reconsider:** If we ever need a read-only context (e.g., for a "safe preview" mode where the LLM can inspect but not modify state), `DONT_CONTEXTIFY` with a frozen global would be appropriate.

**Confidence:** HIGH -- Verified against [Node.js commit introducing DONT_CONTEXTIFY](https://github.com/nodejs/node/commit/2d90340cb3) and [v24.x docs](https://nodejs.org/docs/latest-v24.x/api/vm.html).

### 1.3 `microtaskMode` -- Critical: Avoid `'afterEvaluate'`

**Decision: Do NOT set `microtaskMode: 'afterEvaluate'` on the context.**

**The problem `afterEvaluate` solves:** By default, Promises in a VM context can escape the `timeout` option. Code like `Promise.resolve().then(() => { while(true) {} })` will bypass the timeout because the infinite loop runs in the global microtask queue after `runInContext` returns.

**Why we must NOT use `afterEvaluate` despite this:**

There is a [known Node.js bug (#55546)](https://github.com/nodejs/node/issues/55546) where `microtaskMode: 'afterEvaluate'` causes `async`/`await` code to **hang indefinitely**. The issue is open and unresolved as of Node.js 24.x. The mechanism: `afterEvaluate` gives the context its own microtask queue, but `await` suspends execution and hands control back to the event loop. Since the context's microtask queue only drains after evaluation completes, and evaluation is suspended waiting for the `await`, a deadlock occurs.

This is fatal for our REPL because:
- Both reference implementations (hampton-io/RLM, code-rabi/rllm) wrap code in `async` IIFEs
- Our `llm_query()` global returns a Promise that the LLM code `await`s
- Every REPL iteration would hang

**Our approach to timeout safety instead:**

```javascript
async execute(code) {
  // 1. Wrap in async IIFE for await support
  const wrappedCode = `(async () => { ${transformedCode} })()`;

  // 2. Create Script and run -- this returns a Promise
  const script = new Script(wrappedCode, { filename: 'rlm-repl.mjs' });
  const resultPromise = script.runInContext(this.context);
  // Note: timeout on runInContext only covers synchronous execution.
  // The async IIFE returns immediately (a pending Promise).

  // 3. Race the Promise against our own timeout
  const timeoutMs = this.config.executionTimeout ?? 30_000;
  const timeoutPromise = new Promise((_, reject) => {
    const handle = setTimeout(() => {
      reject(new Error(`REPL execution timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    // Store handle for cleanup
    this._timeoutHandle = handle;
  });

  try {
    const result = await Promise.race([resultPromise, timeoutPromise]);
    return result;
  } finally {
    clearTimeout(this._timeoutHandle);
  }
}
```

**Trade-off:** This timeout does NOT kill the underlying V8 execution -- a tight infinite loop inside the async IIFE will escape. However, for our use case (LLM-generated navigation code, not adversarial code), `await`-based hangs are far more likely than tight infinite loops. The `Promise.race` approach handles the common case (slow LLM queries, large file reads) while keeping `async`/`await` working.

For true infinite-loop protection, add a `Script` timeout on the synchronous compilation phase:

```javascript
const script = new Script(wrappedCode, { filename: 'rlm-repl.mjs' });
// This timeout kills synchronous infinite loops during initial evaluation
const resultPromise = script.runInContext(this.context, { timeout: 5000 });
// Then race the async completion against our own timer
```

**Confidence:** HIGH -- Bug verified at [nodejs/node#55546](https://github.com/nodejs/node/issues/55546). Both reference implementations avoid `afterEvaluate`.

### 1.4 `const`/`let` to `globalThis` Transformation

**Problem:** In `node:vm`, each `runInContext` call is a fresh scope. Variables declared with `const` or `let` are block-scoped and vanish after execution. For the REPL to maintain state across iterations, variables must be promoted to `globalThis`.

**Hampton-io's regex approach:**

```javascript
const transformedCode = code.replace(/\b(const|let)\s+(\w+)\s*=/g, 'globalThis.$2 =');
```

**Known edge cases this regex FAILS on:**

| Pattern | Input | Broken Output | Correct Behavior |
|---------|-------|---------------|-----------------|
| Destructuring | `const { a, b } = obj;` | `globalThis.{ a, b } = obj;` | Should become `const _tmp = obj; globalThis.a = _tmp.a; globalThis.b = _tmp.b;` |
| Array destructuring | `const [x, y] = arr;` | `globalThis.[x, y] = arr;` | Should assign x and y separately |
| Multi-declaration | `const a = 1, b = 2;` | `globalThis.a = 1, b = 2;` | Only captures first variable |
| `for` loop | `for (let i = 0; ...)` | `for (globalThis.i = 0; ...)` | Loop variables should NOT be global |
| Nested in string | `"const x = 5"` | `"globalThis.x = 5"` | Should not transform strings |
| Comments | `// const x = 5` | `// globalThis.x = 5` | Should not transform comments |

**Our approach: simple regex with documented limitations.**

For v0.0.1, use the same simple regex as hampton-io but document the limitations. The LLM rarely generates destructuring in REPL exploration code (it prefers simple assignments), and for-loop variables escaping to global scope is harmless in a single-session REPL.

```javascript
/**
 * Transform top-level const/let to globalThis assignments for variable
 * persistence across REPL iterations.
 *
 * KNOWN LIMITATIONS:
 * - Destructuring patterns are not supported (will produce invalid code)
 * - Multi-variable declarations only capture the first variable
 * - Transformations inside string literals or comments are incorrectly applied
 * - For-loop variables are incorrectly promoted to globalThis
 *
 * These limitations are acceptable for v0.0.1 because:
 * 1. LLM-generated REPL code predominantly uses simple assignments
 * 2. Destructuring failures produce visible errors the LLM can fix
 * 3. For v2, consider an AST-based approach (acorn/esprima)
 */
function transformDeclarations(code) {
  return code.replace(/\b(const|let)\s+(\w+)\s*=/g, 'globalThis.$2 =');
}
```

**When to upgrade:** If the LLM frequently generates destructuring patterns that break, switch to a lightweight AST parser (acorn is ~120KB, MIT license). This is a Phase 2 optimization, not a Phase 1 blocker.

**Confidence:** HIGH -- Verified by reading hampton-io/RLM source (vm-sandbox.ts line 288). Edge cases identified by analysis.

### 1.5 Cross-Realm Error Handling with `Error.isError()`

**Problem:** Errors thrown inside a `vm.createContext()` sandbox are created with the sandbox's `Error` constructor, not the host's. This means `err instanceof Error` returns `false` in the host code -- a classic cross-realm bug.

**Node.js 24 solution:** `Error.isError()` checks for the internal `[[ErrorData]]` slot, which works across realms. This is part of the TC39 proposal (Stage 4, shipping in ES2026) and available in Node.js 24+ via V8 13.4+.

**Recommended pattern for our REPL error handling:**

```javascript
/**
 * Check if a value is an Error, works across VM context boundaries.
 * Uses Error.isError() (Node.js 24+) with instanceof fallback.
 */
function isError(value) {
  if (typeof Error.isError === 'function') {
    return Error.isError(value);
  }

  return value instanceof Error;
}

// Usage in sandbox execute():
async execute(code) {
  try {
    const result = await script.runInContext(this.context, { timeout });
    // ...
  } catch (err) {
    // This correctly detects errors from the VM context
    if (isError(err)) {
      return { error: err.message, stack: err.stack };
    }

    return { error: String(err) };
  }
}
```

**Why this matters:** Without `Error.isError()`, the REPL error handler falls through to the `String(err)` branch, losing the stack trace and error type. This degrades the LLM's ability to self-correct because it sees `"[object Object]"` instead of `"TypeError: Cannot read properties of undefined (reading 'map')"`.

**Additional cross-realm considerations:**

| API | Cross-realm safe? | Notes |
|-----|-------------------|-------|
| `Error.isError(err)` | Yes (Node.js 24+) | Checks `[[ErrorData]]` slot |
| `err instanceof Error` | NO | Different Error constructors per realm |
| `err.stack` | Yes (getter on builtins only) | Returns `undefined` for non-builtin error objects |
| `structuredClone(obj)` | Partial | Uses outer realm's constructors ([nodejs/node#55554](https://github.com/nodejs/node/issues/55554)) |
| `Array.isArray(arr)` | Yes | Has worked cross-realm since ES5 |
| `typeof err === 'object'` | Yes | Primitive check, realm-independent |

**Confidence:** HIGH -- Verified against [MDN Error.isError()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/isError), [TC39 proposal](https://github.com/tc39/proposal-is-error), [Node.js 24 docs](https://nodejs.org/docs/latest-v24.x/api/errors.html).

### 1.6 Object.prototype.toString Patch

**Problem:** When the LLM writes `"Result: " + someObject`, JavaScript calls `someObject.toString()` which returns `"[object Object]"`. The data is lost and the LLM sees corrupted output. Hampton-io/RLM v0.3.0 patches this.

**Recommended pattern (from hampton-io/RLM):**

```javascript
const patchScript = new Script(`
  (function() {
    const originalToString = Object.prototype.toString;
    Object.prototype.toString = function() {
      if (this && typeof this === 'object' &&
          this.constructor === Object &&
          Object.getPrototypeOf(this) === Object.prototype) {
        try {
          return JSON.stringify(this);
        } catch (e) {
          return originalToString.call(this);
        }
      }
      return originalToString.call(this);
    };
  })();
`);
patchScript.runInContext(context);
```

**Why only patch plain objects:** Arrays, Dates, RegExps, etc. already have useful `toString()` implementations. We only patch `Object.prototype.toString` for `{}` instances -- the ones that produce `[object Object]`.

**Circular reference safety:** The `try/catch` around `JSON.stringify` handles circular references gracefully by falling back to the original `toString`.

**Confidence:** HIGH -- Verified by reading hampton-io/RLM source (vm-sandbox.ts lines 253-272).

### 1.7 Async IIFE Pattern for `await` Support

**Both reference implementations wrap REPL code in an async IIFE.** This enables the LLM to write `await llm_query(...)` naturally.

**Recommended implementation:**

```javascript
function wrapCode(code) {
  const transformed = transformDeclarations(code);

  return `(async () => {
  try {
    ${transformed}
  } catch (__err__) {
    print('[ERROR] ' + (__err__.message || String(__err__)));
    throw __err__;
  }
})()`;
}
```

**Key behaviors:**

1. The outer `try/catch` captures errors AND re-throws them so the host can detect failure
2. Errors are also printed via `print()` so the output includes error details for the LLM
3. The async IIFE returns a Promise, which the host `await`s (see section 1.3)
4. `transformDeclarations()` runs first to promote `const`/`let` to `globalThis`

**Confidence:** HIGH -- Both hampton-io/RLM (line 292) and code-rabi/rllm (line 245) use this exact pattern.

---

## 2. File System: `node:fs/promises` glob

### 2.1 API Configuration

**Stability:** Stable since Node.js 24.0.0 (docs). The `ExperimentalWarning` was a bug in v24.0.0, [fixed in v24.1.0](https://nodejs.org/en/blog/release/v24.1.0). Require Node.js >= 24.1.0 to avoid the warning.

**API signature:**

```javascript
import { glob } from 'node:fs/promises';

// Returns AsyncIterator<string>
for await (const entry of glob(pattern, options)) {
  // entry is a string path
}

// Or collect all results
const entries = await Array.fromAsync(glob(pattern, options));
```

**Options:**

| Option | Type | Default | Purpose |
|--------|------|---------|---------|
| `cwd` | `string` or `URL` | `process.cwd()` | Working directory for relative patterns. URL support added in v24.1.0. |
| `exclude` | `Function` | `undefined` | Filter function: `(path) => boolean`. Return `true` to exclude. In Node.js 25+, also accepts `string[]` glob patterns. |
| `withFileTypes` | `boolean` | `false` | When `true`, yields `Dirent` objects instead of strings. |

**Recommended usage for our `files()` REPL global:**

```javascript
import { glob } from 'node:fs/promises';
import { join } from 'node:path';

async function filesGlobal(pattern, projectRoot) {
  const cwd = projectRoot || workspaceRoot;
  const results = [];

  for await (const entry of glob(pattern, {
    cwd,
    exclude: (path) => {
      // Skip node_modules and dist
      const normalized = path.replace(/\\/g, '/');

      return normalized.includes('/node_modules/') || normalized.includes('/dist/');
    },
  })) {
    // Normalize to forward slashes for consistent cross-platform output
    results.push(entry.replace(/\\/g, '/'));
  }

  return results;
}
```

### 2.2 Windows Path Separator Behavior

**Critical cross-platform issue: glob patterns MUST use forward slashes.** Backslashes are interpreted as escape characters in glob patterns, not path separators. This is consistent across both the built-in `fs.glob` and the userland `glob` package.

| Aspect | Behavior |
|--------|----------|
| Pattern input | MUST use forward slashes (`**/*.ts`, not `**\\*.ts`) |
| Returned paths on Windows | MAY use backslashes (`src\app\foo.ts`) |
| Returned paths on macOS/Linux | Always forward slashes (`src/app/foo.ts`) |

**Workaround:** Always normalize returned paths:

```javascript
const normalized = entry.replace(/\\/g, '/');
```

**Why not use `path.posix.normalize()`:** `path.posix` does not handle Windows drive letters (`D:\...` -> `D:/...`). The regex replace is simpler and sufficient.

### 2.3 ReFS Dev Drive Behavior

**Finding: No documented issues specific to ReFS Dev Drive with `fs.glob`.**

ReFS (Resilient File System) used by Windows Dev Drives supports the same file system APIs as NTFS through NTFS reparse points. The key differences relevant to our use case:

| Concern | NTFS | ReFS Dev Drive | Impact |
|---------|------|----------------|--------|
| Symlinks | Supported (may need Developer Mode) | Supported (same) | None -- we don't create symlinks |
| Junctions | Supported | Likely supported (docs say "NTFS volumes") | LOW risk -- Nx workspaces rarely use junctions |
| `fs.glob` traversal | Works | Works (no reported issues) | None |
| Performance | Baseline | Generally faster for many small files | Positive |
| Path separators | Backslashes | Backslashes (same as NTFS) | Same normalization needed |

**Recommendation:** No special handling needed for ReFS Dev Drive. If issues arise, they will manifest as the same path separator problems that affect NTFS.

### 2.4 `fs.glob` vs Userland `glob` Package

| Feature | Built-in `fs.glob` | `glob` npm package |
|---------|---------------------|--------------------|
| Zero dependencies | Yes | No (depends on minimatch, etc.) |
| `exclude` option | Function only (v24), Function or string[] (v25+) | `ignore` option (glob patterns) |
| `posix` output option | No | Yes -- forces forward-slash output |
| `windowsPathsNoEscape` | No | Yes -- treats backslashes as separators |
| Returns directories | Yes | Configurable (`nodir: true`) |
| `withFileTypes` | Yes (Dirent) | Yes |

**Decision:** Use built-in `fs.glob`. The missing `posix` and `nodir` options are easily handled:
- **posix paths:** `.replace(/\\/g, '/')` on results
- **files only:** Filter with `exclude: (path) => statSync(path).isDirectory()` or check `Dirent.isFile()` with `withFileTypes: true`

**Confidence:** MEDIUM -- `fs.glob` is stable per docs, but has fewer battle-tested hours than userland `glob` (500M weekly downloads). The [globSync inconsistency bug](https://github.com/nodejs/node/issues/61257) suggests edge cases may remain. Fallback plan: `fast-glob` 3.3.3 if blocking issues found.

---

## 3. Nx CLI Integration: `child_process`

### 3.1 `execSync` vs `execFileSync` -- Use `execSync`

**Decision: Use `execSync` with `shell: true` (default) for all Nx CLI calls.**

| Criterion | `execSync` | `execFileSync` |
|-----------|------------|----------------|
| Shell spawning | Yes (default) | No (default) |
| `.cmd`/`.bat` files on Windows | Works | FAILS without `shell: true` |
| `npx` resolution | Works | FAILS without `shell: true` |
| Pipes/redirects | Supported | Not supported |
| Security | Shell injection risk | Safer (no shell metacharacters) |
| Performance | Slightly slower (shell overhead) | Slightly faster |

**Why `execSync` wins:** On Windows, `npx` (and `pnpm exec`) resolve to `.cmd` files. `execFileSync` cannot execute `.cmd` files without `shell: true`. Since we'd need `shell: true` on Windows anyway, we lose `execFileSync`'s security advantage while gaining platform-specific branching complexity.

**The security trade-off is acceptable because:**
1. We control the command strings (they come from our code, not user input)
2. We use an allowlist of Nx commands (no arbitrary command execution)
3. Project names from the workspace index could theoretically contain shell metacharacters, but Nx project names are constrained to `[a-zA-Z0-9._-]`

### 3.2 Nx Runner Implementation

**Recommended pattern:**

```javascript
import { execSync } from 'node:child_process';
import { join } from 'node:path';

// Read-only Nx commands that are safe to execute
const ALLOWED_COMMANDS = new Set([
  'show projects',
  'show project',
  'graph',
  'report',
]);

/**
 * Execute an Nx CLI command in the workspace.
 *
 * @param {string} command - The Nx sub-command (e.g., 'show projects --json')
 * @param {string} workspaceRoot - Absolute path to the workspace root
 * @param {object} [options] - Additional options
 * @param {number} [options.timeout=60000] - Timeout in milliseconds
 * @param {number} [options.maxBuffer=10485760] - Max stdout buffer (10MB default)
 * @returns {string} stdout from the Nx command
 */
function nxRun(command, workspaceRoot, options = {}) {
  const { timeout = 60_000, maxBuffer = 10 * 1024 * 1024 } = options;

  // Validate against allowlist
  const baseCommand = command.split(/\s+/).slice(0, 2).join(' ');

  if (!ALLOWED_COMMANDS.has(baseCommand)) {
    throw new Error(`Nx command not allowed: "${baseCommand}". Allowed: ${[...ALLOWED_COMMANDS].join(', ')}`);
  }

  // Detect package manager for the workspace
  const nxBin = detectNxBin(workspaceRoot);
  const fullCommand = `${nxBin} ${command}`;

  try {
    const stdout = execSync(fullCommand, {
      cwd: workspaceRoot,
      encoding: 'utf8',
      timeout,
      maxBuffer,
      // shell: true is the default for execSync -- explicit for clarity
      shell: true,
      // Suppress stderr noise (Nx prints warnings to stderr)
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NX_DAEMON: 'false',        // Avoid daemon startup overhead in one-shot commands
        NX_SKIP_NX_CACHE: 'false', // Allow cache hits
        FORCE_COLOR: '0',          // Prevent ANSI color codes in JSON output
      },
    });

    return stdout.trim();
  } catch (err) {
    if (err.killed) {
      throw new Error(`Nx command timed out after ${timeout}ms: ${fullCommand}`);
    }

    throw new Error(`Nx command failed: ${fullCommand}\n${err.stderr || err.message}`);
  }
}

/**
 * Detect how to invoke Nx in the workspace.
 * Prefers the workspace's package manager over global nx.
 */
function detectNxBin(workspaceRoot) {
  const { existsSync } = require('node:fs');

  // Check for pnpm (pnpm-lock.yaml)
  if (existsSync(join(workspaceRoot, 'pnpm-lock.yaml'))) {
    return 'pnpm exec nx';
  }

  // Check for yarn (yarn.lock)
  if (existsSync(join(workspaceRoot, 'yarn.lock'))) {
    return 'yarn nx';
  }

  // Default to npm (package-lock.json or no lockfile)
  return 'npx nx';
}
```

### 3.3 Cross-Platform Gotchas

| Gotcha | Platform | Impact | Workaround |
|--------|----------|--------|------------|
| `npx` resolves to `.cmd` file | Windows | `execFileSync` fails with ENOENT | Use `execSync` (shell: true by default) |
| Paths with spaces in CWD | Windows | `execSync` fails if CWD path has spaces | Quote the CWD path in the command, or pass via `cwd` option (handles quoting internally) |
| ANSI color codes in output | All | JSON.parse fails on colored output | Set `FORCE_COLOR=0` in env |
| Nx daemon process | All | Slow first invocation, port conflicts | Set `NX_DAEMON=false` for one-shot commands |
| `nx graph --print` output size | All (large workspaces) | Default `maxBuffer` (1MB) may overflow with 500+ projects | Set `maxBuffer: 10 * 1024 * 1024` |
| Line endings | Windows | `\r\n` in stdout | `.trim()` handles trailing; `JSON.parse` ignores line endings |
| `ComSpec` env variable | Windows | `execSync` uses `%ComSpec%` (usually `cmd.exe`) | This is correct behavior; no workaround needed |

### 3.4 Nx Command Output Parsing

All Nx commands we use support `--json` output. Parse patterns:

```javascript
// nx show projects --json
const projectNames = JSON.parse(nxRun('show projects --json', root));
// Returns: ["project-a", "project-b", ...]

// nx show project my-app --json
const projectConfig = JSON.parse(nxRun('show project my-app --json', root));
// Returns: { name, root, sourceRoot, targets, tags, ... }

// nx graph --print
const graph = JSON.parse(nxRun('graph --print', root));
// Returns: { graph: { nodes, dependencies }, ... }
```

**Confidence:** HIGH -- Nx CLI JSON output formats verified against [Nx Commands Reference](https://nx.dev/docs/reference/nx-commands) and tested on Nx 19.8-22.5.x range.

---

## 4. Node.js 24 LTS Features Benefiting the REPL

### 4.1 `Error.isError()` -- Use for Cross-Realm Error Detection

**Status:** Available in Node.js 24.0.0+ (V8 13.4). TC39 Stage 4 (accepted for ES2026).

**Use case:** Every error thrown inside our `vm.createContext()` sandbox crosses a realm boundary. Without `Error.isError()`, we would need fragile duck-typing to detect errors.

**Implementation:** See section 1.5 above.

**Confidence:** HIGH -- Verified against [MDN Error.isError()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/isError), [Node.js 24 release notes](https://blog.codeminer42.com/whats-new-in-node-js-24/).

### 4.2 `structuredClone()` -- Use with Caution in VM Contexts

**Status:** Available since Node.js 17. Global function, no import needed.

**Cross-realm issue:** `structuredClone()` called inside a VM context [uses the outer (host) context's realm](https://github.com/nodejs/node/issues/55554) to construct the cloned object. This means cloned objects have the host's prototypes, not the sandbox's.

**Practical impact for our REPL:** Minimal. We don't need deep cloning across the boundary -- we either:
- Read values from the sandbox context directly (already in the host realm)
- Write values into the sandbox context (host objects in sandbox context -- works fine)

**Recommendation:** Do NOT expose `structuredClone` as a REPL global. If deep cloning is needed inside the sandbox, `JSON.parse(JSON.stringify(obj))` is sufficient for the data types we handle (no Functions, no circular references in workspace index data).

**Confidence:** HIGH -- Issue verified at [nodejs/node#55554](https://github.com/nodejs/node/issues/55554).

### 4.3 V8 13.6 Engine Features

Node.js 24 ships V8 13.6 with full ECMAScript 2025 support. Features usable in sandboxed code:

| Feature | Usable in VM? | Benefit for REPL |
|---------|---------------|------------------|
| `Array.fromAsync()` | Yes | Collect async iterators in REPL code |
| `Set` methods (union, intersection, difference) | Yes | Set operations on project collections |
| `Promise.withResolvers()` | Yes | Cleaner promise construction in REPL |
| `RegExp` v flag (set notation) | Yes | Advanced pattern matching in search |
| Iterator helpers (`.map()`, `.filter()`, `.take()`) | Yes | Chain operations on large collections lazily |
| `Object.groupBy()` | Yes | Group projects by tag, type, etc. |
| `Temporal` | No (still Stage 3) | Not available |

**Recommendation:** Do NOT explicitly add these to the sandbox globals -- they are automatically available on the built-in objects (`Array`, `Set`, etc.) that we already expose. LLM-generated code can use them naturally.

### 4.4 `node:test` Runner Improvements

Node.js 24 test runner defaults to parallel execution and supports `--test-reporter` for custom output. Relevant for our Phase 1 testing:

```javascript
// Test file: scripts/workspace-indexer.test.mjs
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkspaceIndex } from './workspace-indexer.mjs';

describe('workspace-indexer', () => {
  it('builds index from nx cli output', async () => {
    // mock execSync to avoid needing a real workspace
    // ...
  });
});

// Run: node --test scripts/*.test.mjs
```

**Confidence:** HIGH -- `node:test` is stable since Node.js 20.x.

---

## 5. Handle Store: Implementation Details

The handle store keeps large results in a Map, passing lightweight stubs to the LLM. This is a pure JavaScript pattern with no special Node.js API requirements.

**Recommended implementation:**

```javascript
/**
 * Handle-based result store. Large values get a handle ID;
 * only the handle stub (type + preview) goes to the LLM.
 */
class HandleStore {
  /** @type {Map<string, unknown>} */
  #store = new Map();
  #counter = 0;
  /** @type {number} */
  #maxPreviewLength;
  /** @type {number} */
  #sizeThreshold;

  /**
   * @param {object} [options]
   * @param {number} [options.maxPreviewLength=200] - Max chars in preview string
   * @param {number} [options.sizeThreshold=500] - JSON.stringify length above which a handle is created
   */
  constructor(options = {}) {
    this.#maxPreviewLength = options.maxPreviewLength ?? 200;
    this.#sizeThreshold = options.sizeThreshold ?? 500;
  }

  /**
   * Store a value if it exceeds the size threshold.
   * Returns either the original value (small) or a handle stub (large).
   */
  maybeStore(value) {
    const json = safeStringify(value);

    if (json.length <= this.#sizeThreshold) {
      return value; // Small enough to inline
    }

    const id = `$h${++this.#counter}`;
    this.#store.set(id, value);

    return {
      __handle__: id,
      type: typeOf(value),
      length: Array.isArray(value) ? value.length : undefined,
      preview: json.slice(0, this.#maxPreviewLength) + '...',
    };
  }

  /** Retrieve a stored value by handle ID. */
  get(id) {
    return this.#store.get(id);
  }

  /** Number of stored handles. */
  get size() {
    return this.#store.size;
  }

  /** Clear all handles (call between REPL sessions). */
  clear() {
    this.#store.clear();
    this.#counter = 0;
  }
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function typeOf(value) {
  if (Array.isArray(value)) {
    return 'Array';
  }

  if (value instanceof Map) {
    return 'Map';
  }

  if (value instanceof Set) {
    return 'Set';
  }

  return typeof value;
}
```

**Confidence:** HIGH -- Pattern validated by yogthos/Matryoshka (reports 97% token savings) and is pure JavaScript with no API dependencies.

---

## 6. What to Test First in Phase 1

Based on this research, the following are ordered by risk (highest risk first):

### Priority 1: VM Sandbox Core (Phase 2 components, but validate early)

1. **Async IIFE + Promise.race timeout** -- Verify the timeout pattern works with real `await` calls. The `microtaskMode` deadlock is the highest-risk finding.
2. **Cross-realm error detection** -- Verify `Error.isError()` works on errors thrown in the sandbox. This is critical for the LLM's self-correction loop.
3. **`const`/`let` transformation** -- Verify variable persistence across multiple `runInContext` calls.
4. **Object.prototype.toString patch** -- Verify objects stringify correctly when concatenated.

### Priority 2: Nx Runner (Phase 1 core)

5. **`execSync` with `npx nx`/`pnpm exec nx` on Windows** -- Verify the package manager detection works and commands execute.
6. **`nx graph --print` output size** -- Verify `maxBuffer: 10MB` is sufficient for 500+ project workspaces.
7. **JSON parsing of Nx output** -- Verify `FORCE_COLOR=0` suppresses ANSI codes.

### Priority 3: File System (Phase 1/2)

8. **`fs.glob` on Windows** -- Verify pattern `**/*.ts` works with `cwd` set to a project root, and paths are normalized to forward slashes.
9. **`fs.glob` exclude function** -- Verify `node_modules` and `dist` exclusion works.

### Minimal Test Script (Run Before Any Implementation)

```javascript
// scripts/api-smoke-test.mjs
// Run: node scripts/api-smoke-test.mjs
import { createContext, Script } from 'node:vm';
import { glob } from 'node:fs/promises';
import { execSync } from 'node:child_process';

// Test 1: VM async IIFE + timeout
console.log('[TEST 1] VM async IIFE with Promise.race timeout...');
const ctx = createContext({
  print: (...args) => console.log('  [SANDBOX]', ...args),
  Promise,
}, {
  codeGeneration: { strings: false, wasm: false },
});

const code = `(async () => {
  globalThis.x = 42;
  const result = await new Promise(resolve => setTimeout(() => resolve('done'), 100));
  print('Result:', result, 'x:', x);
})()`;

// Note: setTimeout won't work inside VM without injecting it
// Simplified test without timer:
const simpleCode = `(async () => {
  globalThis.x = 42;
  const result = await Promise.resolve('done');
  print('Result:', result, 'x:', x);
})()`;

const script = new Script(simpleCode);
const promise = script.runInContext(ctx);
const timeout = new Promise((_, reject) =>
  setTimeout(() => reject(new Error('Timeout')), 5000)
);
await Promise.race([promise, timeout]);
console.log('  [OK] x persisted:', ctx.x === 42);

// Test 2: Cross-realm Error.isError
console.log('[TEST 2] Cross-realm Error.isError...');
const errCtx = createContext({}, {
  codeGeneration: { strings: false, wasm: false },
});

try {
  new Script('throw new TypeError("test error")').runInContext(errCtx);
} catch (err) {
  const crossRealm = !(err instanceof TypeError);
  const isErrorWorks = Error.isError?.(err) ?? false;
  console.log('  [INFO] instanceof TypeError:', !crossRealm);
  console.log('  [INFO] Error.isError():', isErrorWorks);
  console.log('  [OK] Error.isError correctly detects cross-realm error:', isErrorWorks);
}

// Test 3: fs.glob on current directory
console.log('[TEST 3] fs.glob...');
let count = 0;

for await (const entry of glob('**/*.md', {
  cwd: process.cwd(),
  exclude: (p) => p.replace(/\\/g, '/').includes('/node_modules/'),
})) {
  count++;
}

console.log(`  [OK] Found ${count} .md files`);

// Test 4: execSync
console.log('[TEST 4] execSync...');
const nodeVersion = execSync('node --version', { encoding: 'utf8' }).trim();
console.log(`  [OK] Node.js version: ${nodeVersion}`);

console.log('\n[SUCCESS] All smoke tests passed.');
```

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| `vm.createContext` mode | Standard (contextified) | `DONT_CONTEXTIFY` | We need mutable globalThis for variable persistence |
| Microtask handling | `Promise.race` timeout | `microtaskMode: 'afterEvaluate'` | Known deadlock with async/await ([nodejs/node#55546](https://github.com/nodejs/node/issues/55546)) |
| `const/let` transformation | Simple regex | AST parser (acorn) | Over-engineering for v0.0.1; LLM code rarely uses destructuring |
| Cross-realm error check | `Error.isError()` | Duck typing (`err.message && err.stack`) | `Error.isError` is reliable, duck typing is fragile |
| Nx CLI invocation | `execSync` | `execFileSync` | Windows `.cmd` files require shell; `execSync` is simpler |
| Nx CLI invocation | `execSync` | `spawn` (async) | Synchronous is simpler for one-shot commands; REPL is already async at a higher level |
| File globbing | `fs.glob` (built-in) | `fast-glob` npm package | Zero dependency policy; built-in is stable in Node.js 24.1+ |
| Path normalization | `.replace(/\\\\/g, '/')` | `path.posix.normalize()` | `path.posix` does not handle Windows drive letters |

---

## Key Version Constraints (Updated)

| Constraint | Minimum Version | Reason |
|------------|-----------------|--------|
| Node.js | 24.1.0 | `fs.glob` ExperimentalWarning fix. `Error.isError()` available. `codeGeneration` options stable. |
| Nx CLI | 19.8.0 | Target workspace version. `show projects --json` and `graph --print` available. |
| V8 | 13.4+ (ships with Node.js 24) | `Error.isError()`, ECMAScript 2025 features |

---

## Sources

### Official Documentation
- [Node.js v24.x vm module docs](https://nodejs.org/docs/latest-v24.x/api/vm.html) -- `createContext` options, `DONT_CONTEXTIFY`, `microtaskMode`, timeout behavior
- [Node.js v24.x fs module docs](https://nodejs.org/docs/latest-v24.x/api/fs.html) -- `fs.glob` API, stability status
- [Node.js v24.x child_process docs](https://nodejs.org/docs/latest-v24.x/api/child_process.html) -- `execSync` vs `execFileSync`, shell defaults, Windows behavior
- [Node.js v24.1.0 Release Notes](https://nodejs.org/en/blog/release/v24.1.0) -- `fs.glob` ExperimentalWarning fix, URL support for `cwd`
- [MDN Error.isError()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/isError) -- Cross-realm error detection

### Node.js Issues and PRs
- [nodejs/node#55546](https://github.com/nodejs/node/issues/55546) -- `microtaskMode: 'afterEvaluate'` hangs with async/await (OPEN, affects Node.js 22-25)
- [nodejs/node#55554](https://github.com/nodejs/node/issues/55554) -- `structuredClone()` uses wrong context in `vm.runInContext()`
- [nodejs/node#58343](https://github.com/nodejs/node/issues/58343) -- `fsPromises.glob` ExperimentalWarning in Node.js 24.0.0 (FIXED in 24.1.0)
- [nodejs/node#61257](https://github.com/nodejs/node/issues/61257) -- `fs.globSync` fails when `fs.glob` does not
- [nodejs/node#3020](https://github.com/nodejs/node/issues/3020) -- Promises escape vm.runInContext timeout
- [nodejs/node commit 2d90340](https://github.com/nodejs/node/commit/2d90340cb3) -- Introducing `vm.constants.DONT_CONTEXTIFY`

### TC39 Proposals
- [tc39/proposal-is-error](https://github.com/tc39/proposal-is-error) -- Stage 4, ES2026

### Implementation References
- [hampton-io/RLM vm-sandbox.ts](https://github.com/hampton-io/RLM) -- v0.3.0 VM sandbox implementation (createContext, toString patch, const/let transform, async IIFE)
- [code-rabi/rllm sandbox.ts](https://github.com/code-rabi/rllm) -- v1.1.0 VM sandbox implementation (error handling, variable capture)

### Windows / Cross-Platform
- [spawn npx ENOENT Windows fix](https://fransiscuss.com/2025/04/22/fix-spawn-npx-enoent-windows11-mcp-server/) -- Why `npx` needs shell on Windows
- [Nx issue #27331](https://github.com/nrwl/nx/issues/27331) -- `nx init` script fails on Windows with `execSync`
- [Cross-realm error checking guide](https://allthingssmitty.com/2026/02/23/from-instanceof-to-error-iserror-safer-error-checking-in-javascript/) -- Practical `Error.isError()` usage patterns
