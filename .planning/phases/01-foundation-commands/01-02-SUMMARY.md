---
phase: 01-foundation-commands
plan: 02
subsystem: workspace-data-layer
tags: [nx, workspace-index, tsconfig, path-aliases, vitest, staleness-detection]

# Dependency graph
requires:
  - phase: 01-foundation-commands
    provides: nx-runner.mjs (runNxGraph), output-format.mjs, vitest config, test fixtures
provides:
  - workspace-indexer.mjs with buildIndex, transformGraphToIndex, readPathAliases
  - shared/index-loader.mjs with loadIndex (staleness + auto-rebuild)
  - path-resolver.mjs with resolveAlias (bidirectional alias resolution)
affects: [01-03-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [
      graph-level-type-extraction,
      o1-mtime-staleness,
      wildcard-exclusion,
      tsconfig-fallback,
      bidirectional-resolution,
    ]

key-files:
  created:
    - plugins/lz-nx.rlm/scripts/workspace-indexer.mjs
    - plugins/lz-nx.rlm/scripts/shared/index-loader.mjs
    - plugins/lz-nx.rlm/scripts/path-resolver.mjs
    - plugins/lz-nx.rlm/scripts/__tests__/workspace-indexer.test.mjs
    - plugins/lz-nx.rlm/scripts/__tests__/workspace-indexer-io.test.mjs
    - plugins/lz-nx.rlm/scripts/__tests__/index-loader.test.mjs
    - plugins/lz-nx.rlm/scripts/__tests__/path-resolver.test.mjs
  modified: []

key-decisions:
  - 'Split workspace-indexer tests into 3 files to avoid vi.mock hoisting conflicts -- vi.mock is hoisted to file top regardless of describe block placement'
  - 'Used vi.hoisted() for mock references in I/O test files -- clean pattern for Vitest 4.x mock sharing'
  - 'Zero npm dependencies maintained -- all node:* built-ins'

patterns-established:
  - 'vi.hoisted() + vi.mock() pattern for Vitest 4.x test files with module-level mocks'
  - 'createRequire() for loading JSON fixtures in test files (immune to vi.mock hoisting)'
  - 'Pure function tests separated from I/O-mocked tests in different files'

requirements-completed: [FOUND-01, FOUND-02, FOUND-03]

# Metrics
duration: 7min
completed: 2026-03-04
---

# Phase 1 Plan 02: Workspace Data Layer Summary

**Workspace indexer transforms nx graph to slim JSON index, index-loader with O(1) staleness detection, and bidirectional path alias resolver -- zero npm dependencies, 36 new tests**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-04T23:34:27Z
- **Completed:** 2026-03-04T23:41:23Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- workspace-indexer.mjs transforms `nx graph --print` output to slim index with graph-level type extraction (e2e correctly classified), executor-only targets, and full path alias arrays
- readPathAliases reads tsconfig.base.json with fallback to tsconfig.json, filters wildcards, preserves all path arrays per alias for TypeScript fallback resolution
- index-loader.mjs performs O(1) staleness detection against three watch paths (.nx/workspace-data/, tsconfig.base.json, nx.json) with auto-build on missing and auto-rebuild on stale
- path-resolver.mjs resolves aliases bidirectionally with exact match priority, substring fallback truncated at 20, direction indicators, and support for multi-match reverse lookups
- 36 new tests (23 workspace-indexer/index-loader + 13 path-resolver), 66 total passing

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Failing tests for workspace-indexer and index-loader** - `6287876` (test)
2. **Task 1 GREEN: Implement workspace-indexer and index-loader** - `c599f9c` (feat)
3. **Task 2 RED: Failing tests for path-resolver** - `4f7600a` (test)
4. **Task 2 GREEN: Implement path-resolver** - `3b858f9` (feat)

_Note: TDD tasks produced 2 commits each (test + feat). No refactor needed -- code was clean._

## Files Created/Modified

- `plugins/lz-nx.rlm/scripts/workspace-indexer.mjs` - Transforms nx graph + tsconfig to slim index, builds and writes JSON
- `plugins/lz-nx.rlm/scripts/shared/index-loader.mjs` - Loads index with staleness detection and auto-rebuild
- `plugins/lz-nx.rlm/scripts/path-resolver.mjs` - Bidirectional alias-path resolution with substring fallback
- `plugins/lz-nx.rlm/scripts/__tests__/workspace-indexer.test.mjs` - 8 tests for pure transformGraphToIndex function
- `plugins/lz-nx.rlm/scripts/__tests__/workspace-indexer-io.test.mjs` - 8 tests for readPathAliases and buildIndex (mocked I/O)
- `plugins/lz-nx.rlm/scripts/__tests__/index-loader.test.mjs` - 7 tests for loadIndex and staleness detection
- `plugins/lz-nx.rlm/scripts/__tests__/path-resolver.test.mjs` - 13 tests for resolveAlias bidirectional resolution

## Decisions Made

- **Split tests by mock dependency:** Pure function tests (transformGraphToIndex) in one file, I/O-mocked tests (readPathAliases, buildIndex) in another, index-loader in a third. This avoids Vitest's vi.mock hoisting which causes all file-level mocks to apply globally regardless of describe block placement.
- **vi.hoisted() for mock references:** Used Vitest 4.x's vi.hoisted() to create mock function references accessible inside vi.mock factory functions, avoiding circular reference issues.
- **createRequire() for fixture loading:** Used Node.js createRequire() to load JSON fixtures, which is immune to vi.mock hoisting of node:fs (JSON require uses a different code path than readFileSync).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Split test files to resolve vi.mock hoisting conflicts**

- **Found during:** Task 1 (GREEN phase)
- **Issue:** Plan specified a single workspace-indexer.test.mjs file, but vi.mock() calls are hoisted to file top by Vitest regardless of which describe block they appear in. This caused all tests to receive mocked modules even when the pure function tests needed the real implementation.
- **Fix:** Split into three test files: workspace-indexer.test.mjs (pure), workspace-indexer-io.test.mjs (mocked I/O), index-loader.test.mjs (mocked). Used vi.hoisted() for shared mock references.
- **Files modified:** Three test files instead of one
- **Verification:** All 66 tests pass, no cross-contamination between mocked and unmocked tests
- **Committed in:** c599f9c (GREEN phase commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for test correctness. Same total test count as planned, just organized across 3 files instead of 1. No scope creep.

## Issues Encountered

None beyond the auto-fixed deviation above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Workspace index data layer complete, ready for Plan 03 commands to consume
- index-loader.mjs ready for deps-command.mjs, find-command.mjs, alias-command.mjs to call loadIndex()
- path-resolver.mjs ready for alias-command.mjs to call resolveAlias()
- All 66 tests passing with zero npm dependencies

## Self-Check: PASSED

- All 7 created source/test files verified on disk
- All 4 task commits verified in git log (6287876, c599f9c, 4f7600a, 3b858f9)
- 66/66 tests passing
- All 3 module exports verified (buildIndex, transformGraphToIndex, readPathAliases, loadIndex, resolveAlias)

---

_Phase: 01-foundation-commands_
_Completed: 2026-03-04_
