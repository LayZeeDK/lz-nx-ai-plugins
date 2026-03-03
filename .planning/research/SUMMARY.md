# Research Summary: lz-nx.rlm

**Domain:** RLM-powered Claude Code plugin for Nx JavaScript/TypeScript workspace navigation
**Researched:** 2026-03-03
**Overall confidence:** HIGH

## Executive Summary

This research validates and updates the stack decisions for building an RLM (Recursive Language Model) Claude Code plugin that externalizes Nx monorepo workspaces as navigable REPL variables. The core finding is that the entire plugin can be built with **zero npm dependencies**, relying entirely on Node.js 24 LTS built-in modules and the Claude Code plugin system's native capabilities.

The Node.js `vm` module remains the correct REPL sandbox choice. Both reference implementations (hampton-io/RLM v0.3.0 and code-rabi/rllm v1.1.0) validate this approach with production-quality code. The security tradeoffs are well-understood: `vm` is not adversary-proof, but for LLM-generated code in a local development context, it provides sufficient isolation with minimal overhead (<5ms startup vs 50-100ms for subprocess alternatives).

The Claude Code plugin system has matured significantly since the existing research was written. Skills and commands are now unified, subagents support persistent memory and background execution, and three hook types (command, prompt, agent) provide rich automation capabilities. The subagent model routing (`haiku`/`sonnet`/`opus`/`inherit`) maps directly to our multi-model architecture: Haiku for mechanical search, Sonnet for REPL orchestration, user's choice for the main conversation.

Nx CLI commands (`show projects`, `show project`, `graph --print`) are stable across the target range (19.8 to 22.5.x), requiring no version-conditional logic. The workspace indexer can use these commands identically regardless of the host workspace's Nx version.

## Key Findings

**Stack:** Zero external dependencies. Node.js 24 LTS + built-in `vm`, `fs`, `child_process` modules. Claude Code native plugin system for packaging. No build step -- pure `.mjs` scripts.

**Architecture:** Plugin -> Skills/Commands/Agents -> Node.js scripts. REPL sandbox uses `node:vm` with Nx-specific globals. Subagent system handles model routing natively.

**Critical pitfall:** The `node:vm` module is not a security sandbox. Prototype chain escapes are trivial. Acceptable for LLM-generated code; upgrade to `isolated-vm` if user-provided code is ever executed.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Foundation: Workspace Indexer + Path Resolver** - Build the workspace index from Nx CLI output and tsconfig.base.json. Pure Node.js, zero LLM involvement. Testable in isolation.
   - Addresses: workspace-indexer.mjs, path-resolver.mjs, nx-runner.mjs
   - Avoids: Starting with the REPL (high complexity) before the data it navigates exists

2. **REPL Sandbox Core** - Implement `node:vm` sandbox with workspace-aware globals. Test execution loop without LLM integration (mock LLM responses).
   - Addresses: repl-sandbox.mjs, handle-store.mjs, rlm-config.mjs
   - Avoids: Coupling REPL development to LLM API availability

3. **Deterministic Commands** - Build zero-LLM-token commands (`/deps`, `/find`, `/alias`). Provides immediate user value and validates the workspace index.
   - Addresses: deps.md, find.md, alias.md commands
   - Avoids: Requiring working RLM loop for first usable features

4. **Agent Integration** - Wire repl-executor and haiku-searcher agents. Implement the fill/solve execution loop with real LLM calls.
   - Addresses: repl-executor.md, haiku-searcher.md agents
   - Avoids: Big-bang integration by building on tested foundation

5. **Explore Skill** - Build the `/explore` skill that ties workspace index + REPL + agents into the full RLM navigation workflow.
   - Addresses: explore/SKILL.md
   - Avoids: Building the skill before its components are validated

**Phase ordering rationale:**
- Index before REPL: the REPL navigates the index; building the index first ensures the REPL has data to work with
- Commands before agents: commands validate the index without LLM complexity
- Agents before skills: skills orchestrate agents; agents need to work first
- Each phase produces testable, shippable artifacts

**Research flags for phases:**
- Phase 2 (REPL Sandbox): Needs deeper research on `const/let` -> `globalThis` transformation edge cases and async IIFE error propagation
- Phase 4 (Agent Integration): May need investigation into subagent context limits and auto-compaction behavior
- Phase 1, 3, 5: Standard patterns, unlikely to need additional research

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies verified against current docs. Zero dependencies validated by reference implementations. Node.js 24 LTS confirmed active through April 2028. |
| Features | HIGH | Feature landscape well-mapped by existing BRAINSTORM.md. Table stakes vs. differentiators clear from competitor analysis. |
| Architecture | HIGH | Plugin system documented in detail. Subagent model routing confirmed. vm sandbox pattern validated by two independent implementations. |
| Pitfalls | HIGH | vm security limitations well-documented. Cross-platform concerns identified. Nx version compatibility verified. |

## Gaps to Address

- **Subagent context window limits:** How much data can a subagent receive before auto-compaction triggers? Relevant for repl-executor receiving large workspace indices. Needs empirical testing in Phase 4.
- **`node:fs/promises` glob on Windows:** The built-in `fs.glob` is stable since Node.js 22.17, but Windows-specific behavior (path separators, symlink handling in ReFS Dev Drive) should be validated in Phase 1. Fall back to `fast-glob` 3.3.3 if issues arise.
- **Node.js 24 `vm.constants.DONT_CONTEXTIFY`:** This new option creates contexts without contextifying quirks. Needs investigation whether it improves or complicates our sandbox setup. Lower priority -- standard `vm.createContext()` works fine.
- **Haiku 4.5 coding capability at scale:** Research confirms Haiku 4.5 matches Sonnet 4 on SWE-bench, but behavior on mechanical search tasks (our use case) needs validation during Phase 4.
