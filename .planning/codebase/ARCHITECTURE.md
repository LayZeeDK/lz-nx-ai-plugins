# Architecture

**Analysis Date:** 2026-03-03

## Pattern Overview

**Overall:** Knowledge Repository and Plugin Design Specification

This is a **research and design specification repository** for Claude Code plugins targeting Nx monorepos. The architecture is documentation-driven, organized by research domain with synthesized findings and plugin brainstorm proposals. No production code yet exists.

**Key Characteristics:**
- Research-based knowledge capture (corpus of external articles, documentation, specifications)
- Synthesized findings organized by focus area
- Plugin design specification using RLM (Recursive Language Model) principles
- Cross-referenced research documents forming a knowledge graph
- Focus on token efficiency, context rot prevention, and workspace navigation patterns

## Layers

**Research Layer:**
- Purpose: Capture external knowledge from blogs, documentation, and academic papers
- Location: `research/` subdirectories
- Contains: Markdown transcriptions of blog posts, documentation excerpts, video notes, synthesis documents
- Depends on: Public sources (blogs, docs, papers)
- Used by: Synthesis layer for analysis and summarization

**Synthesis Layer:**
- Purpose: Distill research findings into actionable insights
- Location: `research/*/SYNTHESIS.md` (RLM, prompt-engineering, claude-agent-teams)
- Contains: Organized summaries, key takeaways, patterns, constraints
- Depends on: Research layer documents
- Used by: Design layer

**Design Layer:**
- Purpose: Define plugin architecture, workflows, and implementation patterns
- Location: `research/claude-plugin/BRAINSTORM.md`, `research/claude-plugin/README.md`
- Contains: Use case proposals, component definitions, token projections, implementation roadmap
- Depends on: Synthesis layer
- Used by: Plugin developers (when implementing)

**Foundation Layer (Proposed):**
- Purpose: Reusable patterns and Node.js scripts for workspace indexing and REPL isolation
- Location: `plugins/` (future) or `scripts/` directory
- Contains: workspace-indexer.mjs, path-resolver.mjs, repl-sandbox.mjs, nx-runner.mjs
- Depends on: Nx CLI, Node.js vm module, file system
- Used by: Individual plugin skills and commands

## Data Flow

**Research Capture → Synthesis → Design → Implementation**

1. **Research Ingestion** - External knowledge (blogs, docs) captured as `.md` files in research subdirectories
2. **Synthesis** - SYNTHESIS.md in each research domain distills patterns and findings
3. **Design Specification** - BRAINSTORM.md consolidates synthesis into concrete plugin architecture
4. **Plugin Implementation** (future) - Developers read specification and build `plugins/` with skills, commands, hooks, agents

**Key Workflow Example (RLM Plugin):**

1. Research layer: `research/rlm/` contains 20+ documents on RLM theory and implementation
2. Synthesis layer: `research/rlm/SYNTHESIS.md` extracts core patterns, architectural choices
3. Design layer: `research/claude-plugin/BRAINSTORM.md` proposes RLM REPL environment for Nx workspace
4. Implementation (future): `plugins/rlm-nx-plugin/` would contain REPL sandbox, workspace indexer, skills

**State Management:**
- Research documents are immutable captures (git-tracked)
- Synthesis documents are curated summaries (git-tracked, hand-edited)
- Design documents are specifications (git-tracked, version with plugin)
- Plugin code (future) will be separate, version-controlled with its own lifecycle

## Key Abstractions

**Workspace Index:**
- Purpose: Externalize Nx workspace structure as a navigable variable instead of files to read
- Examples: `research/claude-plugin/BRAINSTORM.md` Section 1a (workspace-indexer.mjs proposal)
- Pattern: Node.js script generates compact JSON from `nx show projects --json`, `nx graph --print`, `tsconfig.base.json`
- Represents: Projects, dependencies, path aliases, component registry, store registry, service registry
- Benefit: Eliminates 5-15 tool calls per session; replaces with single structured Read

**RLM REPL Environment:**
- Purpose: Execute workspace queries in an isolated Node.js VM, discarding intermediate results
- Examples: `research/claude-plugin/BRAINSTORM.md` Section 2a (repl-sandbox.mjs proposal)
- Pattern: Node.js vm.createContext() with globals (workspace, projects, components, read(), search())
- Represents: Navigable codebase accessible to recursively-spawned LLM calls
- Benefit: Context rot prevention; intermediate results never enter conversation

**Skill System:**
- Purpose: User-invokable workflows for common tasks (explore, impact analysis, test generation, pattern audit)
- Examples: `/rlm:explore`, `/rlm:impact`, `/rlm:test-gen`, `/rlm:patterns`
- Pattern: Markdown skill definitions with triggered agents and result formatting
- Represents: LLM-driven workflows that leverage workspace index and REPL

**Command System:**
- Purpose: Deterministic, zero-LLM operations for quick queries
- Examples: `/rlm:nx-deps`, `/rlm:nx-find`, `/rlm:nx-alias`, `/rlm:status`
- Pattern: Node.js scripts invoked directly, output to markdown, no LLM interpretation needed
- Represents: Navigation and lookup operations (dependency trees, file search, alias resolution, metrics)

**Hook System:**
- Purpose: Automated behaviors triggered by plugin events (SessionStart, PreCompact, PreToolUse, PostToolUse)
- Examples: Session index, strategy hints, knowledge preservation, search optimization, result caching
- Pattern: JSON configuration + Node.js scripts
- Represents: Cross-cutting concerns that improve efficiency without user action

**Agent System:**
- Purpose: Specialized LLM workers for specific task classes
- Examples: haiku-searcher (mechanical search), haiku-classifier (task routing), repl-executor (RLM loop)
- Pattern: Agent definitions with model choice, tools, temperature settings
- Represents: Model routing strategy (Haiku for mechanical work, Sonnet for reasoning)

## Entry Points

**User Entry - Skills:**
- Location: `/rlm:explore`, `/rlm:impact`, `/rlm:analyze`, `/rlm:test-gen`, `/rlm:search`, `/rlm:trace`, `/rlm:patterns`
- Triggers: User types slash command in Claude Code
- Responsibilities: Dispatch to appropriate agent, format results, prevent context rot

**User Entry - Commands:**
- Location: `/rlm:nx-deps`, `/rlm:nx-find`, `/rlm:nx-alias`, `/rlm:status`
- Triggers: User types slash command in Claude Code
- Responsibilities: Execute Node.js script, format output, return immediately (no LLM)

**Automated Entry - SessionStart Hook:**
- Location: `hooks/SessionStart`
- Triggers: Claude Code session begins
- Responsibilities: Run workspace indexer, inject strategy hints

**Automated Entry - Search Interception (PreToolUse Hook):**
- Location: `hooks/PreToolUse`
- Triggers: Claude attempts tool use that matches search intent
- Responsibilities: Route to lower-token strategies (workspace index lookup, smart search agent)

**Documentation Entry - Research Domain:**
- Location: `research/`
- Triggers: Plugin developer reads repository
- Responsibilities: Explain domain knowledge (RLM, prompt engineering, Nx, Claude agent teams), provide context for design choices

## Error Handling

**Strategy:** Graceful degradation with fallback to baseline Claude Code when plugin features unavailable

**Patterns:**
- Workspace index unavailable → Fall back to git grep + Explore agent
- REPL sandbox failure → Return error message with debugging info, suggest manual Explore
- Hook script error → Log to session and continue without blocking
- Missing Nx workspace → Detect and disable Nx-specific features (deps tree, project awareness)
- Network/permission issues → Cache results locally, notify user of stale data

**Design principle:** Plugin features are optimizations, not requirements. All tasks must remain possible without them.

## Cross-Cutting Concerns

**Logging:** Documented in proposed hook system; session metrics available via `/rlm:status` command. Token counting optional (opt-in via `token-benchmark.mjs`).

**Validation:**
- Workspace index validates against actual workspace on SessionStart
- Script inputs validated before Nx/fs operations
- Hook configurations validated as JSON at plugin load time
- Skill arguments parsed from `$ARGUMENTS` with fallback to defaults

**Authentication:**
- No external auth required
- Nx commands use workspace credentials (same as developer environment)
- File access restricted to workspace directory

**Token Efficiency (Core Concern):**
- Workspace index: Replaces 50K tokens of Explore overhead with 4-8K index Read
- REPL isolation: Discards intermediate results, saves 20-50K tokens per exploration task
- Model routing: Haiku for mechanical tasks (grep, indexing), Sonnet for reasoning
- Handle-based storage: Results referenced by handle rather than regenerated (97% token savings for large results)
- Command-based lookups: Zero LLM tokens for deterministic operations

**Context Rot Prevention (Core Concern):**
- REPL isolation: Intermediate navigation results never enter conversation
- Progressive disclosure: Provide high-level summaries first, drill into details only if asked
- Compaction-aware history: REPL command history preserved across compaction events
- Tiered context management: Separate prompt sections for index, findings, active task

---

*Architecture analysis: 2026-03-03*
