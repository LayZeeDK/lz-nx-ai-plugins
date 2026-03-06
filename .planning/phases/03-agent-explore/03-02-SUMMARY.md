---
phase: 03-agent-explore
plan: 02
subsystem: skill
tags: [explore, skill, task-tool, orchestration, rlm, agent-spawning]

# Dependency graph
requires:
  - phase: 03-agent-explore
    plan: 01
    provides: repl-executor agent definition for Task tool spawning
  - phase: 02-repl-core
    provides: repl-sandbox.mjs, rlm-config.mjs, repl-session.mjs, index-loader.mjs
provides:
  - explore skill definition with Task tool orchestration for RLM workspace exploration
  - user-facing /lz-nx.rlm:explore command entry point
affects: [end-to-end verification, user documentation, plugin distribution]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Workflow skill pattern: SKILL.md as thin orchestration layer that validates input, resolves paths, spawns agent via Task tool, and relays result"
    - "max_turns = maxIterations + 2 as external safety net with headroom for non-code agent turns"
    - "Ephemeral session lifecycle: create per invocation, delete on success, keep on failure for post-mortem"

key-files:
  created:
    - plugins/lz-nx.rlm/skills/explore/SKILL.md
    - tests/lz-nx.rlm/src/test/explore-skill.test.ts
  modified: []

key-decisions:
  - "Skill uses git rev-parse --show-toplevel for cross-platform workspace root resolution"
  - "Plugin root derived from CLAUDE_SKILL_DIR by navigating up two levels"
  - "Session ID uses timestamp format for simplicity and uniqueness"

patterns-established:
  - "SIFERS test pattern for skill markdown structural validation: readFileSync + frontmatter parsing + body content matching"
  - "Workflow skill 8-step pattern: validate -> paths -> index -> config -> session -> spawn -> relay -> cleanup"

requirements-completed: [SKIL-01]

# Metrics
duration: 3min
completed: 2026-03-06
---

# Phase 03 Plan 02: Explore Skill Summary

**Explore skill definition with 8-step Task tool orchestration workflow, input validation, config-driven agent spawning, --debug diagnostic footer, and ephemeral session lifecycle**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-06T00:23:31Z
- **Completed:** 2026-03-06T00:26:58Z
- **Tasks:** 2/3 (checkpoint pending at Task 3)
- **Files modified:** 2

## Status

Tasks 1-2 complete. **Task 3 (checkpoint:human-verify) pending** -- requires manual end-to-end verification of the complete RLM exploration pipeline in a live Claude Code session.

## Accomplishments
- 13 structural tests defining the explore skill contract (frontmatter fields, workflow content references)
- SKILL.md with complete 8-step workflow: input validation, path resolution, workspace index auto-build, config loading, session ID generation, repl-executor agent spawning via Task tool, result relay with optional --debug footer, session file cleanup
- Skill correctly sets max_turns to maxIterations + 2 as external safety net
- No-argument invocation returns usage hint without spawning the agent
- All 224 tests pass (211 existing + 13 new)

## Task Commits

Each task was committed atomically using TDD (test then feat):

1. **Task 1: Structural test for explore skill** - `d0f4336` (test) - 13 failing tests defining structural contract
2. **Task 2: Create explore skill definition** - `48b6191` (feat) - SKILL.md implementation, all 13 tests pass

## Files Created/Modified
- `plugins/lz-nx.rlm/skills/explore/SKILL.md` - Explore skill definition with YAML frontmatter (name, description, argument-hint, disable-model-invocation) and 8-step workflow instructions
- `tests/lz-nx.rlm/src/test/explore-skill.test.ts` - 13 structural tests validating frontmatter fields and workflow content references

## Decisions Made
- Skill uses `git rev-parse --show-toplevel` for cross-platform workspace root resolution instead of environment variables
- Plugin root derived from `${CLAUDE_SKILL_DIR}` by navigating up two levels (skill dir is `plugins/lz-nx.rlm/skills/explore/`)
- Session ID uses timestamp format (epoch milliseconds) for simplicity and guaranteed uniqueness
- Import order in test file: node: builtins before vitest (import-x/order rule)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed import order in explore-skill.test.ts**
- **Found during:** Task 2 (verification)
- **Issue:** `vitest` import before `node:fs` and `node:path` violates import-x/order lint rule
- **Fix:** Reordered imports: node: builtins first, then vitest
- **Files modified:** tests/lz-nx.rlm/src/test/explore-skill.test.ts
- **Verification:** Tests still pass after reorder
- **Committed in:** 48b6191 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Trivial import reorder for lint compliance. No scope creep.

## Issues Encountered

Pre-existing lint errors in other test files (repl-globals.test.ts, repl-sandbox.test.ts, repl-session.test.ts, agent-definition.test.ts) -- these are out of scope for this plan.

## User Setup Required
None - no external service configuration required.

## Next Step: Manual Verification (Checkpoint Pending)

Task 3 requires end-to-end manual verification of the complete RLM exploration pipeline:
1. `/lz-nx.rlm:explore` with no arguments returns usage hint
2. `/lz-nx.rlm:explore "How many projects are there?"` returns correct answer
3. `/lz-nx.rlm:explore "What depends on [shared lib]?"` handles multi-step navigation
4. `--debug` flag shows diagnostic footer
5. Session files cleaned up after successful runs

## Self-Check: PASSED

- FOUND: plugins/lz-nx.rlm/skills/explore/SKILL.md
- FOUND: tests/lz-nx.rlm/src/test/explore-skill.test.ts
- FOUND: d0f4336 (Task 1 test commit)
- FOUND: 48b6191 (Task 2 feat commit)
- 224/224 tests pass

---
*Phase: 03-agent-explore*
*Completed: 2026-03-06 (Tasks 1-2; Task 3 checkpoint pending)*
