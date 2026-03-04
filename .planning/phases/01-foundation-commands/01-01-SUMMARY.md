---
phase: 01-foundation-commands
plan: 01
subsystem: plugin-infrastructure
tags: [nx, claude-code-plugin, vitest, child-process, cross-platform]

# Dependency graph
requires:
  - phase: none
    provides: first plan in milestone
provides:
  - Plugin directory structure at plugins/lz-nx.rlm/
  - Command markdown files (deps, find, alias) discoverable by Claude Code
  - nx-runner.mjs with safe Nx CLI execution (allowlist, env vars, error recovery)
  - output-format.mjs with ASCII-only formatting utilities
  - Vitest config and test fixtures for all subsequent plans
affects: [01-02-PLAN, 01-03-PLAN]

# Tech tracking
tech-stack:
  added: [vitest 4.x (devDep, already in workspace)]
  patterns: [command-allowlist, prefix-matching, retry-with-reset, ASCII-only-output]

key-files:
  created:
    - plugins/lz-nx.rlm/.claude-plugin/plugin.json
    - plugins/lz-nx.rlm/commands/deps.md
    - plugins/lz-nx.rlm/commands/find.md
    - plugins/lz-nx.rlm/commands/alias.md
    - plugins/lz-nx.rlm/vitest.config.mjs
    - plugins/lz-nx.rlm/scripts/nx-runner.mjs
    - plugins/lz-nx.rlm/scripts/shared/output-format.mjs
    - plugins/lz-nx.rlm/scripts/__tests__/nx-runner.test.mjs
    - plugins/lz-nx.rlm/scripts/__tests__/fixtures/graph-output.json
    - plugins/lz-nx.rlm/scripts/__tests__/fixtures/tsconfig-base.json
  modified: []

key-decisions:
  - "Used exact prefix matching for allowlist instead of regex normalization from research -- regex stripped meaningful command parts"
  - "Zero npm dependencies for plugin scripts -- all node:* built-ins"
  - "npx nx as CLI invocation method (works with npm, sufficient for v0.0.1)"

patterns-established:
  - "Command allowlist: exact prefix match with SAFE_PREFIXES array"
  - "Mandatory env vars: NX_TUI=false, NX_INTERACTIVE=false, NX_NO_CLOUD=true"
  - "Error recovery: auto nx-reset + single retry for graph failures"
  - "Output format: ASCII [INFO]/[WARN]/[ERROR]/[OK] tags for cp1252 compatibility"

requirements-completed: [PLUG-01, PLUG-02, FOUND-03]

# Metrics
duration: 5min
completed: 2026-03-04
---

# Phase 1 Plan 01: Plugin Shell and Foundation Summary

**Plugin skeleton with 3 command definitions, tested Nx-runner (allowlist + retry), and ASCII output utilities -- zero npm dependencies**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-04T23:25:25Z
- **Completed:** 2026-03-04T23:30:31Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Plugin directory structure at plugins/lz-nx.rlm/ with valid plugin.json manifest
- Three command markdown files (deps, find, alias) with disable-model-invocation and allowed-tools
- nx-runner.mjs with command allowlisting, mandatory env vars, 10MB maxBuffer, windowsHide, and graph retry logic
- output-format.mjs with ASCII-only [INFO]/[WARN]/[ERROR]/[OK] formatting for cp1252 compatibility
- Vitest config targeting plugin test directory, with realistic graph-output.json (4 projects, dependencies) and tsconfig-base.json fixtures
- 30 tests passing covering all specified behaviors

## Task Commits

Each task was committed atomically:

1. **Task 1: Create plugin directory structure** - `491325a` (feat)
2. **Task 2 RED: Failing tests for nx-runner and output-format** - `7211329` (test)
3. **Task 2 GREEN: Implement nx-runner and output-format** - `28ac60f` (feat)

_Note: TDD Task 2 produced 2 commits (test + feat). No refactor needed -- code was clean._

## Files Created/Modified
- `plugins/lz-nx.rlm/.claude-plugin/plugin.json` - Plugin manifest (name, version, metadata)
- `plugins/lz-nx.rlm/commands/deps.md` - Dependency tree slash command definition
- `plugins/lz-nx.rlm/commands/find.md` - Content search slash command definition
- `plugins/lz-nx.rlm/commands/alias.md` - Alias resolution slash command definition
- `plugins/lz-nx.rlm/vitest.config.mjs` - Vitest config for plugin tests
- `plugins/lz-nx.rlm/scripts/nx-runner.mjs` - Safe Nx CLI wrapper with allowlist and retry
- `plugins/lz-nx.rlm/scripts/shared/output-format.mjs` - ASCII output formatting utilities
- `plugins/lz-nx.rlm/scripts/__tests__/nx-runner.test.mjs` - 30 tests for runner and formatter
- `plugins/lz-nx.rlm/scripts/__tests__/fixtures/graph-output.json` - Realistic 4-project graph fixture
- `plugins/lz-nx.rlm/scripts/__tests__/fixtures/tsconfig-base.json` - tsconfig with path aliases fixture

## Decisions Made
- **Exact prefix matching over regex normalization:** The research suggested stripping flags and trailing args via regex before checking allowlist, but this stripped meaningful command parts (e.g., `graph --print` became `graph`, `show projects` became `show`). Switched to simple exact prefix + space boundary matching which is both simpler and correct.
- **No refactor phase needed:** Both modules were clean after GREEN phase -- no code duplication, good naming, proper documentation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed allowlist normalization breaking safe commands**
- **Found during:** Task 2 (GREEN phase)
- **Issue:** The regex normalization from RESEARCH.md (`command.replace(/\s+--\S+/g, '').replace(/\s+\S+$/, '')`) incorrectly stripped meaningful parts of commands. `graph --print` lost `--print` (treated as a flag), `show projects` lost `projects` (treated as trailing arg).
- **Fix:** Replaced with exact prefix matching: `trimmed === prefix || trimmed.startsWith(prefix + ' ')`
- **Files modified:** plugins/lz-nx.rlm/scripts/nx-runner.mjs
- **Verification:** All 30 tests pass, including graph --print and show projects
- **Committed in:** 28ac60f (part of GREEN phase commit)

**2. [Rule 3 - Blocking] Installed npm dependencies for test infrastructure**
- **Found during:** Task 2 (RED phase)
- **Issue:** `node_modules` was missing -- vitest could not run
- **Fix:** Ran `npm install` to install existing devDependencies from package.json
- **Files modified:** node_modules/ (gitignored)
- **Verification:** Vitest runs successfully
- **Committed in:** N/A (node_modules is gitignored)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes necessary for correctness and task completion. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plugin shell ready for Plans 02 and 03 to build upon
- nx-runner.mjs ready for workspace-indexer.mjs to call `runNxGraph()`
- output-format.mjs ready for all command scripts to use for status/error output
- Test fixtures ready for workspace-indexer and command tests
- Vitest config ready for all subsequent test files

## Self-Check: PASSED

- All 10 created files verified on disk
- All 3 task commits verified in git log (491325a, 7211329, 28ac60f)
- 30/30 tests passing

---
*Phase: 01-foundation-commands*
*Completed: 2026-03-04*
