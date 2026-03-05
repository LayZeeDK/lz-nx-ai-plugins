---
phase: 02-repl-core
plan: 02
subsystem: repl
tags: [vm, sandbox, globals, session, timeout, security, tdd]

# Dependency graph
requires:
  - phase: 02-repl-core
    plan: 01
    provides: transformDeclarations, createPrintCapture, loadConfig, readSession/writeSession
  - phase: 01-foundation
    provides: runNx, workspace index schema, vitest test infrastructure
provides:
  - createReplGlobals factory for all 12 workspace-aware REPL globals
  - BUILTIN_GLOBAL_NAMES set for session/SHOW_VARS filtering
  - executeSandbox function for isolated VM code execution with SandboxResult contract
  - CLI entry point for stdin code -> stdout JSON execution
affects: [03-agent, repl-executor, Phase 3 agent loop driver]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "VM context isolation with codeGeneration blocking for eval/Function security"
    - "Object.prototype.toString patch for JSON in string concatenation (Hampton-io)"
    - "Reverse adjacency list built once at factory creation for O(1) dependents lookup"
    - "Config-driven VM timeout with explicit option override"
    - "CLI entry point guarded by process.argv check for testability"

key-files:
  created:
    - plugins/lz-nx.rlm/scripts/shared/repl-globals.mjs
    - plugins/lz-nx.rlm/scripts/repl-sandbox.mjs
    - tests/lz-nx.rlm/src/test/repl-globals.test.ts
    - tests/lz-nx.rlm/src/test/repl-sandbox.test.ts
  modified: []

key-decisions:
  - "SHOW_VARS takes sandbox as parameter rather than closing over it -- allows the sandbox object to be built incrementally before SHOW_VARS is wired in"
  - "CLI entry point guard checks both filename suffix and --index arg presence to avoid false positives during test imports"

patterns-established:
  - "Factory function returning all globals as plain object -- testable without VM context"
  - "SandboxResult contract: { output, variables, final, finalVar, error } -- consumed by Phase 3 loop driver"
  - "Session state round-trip: readSession -> VM execution -> writeSession per turn"

requirements-completed: [REPL-01, REPL-02, REPL-04]

# Metrics
duration: 6min
completed: 2026-03-05
---

# Phase 02 Plan 02: REPL Sandbox Engine Summary

**VM sandbox execution engine with 12 workspace-aware globals, SandboxResult JSON contract, session state persistence, config-driven timeout, and eval/Function code generation blocking**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-05T22:01:56Z
- **Completed:** 2026-03-05T22:08:49Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- createReplGlobals factory produces all 12 workspace-aware globals (workspace, projects, deps, dependents, read, files, search, nx, print, SHOW_VARS, FINAL, FINAL_VAR) with BUILTIN_GLOBAL_NAMES set
- executeSandbox runs JS in isolated VM context with code transform integration, session state persistence, FINAL/FINAL_VAR termination, Object.prototype.toString patch, and config-driven timeout
- CLI entry point reads stdin, parses --session/--index/--timeout/--plugin-root/--workspace-root args, writes SandboxResult JSON to stdout
- eval() and new Function() blocked by codeGeneration: { strings: false, wasm: false }
- All 199 tests pass (154 Phase 1 + 45 Phase 2)

## Task Commits

Each task was committed atomically using TDD (test then feat):

1. **Task 1: REPL globals factory**
   - `cd77d4e` (test) - add failing tests for repl-globals (26 tests)
   - `1cf42e5` (feat) - implement REPL globals factory

2. **Task 2: REPL sandbox execution engine**
   - `fef38af` (test) - add failing tests for repl-sandbox (19 tests)
   - `3ae40c3` (feat) - implement REPL sandbox execution engine

## Files Created/Modified
- `plugins/lz-nx.rlm/scripts/shared/repl-globals.mjs` - Factory for all 12 REPL globals with reverse adjacency list for dependents, git ls-files/grep wrappers, runNx wrapper, SHOW_VARS formatter
- `plugins/lz-nx.rlm/scripts/repl-sandbox.mjs` - VM execution engine: executeSandbox(code, options) -> SandboxResult, plus CLI stdin/stdout entry point
- `tests/lz-nx.rlm/src/test/repl-globals.test.ts` - 26 tests covering all globals in isolation with mocked spawnSync/readFileSync/runNx
- `tests/lz-nx.rlm/src/test/repl-sandbox.test.ts` - 19 tests covering VM execution, session persistence, FINAL/FINAL_VAR, timeout, security, config-driven timeout

## Decisions Made
- SHOW_VARS accepts sandbox as parameter rather than closing over it in the factory -- this allows the sandbox object to be built incrementally (session state + globals + console) before SHOW_VARS is wired in as a no-argument closure on the sandbox
- CLI entry point guard checks both filename suffix and --index arg presence to prevent false activation during test module imports
- extractState in sandbox uses the same filtering logic as writeSession (skip builtins, functions, non-serializable) for SandboxResult.variables

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The REPL sandbox engine is the core building block for Phase 3's agent loop driver
- Phase 3 will invoke: `echo code | node repl-sandbox.mjs --session X --index Y [--timeout Z]`
- SandboxResult contract is stable: { output, variables, final, finalVar, error }
- Config-driven timeout (loadConfig.maxTimeout * 1000) applies when --timeout is not passed
- All Phase 2 modules (code-transform, print-capture, rlm-config, repl-session, repl-globals, repl-sandbox) are complete

## Self-Check: PASSED

- All 5 files verified present on disk
- All 4 commits verified in git history (cd77d4e, 1cf42e5, fef38af, 3ae40c3)
- 199/199 tests pass (154 Phase 1 + 45 Phase 2)

---
*Phase: 02-repl-core*
*Completed: 2026-03-05*
