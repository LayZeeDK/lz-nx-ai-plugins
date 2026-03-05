---
phase: quick-4
plan: 1
subsystem: infra
tags: [nx, typescript, vitest, eslint, nxViteTsPaths]

# Dependency graph
requires:
  - phase: 01.1-nx-project-setup-linting
    provides: initial Nx project structure, eslint and typecheck infrastructure
provides:
  - Nx-aligned plugin project config with inferred lint target
  - Nx-aligned test project config with inferred typecheck, test, and lint targets
  - Solution-style tsconfig with tsconfig.spec.json for test project
  - Conventional src/ directory structure for test files
  - nxViteTsPaths() path resolution replacing manual resolve.alias
affects: [phase-02, phase-03]

# Tech tracking
tech-stack:
  added: ["@nx/vite nxViteTsPaths plugin"]
  patterns: ["solution-style tsconfig with references", "project-level eslint.config.mjs extending root", "nxViteTsPaths() for path alias resolution"]

key-files:
  created:
    - plugins/lz-nx.rlm/eslint.config.mjs
    - tests/lz-nx.rlm/tsconfig.spec.json
    - tests/lz-nx.rlm/eslint.config.mjs
  modified:
    - plugins/lz-nx.rlm/project.json
    - plugins/lz-nx.rlm/tsconfig.json
    - tests/lz-nx.rlm/project.json
    - tests/lz-nx.rlm/tsconfig.json
    - tests/lz-nx.rlm/vitest.config.mjs
    - .gitignore

key-decisions:
  - "Retain manual typecheck target for plugin project because noEmit is incompatible with tsc --build mode used by @nx/js/typescript inferred targets"
  - "Skip solution-style tsconfig for plugin project (no tsconfig.lib.json) to avoid unwanted inferred build target"
  - "Use solution-style tsconfig with tsconfig.spec.json for test project where inferred typecheck works correctly"

patterns-established:
  - "Non-buildable plugin projects use flat tsconfig.json with manual typecheck target (tsc -p, not --build)"
  - "Test projects use solution-style tsconfig.json with tsconfig.spec.json reference"
  - "All projects have project-level eslint.config.mjs extending root config for lint target inference"
  - "Vitest configs use nxViteTsPaths() instead of manual resolve.alias for path aliases"

requirements-completed: []

# Metrics
duration: 6min
completed: 2026-03-05
---

# Quick Task 4: Align Project Configurations with Nx Defaults Summary

**Nx-aligned project configs with inferred targets, solution-style tsconfig for tests, nxViteTsPaths() path resolution, and conventional src/ test directory structure**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-05T21:16:47Z
- **Completed:** 2026-03-05T21:22:59Z
- **Tasks:** 3
- **Files modified:** 19 (10 renamed, 3 created, 6 modified)

## Accomplishments

- Plugin project.json aligned with Nx defaults ($schema, sourceRoot, projectType, tags)
- Test project converted to solution-style tsconfig with tsconfig.spec.json reference
- Vitest config modernized from manual resolve.alias to nxViteTsPaths()
- Test files and fixtures moved from project root to src/ following Nx conventions
- Project-level eslint.config.mjs added to both projects for lint target inference
- All 111 tests pass, typecheck and lint clean across both projects

## Task Commits

Each task was committed atomically:

1. **Task 1: Align plugin project with Nx defaults** - `379044e` (refactor)
2. **Task 2: Align test project and move tests to src/** - `db0b071` (refactor)
3. **Task 3: Full cross-project verification** - no commit (verification-only)

## Files Created/Modified

- `plugins/lz-nx.rlm/project.json` - Added $schema, sourceRoot, projectType; kept manual typecheck target
- `plugins/lz-nx.rlm/tsconfig.json` - Added types:node to compilerOptions (unchanged structure)
- `plugins/lz-nx.rlm/eslint.config.mjs` - New project-level eslint config extending root
- `tests/lz-nx.rlm/project.json` - Added $schema, sourceRoot, projectType; empty targets (all inferred)
- `tests/lz-nx.rlm/tsconfig.json` - Converted to solution-style with tsconfig.spec.json reference
- `tests/lz-nx.rlm/tsconfig.spec.json` - New compilation config for test files
- `tests/lz-nx.rlm/vitest.config.mjs` - Replaced manual resolve.alias with nxViteTsPaths()
- `tests/lz-nx.rlm/eslint.config.mjs` - New project-level eslint config extending root
- `tests/lz-nx.rlm/src/*.test.ts` - 8 test files moved from root to src/
- `tests/lz-nx.rlm/src/fixtures/` - Fixture directory moved from root to src/
- `.gitignore` - Added *.tsbuildinfo pattern

## Decisions Made

1. **Retained manual typecheck target for plugin project** - The @nx/js/typescript plugin uses `tsc --build` mode for inferred typecheck targets, which is incompatible with `noEmit: true`. Since the plugin is pure .mjs scripts with no build output, `noEmit` is required. A manual `tsc -p` target bypasses this limitation.

2. **Skipped solution-style tsconfig for plugin project** - Creating tsconfig.lib.json would trigger an unwanted inferred `build` target from the @nx/js/typescript plugin (configName: "tsconfig.lib.json" matches). Since the plugin has no tests in its directory (tests are in a separate project), a single flat tsconfig.json is sufficient.

3. **Used solution-style tsconfig for test project** - The test project doesn't have a tsconfig.lib.json, so the @nx/js/typescript plugin correctly infers a simple `typecheck` target using `tsc --noEmit -p tsconfig.json`. The solution-style tsconfig with tsconfig.spec.json reference follows Nx conventions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] noEmit incompatible with tsc --build inferred typecheck**
- **Found during:** Task 1 (Plugin project config alignment)
- **Issue:** Plan specified solution-style tsconfig.json with tsconfig.lib.json reference. The @nx/js/typescript plugin inferred a disabled typecheck target (echo warning) because `noEmit: true` is incompatible with `tsc --build` mode used by the inferred targets.
- **Fix:** Kept flat tsconfig.json (no references, no tsconfig.lib.json) with manual typecheck target using `tsc -p` instead of `tsc --build`. This retains the plan's other improvements ($schema, sourceRoot, eslint.config.mjs) while ensuring typecheck actually runs.
- **Files modified:** plugins/lz-nx.rlm/project.json, plugins/lz-nx.rlm/tsconfig.json
- **Verification:** `nx run lz-nx-rlm:typecheck` succeeds; `nx show project lz-nx-rlm` shows typecheck + lint targets only
- **Committed in:** 379044e (Task 1 commit)

**2. [Rule 3 - Blocking] Added *.tsbuildinfo to .gitignore**
- **Found during:** Task 2 (Test project config alignment)
- **Issue:** Solution-style tsconfig.json with references caused tsc to generate tsconfig.tsbuildinfo, which was not gitignored
- **Fix:** Added `*.tsbuildinfo` to .gitignore under compiled output section
- **Files modified:** .gitignore
- **Verification:** `git check-ignore` confirms the file is now ignored
- **Committed in:** db0b071 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both auto-fixes necessary for correct Nx target inference and clean git tracking. Plugin project retains manual typecheck but gains all other Nx alignment improvements. No scope creep.

## Issues Encountered

- Pre-existing formatting issues in .planning/ and research/ directories detected by `nx format:check --all` -- out of scope per deviation rules (pre-existing, unrelated files)
- Test project gets nx-release-publish, build-deps, and watch-deps inferred targets from package.json and @nx/vite/plugin -- acceptable no-ops, consistent with plan note

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Both projects fully aligned with Nx conventions
- Inferred targets working correctly (typecheck, lint, test)
- nxViteTsPaths() established as the standard path resolution pattern for vitest configs
- Ready for Phase 2 implementation with clean project infrastructure

## Self-Check: PASSED

- All 19 expected files found on disk
- Both task commits verified (379044e, db0b071)
- All 111 tests passing, typecheck and lint clean

---
*Quick Task: 4-align-project-configurations-with-nx-def*
*Completed: 2026-03-05*
