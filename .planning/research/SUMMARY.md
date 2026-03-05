# Project Research Summary

**Project:** lz-nx.rlm -- RLM-powered Claude Code plugin for Nx JS/TS workspaces
**Domain:** Recursive Language Model (RLM) codebase navigation plugin
**Researched:** 2026-03-04
**Confidence:** HIGH

## Executive Summary

This plugin implements the Recursive Language Model (RLM) paradigm for Nx monorepo navigation inside Claude Code. RLM externalizes context into a persistent JavaScript REPL sandbox, letting the AI iteratively execute code against a workspace graph index rather than loading entire codebases into its context window. Four reference implementations (hampton-io/RLM, code-rabi/rllm, yogthos/Matryoshka, and the original Python RLM) confirm the pattern is viable and well-understood at the source-code level. The stack is deliberately minimal: Node.js 24.1+ only, zero npm dependencies, `node:vm` for sandboxing, and the Nx CLI as the single external dependency. The core innovation is treating the Nx project graph as a structured navigable object rather than flat text, which no existing RLM plugin does.

The recommended approach builds in three sequential phases: Foundation Scripts (workspace indexer, path resolver, Nx CLI wrapper, deterministic commands), REPL Core (VM sandbox with workspace-aware globals), and Agent Integration (the repl-executor subagent driving the fill/solve loop). This order follows the strict dependency chain: the workspace index must exist before the REPL sandbox can be initialized, and the sandbox must work before agent integration can be validated. The `llm_query()` sub-LLM call feature is explicitly deferred to a later milestone because Claude Code's subagent nesting constraint (a subagent cannot spawn another subagent) makes it non-trivial to implement, and the core token-saving hypothesis can be validated without it.

The primary risk is the VM sandbox implementation, which has four critical pitfalls that can each cause complete failure: the naive `const/let -> globalThis` regex transformation that breaks destructuring and for-loops; async IIFE timeout escape combined with the `microtaskMode: 'afterEvaluate'` deadlock bug (nodejs/node#55546, open in Node.js 22-25+); prototype chain escape through injected objects; and the four-mode `FINAL()` termination brittleness in the execution loop. All four are well-understood with proven mitigations from the reference implementations. The mitigation pattern throughout is to follow hampton-io/RLM closely for the sandbox implementation and apply the `Promise.race` timeout pattern instead of relying on the broken `microtaskMode`.

## Key Findings

### Recommended Stack

The stack is fully validated at the API level. Node.js 24.1+ is the runtime, with `node:vm` for the REPL sandbox, `node:fs/promises` `glob` for file discovery, `node:child_process` `execSync` for Nx CLI calls, and `node:test` for testing. The zero-dependency constraint is firm: all features can be implemented with built-in Node.js APIs, and every npm dependency considered was rejected in favor of a built-in alternative.

API-level research surfaced several implementation-critical constraints: `microtaskMode: 'afterEvaluate'` must not be used (open deadlock bug nodejs/node#55546), `vm.constants.DONT_CONTEXTIFY` must not be used (conflicts with mutable globalThis requirement for variable persistence), `execSync` with `shell: true` (default) is correct for Windows `.cmd` file resolution, and `fs.glob` requires Node.js 24.1+ to avoid the spurious ExperimentalWarning from 24.0.0. The `Error.isError()` method (TC39 Stage 4, available in Node.js 24+ via V8 13.4) must replace `instanceof Error` for cross-realm error detection across the VM context boundary.

**Core technologies:**
- `node:vm` (Node.js 24.1+): REPL sandbox -- use `codeGeneration: { strings: false, wasm: false }` and standard contextify (not DONT_CONTEXTIFY); blocks `eval()` and WASM; does NOT block prototype chain escape
- `node:fs/promises` `glob`: File discovery -- stable since 24.1.0; normalize all returned paths with `.replace(/\\/g, '/')` on Windows; use forward slashes in patterns
- `node:child_process` `execSync`: Nx CLI integration -- use `shell: true` (default) for Windows `.cmd` support; pass env vars via `env` option; never embed env vars in shell syntax
- `node:test`: Testing -- stable since Node.js 20.x; mock `execSync` to avoid requiring a real Nx workspace
- `Error.isError()` / `util.types.isNativeError()`: Cross-realm error detection -- TC39 Stage 4; replaces fragile `instanceof Error` that always fails across VM context boundaries
- `HandleStore` (pure JS, no npm): Token savings -- in-memory Map with size threshold and stub generation; not a separate component; 97% token savings on large collections confirmed by Matryoshka

### Expected Features

All P0 features must ship together as v0.0.1 -- they form a single dependency chain, and omitting any one breaks the core validation hypothesis.

**Must have (table stakes -- v0.0.1):**
- Workspace indexer -- builds `workspace-index.json` from Nx CLI; foundation for all other features
- Path resolver -- bidirectional tsconfig alias resolution; required for `read()` global
- REPL sandbox -- Node.js VM with 12 workspace-aware globals (`workspace`, `projects`, `deps()`, `dependents()`, `read()`, `files()`, `search()`, `nx()`, `FINAL()`, `FINAL_VAR()`, `print()`, `SHOW_VARS()`)
- globalThis persistence -- `const/let -> globalThis` transformation enabling variable persistence across REPL iterations (the "handle store" mechanism, not a separate component)
- Smart `print()` truncation -- large results shown as compact stubs, preventing context flooding
- Execution loop with robust termination -- fill/solve cycle with all four failure-mode guards (maxIterations, maxTimeout, maxErrors, stale-loop detection)
- RLM configuration/guardrails -- `maxIterations` (20), `maxTimeout` (120s), `maxErrors` (3)
- Nx CLI wrapper -- allowlisted read-only commands (`show`, `graph`, `list`, `report`, `affected --print`)
- Explore skill -- primary user-facing RLM Q&A capability
- repl-executor agent -- Sonnet subagent driving the REPL loop in isolated context
- Deterministic commands -- `/deps`, `/find`, `/alias` (zero LLM tokens)

**Should have (competitive -- later milestone):**
- `llm_query()` via direct Anthropic API script -- deferred due to subagent nesting constraint; implement as a Node.js script calling the Anthropic API directly (ANTHROPIC_API_KEY is available from Claude Code)
- haiku-searcher agent -- cost optimization target for `llm_query()`
- Strategy hints injection -- workspace-specific REPL tips; shown by Prime Intellect research to significantly improve model behavior
- SessionStart hook -- auto-index rebuild on workspace change
- Impact analysis skill (`/impact`)

**Defer (later milestones):**
- Angular-specific component registries -- framework lock-in risk; `search()` covers the workspace navigation use cases
- Agent teams / parallel sub-LLM processing
- Token benchmarking and `/status` command
- MCP server integration -- explicitly anti-feature; Nx themselves deleted MCP tools in favor of skills (documented in their blog)
- Semantic/vector search -- requires external embedding model and vector database; `git grep` (via `spawnSync` with `shell: false`) + workspace index covers the use cases; Node.js built-in fallback for non-git environments (see `.planning/quick/1-research-and-analyze-git-grep-and-altern/ANALYSIS.md`)
- Persistent cross-session memory -- the workspace index IS the persistent memory (rebuilt deterministically from Nx CLI)
- S-expression DSL -- JavaScript is more natural for Nx/TS workspaces; Claude generates it fluently

### Architecture Approach

The system has four layers: User Layer (skill/command invocation), Agent Layer (repl-executor subagent), Script Layer (Node.js scripts with zero LLM tokens), and External Layer (Nx CLI, filesystem, git). The defining architectural decision is the per-invocation process model: each REPL turn spawns a fresh `node` process that reads session state from `.cache/repl-session-<id>.json`, executes one code block in a VM context loaded with the workspace index, writes updated state, and exits. This avoids IPC complexity (Claude Code's Bash tool cannot communicate with a running process) while providing crash isolation and explicit state management.

The handle store is not a separate component. It is the combination of `globalThis` persistence (via `const/let` transformation) and smart truncation in `print()`. The LLM navigates large collections (537 projects, 1700 file paths) via JavaScript code that filters and reads selectively -- the truncated stub in `print()` output shows what is available without flooding context. Only the print output is truncated; the full data remains in `globalThis` and the session state JSON.

**Major components (in build dependency order):**
1. `rlm-config.mjs` -- guardrails configuration with defaults; no dependencies; build first
2. `nx-runner.mjs` -- Nx CLI wrapper with allowlist, timeout, package-manager detection; depends on rlm-config
3. `workspace-indexer.mjs` -- builds JSON index from Nx CLI; depends on nx-runner
4. `path-resolver.mjs` -- tsconfig alias resolution; depends on workspace index schema
5. `handle-store.mjs` -- in-memory Map with size threshold and stub generation; no dependencies
6. `repl-sandbox.mjs` -- Node.js VM with 12 workspace globals, `const/let` transform, async IIFE, `Promise.race` timeout, Object.prototype.toString patch, cross-realm error detection; depends on all above
7. `agents/repl-executor.md` -- Sonnet subagent driving the fill/solve loop; depends on repl-sandbox.mjs
8. `skills/explore/SKILL.md` -- primary user-facing skill; depends on repl-executor
9. `commands/deps.md`, `find.md`, `alias.md` -- deterministic zero-LLM commands; depend only on workspace index

### Critical Pitfalls

1. **`const/let -> globalThis` regex breaks destructuring and for-loops** -- The simple regex `\b(const|let)\s+(\w+)\s*=/g` produces `SyntaxError` on `const { a, b } = obj`, `const [x, y] = arr`, `for (const [k, v] of map)`, and silently loses variables in multi-declarations. The LLM wastes 2-5 iterations debugging phantom syntax errors it did not create. Prevention: use AST-based transformation (acorn/meriyah) for v0.0.1 if LLM-generated code shows destructuring patterns; or document the limitation and add a REPL system prompt hint instructing the LLM to use simple assignments. Test against 20+ LLM-generated code samples before shipping.

2. **Async IIFE timeout escape + `microtaskMode: 'afterEvaluate'` deadlock** -- `vm.runInContext({ timeout })` only applies to synchronous execution; the async IIFE returns a Promise immediately and the timeout no longer applies. `microtaskMode: 'afterEvaluate'` appears to be the fix but causes an unresolved deadlock with `async/await` (nodejs/node#55546, open, affects Node.js 22-25+). Prevention: use `Promise.race([resultPromise, timeoutPromise])` in the host for async timeout. Apply `vm.Script` timeout only for the synchronous phase (tight infinite loops). Never use `microtaskMode: 'afterEvaluate'`.

3. **Prototype chain escape through injected objects** -- Any object injected into the VM context provides `this.constructor.constructor("return process")()` as an escape vector. `codeGeneration: { strings: false }` blocks `Function("...")` but not the constructor chain traversal. Prevention: use `Object.create(null)` as the sandbox base, wrap all REPL globals as arrow functions (no `.prototype`), deep-freeze all injected data objects. Add automated escape payload tests to CI. Document that `node:vm` provides scope isolation for trusted LLM code, not adversarial sandboxing.

4. **`FINAL()` termination brittleness with four failure modes** -- The LLM can: (a) call `FINAL()` inside a dead code branch, (b) call it prematurely before any workspace exploration, (c) generate repeated identical code blocks in a stuck loop, (d) produce `FINAL("[object Object]")` via implicit string coercion. Prevention: implement the full four-layer guard stack (maxIterations=20, maxTimeout=120s, maxErrors=3, stale-loop detection with 3-iteration window), apply the Object.prototype.toString patch, require `codeExecutedCount >= 2` before accepting FINAL, inject mid-loop hints at iteration 10.

5. **`llm_query()` cannot directly spawn Claude subagents from Node.js scripts** -- The repl-executor is already a subagent; Claude Code does not support nested subagent spawning. Prevention: defer `llm_query()` to a later milestone. For that milestone, implement via a Node.js script that calls the Anthropic API directly using `ANTHROPIC_API_KEY` (available from Claude Code). The core RLM value proposition validates with Sonnet-only reasoning and deterministic globals.

## Implications for Roadmap

The component dependency graph is a strict linear chain that dictates phase order. The workspace index must exist before the REPL sandbox, and the sandbox must work before agent integration. Deterministic commands are moved to Phase 1 (not deferred as initially proposed in ARCHITECTURE.md) because they depend only on the workspace index and deliver immediate user value.

### Phase 1: Foundation Scripts + Deterministic Commands

**Rationale:** The workspace index is the foundation for every other component. All Phase 1 work produces Node.js scripts with no LLM interaction, making it the lowest-risk phase with the clearest success criteria: `node scripts/workspace-indexer.mjs --build` must produce a valid JSON index, and the three deterministic commands must return correct output. Shipping commands here means users get immediate value even before the REPL loop works.

**Delivers:** `rlm-config.mjs`, `nx-runner.mjs`, `workspace-indexer.mjs`, `path-resolver.mjs`, and the `.cache/workspace-index.json` index. Also delivers `commands/deps.md`, `commands/find.md`, `commands/alias.md` since they depend only on the index.

**Addresses (from FEATURES.md):** Workspace indexer, path resolver, Nx CLI wrapper, RLM configuration, deterministic commands -- all P0, all LOW-MEDIUM implementation complexity.

**Avoids (from PITFALLS.md):**
- Pitfall 7: Git Bash MSYS2 path munging -- use `spawnSync` with `shell: false` and argument arrays for `git grep` (confirmed by cross-platform search analysis in `.planning/quick/1-research-and-analyze-git-grep-and-altern/ANALYSIS.md`)
- Pitfall 8: `cmd.exe` default shell -- set env vars via the `env` option, never shell syntax
- Pitfall 9: `fs.glob` backslash paths -- normalize immediately with `.replace(/\\/g, '/')`
- Pitfall 13: Nx output `\r\n` line endings -- strip `\r` from all `execSync` output
- Pitfall 14: `CLAUDE_PLUGIN_ROOT` backslash corruption -- resolve paths via `import.meta.url`
- Pitfall 17: Nx daemon OOM on large workspaces -- use `nx show projects --json` first, then per-project incremental; never `nx graph --print` in a hook; set `maxBuffer: 10MB`

### Phase 2: REPL Core

**Rationale:** The VM sandbox is the highest-complexity, highest-risk component. It contains four critical pitfalls that require careful implementation and testing before any agent integration can proceed. Building the sandbox first and testing it thoroughly with unit tests and the smoke test script (defined in STACK.md) eliminates the largest source of failure before it becomes entangled with agent behavior. The sandbox can be tested without any LLM by passing JavaScript code via stdin and asserting the SandboxResult JSON output.

**Delivers:** `handle-store.mjs` and `repl-sandbox.mjs` implementing the full 12-global workspace-aware REPL. The sandbox must: execute JavaScript in an isolated VM context, load the workspace index as the `workspace` global, persist variables across turns via session state JSON, and return SandboxResult JSON on stdout.

**Uses (from STACK.md):** `node:vm` with `codeGeneration: { strings: false, wasm: false }`, async IIFE pattern, `Promise.race` timeout (not `microtaskMode`), `Error.isError()` for cross-realm error detection, Object.prototype.toString patch, `const/let -> globalThis` transformation.

**Avoids (from PITFALLS.md):**
- Pitfall 1: `const/let` regex -- document edge cases, add REPL hint, plan AST upgrade if needed
- Pitfall 2: Async timeout escape -- `Promise.race` pattern; never `microtaskMode: 'afterEvaluate'`
- Pitfall 3: Prototype chain escape -- `Object.create(null)` base, arrow function globals, deep-freeze injected data
- Pitfall 6: Cross-realm `instanceof Error` -- use `Error.isError()` / `util.types.isNativeError()`
- Pitfall 10: Handle store memory growth -- cap at 50 entries, size-cap individual handles at 100KB
- Pitfall 12: VM context memory leaks -- reuse one context per session; null out references on session end
- Pitfall 16: `vm.Script` constructor timeout ignored -- always pass timeout to `.runInContext()`, not the constructor
- Pitfall 19: Path mismatch between indexer and `read()` -- resolve relative paths against workspace root in the `read()` global
- Pitfall 20: Model confusion from handle stubs -- add handle usage examples to the REPL system prompt

### Phase 3: Agent Integration

**Rationale:** With the sandbox validated, agent integration is the next step. The repl-executor subagent drives the fill/solve loop, which has four documented termination failure modes that require the complete state machine to be implemented and tested. This phase validates the core RLM thesis: does the plugin actually answer questions about the Nx workspace using fewer tokens than dumping the workspace into context? If yes, the architecture is sound. If no, the approach needs rethinking before adding more features.

**Delivers:** `agents/repl-executor.md` implementing the fill/solve loop with the four-layer termination state machine, and `skills/explore/SKILL.md` as the primary user-facing skill. The milestone is: `/lz-nx.rlm:explore "How many projects are there?"` returns a correct, distilled answer.

**Implements (from ARCHITECTURE.md):** Agent Layer and Skill Layer. Validates the complete data flow from skill invocation through agent spawning, REPL iterations, and FINAL answer return to the main conversation.

**Avoids (from PITFALLS.md):**
- Pitfall 4: FINAL() termination brittleness -- all four guards (maxIterations, maxTimeout, maxErrors, stale-loop detection) must ship together with the loop
- Pitfall 5: llm_query() subagent nesting -- deferred; Sonnet handles all reasoning
- Pitfall 11: Subagent context limits -- aggressive output truncation (2KB per print), handle stubs, maxIterations=20
- Pitfall 18: YAML frontmatter gotchas -- validate frontmatter, avoid consecutive `@~/` references, test on Windows

### Phase Ordering Rationale

- Strict dependency order (config -> runner -> indexer -> sandbox -> agent -> skill) makes parallelization impossible without the foundation in place.
- Deterministic commands moved from Phase 4 to Phase 1: they depend only on the workspace index (which Phase 1 builds), deliver immediate user value, and validate the index format from a different angle than the REPL.
- Agent integration (Phase 3) is the highest-risk integration and reaches it as early as possible, after the sandbox is validated in isolation.
- Later milestone features (`llm_query()`, haiku-searcher, hooks, strategy hints) form a natural second milestone after v0.0.1 validation.

### Research Flags

Phases needing deeper research during planning:
- **Phase 2 (REPL Core):** The `const/let -> globalThis` transformation approach needs a final decision before implementation begins: simple regex (known edge cases, zero dependencies) vs. AST parser (correct, adds acorn dependency). Suggested resolution: run 20+ real LLM-generated REPL samples through the regex and count destructuring failures. If > 5%, add acorn.
- **Phase 3 (Agent Integration):** The exact REPL system prompt, handle stub format, and mid-loop hint wording require empirical calibration with real Sonnet responses on real Nx workspace queries. Plan for 1-2 iteration cycles (implement -> test -> refine) before Phase 3 is considered done.

Phases with standard patterns (can skip research-phase):
- **Phase 1 (Foundation Scripts):** All components follow documented Node.js API patterns. The workspace indexer follows `nx show projects/project --json`. Path resolver follows standard `tsconfig.base.json` parsing. No unknown territory.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All API decisions verified against Node.js v24.x official docs and open issue tracker. Key findings (no DONT_CONTEXTIFY, no microtaskMode, Promise.race timeout, Error.isError) each tied to a specific open issue or official doc section. Minor uncertainty: fs.glob edge cases suggested by the globSync inconsistency bug (nodejs/node#61257). |
| Features | HIGH | All API contracts derived from direct source code reading of four reference implementations (not secondary documentation). Feature dependencies, anti-features, and the llm_query() deferral decision each confirmed by multiple implementation examples. |
| Architecture | HIGH | Per-invocation process model, SandboxResult schema, session state JSON, and component build order derived from actual reference implementation source code analysis. The handle-store-as-globalThis insight eliminates the proposed separate handle-store component. All six error boundaries have documented detection and recovery strategies. |
| Pitfalls | HIGH | 20 documented pitfalls with specific Node.js issue numbers (confirmed open), CVE references (confirmed published), MSYS2 documentation links, and Claude Code GitHub issue numbers. Phase-specific warning table maps each pitfall to where it will be encountered. All four critical pitfalls confirmed across multiple reference implementations. |

**Overall confidence:** HIGH

### Gaps to Address

- **`const/let` transformation approach:** Simple regex vs. AST parser decision is documented but not resolved. Resolution needed before Phase 2 implementation. Run empirical corpus test during Phase 2 planning.
- **REPL system prompt calibration:** Exact wording for handle stub explanations, strategy hints, and termination instructions requires empirical validation with real Sonnet behavior on real Nx workspace queries. Plan iterative refinement during Phase 3.
- **`llm_query()` API key accessibility:** When implemented in a later milestone, the assumption is `ANTHROPIC_API_KEY` is available in the Node.js script environment from Claude Code. Verify this assumption before that milestone's planning begins.
- **Nx daemon behavior on 537-project workspace:** The incremental indexing approach mitigates the documented OOM risk, but empirical testing on the actual target workspace is needed during Phase 1.
- **Subagent auto-compaction empirical behavior:** The auto-compaction threshold and what is lost during compaction needs empirical testing with real REPL sessions during Phase 3.

## Sources

### Primary (HIGH confidence)

**Reference Implementation Source Code (directly read):**
- `hampton-io/RLM/src/sandbox/vm-sandbox.ts` -- VM sandbox, const/let transform, async IIFE, Object.prototype.toString patch, FINAL detection, pending query queue
- `code-rabi/rllm/src/sandbox.ts` -- SandboxResult format, cross-realm error handling, variable capture
- `yogthos/Matryoshka/src/engine/nucleus-engine.ts` -- handle store design, RESULTS binding, stale loop detection
- `alexzhang13/rlm/rlm/core/rlm.py` -- canonical RLM loop, FINAL protocol, consecutive error tracking

**Node.js Official Documentation (verified):**
- [Node.js v24.x vm module](https://nodejs.org/docs/latest-v24.x/api/vm.html) -- createContext options, DONT_CONTEXTIFY, microtaskMode
- [Node.js v24.x fs module](https://nodejs.org/docs/latest-v24.x/api/fs.html) -- fs.glob API, stability status
- [Node.js v24.1.0 Release Notes](https://nodejs.org/en/blog/release/v24.1.0) -- fs.glob ExperimentalWarning fix

**Node.js Issue Tracker (verified open issues):**
- [nodejs/node#55546](https://github.com/nodejs/node/issues/55546) -- microtaskMode afterEvaluate deadlocks async/await (OPEN, Node.js 22-25+)
- [nodejs/node#3020](https://github.com/nodejs/node/issues/3020) -- Promises escape vm.runInContext timeout (OPEN since 2015)
- [nodejs/node#20982](https://github.com/nodejs/node/issues/20982) -- vm.Script timeout silently ignored on constructor

**TC39 / ECMAScript:**
- [tc39/proposal-is-error](https://github.com/tc39/proposal-is-error) -- Stage 4, ES2026, available in Node.js 24+ via V8 13.4

### Secondary (MEDIUM confidence)

**RLM Research:**
- [RLM paper (arXiv:2512.24601)](https://arxiv.org/abs/2512.24601) -- theoretical foundation, Section 16 limitations (termination brittleness, training gap)
- [Prime Intellect: RLM paradigm of 2026](https://www.primeintellect.ai/blog/rlm) -- strategy hints importance, environment tips

**Claude Code Plugin System:**
- [Claude Code subagent docs](https://code.claude.com/docs/en/sub-agents) -- subagent nesting constraint
- [claude-code#27053](https://github.com/anthropics/claude-code/issues/27053) -- Task tool rate limit bug
- [claude-code#18527](https://github.com/anthropics/claude-code/issues/18527), [#22449](https://github.com/anthropics/claude-code/issues/22449) -- CLAUDE_PLUGIN_ROOT backslash issues

**Cross-Platform:**
- [MSYS2 Filesystem Paths](https://www.msys2.org/docs/filesystem-paths/) -- MSYS_NO_PATHCONV, argument conversion behavior

**Nx CLI:**
- [Nx daemon OOM (#26786)](https://github.com/nrwl/nx/issues/26786), [hanging tasks (#28487)](https://github.com/nrwl/nx/issues/28487) -- large workspace behavior

### Tertiary (LOW confidence)

**Subagent context limits:**
- [Claude Code context buffer analysis](https://claudefa.st/blog/guide/mechanics/context-buffer-management) -- auto-compaction behavior; needs empirical validation with real REPL sessions

---

> **Correction (2026-03-05):** This document uses "zero LLM tokens" when describing deterministic commands (lines 47, 80) and the Script Layer (line 67). The Script Layer description is accurate — the Node.js scripts make no LLM calls. However, the command descriptions conflate two invocation paths: (1) the REPL sandbox path, where script functions are imported as VM globals and called programmatically (genuinely zero model involvement), and (2) the Claude Code command path, where the model reads the command markdown, invokes Bash, and processes output. `disable-model-invocation: true` only prevents Claude from *automatically* invoking commands — it does not bypass model processing when users invoke them. See CLI-01 in REQUIREMENTS.md for standalone CLI tracking.

*Research completed: 2026-03-04*
*Ready for roadmap: yes*
