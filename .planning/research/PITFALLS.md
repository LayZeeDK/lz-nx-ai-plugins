# Domain Pitfalls

**Domain:** RLM-powered Nx Claude Code plugin (JavaScript REPL sandbox + Nx workspace navigation)
**Researched:** 2026-03-03

---

## Critical Pitfalls

Mistakes that cause rewrites, security breaches, or fundamental architecture failures.

### Pitfall 1: Node.js `vm` Module Is Not a Security Sandbox

**What goes wrong:** The Node.js `vm` module is explicitly documented as "not a security mechanism." Code running inside `vm.createContext()` can escape the sandbox via prototype chain traversal (`this.constructor.constructor("return process")().exit()`), Proxy-based exception techniques, and Promise callback exploitation. CVE-2025-68613 (n8n workflow engine) and CVE-2026-22709 (vm2) demonstrate these escapes are actively exploited in the wild.

**Why it happens:** Developers treat `vm.createContext()` as equivalent to Docker-level isolation. It is not. JavaScript's dynamic prototype chain means any non-primitive object injected into the sandbox context provides an escape vector. Even `Object.create(null)` for the context object is insufficient if any helper functions or objects (like arrays, Maps, or the workspace index object) are passed in -- attackers reach the host `Function` constructor via `someObject.constructor.constructor("return process")()`.

**Consequences:**
- Arbitrary code execution on the host machine if the LLM generates (or is prompt-injected into generating) an escape payload
- File system access, process spawning, environment variable exfiltration
- In a Claude Code plugin context, this means the REPL could be used to execute arbitrary shell commands outside the allowlisted set

**Warning signs:**
- Passing non-frozen objects (arrays, Maps, plain objects) into the VM context
- REPL globals that return complex objects (e.g., `deps()` returning a full graph object with prototype chain intact)
- Not testing sandbox escape vectors during development

**Prevention:**
1. Accept that `vm` provides **scope isolation, not security isolation**. The threat model is "prevent accidental access to host APIs," not "prevent malicious escape."
2. Freeze all objects passed into the sandbox context: `Object.freeze()` recursively on the workspace index, registry Maps, and any objects returned by REPL globals.
3. Create the context with `Object.create(null)` and only inject primitive-returning wrapper functions, never raw objects with live prototype chains.
4. Set `codeGeneration: { strings: false, wasm: false }` to block `eval()` and WASM-based attacks.
5. Wrap every REPL global function to return frozen copies or primitives, never references to host objects.
6. For v1 where the LLM generates the code (not untrusted users), this is acceptable risk. If the plugin is ever exposed to user-supplied code, move to `isolated-vm` or Worker Thread isolation.
7. Monitor for future Node.js security releases affecting `vm` (CVE-2025-55131 demonstrated a buffer allocation race condition in the vm module with timeouts).

**Detection:** Automated test suite with known escape payloads (`this.constructor.constructor`, Proxy throws, Promise chain exploitation). Run on every change to `repl-sandbox.mjs`.

**Phase relevance:** Must be addressed in the first phase when building `repl-sandbox.mjs`. Get the isolation model right from day one.

**Confidence:** HIGH -- multiple CVEs, official Node.js documentation warning, and community consensus all confirm this.

**Sources:**
- [Snyk: Security concerns of JavaScript sandbox with Node.js VM module](https://snyk.io/blog/security-concerns-javascript-sandbox-node-js-vm-module/)
- [CVE-2025-68613: n8n sandbox escape](https://www.penligent.ai/hackinglabs/cve-2025-68613-deep-dive-how-node-js-sandbox-escapes-shatter-the-n8n-workflow-engine/)
- [CVE-2026-22709: vm2 critical sandbox escape](https://www.endorlabs.com/learn/cve-2026-22709-critical-sandbox-escape-in-vm2-enables-arbitrary-code-execution)
- [Node.js vm escape gist](https://gist.github.com/jcreedcmu/4f6e6d4a649405a9c86bb076905696af)

---

### Pitfall 2: REPL Execution Loop Infinite Loops and Runaway Resource Consumption

**What goes wrong:** The RLM execution loop (`fill -> solve -> FINAL`) can get stuck in several ways: (a) the LLM never emits `FINAL()`, looping indefinitely through fill iterations; (b) LLM-generated code contains `while(true){}` or equivalent CPU-bound constructs that block the Node.js event loop; (c) recursive `llm_query()` calls cascade without convergence, spawning unbounded sub-calls; (d) `vm.runInContext` timeout fails to terminate native code execution (e.g., `BigInt("1".repeat(1e8))`).

**Why it happens:**
- Current frontier models have not been trained on the RLM paradigm (the "training gap" from the research). They may not reliably produce `FINAL()` termination signals, especially on complex tasks.
- The `timeout` option on `vm.runInContext` relies on V8's interrupt mechanism, which only works for JavaScript-level loops. Native code (BigInt construction, regex backtracking, large string operations) cannot be interrupted.
- `timeout` passed to the `vm.Script` constructor is silently ignored -- it must be passed to `.runInContext()` directly, a subtle API footgun.
- Model-dependent behavior: GPT-4 might use ~10 sub-calls for a task while Qwen-Coder uses ~1000 for the same task.

**Consequences:**
- Node.js process hangs indefinitely, blocking the Claude Code session
- The Claude Code hook system has a 60-second timeout for hooks; a hung REPL would exceed this and cause silent failures
- Token cost runaway if `llm_query()` sub-calls cascade without depth limits
- User perceives the plugin as broken/frozen with no error feedback

**Warning signs:**
- REPL iteration counts approaching `maxIterations` without progress toward `FINAL()`
- Consecutive iterations producing the same or similar code (model stuck in a loop)
- Sub-call depth exceeding 2 without convergence
- Execution time per REPL block exceeding 5 seconds

**Prevention:**
1. **Layer four independent guards:** `maxIterations` (default 20), `maxTimeout` (default 120s wall clock), `maxConsecutiveErrors` (default 3), and per-block execution timeout (default 5s).
2. **Run VM execution in a Worker Thread**, not the main thread. This allows `worker.terminate()` as a hard kill when `vm.runInContext` timeout fails on native code. The main thread stays responsive.
3. **Detect stale loops:** Track code similarity across iterations. If the LLM produces substantially similar code 3 iterations in a row, force-terminate with an error message. Hash or fingerprint each code block.
4. **Pass `timeout` to `.runInContext()`, never to the `vm.Script` constructor.** The constructor silently ignores it.
5. **Cap `llm_query()` sub-call depth** at 2 (matching the paper's tested configuration of `max_depth=1`). At max depth, `rlm_query()` downgrades to `llm_query()`.
6. **Instrument iteration telemetry:** Log iteration count, elapsed time, and code hash per iteration. Emit warnings at 50% and 80% of limits.
7. **Provide graceful degradation:** When limits are hit, return the best partial answer accumulated so far (from REPL variables), not just an error.

**Detection:** Integration tests that deliberately trigger each failure mode: infinite JS loop, `FINAL()` never called, cascading sub-calls, native code timeout evasion.

**Phase relevance:** Core to the REPL engine phase. The execution loop and all four guards must ship together -- never ship the loop without the guards.

**Confidence:** HIGH -- documented in the RLM paper (Section 16), Prime Intellect ablations, and Node.js vm module documentation.

**Sources:**
- [Node.js vm.Script timeout issue](https://github.com/nodejs/node/issues/20982)
- [vm.runInContext timeout performance impact](https://github.com/nodejs/node/issues/52261)
- [RLM paper: limitations and open problems](https://arxiv.org/html/2512.24601v1)
- [Prime Intellect: RLM paradigm of 2026](https://www.primeintellect.ai/blog/rlm)

---

### Pitfall 3: `CLAUDE_PLUGIN_ROOT` Path Separator Corruption on Windows

**What goes wrong:** On Windows, `${CLAUDE_PLUGIN_ROOT}` is set to a Windows-style path with backslashes (e.g., `C:\Users\user\.claude\plugins\...`). When this variable is interpolated into bash hook commands, the backslashes are either stripped (producing `C:Usersuser.claude...`) or interpreted as escape sequences. Plugin hooks fail with "No such file or directory" errors.

**Why it happens:** Claude Code runs hooks via Git Bash (MSYS2) on Windows. The variable substitution for `${CLAUDE_PLUGIN_ROOT}` happens before the command reaches bash, but the path uses Windows backslash separators. Bash interprets backslashes as escape characters, corrupting the path. This is tracked as open issues on the Claude Code repository (#18527, #22449) with no official fix as of March 2026.

**Consequences:**
- All plugin hooks fail silently on Windows: SessionStart, PreToolUse, PostToolUse, Stop
- Plugin appears completely non-functional on Windows despite working on macOS/Linux
- The AGENTS.md for this repo explicitly requires cross-platform support (macOS, Linux, Windows)

**Warning signs:**
- Hook scripts that reference `${CLAUDE_PLUGIN_ROOT}` in `hooks.json`
- Testing only on macOS/Linux during development
- Error messages containing mangled paths like `C:Users...` in Windows CI or testing

**Prevention:**
1. **Never rely on `${CLAUDE_PLUGIN_ROOT}` in bash hook commands.** The project's own AGENTS.md already documents this: "CLAUDE_PLUGIN_ROOT is substituted by the plugin system in hooks.json but NOT in command markdown files."
2. **In hooks.json, use Node.js scripts that resolve their own path:** The hook command should be `node "${CLAUDE_PLUGIN_ROOT}/scripts/some-script.mjs"` -- Node.js handles the path normalization. The plugin system correctly passes the path to `node` even on Windows because Node.js accepts both separators.
3. **If hooks must use bash scripts,** convert the path to POSIX format inside the script: `plugin_root=$(cygpath -u "$CLAUDE_PLUGIN_ROOT")`.
4. **Use forward slashes everywhere in plugin paths.** PowerShell, Node.js, and Git Bash all accept forward slashes on Windows.
5. **Test on Windows in CI from the first phase.** Do not defer Windows testing.

**Detection:** CI matrix that includes Windows. Specific test that runs each hook and verifies the script path resolves correctly.

**Phase relevance:** Affects every phase that adds hooks or scripts. Establish the path handling convention in phase 1 and enforce it in code review.

**Confidence:** HIGH -- multiple open GitHub issues with reproduction steps, confirmed by the project's own AGENTS.md documentation.

**Sources:**
- [Plugin bash hooks fail on Windows: mixed path separators](https://github.com/anthropics/claude-code/issues/18527)
- [CLAUDE_PLUGIN_ROOT backslashes stripped on Windows](https://github.com/anthropics/claude-code/issues/22449)
- [Windows Git Bash recurring command issues](https://github.com/anthropics/claude-code/issues/29346)

---

### Pitfall 4: Nx Daemon Timeouts and OOM on Large Workspaces

**What goes wrong:** On a 537-project workspace, Nx daemon operations can take minutes instead of seconds. `nx graph --print` triggers full project graph computation that can consume 38+ GB of memory and crash with OOM. The daemon can hang indefinitely when plugins produce graph errors, leaving a zombie process that blocks subsequent Nx commands.

**Why it happens:** The Nx daemon maintains an in-memory project graph. For large workspaces, initial graph computation is expensive (reported at 8-10 minutes in Nx v21+). `nx graph --print` forces serialization of the entire graph to JSON, which for 537 projects with full dependency edges can produce a multi-MB JSON blob. If the daemon encounters an error during graph computation (e.g., malformed `project.json`), it hangs and holds its socket, preventing new commands.

**Consequences:**
- `workspace-indexer.mjs` on SessionStart hangs for minutes, making the plugin feel broken on first use
- OOM crash if the daemon tries to build the full graph on a machine with limited memory (the 16 GB max usable RAM constraint from the dev machine spec)
- Zombie daemon process blocks all subsequent Nx commands until `nx reset` is run
- JSON serialization of the full graph can exceed Node.js default `maxBuffer` (200 KB for `execSync`), silently truncating output

**Warning signs:**
- `nx graph --print` taking more than 10 seconds on the target workspace
- Node.js process memory climbing above 2 GB during workspace indexing
- "Calculating the project graph on the Nx Daemon is taking longer than expected" messages
- Truncated JSON output from `execSync` (missing closing brackets)

**Prevention:**
1. **Never call `nx graph --print` in the SessionStart hook.** Cache the graph and rebuild incrementally. Use the daemon's cached graph at `.nx/workspace-data/project-graph.json` when available.
2. **Set `maxBuffer` explicitly** on all `execSync` calls to Nx: `execSync('npx nx ...', { maxBuffer: 10 * 1024 * 1024, encoding: 'utf8' })` (10 MB).
3. **Implement timeout + fallback** for all Nx CLI calls: if `nx show projects --json` takes more than 30 seconds, fall back to reading `nx.json` and `project.json` files directly.
4. **Use `NX_DAEMON=false`** for indexing operations to avoid daemon state issues, or pipe output directly instead of relying on daemon caching.
5. **Use `nx show projects --json`** (lightweight, returns only project names) instead of `nx graph --print` (heavyweight, returns full dependency graph) when full graph is not needed.
6. **Build the dependency graph incrementally:** First get project names (`nx show projects --json`), then get per-project details on demand (`nx show project <name> --json`), caching results.
7. **Handle `nx reset` recovery:** If any Nx command fails with a daemon error, automatically run `nx reset` and retry once.

**Detection:** Performance benchmarks for the indexing script on the target 537-project workspace. Alert if indexing takes more than 30 seconds.

**Phase relevance:** Critical for the workspace indexer phase. The indexing strategy must be designed around daemon limitations from the start.

**Confidence:** HIGH -- multiple GitHub issues (#26786, #28487, #32265) with detailed reproduction on large workspaces. The target workspace (537 projects) is squarely in the affected range.

**Sources:**
- [Nx daemon OOM on project graph](https://github.com/nrwl/nx/issues/26786)
- [Nx tasks hanging 30+ minutes](https://github.com/nrwl/nx/issues/28487)
- [Slow project graph calculation](https://github.com/nrwl/nx/issues/32265)
- [Nx Daemon documentation](https://nx.dev/docs/concepts/nx-daemon)

---

### Pitfall 5: The RLM Training Gap -- Models Underutilize or Misuse the REPL

**What goes wrong:** Current frontier models (Claude Sonnet, GPT-4, etc.) have not been trained on the RLM paradigm. They underutilize sub-calls, make poor decomposition choices, fail to emit `FINAL()` reliably, and sometimes perform worse with RLM scaffolding than without it. Prime Intellect's ablations confirm: without strategy hints in the system prompt, RLM can actually degrade performance compared to a plain LLM call.

**Why it happens:** The RLM paper's experiments show that models need explicit RL training on RLM trajectories to use the REPL effectively. The first natively recursive model (RLM-Qwen3-8B) required distillation from 1,072 quality trajectories to improve by 28.3%. Without training, models treat the REPL as a novelty rather than a systematic navigation tool. They may:
- Dump entire file contents into `print()` instead of extracting specific lines
- Call `llm_query()` for tasks that could be done with `search()` or `files()`
- Attempt to read the entire workspace into a REPL variable instead of navigating incrementally
- Generate syntactically invalid JavaScript for the REPL

**Consequences:**
- Token savings evaporate if the model uses the REPL inefficiently (negating the core value proposition)
- REPL output truncation at 2K chars causes information loss when the model dumps large results
- Model confusion when REPL output is truncated, leading to repeated attempts
- False perception that the plugin "doesn't work" when the model simply isn't leveraging it correctly

**Warning signs:**
- Average iteration count exceeding 15 for simple queries (should be 3-7)
- `print()` output regularly hitting the truncation limit
- Model generating `read()` calls on entire files when only specific functions are needed
- Model not using workspace index lookups and instead doing `search()` for project names

**Prevention:**
1. **Invest heavily in the system prompt and strategy hints.** The Prime Intellect research shows strategy hints are the single most impactful mitigation. Include explicit examples of good REPL usage patterns:
   - "Use `projects.get('name')` to find a project, not `search('name')`"
   - "Use `read(path, startLine, endLine)` to read specific functions, not entire files"
   - "Call `FINAL(answer)` as soon as you have the answer -- do not continue exploring"
2. **Provide concrete REPL usage examples** in the agent prompt, not just API documentation. Show 2-3 complete fill-solve trajectories for common query types.
3. **Truncate `print()` output aggressively** (2K chars default) and append a hint: `"[truncated at 2000 chars -- use targeted reads instead of dumping full content]"`.
4. **Pre-populate REPL with helper patterns:** Instead of exposing raw `workspace` object, expose high-level query functions (`findProject()`, `findComponent()`, `getDeps()`) that return concise results.
5. **Implement progressive prompt refinement:** If the first 5 iterations show no progress toward FINAL, inject a mid-loop hint: "You have used 5 of 20 iterations. Consider calling FINAL() with your current best answer."
6. **Benchmark model-specific behavior** early. Claude Sonnet may behave differently than expected. Run the same 5 queries against the REPL and measure iteration count, token usage, and answer quality.

**Detection:** Per-query telemetry: iteration count, total tokens, print truncation count, time-to-FINAL. Establish baselines in phase 1 and alert on regression.

**Phase relevance:** Spans all phases. The system prompt and strategy hints should be iterated throughout development. This is a continuous tuning problem, not a one-time fix.

**Confidence:** HIGH -- the training gap is the most consistently cited limitation across the RLM paper, Prime Intellect blog, community implementations, and the project's own synthesis document.

**Sources:**
- [RLM paper: Section 16 limitations](https://arxiv.org/html/2512.24601v1)
- [Prime Intellect: environment tips and strategy hints](https://www.primeintellect.ai/blog/rlm)
- [RLM synthesis: Section 13 community perspectives](D:/projects/github/LayZeeDK/lz-nx-ai-plugins/research/rlm/SYNTHESIS.md)

---

## Moderate Pitfalls

### Pitfall 6: `child_process.execSync` Encoding Mismatch on Windows

**What goes wrong:** `execSync` returns a Buffer by default. When `{ encoding: 'utf8' }` is specified, it decodes as UTF-8. But on Windows, child processes (like `git grep`, `nx`) may output text in the system's legacy code page (cp1252 or cp437), not UTF-8. File paths containing non-ASCII characters, Nx project names with special characters, or git output with unicode branch names produce garbled text.

**Why it happens:** Windows console default code page is cp1252. Node.js `execSync` with `encoding: 'utf8'` assumes the child process outputs UTF-8. When the child process uses the system code page instead, the decoding produces mojibake (garbled characters). This is especially problematic with `git grep` output that includes file paths with accented characters (common in international codebases).

**Prevention:**
1. **Always get raw Buffer first** and decode explicitly: `execSync('command', { encoding: 'buffer' })` then inspect for valid UTF-8 before decoding.
2. **Prepend `chcp 65001 &&`** to commands that need UTF-8 output on Windows, but only when `process.platform === 'win32'`.
3. **For Git Bash on Windows** (which is the shell Claude Code uses), UTF-8 is typically the default. But verify by checking the `LANG` environment variable -- it should contain `UTF-8`.
4. **Set `maxBuffer` on all `execSync` calls.** Default is 200 KB, which is easily exceeded by `git grep` on a 537-project workspace.
5. **Always pass `{ encoding: 'utf8' }` to `execSync`** when running through Git Bash (which does use UTF-8), but test with real data on Windows.

**Detection:** Unit tests with non-ASCII file paths on Windows. CI matrix including Windows.

**Phase relevance:** Affects the workspace indexer and all scripts that shell out to Git or Nx. Establish the encoding convention in phase 1.

**Confidence:** MEDIUM -- well-documented Node.js behavior, but Git Bash mitigates most cases. Risk is real for edge cases.

**Sources:**
- [Node.js help: UTF-8 encoding in child processes](https://github.com/nodejs/help/issues/3781)
- [Node.js child_process docs](https://nodejs.org/api/child_process.html)

---

### Pitfall 7: REPL State Corruption Across Iterations

**What goes wrong:** The Node.js VM REPL persists state via `globalThis` across iterations (by design -- this is the "filling phase" accumulating variables). But this persistence creates mutation hazards: (a) a failed iteration can leave partially initialized variables; (b) `const` re-declarations fail with `SyntaxError` on subsequent iterations; (c) the LLM may overwrite critical REPL globals (like `workspace`, `deps`, `FINAL`) with user variables.

**Why it happens:** The `vm` module's persistent context is a mutable global namespace. There is no mechanism for transactional iteration (rollback on error) or namespace protection for built-in REPL globals. The Hampton-io/RLM and code-rabi/rllm implementations handle this via `globalThis` transformation (`const x = 5` becomes `globalThis.x = 5`) and scaffold restoration after each `exec()`.

**Prevention:**
1. **Transform `const`/`let`/`var` declarations** to `globalThis.xxx = ...` assignments before execution. This prevents re-declaration errors across iterations.
2. **Snapshot REPL globals** before each iteration. After execution, restore any overwritten built-in globals (`workspace`, `projects`, `deps`, `search`, `FINAL`, etc.).
3. **Isolate error recovery:** When a code block throws, capture the error but don't abort the loop. Log the error, restore the scaffold, and let the LLM try again (up to `maxConsecutiveErrors`).
4. **Namespace protection:** Use `Object.defineProperty` with `configurable: false, writable: false` on all built-in REPL globals to prevent accidental overwrite.
5. **Provide `SHOW_VARS()` explicitly** so the LLM can inspect what variables exist before re-declaring.

**Detection:** Test case that declares `const x = 5` in iteration 1 and `const x = 10` in iteration 2 -- verify it succeeds after transformation.

**Phase relevance:** Core REPL engine phase. Ship together with the sandbox.

**Confidence:** HIGH -- documented pattern in Hampton-io/RLM and code-rabi/rllm implementations.

---

### Pitfall 8: Hook Execution Timeout Blocking Claude Code Sessions

**What goes wrong:** Claude Code hooks have a timeout (60 seconds for most hooks). If a SessionStart hook runs the workspace indexer and it takes longer than 60 seconds (plausible for initial indexing of a 537-project workspace with full Nx graph computation), the hook silently fails. The plugin starts without a workspace index, and all REPL operations that depend on it break silently.

**Why it happens:** The workspace indexer calls Nx CLI commands (`nx show projects --json`, `nx graph --print`, per-project `nx show project <name>`) that depend on the Nx daemon. First-run daemon startup on a large workspace is slow. Combined with component/store/service registry scanning (regex over 1,700+ files), the total indexing time can exceed the hook timeout.

**Prevention:**
1. **Make the SessionStart hook a fast "index check" only.** Check if a cached index exists and is fresh (compare file mtimes). If fresh, load it. If stale, trigger indexing in the background.
2. **Split indexing into tiers:**
   - Tier 1 (fast, < 5s): Project names from `nx show projects --json` + path aliases from `tsconfig.base.json`. This is enough for basic REPL operation.
   - Tier 2 (medium, < 30s): Dependency graph from cached `.nx/workspace-data/project-graph.json`.
   - Tier 3 (slow, < 120s): Full component/store/service registries from regex scanning. Run as a background task or on first demand.
3. **Never block on full indexing in a hook.** Start with Tier 1, provide immediate value, and progressively enhance.
4. **Provide clear user feedback** if the index is stale or incomplete: "Workspace index is building in the background. Some features may be limited."

**Detection:** Timer on the SessionStart hook. Log warning if indexing exceeds 10 seconds. Alert if it exceeds 30 seconds.

**Phase relevance:** Workspace indexer phase. The tiered indexing strategy must be designed upfront.

**Confidence:** HIGH -- based on Nx daemon timing data from GitHub issues and Claude Code hook timeout documentation.

**Sources:**
- [Claude Code hooks reference](https://code.claude.com/docs/en/hooks)
- [PostToolUse hooks not executing](https://github.com/anthropics/claude-code/issues/6305)

---

### Pitfall 9: `llm_query()` Sub-Calls Cannot Actually Spawn Claude Subagents from Node.js VM

**What goes wrong:** The REPL design assumes `llm_query()` can invoke Claude API calls from within the sandbox. But the Claude Code plugin architecture does not expose a direct LLM API from Node.js scripts. Plugins interact with Claude through commands, skills, agents (markdown definitions), and hooks -- not through programmatic API calls from arbitrary JavaScript. There is no `claude.complete()` function available in the sandbox.

**Why it happens:** The RLM paper's reference implementation uses a TCP-based LMHandler that routes `llm_query()` to external LLM backends. In the Claude Code plugin context, there is no equivalent infrastructure. Claude Code plugins are declarative (markdown agent definitions, hook scripts that return JSON) rather than imperative (arbitrary API calls from code).

**Consequences:**
- The core RLM mechanism (symbolic recursion via `llm_query()` sub-calls) may not be implementable as designed
- Without sub-calls, the plugin degrades from "RLM" to "REPL with workspace navigation" -- still valuable but missing the recursive component
- Architecture redesign needed mid-development if this limitation is discovered late

**Prevention:**
1. **Design `llm_query()` to dispatch via the Claude Code `Task` tool.** The REPL executor agent (which drives the fill-solve loop) can be instructed to spawn a subagent via `Task` when the REPL code calls `llm_query()`. The flow: REPL code calls `llm_query(prompt)` -> REPL pauses -> executor agent receives the sub-call request -> spawns a Haiku subagent via `Task` tool -> receives result -> injects result back into REPL -> REPL resumes.
2. **Implement as async callback:** The `llm_query()` global in the sandbox returns a Promise. The sandbox executor awaits it. The resolution comes from the agent layer, not from a direct API call.
3. **Prototype this mechanism in phase 1** before building the full REPL. If the Task-based delegation pattern doesn't work (e.g., the 32K output token limit on subagents, or rate limit false positives from issue #27053), the architecture needs to pivot early.
4. **Fallback plan:** If programmatic sub-calls prove infeasible, implement a "single-model REPL" where the root Sonnet agent handles all iterations without sub-delegation. This loses the cost optimization of Haiku sub-calls but preserves the REPL navigation value.

**Detection:** Proof-of-concept in phase 1 that demonstrates: REPL code calls `llm_query()` -> message reaches agent layer -> subagent spawns and returns -> result flows back to REPL.

**Phase relevance:** This is a **go/no-go architectural decision** for phase 1. It determines whether the plugin is a true RLM implementation or a REPL-only tool.

**Confidence:** MEDIUM -- the mechanism is theoretically possible through the Task tool, but no existing Claude Code plugin implements this pattern. The subagent rate limit bug (#27053) and 32K output token cap (#10738) are real risks.

**Sources:**
- [Task tool subagent rate limit bug](https://github.com/anthropics/claude-code/issues/27053)
- [Output token limit not applied to subagents](https://github.com/anthropics/claude-code/issues/10738)
- [Claude Code hooks reference](https://code.claude.com/docs/en/hooks)

---

### Pitfall 10: `nx show project <name> --json` Per-Project Calls at Scale

**What goes wrong:** To build a complete workspace index with target availability (which projects have `build`, `test`, `lint`, `serve`, `e2e`), the indexer needs to call `nx show project <name> --json` for each of 537 projects. Each call takes 1-3 seconds. Sequentially, this is 537-1,611 seconds (9-27 minutes). Even with daemon caching, the initial population is prohibitively slow.

**Why it happens:** `nx show projects --json` returns only project names, not their configuration. `nx graph --print` provides dependency edges but not per-project target configuration. Getting target availability requires per-project queries. There is no bulk API for "show all projects with their targets."

**Prevention:**
1. **Do not call `nx show project` for every project.** Instead, read `project.json` files directly from disk using the project source roots obtained from `nx show projects --json` + workspace layout convention.
2. **Parse `project.json` or `package.json` directly** for target information. Nx infers targets from files (`jest.config.ts` implies `test`, `webpack.config.js` implies `build`), but explicit targets are in `project.json`.
3. **Use the cached project graph** at `.nx/workspace-data/project-graph.json` which contains nodes with their configuration data.
4. **Build target information lazily:** Only resolve targets for a project when the user queries it, not upfront for all 537.

**Detection:** Performance benchmark: the full indexing pipeline must complete in under 30 seconds for 537 projects.

**Phase relevance:** Workspace indexer design phase.

**Confidence:** HIGH -- simple arithmetic (537 calls x 1-3s each = 9-27 minutes) makes this obvious.

---

## Minor Pitfalls

### Pitfall 11: `vm.runInContext` Timeout Performance Overhead

**What goes wrong:** Specifying a `timeout` on `vm.runInContext()` initializes a V8 watchdog thread for every execution. Under load (20 iterations per REPL session, multiple sessions), this creates measurable overhead -- the watchdog initialization is the bottleneck, not the code execution itself.

**Prevention:** Accept the overhead (it is small for a plugin's use case -- 20 iterations, not 1000 concurrent requests). If profiling shows it's an issue, run the VM without timeout and implement external timeout via `setTimeout` + `worker.terminate()` from the parent thread.

**Phase relevance:** Optimization phase, not initial build.

**Confidence:** MEDIUM -- documented in Node.js issue #10453 but likely not significant at plugin scale.

**Sources:**
- [VM timeout performance impact](https://github.com/nodejs/node/issues/10453)
- [VM timeout with watchdog thread](https://github.com/nodejs/node/issues/52261)

---

### Pitfall 12: Nx `project.json` vs. Inferred Targets Confusion

**What goes wrong:** Nx workspaces can define targets in `project.json` (explicit) or infer them from file presence (e.g., `jest.config.ts` -> `test` target). When the workspace indexer reads `project.json` directly (bypassing Nx), it may miss inferred targets. The REPL then reports "project X has no test target" when it actually does.

**Prevention:** Prefer reading from the Nx project graph cache (`.nx/workspace-data/project-graph.json`) which includes both explicit and inferred targets. Fall back to `nx show project <name> --json` (which resolves inferred targets) only when the cache is stale.

**Phase relevance:** Workspace indexer design phase.

**Confidence:** MEDIUM -- depends on the target workspace's configuration style. The Connect monolith likely uses explicit `project.json` targets, but this should be verified.

---

### Pitfall 13: Handle Store Memory Leaks

**What goes wrong:** The handle-based result storage (`$res1: Array(537) [preview...]`) keeps large result sets in a Map. If handles are never cleaned up (e.g., REPL session runs 20 iterations, each producing large results), memory grows unbounded within a session.

**Prevention:** Implement a generation-based cleanup: results from iterations older than 5 iterations ago are eligible for garbage collection. Alternatively, cap the handle store at 50 entries and evict LRU.

**Phase relevance:** Handle store implementation phase.

**Confidence:** MEDIUM -- only a problem for long REPL sessions with large intermediate results.

---

### Pitfall 14: PostToolUse Hooks Silently Failing on Windows

**What goes wrong:** PostToolUse and PreToolUse hooks were reported to silently fail to execute on Windows. The hooks are configured correctly in `hooks.json` but never fire. This was tracked as a bug in Claude Code that was fixed by using Git Bash instead of cmd.exe, but regressions have occurred.

**Prevention:**
1. Test all hooks on Windows explicitly during development.
2. Include a "hook health check" in the SessionStart hook that verifies all configured hooks are responsive.
3. Log hook invocations to a file so silent failures can be detected post-hoc.

**Phase relevance:** Any phase that adds hooks.

**Confidence:** MEDIUM -- the fix was deployed but regressions are possible given the multiple open Windows path issues.

**Sources:**
- [PostToolUse hooks not executing](https://github.com/anthropics/claude-code/issues/6305)

---

### Pitfall 15: Error Cascading in Recursive Sub-Calls

**What goes wrong:** In a recursive RLM stack, a hallucination or error in a leaf node (sub-LLM call) propagates upward. Unlike attention (which ensembles information), a discrete function call returns a hard decision. If a Haiku sub-call returns incorrect information, the root Sonnet agent trusts it as fact and builds on it.

**Prevention:**
1. **Implement verification for critical sub-call results.** For factual queries (file paths, dependency relationships), verify the result against the workspace index before using it.
2. **Use deterministic operations over LLM sub-calls when possible.** If `search()` can answer the question, do not use `llm_query()`.
3. **Log all sub-call inputs and outputs** for debugging. When the final answer is wrong, the trajectory log reveals which sub-call introduced the error.

**Phase relevance:** All phases involving `llm_query()` sub-calls.

**Confidence:** HIGH -- documented in the RLM paper and confirmed by community experience.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| REPL sandbox (`repl-sandbox.mjs`) | VM sandbox escape via prototype chain (Pitfall 1) | Freeze all objects, `Object.create(null)` context, `codeGeneration: false` |
| REPL sandbox (`repl-sandbox.mjs`) | REPL state corruption across iterations (Pitfall 7) | Transform declarations, snapshot globals, namespace protection |
| Execution loop | Infinite loops / timeout evasion (Pitfall 2) | Four-layer guards, Worker Thread isolation, stale loop detection |
| Execution loop | Models underutilize REPL (Pitfall 5) | Strategy hints, concrete examples, progressive prompt refinement |
| Workspace indexer | Nx daemon timeout/OOM (Pitfall 4) | Tiered indexing, cached graph, never block on full index |
| Workspace indexer | Per-project call scaling (Pitfall 10) | Read `project.json` directly, use cached project graph |
| Workspace indexer | Hook timeout on SessionStart (Pitfall 8) | Fast index check, background indexing, tiered loading |
| `llm_query()` integration | Sub-calls may not be feasible in Claude Code (Pitfall 9) | Prototype Task-based delegation in phase 1, have fallback plan |
| Cross-platform scripts | Path separator corruption on Windows (Pitfall 3) | Node.js for all path operations, forward slashes, CI matrix |
| Cross-platform scripts | `execSync` encoding mismatch on Windows (Pitfall 6) | Raw Buffer decoding, explicit encoding, maxBuffer |
| All hook phases | PostToolUse silent failures on Windows (Pitfall 14) | Windows CI, hook health check, invocation logging |
| Handle store | Memory leaks from accumulated results (Pitfall 13) | Generation-based cleanup, entry cap, LRU eviction |

---

## Sources

### Node.js VM Security
- [Snyk: Security concerns of JavaScript sandbox with Node.js VM module](https://snyk.io/blog/security-concerns-javascript-sandbox-node-js-vm-module/)
- [CVE-2025-68613: n8n sandbox escape deep dive](https://www.penligent.ai/hackinglabs/cve-2025-68613-deep-dive-how-node-js-sandbox-escapes-shatter-the-n8n-workflow-engine/)
- [CVE-2026-22709: vm2 critical sandbox escape](https://www.endorlabs.com/learn/cve-2026-22709-critical-sandbox-escape-in-vm2-enables-arbitrary-code-execution)
- [Escaping Node.js VM (gist)](https://gist.github.com/jcreedcmu/4f6e6d4a649405a9c86bb076905696af)
- [Node.js vm.Script timeout issue](https://github.com/nodejs/node/issues/20982)
- [VM timeout performance impact](https://github.com/nodejs/node/issues/52261)
- [VM timeout is much slower](https://github.com/nodejs/node/issues/10453)

### Claude Code Plugin Issues
- [Plugin bash hooks fail on Windows: CLAUDE_PLUGIN_ROOT](https://github.com/anthropics/claude-code/issues/18527)
- [CLAUDE_PLUGIN_ROOT backslashes stripped on Windows](https://github.com/anthropics/claude-code/issues/22449)
- [Windows Git Bash recurring command issues](https://github.com/anthropics/claude-code/issues/29346)
- [PostToolUse hooks not executing](https://github.com/anthropics/claude-code/issues/6305)
- [Task tool subagent rate limit bug](https://github.com/anthropics/claude-code/issues/27053)
- [Output token limit not applied to subagents](https://github.com/anthropics/claude-code/issues/10738)
- [Claude Code hooks reference](https://code.claude.com/docs/en/hooks)

### Nx CLI Edge Cases
- [Nx daemon OOM on project graph](https://github.com/nrwl/nx/issues/26786)
- [Nx tasks hanging 30+ minutes](https://github.com/nrwl/nx/issues/28487)
- [Slow project graph calculation in Nx v21](https://github.com/nrwl/nx/issues/32265)
- [Nx Daemon documentation](https://nx.dev/docs/concepts/nx-daemon)
- [Add JSON output to nx show projects](https://github.com/nrwl/nx/issues/21602)

### RLM Limitations
- [RLM paper: arxiv.org/abs/2512.24601](https://arxiv.org/abs/2512.24601)
- [Prime Intellect: RLM paradigm of 2026](https://www.primeintellect.ai/blog/rlm)
- [RLM synthesis (project research)](D:/projects/github/LayZeeDK/lz-nx-ai-plugins/research/rlm/SYNTHESIS.md)

### Cross-Platform
- [Node.js help: UTF-8 encoding in child processes](https://github.com/nodejs/help/issues/3781)
- [Node.js child_process documentation](https://nodejs.org/api/child_process.html)
- [Fixing Claude Code's PowerShell problem with hooks](https://blog.netnerds.net/2026/02/claude-code-powershell-hooks/)
