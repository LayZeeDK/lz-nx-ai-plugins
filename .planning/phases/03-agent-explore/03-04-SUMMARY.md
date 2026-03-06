---
phase: 03-agent-explore
plan: 04
subsystem: agent
tags: [sandbox, file-input, permission-prompts, skill-path-resolution]

# Dependency graph
requires:
  - phase: 03-agent-explore (plans 01-03)
    provides: agent definition, explore skill, gap diagnosis
provides:
  - "--file flag on repl-sandbox.mjs for file-based code input"
  - "Write tool + --file invocation pattern in repl-executor agent (zero shell operators)"
  - "PLUGIN_ROOT derived from WORKSPACE_ROOT in explore skill (no CLAUDE_SKILL_DIR dependency)"
  - "Structural regression tests for new patterns"
affects: [03-UAT, milestone-closure]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Write tool + --file flag pattern for prompt-free sandbox invocation"
    - "WORKSPACE_ROOT-relative plugin path construction (no CLAUDE_SKILL_DIR)"

key-files:
  created: []
  modified:
    - plugins/lz-nx.rlm/scripts/repl-sandbox.mjs
    - plugins/lz-nx.rlm/agents/repl-executor.md
    - plugins/lz-nx.rlm/skills/explore/SKILL.md
    - tests/lz-nx.rlm/src/test/agent-definition.test.ts
    - tests/lz-nx.rlm/src/test/explore-skill.test.ts

key-decisions:
  - "File-based code input via --file flag with stdin fallback for backward compatibility"
  - "Write tool for code file creation eliminates all permission prompts from sandbox invocation"
  - "PLUGIN_ROOT = WORKSPACE_ROOT + '/plugins/lz-nx.rlm' instead of dirname(CLAUDE_SKILL_DIR) navigation"

patterns-established:
  - "Write tool + --file: agent writes code via Write tool to .cache/repl-code.js, then runs plain node command with --file flag"
  - "WORKSPACE_ROOT-relative paths: derive plugin paths from WORKSPACE_ROOT + known relative path instead of environment variables"

requirements-completed: [AGNT-01, SKIL-01]

# Metrics
duration: 3min
completed: 2026-03-06
---

# Phase 3 Plan 4: Gap Closure - Permission Prompts and SKILL_DIR Resolution

**Sandbox --file flag and Write tool invocation pattern eliminating all permission prompts; PLUGIN_ROOT derived from WORKSPACE_ROOT removing CLAUDE_SKILL_DIR dependency**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-06T13:49:59Z
- **Completed:** 2026-03-06T13:53:08Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added --file flag to repl-sandbox.mjs CLI entry point for file-based code input (backward-compatible with stdin)
- Rewrote repl-executor.md sandbox invocation to use Write tool + --file flag with zero shell operators
- Added Write to agent tools array (Bash, Read, Write)
- Fixed SKILL.md Step 2 to derive PLUGIN_ROOT from WORKSPACE_ROOT + '/plugins/lz-nx.rlm', removing all CLAUDE_SKILL_DIR references
- Updated and added structural tests: 35 tests pass across agent-definition and explore-skill; 234 total tests green

## Task Commits

Each task was committed atomically:

1. **Task 1: Add --file flag to sandbox and rewrite agent/skill invocation patterns** - `ed0e78d` (feat)
2. **Task 2: Update structural tests for new patterns** - `9478920` (test)

## Files Created/Modified
- `plugins/lz-nx.rlm/scripts/repl-sandbox.mjs` - Added --file flag to CLI entry point; reads from file path when provided, falls back to stdin
- `plugins/lz-nx.rlm/agents/repl-executor.md` - Added Write to tools; rewrote invocation to Write tool + --file; removed all shell operators
- `plugins/lz-nx.rlm/skills/explore/SKILL.md` - PLUGIN_ROOT derived from WORKSPACE_ROOT; removed CLAUDE_SKILL_DIR dependency and dirname navigation
- `tests/lz-nx.rlm/src/test/agent-definition.test.ts` - Updated tools test (3 items), replaced stdin test with --file test, added Write tool and no-stdin-redirect tests
- `tests/lz-nx.rlm/src/test/explore-skill.test.ts` - Added no-CLAUDE_SKILL_DIR test and WORKSPACE_ROOT derivation test

## Decisions Made
- File-based code input via --file flag with stdin fallback: backward-compatible change, existing API tests unaffected
- Write tool for code file creation: native Claude Code tool, never triggers permission prompts
- WORKSPACE_ROOT + '/plugins/lz-nx.rlm' for PLUGIN_ROOT: avoids CLAUDE_SKILL_DIR platform bug (GitHub #9354)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Both UAT blockers (GAP-01 permission prompts, GAP-02 SKILL_DIR resolution) are now closed
- All 234 tests pass with no regressions
- Ready for UAT re-verification and v0.0.1 milestone closure

## Self-Check: PASSED

- All 6 files verified present on disk
- Commit ed0e78d (Task 1) verified in git log
- Commit 9478920 (Task 2) verified in git log

---
*Phase: 03-agent-explore*
*Completed: 2026-03-06*
