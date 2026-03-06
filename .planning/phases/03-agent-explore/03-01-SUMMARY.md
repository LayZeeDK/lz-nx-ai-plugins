---
phase: 03-agent-explore
plan: 01
subsystem: agent
tags: [agent, sonnet, xml-prompt, repl, subagent, tdd]

# Dependency graph
requires:
  - phase: 02-repl-core
    plan: 02
    provides: executeSandbox, createReplGlobals, SandboxResult contract, CLI stdin/stdout
  - phase: 01-foundation
    provides: workspace index schema, vitest test infrastructure
provides:
  - repl-executor Sonnet subagent definition with XML two-phase system prompt
  - Agent frontmatter (name, model, tools, description) for Claude Code auto-discovery
  - Inline globals quick-reference for all 12 REPL globals
  - Guardrails section for iteration, error, and stale-loop self-tracking
affects: [03-02-explore-skill, SKIL-01, explore skill Task tool spawning]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "XML two-phase agent prompt (explore/answer) for Sonnet literal instruction-following"
    - "Agent markdown with YAML frontmatter auto-discovered by Claude Code"
    - "Heredoc stdin pattern for sandbox code invocation from agent Bash calls"
    - "Self-tracking guardrails (iteration count, consecutive errors, stale outputs) via conversation history"

key-files:
  created:
    - plugins/lz-nx.rlm/agents/repl-executor.md
    - tests/lz-nx.rlm/src/test/agent-definition.test.ts
  modified: []

key-decisions:
  - "Agent system prompt uses XML phase boundaries (explore/answer) as structural guard against premature FINAL -- Sonnet follows literally"
  - "Inline globals quick-reference (~200 tokens) provides complete API reference without requiring agent to read external files"

patterns-established:
  - "Structural test pattern: parse agent markdown frontmatter and body, validate fields and XML tags without testing LLM behavior"
  - "Agent receives all context via Task prompt (paths, limits) -- never reads config files itself"

requirements-completed: [AGNT-01]

# Metrics
duration: 3min
completed: 2026-03-06
---

# Phase 03 Plan 01: repl-executor Agent Definition Summary

**Sonnet subagent with XML two-phase system prompt (explore then answer), inline globals quick-reference for all 12 REPL globals, and self-tracking guardrails for iteration/error/stale limits**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-06T00:23:11Z
- **Completed:** 2026-03-06T00:25:57Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created repl-executor agent definition at `plugins/lz-nx.rlm/agents/repl-executor.md` with YAML frontmatter (name=repl-executor, model=sonnet, tools=[Bash, Read]) and multi-line description with triggering examples
- XML two-phase system prompt: `<phase name="explore">` forbids FINAL calls during data gathering, `<phase name="answer">` requires verified data before FINAL -- structural guard via Sonnet's literal instruction-following
- Inline globals quick-reference lists all 12 REPL globals with signatures, return types, and usage guidance
- Guardrails section with self-tracking rules for MAX_ITERATIONS, MAX_CONSECUTIVE_ERRORS, and MAX_STALE_OUTPUTS with forced FINAL and partial-answer behavior
- 12 structural tests validate agent frontmatter fields and system prompt XML structure using TDD (RED then GREEN)
- Full test suite: 224 tests pass (12 new + 212 existing), zero regressions

## Task Commits

Each task was committed atomically using TDD (test then feat):

1. **Task 1: Structural test for agent definition (RED)** - `9b5e02f` (test) - 12 failing tests defining structural contract
2. **Task 2: Create repl-executor agent definition (GREEN)** - `8f1f485` (feat) - Agent file making all 12 tests pass

## Files Created/Modified
- `plugins/lz-nx.rlm/agents/repl-executor.md` - Sonnet subagent definition with XML two-phase system prompt, inline globals reference, sandbox invocation pattern, and guardrails
- `tests/lz-nx.rlm/src/test/agent-definition.test.ts` - 12 structural tests validating frontmatter fields (name, model, tools, description) and system prompt XML structure (phases, globals, guardrails, role, sandbox reference, no Task tool)

## Decisions Made
- Agent system prompt uses XML `<phase>` boundaries as the structural guard against premature FINAL -- validated against Sonnet optimization research showing literal instruction-following
- Inline globals quick-reference (~200 tokens) embedded in system prompt provides complete API reference, so the agent never needs to read external documentation files
- Heredoc `cat <<'REPL_CODE'` pattern documented in execution section prevents shell expansion issues with single quotes in generated JavaScript
- Test uses plain `readFileSync` + regex parsing for YAML frontmatter (no YAML library dependency) -- consistent with project's zero-dependency constraint

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Plan's `<verify>` commands used `--testPathPattern` (Jest syntax) but project uses Vitest -- used Vitest's positional filter pattern instead. Not a code issue, just a verify command syntax difference.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The repl-executor agent is ready for the explore skill (03-02-PLAN.md) to spawn via Task tool
- Agent expects these values in its Task prompt: PLUGIN_ROOT, INDEX_PATH, SESSION_PATH, WORKSPACE_ROOT, MAX_ITERATIONS, MAX_CONSECUTIVE_ERRORS, MAX_STALE_OUTPUTS
- SandboxResult contract from Phase 2 is the bridge between sandbox calls and agent decision logic
- 224/224 tests pass -- foundation is solid for skill integration

## Self-Check: PASSED

- FOUND: plugins/lz-nx.rlm/agents/repl-executor.md
- FOUND: tests/lz-nx.rlm/src/test/agent-definition.test.ts
- FOUND: 9b5e02f (test commit)
- FOUND: 8f1f485 (feat commit)
- 224/224 tests pass

---
*Phase: 03-agent-explore*
*Completed: 2026-03-06*
