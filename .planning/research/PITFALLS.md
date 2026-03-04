# Domain Pitfalls

**Domain:** RLM-powered Nx Claude Code plugin (JavaScript REPL sandbox + Nx workspace navigation)
**Researched:** 2026-03-04 (updated with Node.js API deep-dive findings)
**Priority ordering:** By likelihood of causing implementation failure during the first milestone

---

## Critical Pitfalls

Mistakes that cause rewrites, security breaches, or fundamental architecture failures.

### Pitfall 1: `const`/`let` to `globalThis` Transformation Breaks Destructuring, `for` Loops, and Multi-Declarations

**What goes wrong:** The Hampton-io/RLM reference implementation transforms `const`/`let` declarations to `globalThis` assignments using a naive regex: `code.replace(/\b(const|let)\s+(\w+)\s*=/g, 'globalThis.$2 =')`. This regex silently corrupts valid JavaScript in at least six common patterns that LLMs generate.

**Why it happens:** In a `vm.createContext()` persistent context, `const` and `let` declarations are block-scoped to the script execution and do NOT appear on the context object or `globalThis`. The Node.js documentation confirms: block-scoped bindings exist only within the script's "global" scope, not as properties of the global object. Since the REPL needs variables to persist across iterations, the transformation is necessary. But the regex approach is inherently fragile.

**Concrete failure cases:**

```javascript
// 1. Destructuring assignment
const { name, root } = projects.get('my-app');
// Becomes: globalThis.{ name, root } = projects.get('my-app');
// Result: SyntaxError

// 2. Array destructuring
const [first, ...rest] = workspace.projects.values();
// Becomes: globalThis.[first, ...rest] = workspace.projects.values();
// Result: SyntaxError

// 3. Multi-variable declaration
const a = 1, b = 2, c = 3;
// Becomes: globalThis.a = 1, b = 2, c = 3;
// Result: Only `a` persists; `b` and `c` are lost

// 4. for-loop initializers
for (let i = 0; i < projects.size; i++) { /* ... */ }
// Becomes: for (globalThis.i = 0; globalThis.i < projects.size; globalThis.i++) { /* ... */ }
// Result: Pollutes global scope with loop variable, may work but leaks state

// 5. for-of / for-in loops
for (const [name, project] of projects) { /* ... */ }
// Becomes: for (globalThis.[name, project] of projects) { /* ... */ }
// Result: SyntaxError

// 6. Arrow function parameters that look like declarations
const fn = (let_me_explain) => let_me_explain + 1;
// The word `let` inside `let_me_explain` triggers the regex
// Becomes: globalThis.fn = (globalThis.me_explain) => ...
// Result: Broken function
```

**Consequences:**
- LLM generates valid JavaScript; REPL produces SyntaxError; LLM wastes iterations debugging phantom syntax errors it did not create
- Iteration count inflates by 2-5 per corrupted code block (model tries to "fix" code that was correct)
- Worst case: model enters infinite retry loop on destructuring-heavy code, burning all 20 iterations

**Warning signs:**
- SyntaxError on code that looks correct to the model
- Model avoids destructuring (a sign it learned from previous failures in-context)
- Repeated "let me try a different approach" messages

**Prevention:**
1. **Use an AST-based transformation, not regex.** Parse the code with a lightweight parser (e.g., `acorn` or `meriyah` -- both zero-dependency ESM parsers) and selectively rewrite only top-level `VariableDeclaration` nodes of kind `const`/`let` to assignment expressions on `globalThis`. Leave `for` loop initializers, destructuring patterns, and nested scopes untouched.
2. **If regex must be used for v0.0.1**, use a multi-pass approach that handles each case:
   ```javascript
   // Step 1: Protect for-loop declarations (replace temporarily)
   // Step 2: Handle simple `const/let name =` only (not destructuring)
   // Step 3: Restore for-loop declarations
   // Step 4: Leave destructuring as-is (they won't persist, but won't crash)
   ```
3. **Document the limitation:** If destructuring doesn't persist across iterations, add a REPL hint: "Note: `const {a, b} = obj` does not persist variables. Use `globalThis.a = obj.a; globalThis.b = obj.b;` instead."
4. **Test the transformation** against a corpus of 20+ LLM-generated code samples before shipping. Include destructuring, `for` loops, arrow functions, and template literals.

**Detection:** Unit test suite with every pattern above. Each test asserts both no SyntaxError and correct variable persistence.

**Phase relevance:** REPL sandbox core (Phase 2). This is the single most likely cause of "the REPL feels broken" during initial testing.

**Confidence:** HIGH -- verified by reading Hampton-io/RLM source code (line 289 of `vm-sandbox.ts`). The regex `\b(const|let)\s+(\w+)\s*=/g` is exactly as described. The edge cases are straightforward JavaScript semantics.

**Sources:**
- [Hampton-io/RLM vm-sandbox.ts line 289](D:/projects/github/hampton-io/RLM/src/sandbox/vm-sandbox.ts)
- [Node.js vm documentation: const/let behavior](https://nodejs.org/api/vm.html)
- [MDN: globalThis scope with var/let/const](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/globalThis)

---

### Pitfall 2: Async Code in VM Context -- Timeout Escape and Error Propagation Failures

**What goes wrong:** Both reference implementations wrap LLM-generated code in an `async () => { ... }` IIFE to support `await`. This creates three interrelated problems: (a) the `timeout` option on `vm.runInContext()` only bounds *synchronous* execution -- once the IIFE returns a Promise, the timeout no longer applies; (b) errors thrown inside the async IIFE can be silently swallowed if the returned Promise is not properly awaited; (c) `microtaskMode` defaults mean Promise resolutions from the sandbox can interleave unpredictably with the host event loop.

**Why it happens:** The V8 timeout mechanism works by checking the interrupt flag on each JavaScript bytecode execution. When `vm.runInContext()` starts an async IIFE, the synchronous part (creating the Promise) completes almost instantly and within the timeout. The actual work happens in microtasks and callbacks that run *after* `runInContext` returns -- outside the timeout's jurisdiction. This is a documented, unfixed limitation (Node.js issue #3020, open since 2015).

**Concrete failure patterns:**

```javascript
// Pattern 1: Timeout escape via Promise
// The vm timeout of 5000ms does NOT apply to this:
const result = await llm_query("summarize this file");
// If llm_query takes 60 seconds, the vm timeout is irrelevant

// Pattern 2: Infinite async loop escapes timeout
while (true) {
  await new Promise(resolve => setTimeout(resolve, 100));
  // This runs forever -- vm timeout only applied to synchronous code
}

// Pattern 3: Swallowed async error
(async () => {
  const data = await read("/nonexistent/path");
  // Error thrown here becomes an unhandled rejection
  // The REPL reports "no output" instead of the error
})();
// If the outer wrapper doesn't await, error is lost

// Pattern 4: Cross-realm Promise confusion
const p = new Promise((resolve) => resolve(42));
// This creates a Promise using the sandbox's Promise constructor
// When awaited in the host, instanceof Promise returns false
// WARNING: microtaskMode: 'afterEvaluate' seems like a fix but causes async/await DEADLOCKS
// See nodejs/node#55546. Use Promise.race timeout from the host instead.
```

**Consequences:**
- REPL appears to hang when `llm_query()` or `read()` takes too long -- the vm timeout does not save you
- Silent error swallowing makes debugging impossible: the model sees "no output" and has no clue what went wrong
- Cross-realm Promise issues cause `TypeError: Cannot read properties of undefined` in the host when trying to await a sandbox Promise

**Prevention:**
1. **Layer two timeout mechanisms:** Use `vm.runInContext({ timeout })` for synchronous protection AND an external `AbortController` + `setTimeout` for the overall async execution:
   ```javascript
   const controller = new AbortController();
   const timer = setTimeout(() => controller.abort(), maxTimeout);
   try {
     const promise = script.runInContext(context, { timeout: 5000 });
     const result = await Promise.race([
       promise,
       new Promise((_, reject) => {
         controller.signal.addEventListener('abort', () =>
           reject(new Error('Async execution timeout'))
         );
       })
     ]);
   } finally {
     clearTimeout(timer);
   }
   ```
2. **Do NOT use `microtaskMode: 'afterEvaluate'` -- it causes async/await deadlocks.** There is an [open Node.js bug (#55546)](https://github.com/nodejs/node/issues/55546) where `afterEvaluate` gives the context its own microtask queue, but `await` suspends execution and hands control to the event loop. Since the context's microtask queue only drains after evaluation completes, and evaluation is suspended waiting for the `await`, a deadlock occurs. This affects Node.js 22-25+ and is unresolved. Both reference implementations avoid `afterEvaluate`. Instead, rely on `Promise.race` timeout (point 1 above) for async timeout safety.
3. **Always await the IIFE result and wrap in try/catch at the host level:** The code-rabi/rllm implementation does this correctly -- check if `scriptResult instanceof Promise` and await it. Hampton-io does the same with `executeWithQueryProcessing`.
4. **Use `util.types.isNativeError()` for cross-realm error detection** instead of `instanceof Error` (see Pitfall 6).
5. **For Worker Thread isolation (recommended for production):** Run the VM in a Worker Thread. The main thread can call `worker.terminate()` as a hard kill regardless of what the VM is doing -- sync, async, or native code.

**Detection:** Integration tests that: (a) run code with `await new Promise(resolve => setTimeout(resolve, 10000))` and verify it times out within `maxTimeout`; (b) throw inside async IIFE and verify error appears in output; (c) create a cross-realm Promise and verify it resolves correctly in the host.

**Phase relevance:** REPL sandbox core (Phase 2). The Hampton-io implementation has the right architectural pattern for query processing, but the timeout gap is not fully addressed.

**Confidence:** HIGH -- Node.js issue #3020 (open since 2015, 200+ comments), verified in both reference implementations.

**Sources:**
- [Promises allow vm.runInContext timeout to be escaped (Node.js #3020)](https://github.com/nodejs/node/issues/3020)
- [vm.runInThisContext fails with top-level await (Node.js #40898)](https://github.com/nodejs/node/issues/40898)
- [vm timeout breaks console.log/stdout (Node.js #34678)](https://github.com/nodejs/node/issues/34678)
- [microtaskMode afterEvaluate deadlocks async/await (Node.js #55546)](https://github.com/nodejs/node/issues/55546)
- [Node.js vm documentation: microtaskMode](https://nodejs.org/api/vm.html)
- [Hampton-io/RLM executeWithQueryProcessing pattern](D:/projects/github/hampton-io/RLM/src/sandbox/vm-sandbox.ts)
- [code-rabi/rllm Promise awaiting pattern](D:/projects/github/code-rabi/rllm/src/sandbox.ts)

---

### Pitfall 3: Node.js `vm` Prototype Chain Escape via Injected Objects

**What goes wrong:** Every non-primitive object injected into the VM context provides an escape vector via the prototype chain. The classic exploit `this.constructor.constructor("return process")()` gets the host `Function` constructor, which can execute arbitrary code in the host environment. Even with `Object.create(null)` for the context, any injected function, Map, Array, or object (like the workspace index) re-establishes the chain.

**Why it happens:** `vm.createContext()` creates a separate execution scope but NOT a separate realm for object prototypes. When you inject `workspace` (a plain object) into the sandbox, its `__proto__` chain leads back to the host's `Object.prototype`, then `Function`, then `Function.constructor`. The `codeGeneration: { strings: false, wasm: false }` option blocks `eval()` and WASM but does NOT block `this.constructor.constructor` -- that traversal does not involve string-based code generation.

**Our specific risk profile:**

The LLM generates the code that runs in the sandbox. The threat model is NOT adversarial user input -- it is LLM prompt injection or model error causing unintended escape. This is a LOW probability event in practice because:
- Claude does not spontaneously generate sandbox escape payloads
- The sandbox runs in the user's own Claude Code session, not a multi-tenant server
- The user already has full system access via Claude Code's Bash tool

However, the risk is NON-ZERO because:
- Indirect prompt injection via file contents (malicious comments in source code)
- Future expansion to user-supplied code paths

**Concrete escape payloads to test against:**

```javascript
// Classic prototype chain escape
this.constructor.constructor("return process")().exit();

// Via injected object (e.g., workspace)
workspace.constructor.constructor("return process")().env;

// Via Error object
try { null.f() } catch(e) { e.constructor.constructor("return process")().exit() }

// Via Function.prototype.call on an injected function
deps.constructor("return process")();

// Via Proxy (if available in sandbox)
const handler = { get: (t, p) => t.constructor.constructor("return process")() };
```

**Prevention:**
1. **`codeGeneration: { strings: false, wasm: false }` blocks some but not all vectors.** The `strings: false` option prevents `Function("return process")` but the `this.constructor.constructor` variant is a different code path. Hampton-io's test suite verifies this escape is blocked, but the protection comes from their `Object.create(null)` context + the fact that `this` inside the async IIFE refers to the contextified global, not a regular object.
2. **Freeze all injected objects recursively:**
   ```javascript
   function deepFreeze(obj, seen = new WeakSet()) {
     if (obj === null || typeof obj !== 'object' || seen.has(obj)) {
       return obj;
     }
     seen.add(obj);
     Object.freeze(obj);
     for (const value of Object.values(obj)) {
       deepFreeze(value, seen);
     }
     return obj;
   }
   ```
3. **Wrap all REPL globals as arrow functions** (arrow functions have no `.prototype`):
   ```javascript
   // BAD: regular function exposes Function.prototype
   sandbox.deps = function(name) { return getDeps(name); };
   // GOOD: arrow function, frozen result
   sandbox.deps = (name) => deepFreeze(getDeps(name));
   ```
4. **Use `Object.create(null)` for the sandbox base** (both reference implementations do this).
5. **Add a test suite of known escape payloads** and run it on every change to `repl-sandbox.mjs`. Hampton-io's `sandbox-security.test.ts` is a good starting point.
6. **Accept the risk model explicitly:** Document that `vm` provides scope isolation for LLM-generated code, not adversarial sandbox security. If user-supplied code is ever executed, migrate to Worker Thread + `vm` (defense in depth) or `isolated-vm`.

**Detection:** Automated test suite with 5+ known escape payloads. Run on CI for every commit that touches sandbox code.

**Phase relevance:** REPL sandbox core (Phase 2). Get the isolation model right from day one.

**Confidence:** HIGH -- multiple CVEs (CVE-2025-68613, CVE-2026-22709), official Node.js documentation warning, Hampton-io security tests confirm the patterns.

**Sources:**
- [Node.js vm is not a sandbox -- DEV Community](https://dev.to/dendrite_soup/nodevm-is-not-a-sandbox-stop-using-it-like-one-2f74)
- [CVE-2025-68613: n8n sandbox escape](https://www.penligent.ai/hackinglabs/cve-2025-68613-deep-dive-how-node-js-sandbox-escapes-shatter-the-n8n-workflow-engine/)
- [Hampton-io security test suite](D:/projects/github/hampton-io/RLM/tests/sandbox-security.test.ts)
- [Semgrep: vm2 escape analysis](https://semgrep.dev/blog/2026/calling-back-to-vm2-and-escaping-sandbox/)

---

### Pitfall 4: REPL Execution Loop Infinite Loops and `FINAL()` Termination Brittleness

**What goes wrong:** The RLM execution loop (`fill -> solve -> FINAL`) can fail to terminate in several ways: (a) the LLM never emits `FINAL()`, looping to `maxIterations` with no answer; (b) the LLM emits `FINAL()` too early with an incomplete answer; (c) consecutive similar code blocks indicate the model is stuck but the loop continues; (d) the LLM calls `FINAL()` inside a conditional branch that is not taken, causing the loop to miss the termination signal.

**Why it happens:** The "training gap" (Section 16 of the RLM paper) is the root cause. Current frontier models have NOT been trained on the RLM paradigm. They may not reliably produce `FINAL()` termination signals, especially on complex tasks. The RLM paper explicitly flags "brittleness in answer termination" as an open problem.

**Specific failure modes to guard against:**

```javascript
// Mode 1: FINAL() inside dead code path
if (results.length > 100) {
  FINAL("Found many results: " + results.length);
}
// FINAL never called because results.length is 5

// Mode 2: FINAL() called but return value not captured
// The code-rabi/rllm implementation stores FINAL in a variable and checks after execution.
// Hampton-io stores it in __FINAL_ANSWER__. Both approaches work, but
// the check must happen AFTER awaiting the async execution.

// Mode 3: LLM generates similar code across iterations
// Iteration 5: const files = search("Component", "libs/");
// Iteration 6: const files = search("Component", "libs/");
// Iteration 7: const files = search("Component", "libs/");
// Model is stuck. Without detection, burns 15 more iterations.

// Mode 4: FINAL() with [object Object]
// Hampton-io had to add special handling for this:
FINAL("The answer is: " + complexObject);
// Produces: "The answer is: [object Object]"
// Hampton-io patches Object.prototype.toString to return JSON instead
```

**Prevention:**
1. **Four-layer guard stack** (all must ship together with the loop):
   - `maxIterations` (default: 20) -- hard cap on loop count
   - `maxTimeout` (default: 120s wall clock) -- covers async operations
   - `maxConsecutiveErrors` (default: 3) -- break on repeated failures
   - Stale loop detection (3 similar code blocks in a row -> force terminate)
2. **Stale loop detection algorithm:**
   ```javascript
   function isStaleLoop(codeHistory, windowSize = 3) {
     if (codeHistory.length < windowSize) return false;
     const recent = codeHistory.slice(-windowSize);
     const normalized = recent.map(c => c.replace(/\s+/g, ' ').trim());
     return new Set(normalized).size === 1;
   }
   ```
3. **Mid-loop hint injection:** At 50% of `maxIterations`, inject a system message: "You have used N of M iterations. If you have enough information, call FINAL() now. If stuck, try a different approach."
4. **Graceful degradation on timeout:** When any limit is hit, return the best partial answer from REPL variables (scan `globalThis` for plausible answer strings), not just an error.
5. **`FINAL()` value validation:** Reject `FINAL("[object Object]")` and re-prompt the model with "FINAL received but contained [object Object]. Use `JSON.stringify()` or construct a string answer."
6. **Hampton-io's `Object.prototype.toString` patch** prevents `[object Object]` corruption entirely. Consider adopting it:
   ```javascript
   Object.prototype.toString = function() {
     if (this && typeof this === 'object' &&
         this.constructor === Object) {
       try { return JSON.stringify(this); } catch { }
     }
     return originalToString.call(this);
   };
   ```

**Detection:** Integration tests that deliberately trigger each failure mode. Mock LLM responses to produce: never-FINAL, FINAL-too-early, stuck loop, and [object Object] FINAL.

**Phase relevance:** Agent integration (Phase 4). The execution loop and all guards must ship together.

**Confidence:** HIGH -- documented in the RLM paper (Section 16), Prime Intellect ablations, and both reference implementation source code.

**Sources:**
- [RLM paper: limitations and open problems](https://arxiv.org/html/2512.24601v1)
- [Prime Intellect: environment tips](https://www.primeintellect.ai/blog/rlm)
- [Hampton-io FINAL/FINAL_VAR implementation](D:/projects/github/hampton-io/RLM/src/sandbox/vm-sandbox.ts)
- [code-rabi/rllm giveFinalAnswer validation](D:/projects/github/code-rabi/rllm/src/sandbox.ts)

---

### Pitfall 5: `llm_query()` Sub-Calls Cannot Directly Spawn Claude Subagents from Node.js Scripts

**What goes wrong:** The REPL design assumes `llm_query()` can invoke LLM API calls from within the sandbox. But Claude Code plugins interact with Claude through declarative markdown definitions (agents, skills, commands) and hooks -- not through programmatic API calls from arbitrary JavaScript. There is no `claude.complete()` function available to Node.js scripts.

**Why it happens:** The RLM reference implementation uses a TCP-based LMHandler that routes `llm_query()` to external LLM backends. In Claude Code, the closest equivalent is the `Task` tool, which spawns a subagent. But `Task` is a tool that Claude uses in conversation, not a function that Node.js scripts can call directly.

**The architectural gap:**

```
RLM reference:  REPL code -> llm_query() -> TCP socket -> LMHandler -> OpenAI API
                 (synchronous from REPL's perspective)

Claude Code:     REPL code -> llm_query() -> ??? -> Claude subagent -> ???
                 (no direct API available from Node.js scripts)
```

**Possible implementation patterns (from analysis of existing plugins):**

1. **Callback-based delegation (Hampton-io pattern):** The REPL `llm_query()` creates a Promise and queues it. The host (agent layer) processes the queue, dispatches to the subagent, and resolves the Promise. This is exactly what Hampton-io's `pendingQueries` array and `executeWithQueryProcessing` loop implement.

2. **Agent-driven REPL (brainqub3 pattern):** The root agent generates REPL code, the skill's Node.js script executes it, and when `llm_query()` is encountered, the script outputs a structured request. The agent layer reads the output, dispatches the sub-call, and feeds the result back to the REPL in the next iteration.

3. **File-based IPC:** The REPL writes a request to a temp file, the agent reads it, dispatches, and writes the response to another temp file. The REPL polls for the response. Ugly but works within Claude Code's constraints.

**The critical question:** Can the `repl-executor` agent's system prompt instruct it to recognize when the REPL output contains a `llm_query()` request and dispatch it via `Task`? This is the most natural pattern for Claude Code but has risks:
- Subagent context limits (167K usable tokens before compaction)
- Subagent output token limits (32K default, may not be enforced per issue #10738)
- Rate limit false positives from rapid subagent spawning (issue #27053)

**Prevention:**
1. **Prototype the callback pattern in Phase 2** (REPL sandbox core), even with mock LLM responses. Verify the Promise-based queueing works: REPL code calls `llm_query()`, execution pauses, host resolves the Promise, execution resumes.
2. **Wire to real subagents in Phase 4** (agent integration). The `repl-executor` agent markdown must include explicit instructions for handling `llm_query()` requests in REPL output.
3. **Have a fallback plan:** If programmatic sub-calls prove infeasible (rate limits, context limits), implement a "single-model REPL" where the root Sonnet agent handles all iterations without sub-delegation. This loses Haiku cost optimization but preserves the REPL navigation value.
4. **Test subagent limits empirically:** Before committing to the sub-call architecture, run 10 test queries that each spawn 3-5 subagent calls and measure: latency, token usage, rate limit behavior, and context stability.

**Detection:** Phase 2 proof-of-concept that demonstrates end-to-end: REPL code calls `llm_query()` -> message reaches agent layer -> subagent spawns and returns -> result flows back to REPL.

**Phase relevance:** Architecture-defining decision. Must be prototyped in Phase 2, fully implemented in Phase 4. If it fails, the entire sub-call architecture needs to pivot.

**Confidence:** MEDIUM -- the Hampton-io callback pattern is sound, but no existing Claude Code plugin implements this specific REPL-to-subagent bridge. The subagent rate limit bug (#27053) and output token cap (#10738) are real risks that need empirical validation.

**Sources:**
- [Claude Code subagent documentation](https://code.claude.com/docs/en/sub-agents)
- [Hampton-io pendingQueries pattern](D:/projects/github/hampton-io/RLM/src/sandbox/vm-sandbox.ts)
- [Task tool subagent rate limit bug](https://github.com/anthropics/claude-code/issues/27053)
- [Output token limit not applied to subagents](https://github.com/anthropics/claude-code/issues/10738)

---

## Moderate Pitfalls

### Pitfall 6: Cross-Realm `Error` Objects -- `instanceof Error` Returns `false` in VM Contexts

**What goes wrong:** Errors thrown inside `vm.createContext()` are instances of the sandbox's `Error` constructor, not the host's. When caught in the host (or in error handling wrappers), `instanceof Error` returns `false`. The error is silently dropped, converted to `[object Object]`, or causes a secondary TypeError.

**Why it happens:** Each VM context has its own set of built-in constructors. `new Error("test")` in the sandbox creates an object whose prototype chain leads to the sandbox's `Error.prototype`, not the host's. `instanceof` checks the prototype chain against the host's constructor, which fails.

**Concrete impact in our code:**

```javascript
// In repl-sandbox.mjs error handling:
try {
  const result = script.runInContext(context, { timeout: 5000 });
} catch (e) {
  if (e instanceof Error) {
    // FALSE for errors from the VM context!
    // This branch is never taken for sandbox errors
    return { error: e.message };
  }
  // Falls through to generic handler -- may lose error details
  return { error: String(e) }; // Works but loses stack trace
}
```

**Prevention:**
1. **Use `util.types.isNativeError(e)` instead of `instanceof Error`** -- this works across realms and is available in Node.js without any polyfill:
   ```javascript
   import { types } from 'node:util';
   if (types.isNativeError(e)) {
     // Works for errors from any realm
   }
   ```
2. **`Error.isError()` is now TC39 Stage 4** and available in Node.js 24+. Prefer it over `instanceof Error` everywhere:
   ```javascript
   if (Error.isError(e)) {
     // Realm-safe error detection
   }
   ```
3. **Duck-type errors as a fallback:** Check for `.message` and `.stack` properties rather than using `instanceof`:
   ```javascript
   function isErrorLike(e) {
     return e && typeof e === 'object' && 'message' in e && 'stack' in e;
   }
   ```
4. **code-rabi/rllm handles this correctly:** Their error handling uses `e instanceof Error ? ... : String(e)`, which works because they catch errors in the wrapping code that runs IN the same context as the thrown error. Copy this pattern: catch errors inside the async IIFE (same realm), format them as strings, and pass strings out.

**Detection:** Unit test that creates an `Error` inside a VM context, catches it in the host, and verifies the detection method returns `true`.

**Phase relevance:** REPL sandbox core (Phase 2). Apply the pattern consistently from the start.

**Confidence:** HIGH -- well-documented JavaScript behavior, confirmed by Node.js docs, MDN, and the new TC39 `Error.isError()` proposal reaching Stage 4.

**Sources:**
- [Error.isError(): A Better Way to Check Error Types (TC39 Stage 4)](https://www.trevorlasn.com/blog/error-iserror-javascript)
- [MDN: instanceof with cross-realm objects](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/instanceof)
- [Node.js util.types.isNativeError](https://nodejs.org/api/util.html#utiltypesisnativeerrorvalue)

---

### Pitfall 7: Git Bash (MSYS2) Automatic Path Conversion Corrupts Arguments

**What goes wrong:** Git Bash automatically converts any argument that looks like a Unix path (`/c/`, `/usr/`, `/tmp/`) to a Windows path (`C:\`, `C:\Program Files\Git\usr\`, etc.) when calling native Windows binaries. This silently corrupts arguments to `child_process.execSync` when running Nx commands, git grep, or any tool that accepts paths or path-like arguments.

**Why it happens:** MSYS2 (the environment underlying Git Bash) has automatic POSIX-to-Windows path conversion that applies to all arguments passed to non-MSYS executables. This conversion is aggressive: any argument starting with `/` followed by a single letter and `/` is treated as a drive path. Arguments like `/filter/`, `/query/`, or regex patterns like `/src\/lib/` can be corrupted.

**Concrete failure cases in our plugin:**

```javascript
// 1. git grep with path arguments
execSync('git grep -n "pattern" -- libs/shared/')
// Git Bash may convert "libs/shared/" based on context

// 2. Nx commands with project paths
execSync('npx nx show project my-lib --json')
// Safe -- no path-like arguments

// 3. Regex patterns that look like paths
execSync('git grep -n "/api/v1/users"')
// "/api/v1/users" gets converted to "C:\Program Files\Git\api\v1\users"
// Search returns zero results

// 4. JSON output containing paths
const output = execSync('npx nx graph --print');
// Output contains Windows paths with backslashes
// JSON.parse succeeds but paths need normalization
```

**Prevention:**
1. **Use Node.js `child_process` with `shell: false` (the default for `spawn`/`execFile`):** When `shell: false`, arguments are passed directly to the executable without shell interpretation, avoiding MSYS2 path conversion.
   ```javascript
   // BAD: shell: true triggers MSYS2 conversion
   execSync('git grep -n "/api/users"', { shell: true });
   // GOOD: spawn with shell: false, arguments as array
   spawnSync('git', ['grep', '-n', '/api/users'], { encoding: 'utf8' });
   ```
2. **Set `MSYS_NO_PATHCONV=1` in the environment for shell commands:**
   ```javascript
   execSync('git grep -n "/api/users"', {
     env: { ...process.env, MSYS_NO_PATHCONV: '1' },
     encoding: 'utf8',
   });
   ```
   **Caveat:** `MSYS_NO_PATHCONV` disables ALL path conversion. Any argument that IS a path and needs conversion will stop working. Use selectively.
3. **Use `MSYS2_ARG_CONV_EXCL` for selective exclusion:**
   ```javascript
   execSync('git grep -n "/api/users"', {
     env: { ...process.env, MSYS2_ARG_CONV_EXCL: '*' },
     encoding: 'utf8',
   });
   ```
4. **Normalize all paths in output:** When parsing Nx CLI output on Windows, normalize paths to forward slashes:
   ```javascript
   const normalized = outputPath.replace(/\\/g, '/');
   ```

**Detection:** CI test on Windows that runs `git grep` with a regex containing `/` and verifies correct results.

**Phase relevance:** Workspace indexer and Nx runner (Phase 1). All shell commands must be tested on Windows.

**Confidence:** HIGH -- well-documented MSYS2 behavior, confirmed by the project's own CLAUDE.md warning about path issues.

**Confirmed mitigation:** The cross-platform search tool analysis (`.planning/quick/1-research-and-analyze-git-grep-and-altern/ANALYSIS.md`) recommends `spawnSync('git', ['grep', ...], { shell: false })` as the primary invocation pattern for `search()`, which avoids MSYS2 path conversion entirely. The `MSYS_NO_PATHCONV` env var approach is documented as a secondary fallback.

**Sources:**
- [MSYS2 Filesystem Paths documentation](https://www.msys2.org/docs/filesystem-paths/)
- [MSYS_NO_PATHCONV behavior](https://gist.github.com/borekb/cb1536a3685ca6fc0ad9a028e6a959e3)
- [Git Bash path conversion issues](https://www.pascallandau.com/blog/setting-up-git-bash-mingw-msys2-on-windows/)

---

### Pitfall 8: `child_process` Default Shell on Windows Is `cmd.exe`, Not Git Bash

**What goes wrong:** Node.js `child_process.exec()` and `execSync()` use `process.env.ComSpec` (typically `cmd.exe`) as the default shell on Windows. Commands written with Unix shell syntax (pipes, `&&` chaining, glob patterns, environment variable syntax like `$VAR`) fail or behave differently under `cmd.exe` vs. Git Bash.

**Why it happens:** Claude Code runs in Git Bash, so developers test commands that work in Git Bash. But when those same commands are executed via `execSync()` inside a Node.js script, they run under `cmd.exe`, which has different syntax for:
- Environment variable expansion: `$VAR` vs `%VAR%`
- Path separators: `/` (sometimes works) vs `\` (always works)
- Command chaining: `&&` works in both, but `||` and `;` differ
- Quoting: single quotes `'string'` not supported in `cmd.exe`

**Concrete failure in our plugin:**

```javascript
// Works in Git Bash where Claude Code runs:
execSync("git grep -c 'pattern' -- '*.ts'");
// Fails under cmd.exe: single quotes not recognized

// Works in Git Bash:
execSync("NX_DAEMON=false npx nx show projects --json");
// Fails under cmd.exe: NX_DAEMON=false is not a valid cmd command

// The nx-runner.mjs script uses execSync which defaults to cmd.exe
```

**Prevention:**
1. **Prefer `spawnSync` with `shell: false` and argument arrays:** This avoids shell interpretation entirely:
   ```javascript
   const result = spawnSync('git', ['grep', '-c', 'pattern', '--', '*.ts'], {
     encoding: 'utf8',
     env: { ...process.env, NX_DAEMON: 'false' },
   });
   ```
2. **If `execSync` with shell is needed, explicitly set the shell:**
   ```javascript
   execSync('command here', {
     shell: process.platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\bash.exe' : '/bin/sh',
     encoding: 'utf8',
   });
   ```
   But this is fragile -- Git Bash may not be at that path. Better to avoid shell commands.
3. **Use Node.js APIs instead of shell commands where possible:**
   ```javascript
   // Instead of: execSync('git grep -c "pattern" -- "*.ts"')
   // Use: spawnSync('git', ['grep', '-c', 'pattern', '--', '*.ts'])

   // Instead of: execSync('NX_DAEMON=false npx nx ...')
   // Use: spawnSync('npx', ['nx', ...args], { env: { ...process.env, NX_DAEMON: 'false' } })
   ```
4. **Set environment variables via the `env` option, never via shell syntax:**
   ```javascript
   // BAD: shell-specific env var syntax
   execSync('NX_DAEMON=false nx show projects --json');
   // GOOD: works everywhere
   execSync('npx nx show projects --json', {
     env: { ...process.env, NX_DAEMON: 'false' },
   });
   ```

**Detection:** Run all shell commands on Windows under both Git Bash and cmd.exe in CI.

**Phase relevance:** Workspace indexer and Nx runner (Phase 1). Every `execSync` call must be audited for shell assumptions.

**Confidence:** HIGH -- standard Node.js documentation; the distinction between Bash and cmd.exe is well-known.

**Confirmed mitigation:** The cross-platform search tool analysis (`.planning/quick/1-research-and-analyze-git-grep-and-altern/ANALYSIS.md`) recommends `spawnSync` with `shell: false` and argument arrays for all `git grep` invocations in `search()`, which avoids cmd.exe entirely. Environment variables are passed via the `env` option.

**Sources:**
- [Node.js child_process documentation: shell option](https://nodejs.org/api/child_process.html)
- [Resolving compatibility issues with child_process.spawn across platforms](https://medium.com/@python-javascript-php-html-css/resolving-compatibility-issues-with-node-js-child-process-spawn-and-grep-across-platforms-b33be96f9438)

---

### Pitfall 9: `node:fs/promises` `glob` Returns Backslash Paths on Windows

**What goes wrong:** Node.js `fs.glob()` (stable since Node.js 22.17) returns paths with the platform's native separator. On Windows, this means backslashes: `libs\\shared\\utils\\src\\index.ts`. These paths break when: (a) used as keys in Maps or Sets (won't match forward-slash versions), (b) compared against user-provided paths (which may use forward slashes), (c) fed into `git grep` or other Unix-origin tools, (d) stored in the workspace index and later used in cross-platform comparisons.

**Why it happens:** `fs.glob()` uses the `path` module internally, which normalizes to `\` on Windows. The `node-glob` npm package (by Isaac Z. Schlueter) explicitly normalizes to forward slashes, but the built-in `fs.glob()` does not. This is a deliberate design choice -- the built-in follows `path.sep` conventions.

**Prevention:**
1. **Always normalize glob results to forward slashes immediately:**
   ```javascript
   import { glob } from 'node:fs/promises';

   async function findFiles(pattern, cwd) {
     const results = [];
     for await (const entry of glob(pattern, { cwd })) {
       results.push(entry.replace(/\\/g, '/'));
     }
     return results;
   }
   ```
2. **Create a `normalizePath` utility** used consistently across all scripts:
   ```javascript
   export const normalizePath = (p) => p.replace(/\\/g, '/');
   ```
3. **Always use forward slashes in glob patterns** -- both `fs.glob()` and `fast-glob` accept forward slashes on all platforms.
4. **Test path comparisons on Windows:** If the workspace index stores paths, verify that lookups work when the query uses either separator style.

**Detection:** Unit test on Windows that runs `fs.glob('**/*.ts')` and verifies all results use forward slashes after normalization.

**Phase relevance:** Workspace indexer (Phase 1). Path normalization must be consistent from the first file lookup.

**Confidence:** HIGH -- confirmed by Node.js documentation and `node-glob` issue tracker.

**Sources:**
- [node-glob: Windows paths normalized to forward slashes](https://github.com/isaacs/node-glob/issues/419)
- [Node.js fs.glob documentation](https://nodejs.org/api/fs.html)
- [fs.glob: coerce paths to forward slashes](https://github.com/isaacs/node-glob/issues/468)

---

### Pitfall 10: Handle Store Memory Growth During Long REPL Sessions

**What goes wrong:** The handle-based result storage keeps large results in a `Map` (`$res1`, `$res2`, ...). Over a 20-iteration REPL session where each iteration may produce a multi-KB result, the handle store can accumulate 1-5 MB of data that is never garbage collected. In edge cases (e.g., reading many files), this grows to tens of MB.

**Why it happens:** The handle store is designed to prevent large results from entering the LLM context (the core token-saving mechanism). But there is no eviction policy -- once a handle is created, it lives until the REPL session ends. The Matryoshka implementation uses SQLite for handle storage with explicit TTL, but our v0.0.1 uses an in-memory Map for simplicity.

**Concrete growth scenario:**

```javascript
// Iteration 1: files() returns 537 project objects -> $res1 (50KB)
// Iteration 3: read() returns a 2000-line file -> $res2 (80KB)
// Iteration 5: search() returns 200 matches -> $res3 (40KB)
// Iteration 8: deps() returns full dependency tree -> $res4 (30KB)
// ... by iteration 20: ~500KB in handles

// Worst case: model does read() on 10 large files -> 800KB+
```

**Prevention:**
1. **Cap handle store at 50 entries** and evict LRU (least recently used) when full.
2. **Size-cap individual handles:** If a result exceeds 100KB, truncate it and store a warning:
   ```javascript
   if (JSON.stringify(value).length > 100_000) {
     store.set(handle, {
       _truncated: true,
       _originalSize: JSON.stringify(value).length,
       preview: JSON.stringify(value).slice(0, 1000),
     });
   }
   ```
3. **Generation-based cleanup:** Results from iterations older than 5 iterations ago are automatically evicted. The model can re-compute them if needed.
4. **WeakRef for optional handles:** For results the model is unlikely to revisit, use `WeakRef` so GC can reclaim them if memory pressure increases.

**Detection:** Memory profiling during a 20-iteration REPL session. Alert if handle store exceeds 5 MB.

**Phase relevance:** Handle store implementation (Phase 2).

**Confidence:** MEDIUM -- only a problem for long REPL sessions with large intermediate results. The 20-iteration cap naturally limits exposure.

---

### Pitfall 11: Subagent Context Limits and Auto-Compaction Behavior

**What goes wrong:** Claude Code subagents have the same context window as the main conversation (200K for Sonnet, 1M for Sonnet 1M). Auto-compaction triggers at ~95% capacity by default (configurable via `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`). If the `repl-executor` subagent accumulates 20 iterations of REPL output plus system prompt, it can hit compaction mid-session, losing critical iteration context.

**Why it happens:** Each REPL iteration adds to the subagent's conversation: the code block (~200-500 tokens), the output (~200-2000 tokens), and the agent's reasoning (~100-300 tokens). Over 20 iterations at ~1000 tokens per iteration = ~20K tokens just for the REPL loop. Add the system prompt (~2-5K), the original question (~500), and the workspace index summary (~2-5K), and the subagent uses 25-30K tokens. This is well within limits for a single REPL session, but if the subagent also processes large file reads or search results, it can approach compaction.

**Key finding from research:** Subagent transcripts are stored in separate files. Main conversation compaction does NOT affect subagent transcripts. Subagents compact independently. After compaction, specific variable names, exact error messages, and earlier patterns are lost -- which directly undermines the REPL's variable persistence model.

**Prevention:**
1. **Keep REPL output truncated aggressively:** The existing 2K char limit per `print()` output is critical. Never increase it without understanding the context impact.
2. **Use handle stubs, not full data, in agent conversation:** The handle store exists precisely for this -- `$res1: Array(537) [preview...]` is 50 tokens, not 15,000.
3. **Monitor token usage per REPL session:** If the repl-executor subagent approaches 50% of its context, inject a "wrap up" hint.
4. **Consider model routing:** If the repl-executor uses Sonnet (200K context), 20 iterations is safe. If ever routed to a smaller model, reduce `maxIterations` proportionally.

**Detection:** Log the estimated token count of each subagent REPL session. Alert if any session exceeds 100K tokens.

**Phase relevance:** Agent integration (Phase 4). Needs empirical testing with real REPL sessions.

**Confidence:** MEDIUM -- based on Claude Code documentation and community analysis. Exact auto-compaction behavior needs empirical validation.

**Sources:**
- [Claude Code subagent documentation](https://code.claude.com/docs/en/sub-agents)
- [Context management with subagents](https://www.richsnapp.com/article/2025/10-05-context-management-with-subagents-in-claude-code)
- [Claude Code context buffer analysis](https://claudefa.st/blog/guide/mechanics/context-buffer-management)
- [Auto-compaction API docs](https://platform.claude.com/docs/en/build-with-claude/compaction)

---

### Pitfall 12: VM Persistent Context Memory Leaks

**What goes wrong:** Node.js `vm.createContext()` contexts are not reliably garbage collected even when all JavaScript references are released. V8's `Global` handles that keep the context alive can leak, especially when the context contains closures that reference host objects.

**Why it happens:** The Node.js `vm` module has a long history of memory leak issues (GitHub issues #3113, #6552). The root cause is that `v8::Global` references holding compiled function entries alive are not made weak properly. Fixes have been attempted and reverted due to use-after-free crashes. The situation has improved in Node.js 22+ but is not fully resolved.

**Our specific risk:**

Each REPL session creates one VM context. With our plugin, a user might run 5-10 REPL sessions per Claude Code session. If each context leaks 5-10 MB, that is 25-100 MB of leaked memory per Claude Code session -- noticeable but not catastrophic. However, if the workspace index (50-100KB) is re-injected into each context without cleanup, the leak includes the index data.

**Prevention:**
1. **Reuse a single VM context per REPL session** (both reference implementations do this). Never create a new context per iteration -- create one context and execute multiple scripts within it.
2. **Null out references explicitly when the REPL session ends:**
   ```javascript
   function disposeContext(ctx) {
     for (const key of Object.keys(ctx)) {
       ctx[key] = undefined;
     }
     // ctx itself may not be GC'd, but at least the objects it held are freed
   }
   ```
3. **Run the VM in a Worker Thread for hard cleanup:** `worker.terminate()` destroys the entire V8 isolate, guaranteeing no leaks. This is the recommended approach for production.
4. **Do not worry about this for v0.0.1.** The leak is small enough per session that it will not cause problems in a plugin context (short-lived sessions, user restarts Claude Code periodically). Add Worker Thread isolation in a later milestone if profiling shows issues.

**Detection:** Heap snapshot before and after 10 REPL sessions. Verify delta is under 50 MB.

**Phase relevance:** Optimization (not v0.0.1). Document the known leak and plan for Worker Thread isolation later.

**Confidence:** MEDIUM -- documented in Node.js issue tracker but severity is low for our use case.

**Sources:**
- [VM extreme memory growth (Node.js #3113)](https://github.com/nodejs/node/issues/3113)
- [Fixing Node.js vm APIs: memory leaks (Joyee Cheung)](https://joyeecheung.github.io/blog/2023/12/30/fixing-nodejs-vm-apis-1/)
- [vm memory leak in runInNewContext (Node.js v0.x #6552)](https://github.com/nodejs/node-v0.x-archive/issues/6552)

---

## Minor Pitfalls

### Pitfall 13: Nx CLI Output Line Ending Differences

**What goes wrong:** Nx CLI output on Windows uses `\r\n` line endings. When this output is parsed with `split('\n')`, each line retains a trailing `\r`. This causes: (a) JSON parse failures if the output has trailing `\r` before a closing `}`, (b) string comparison failures (`"my-app\r" !== "my-app"`), (c) invisible bugs where logged output looks correct but string equality fails.

**Prevention:**
1. **Always strip `\r` from CLI output immediately:**
   ```javascript
   const output = execSync('npx nx show projects --json', { encoding: 'utf8' })
     .replace(/\r\n/g, '\n')
     .trim();
   ```
2. **Use `JSON.parse()` which handles whitespace:** For JSON output, `JSON.parse` ignores trailing whitespace including `\r`. But for line-by-line parsing, explicit `\r` stripping is needed.

**Phase relevance:** Workspace indexer (Phase 1). Apply to every `execSync` call.

**Confidence:** HIGH -- standard cross-platform issue.

---

### Pitfall 14: `CLAUDE_PLUGIN_ROOT` Path Separator Corruption on Windows

**What goes wrong:** On Windows, `${CLAUDE_PLUGIN_ROOT}` contains backslashes. When interpolated into bash hook commands, backslashes are stripped or interpreted as escape sequences. This is tracked as open issues on Claude Code (#18527, #22449) with no official fix.

**Prevention:**
1. **In hooks.json, use Node.js scripts:** `node "${CLAUDE_PLUGIN_ROOT}/scripts/some-script.mjs"` -- Node.js handles path normalization.
2. **In scripts, resolve paths using `import.meta.url`** or `process.argv` instead of relying on `CLAUDE_PLUGIN_ROOT`:
   ```javascript
   import { fileURLToPath } from 'node:url';
   const __dirname = fileURLToPath(new URL('.', import.meta.url));
   ```
3. **Use forward slashes everywhere** in plugin paths.

**Phase relevance:** Plugin shell (Phase 1). Establish path conventions from day one.

**Confidence:** HIGH -- multiple open GitHub issues with reproduction steps.

**Sources:**
- [Plugin bash hooks fail on Windows (claude-code #18527)](https://github.com/anthropics/claude-code/issues/18527)
- [CLAUDE_PLUGIN_ROOT backslashes stripped (claude-code #22449)](https://github.com/anthropics/claude-code/issues/22449)

---

### Pitfall 15: Haiku 4.5 Wrapping JSON in Markdown Code Fences

**What goes wrong:** When a hook script expects raw JSON output from a Haiku subagent, Haiku often wraps the response in markdown code fences (` ```json ... ``` `) or adds explanatory text before/after the JSON. This breaks `JSON.parse()` and silently fails the hook.

**Prevention:**
1. **Explicitly instruct in the agent prompt:** "Respond with raw JSON only. No markdown code fences. No explanatory text. Just the JSON object."
2. **Parse defensively:** Strip markdown code fences before parsing:
   ```javascript
   function parseJSONResponse(text) {
     const stripped = text
       .replace(/^```(?:json)?\s*/m, '')
       .replace(/\s*```\s*$/m, '')
       .trim();
     return JSON.parse(stripped);
   }
   ```
3. **Validate the parsed result** against a schema before using it.

**Phase relevance:** Agent integration (Phase 4) when wiring the `haiku-searcher` agent.

**Confidence:** MEDIUM -- reported by multiple plugin developers but may improve with newer Haiku versions.

---

### Pitfall 16: `vm.Script` Timeout on Constructor vs `.runInContext()`

**What goes wrong:** The `timeout` option passed to the `vm.Script` constructor is SILENTLY IGNORED. Only the `timeout` passed to `.runInContext()` / `.runInNewContext()` is honored. This is a subtle API footgun that causes "infinite hang" bugs when developers pass timeout to the wrong method.

**Prevention:**
```javascript
// BAD: timeout is silently ignored here
const script = new vm.Script(code, { timeout: 5000 });
script.runInContext(context); // No timeout -- runs forever

// GOOD: timeout on the execution method
const script = new vm.Script(code);
script.runInContext(context, { timeout: 5000 }); // This works
```

Both reference implementations (Hampton-io and code-rabi/rllm) do this correctly. Copy their pattern.

**Phase relevance:** REPL sandbox core (Phase 2).

**Confidence:** HIGH -- documented in Node.js issue #20982.

**Sources:**
- [vm.Script timeout issue (Node.js #20982)](https://github.com/nodejs/node/issues/20982)

---

### Pitfall 17: Nx Daemon Timeouts and OOM on Large Workspaces

**What goes wrong:** On the target 537-project workspace, `nx graph --print` triggers full project graph computation that can consume 38+ GB of memory and crash with OOM. The daemon can hang indefinitely when plugins produce graph errors.

**Prevention:**
1. **Never call `nx graph --print` in a hook.** Use the daemon's cached graph at `.nx/workspace-data/project-graph.json` when available.
2. **Set `maxBuffer` explicitly** on all `execSync` calls: `{ maxBuffer: 10 * 1024 * 1024 }` (10 MB).
3. **Use `nx show projects --json`** (lightweight) instead of `nx graph --print` (heavyweight) when full graph is not needed.
4. **Build incrementally:** Project names first, then per-project details on demand.
5. **Handle `nx reset` recovery:** If any Nx command fails with a daemon error, run `nx reset` and retry once.

**Phase relevance:** Workspace indexer (Phase 1).

**Confidence:** HIGH -- multiple Nx GitHub issues (#26786, #28487, #32265).

**Sources:**
- [Nx daemon OOM on project graph (#26786)](https://github.com/nrwl/nx/issues/26786)
- [Nx tasks hanging 30+ minutes (#28487)](https://github.com/nrwl/nx/issues/28487)

---

### Pitfall 18: Claude Code Agent/Skill Markdown Parsing Gotchas

**What goes wrong:** Several markdown parsing issues affect agent and skill definitions: (a) consecutive `@~/` file references are incorrectly parsed due to markdown strikethrough interference, (b) bold and colored text in markdown output shifts to wrong characters on Windows due to `\r\n` line endings, (c) YAML frontmatter must be valid YAML -- trailing commas, missing quotes on strings with colons, and other JSON-like syntax causes silent failures.

**Prevention:**
1. **Validate YAML frontmatter** with a YAML linter before shipping agent/skill markdown files.
2. **Avoid `@~/` file references** in consecutive lines -- use blank lines between them.
3. **Test agent/skill files on Windows** to verify rendering.
4. **Keep frontmatter minimal:** Only use `description`, `model`, and `allowedTools`. Every additional field is a potential parsing failure point.

**Phase relevance:** Agent integration (Phase 4) and skill (Phase 5).

**Confidence:** MEDIUM -- based on Claude Code CHANGELOG bug fixes.

**Sources:**
- [Claude Code CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
- [Plugins reference](https://code.claude.com/docs/en/plugins-reference)

---

## Integration Pitfalls (Between Components)

### Pitfall 19: REPL `read()` Function and Workspace Indexer Path Mismatch

**What goes wrong:** The workspace indexer stores project source roots as relative paths (e.g., `libs/shared/utils/src`). The REPL `read()` function needs absolute paths to call `fs.readFileSync()`. If the REPL code constructs paths from the index without prepending the workspace root, every `read()` call fails with `ENOENT`.

**Prevention:**
1. **Store the workspace root in the index** and make it available as a REPL global.
2. **Have `read()` resolve relative paths** against the workspace root automatically:
   ```javascript
   sandbox.read = (filePath, startLine, endLine) => {
     const abs = path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot, filePath);
     // ... read and return
   };
   ```
3. **Test the full path: index lookup -> path construction -> file read** as an integration test.

**Phase relevance:** Integration between Phase 1 (indexer) and Phase 2 (REPL).

**Confidence:** HIGH -- straightforward path handling, but easy to miss in initial implementation.

---

### Pitfall 20: Model Confusion from Handle Stubs vs. Actual Data

**What goes wrong:** The handle store replaces large results with stubs like `$res1: Array(537) [preview...]`. The LLM may not understand that `$res1` is a reference to stored data, not a literal string. It may try to `JSON.parse("$res1")`, iterate over the string characters, or treat the stub as the actual result.

**Why it happens:** The training gap. Models have not been trained to interact with handle stubs. Without explicit instructions, the model treats all REPL output as data to be processed, not as references to be dereferenced.

**Prevention:**
1. **Add handle usage examples to the system prompt:**
   ```
   When you see $res1: Array(537) [...], this is a handle to stored data.
   Access it with: const items = $res1;
   Filter it with: const filtered = $res1.filter(x => x.type === 'lib');
   Do NOT try to parse $res1 as a string.
   ```
2. **Make handles callable:** Instead of just storing data, make handles behave like live references:
   ```javascript
   // In the sandbox, $res1 IS the actual array, not a string
   // The stub is only shown in the print output
   ```
3. **Test with 5+ real queries** to verify the model understands and correctly uses handles.

**Phase relevance:** Handle store (Phase 2) and agent integration (Phase 4).

**Confidence:** HIGH -- the training gap is the most consistently cited RLM limitation.

---

## Phase-Specific Warnings

| Phase | Component | Likely Pitfall | Priority |
|-------|-----------|---------------|----------|
| 1 | Workspace indexer | Git Bash path munging corrupts args (Pitfall 7) | HIGH |
| 1 | Workspace indexer | `cmd.exe` default shell breaks Unix syntax (Pitfall 8) | HIGH |
| 1 | Workspace indexer | Nx daemon timeout/OOM on large workspace (Pitfall 17) | HIGH |
| 1 | Workspace indexer | `fs.glob` returns backslash paths on Windows (Pitfall 9) | MEDIUM |
| 1 | Workspace indexer | Nx output line endings `\r\n` (Pitfall 13) | LOW |
| 1 | Plugin shell | `CLAUDE_PLUGIN_ROOT` backslash corruption (Pitfall 14) | LOW |
| 2 | REPL sandbox | `const`/`let` transformation breaks destructuring (Pitfall 1) | **CRITICAL** |
| 2 | REPL sandbox | Async IIFE timeout escape and error swallowing (Pitfall 2) | **CRITICAL** |
| 2 | REPL sandbox | Prototype chain escape via injected objects (Pitfall 3) | HIGH |
| 2 | REPL sandbox | Cross-realm `instanceof Error` fails (Pitfall 6) | MEDIUM |
| 2 | REPL sandbox | VM `Script` timeout on constructor silently ignored (Pitfall 16) | MEDIUM |
| 2 | REPL sandbox | Persistent context memory leaks (Pitfall 12) | LOW |
| 2 | Handle store | Memory growth without eviction (Pitfall 10) | MEDIUM |
| 2 | Handle store | Model confusion from handle stubs (Pitfall 20) | MEDIUM |
| 2 | REPL + Indexer | Path mismatch between index and `read()` (Pitfall 19) | MEDIUM |
| 4 | Execution loop | Infinite loops / `FINAL()` brittleness (Pitfall 4) | **CRITICAL** |
| 4 | `llm_query()` | Sub-calls cannot directly spawn subagents (Pitfall 5) | **CRITICAL** |
| 4 | Subagent | Context limits and auto-compaction (Pitfall 11) | MEDIUM |
| 4 | `haiku-searcher` | Haiku wraps JSON in code fences (Pitfall 15) | LOW |
| 5 | Skill markdown | YAML frontmatter and rendering gotchas (Pitfall 18) | LOW |

---

## Sources

### Node.js VM Module
- [Node.js vm documentation](https://nodejs.org/api/vm.html)
- [MDN: globalThis scope with var/let/const](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/globalThis)
- [Promises allow vm.runInContext timeout to be escaped (Node.js #3020)](https://github.com/nodejs/node/issues/3020)
- [vm.runInThisContext fails with top-level await (Node.js #40898)](https://github.com/nodejs/node/issues/40898)
- [vm timeout breaks console.log/stdout (Node.js #34678)](https://github.com/nodejs/node/issues/34678)
- [vm.Script timeout silently ignored on constructor (Node.js #20982)](https://github.com/nodejs/node/issues/20982)
- [VM extreme memory growth (Node.js #3113)](https://github.com/nodejs/node/issues/3113)
- [microtaskMode afterEvaluate deadlocks async/await (Node.js #55546)](https://github.com/nodejs/node/issues/55546)
- [VM timeout performance impact (Node.js #10453)](https://github.com/nodejs/node/issues/10453)
- [Fixing Node.js vm APIs: memory leaks (Joyee Cheung)](https://joyeecheung.github.io/blog/2023/12/30/fixing-nodejs-vm-apis-1/)
- [node:vm is not a sandbox (DEV Community)](https://dev.to/dendrite_soup/nodevm-is-not-a-sandbox-stop-using-it-like-one-2f74)

### VM Security
- [CVE-2025-68613: n8n sandbox escape](https://www.penligent.ai/hackinglabs/cve-2025-68613-deep-dive-how-node-js-sandbox-escapes-shatter-the-n8n-workflow-engine/)
- [CVE-2026-22709: vm2 critical sandbox escape](https://www.endorlabs.com/learn/cve-2026-22709-critical-sandbox-escape-in-vm2-enables-arbitrary-code-execution)
- [Semgrep: vm2 escape analysis](https://semgrep.dev/blog/2026/calling-back-to-vm2-and-escaping-sandbox/)

### Cross-Realm Errors
- [Error.isError(): TC39 Stage 4](https://www.trevorlasn.com/blog/error-iserror-javascript)
- [MDN: instanceof cross-realm issues](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/instanceof)
- [From instanceof to Error.isError](https://allthingssmitty.com/2026/02/23/from-instanceof-to-error-iserror-safer-error-checking-in-javascript/)

### Cross-Platform
- [MSYS2 Filesystem Paths documentation](https://www.msys2.org/docs/filesystem-paths/)
- [MSYS_NO_PATHCONV behavior](https://gist.github.com/borekb/cb1536a3685ca6fc0ad9a028e6a959e3)
- [Node.js child_process documentation](https://nodejs.org/api/child_process.html)
- [node-glob: Windows paths with forward slashes](https://github.com/isaacs/node-glob/issues/419)
- [Git Bash path conversion pitfalls](https://www.pascallandau.com/blog/setting-up-git-bash-mingw-msys2-on-windows/)

### Claude Code Plugin System
- [Claude Code subagent documentation](https://code.claude.com/docs/en/sub-agents)
- [Plugin bash hooks fail on Windows (claude-code #18527)](https://github.com/anthropics/claude-code/issues/18527)
- [CLAUDE_PLUGIN_ROOT backslashes stripped (claude-code #22449)](https://github.com/anthropics/claude-code/issues/22449)
- [Task tool subagent rate limit bug (claude-code #27053)](https://github.com/anthropics/claude-code/issues/27053)
- [Context management with subagents](https://www.richsnapp.com/article/2025/10-05-context-management-with-subagents-in-claude-code)
- [Claude Code context buffer analysis](https://claudefa.st/blog/guide/mechanics/context-buffer-management)

### RLM Limitations
- [RLM paper: arxiv.org/abs/2512.24601](https://arxiv.org/abs/2512.24601)
- [Prime Intellect: RLM paradigm of 2026](https://www.primeintellect.ai/blog/rlm)

### Reference Implementations
- [Hampton-io/RLM vm-sandbox.ts](D:/projects/github/hampton-io/RLM/src/sandbox/vm-sandbox.ts)
- [Hampton-io/RLM security tests](D:/projects/github/hampton-io/RLM/tests/sandbox-security.test.ts)
- [code-rabi/rllm sandbox.ts](D:/projects/github/code-rabi/rllm/src/sandbox.ts)

### Nx CLI
- [Nx daemon OOM (#26786)](https://github.com/nrwl/nx/issues/26786)
- [Nx tasks hanging (#28487)](https://github.com/nrwl/nx/issues/28487)
