# Codebase Structure

**Analysis Date:** 2026-03-03

## Directory Layout

```
lz-nx-ai-plugins/
├── research/              # Knowledge corpus and synthesis
│   ├── claude-agent-teams/     # Agent teams architecture, setup, costs
│   ├── claude-plugin/          # RLM plugin design and brainstorm
│   ├── nx/                     # Nx CLI research
│   ├── prompt-engineering/     # LLM prompt strategies and optimization
│   └── rlm/                    # Recursive Language Model theory and implementation
├── .planning/             # GSD planning documents (generated)
│   └── codebase/               # Architecture and structure docs
├── AGENTS.md              # Plugin development guidelines
├── CLAUDE.md              # Project-specific Claude instructions
└── LICENSE                # MIT license
```

## Directory Purposes

**`research/`**
- Purpose: Archive of external knowledge sources and synthesized findings
- Contains: Markdown files from blogs, documentation, papers, plus synthesized summaries
- Key files: `*/SYNTHESIS.md`, `*/README.md`
- Subdirectories serve as thematic knowledge bases for plugin design

**`research/claude-agent-teams/`**
- Purpose: Document agent team architectures, setup patterns, cost analysis
- Contains: Blog posts, documentation, cost breakdowns, sub-agent patterns
- Key files:
  - `SYNTHESIS.md` - Consolidated agent team patterns and architectural guidance
  - `agent-teams.md` - Overview of agent team concepts
  - `sub-agents.md` - Sub-agent spawning patterns
  - `features-overview.md` - Claude Code team features
  - `costs.md` - Multi-agent cost analysis

**`research/claude-plugin/`**
- Purpose: Design specification for RLM-powered Claude Code plugin for Nx monorepos
- Contains: Use case proposals, component definitions, workflow examples, token projections
- Key files:
  - `README.md` - Plugin overview and quick reference
  - `BRAINSTORM.md` - Complete design specification (15K+ lines) with sections on:
    - Workspace index foundation layer
    - RLM REPL environment core engine
    - User-invokable skills (explore, impact, analyze, test-gen, search, trace, patterns)
    - Deterministic commands (nx-deps, nx-find, nx-alias, status)
    - Specialized agents (haiku-searcher, haiku-classifier, repl-executor)
    - Hook system (SessionStart, PreCompact, PreToolUse, PostToolUse)
    - Node.js scripts inventory
    - Model routing strategies
    - Workflow examples and token savings projections

**`research/nx/`**
- Purpose: Nx CLI documentation and command reference
- Contains: Nx CLI commands, project graph structure, dependency analysis capabilities
- Key files:
  - `nx-cli.md` - Complete Nx CLI reference

**`research/prompt-engineering/`**
- Purpose: LLM prompt optimization strategies and skill creation patterns
- Contains: Model-specific optimizations, task decomposition, context management, MCP tools
- Key files:
  - `SYNTHESIS.md` - Key findings on prompt efficiency
  - `SKILLS-ARCHITECTURE.md` - How to structure effective skill definitions
  - `SKILL-CREATION-CHECKLIST.md` - Checklist for adding new skills
  - `MODEL-OPTIMIZATION-HAIKU.md` - Haiku-specific prompt strategies
  - `MODEL-OPTIMIZATION-SONNET.md` - Sonnet-specific prompt strategies
  - `MODEL-OPTIMIZATION-OPUS.md` - Opus-specific prompt strategies
  - `LARGE-FILE-CHUNKING.md` - Strategies for processing large files
  - `TASK-SPAWNING-GUIDE.md` - Multi-agent task decomposition patterns
  - `COMMANDS-AND-CONTEXT.md` - Command syntax and context window management

**`research/rlm/`**
- Purpose: Recursive Language Model theory, architecture, and implementation patterns
- Contains: RLM papers, implementation guides, backends (local, Docker, Modal), client SDKs, trajectory visualization
- Key files:
  - `SYNTHESIS.md` - Key RLM concepts and architectural patterns
  - `docs-rlm--recursive-language-models.md` - RLM specification
  - `docs-rlm--repl-environments.md` - REPL setup patterns
  - `docs-rlm--backends.md` - REPL backend options (local, Docker, Modal)
  - `docs-rlm--using-the-rlm-client.md` - RLM client SDK usage
  - `paper-arxiv--recursive-language-models.md` - RLM paper
  - Multiple video notes (`yt-*.md`) - Video presentations on RLM

**`.planning/codebase/`**
- Purpose: Generated GSD planning documents (created by mapping agents)
- Contains: ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, STACK.md, INTEGRATIONS.md, CONCERNS.md
- Note: These are generated/updated by `/gsd:map-codebase` command, not manually maintained

## Key File Locations

**Entry Points:**
- `research/claude-plugin/README.md` - Start here to understand the plugin vision
- `research/claude-plugin/BRAINSTORM.md` - Complete design specification (section-by-section navigation)
- `AGENTS.md` - Guidelines for plugin development

**Configuration & Guidance:**
- `AGENTS.md`: Plugin development conventions, allowed-tools syntax, hook patterns, code style
- `CLAUDE.md`: Points to `AGENTS.md`

**Core Research Domains:**
- RLM: `research/rlm/SYNTHESIS.md` - RLM concepts needed for plugin design
- Prompt Engineering: `research/prompt-engineering/SYNTHESIS.md` - Token efficiency patterns
- Agent Teams: `research/claude-agent-teams/SYNTHESIS.md` - Multi-agent coordination
- Nx: `research/nx/nx-cli.md` - Nx workspace navigation

## Naming Conventions

**Files:**
- Research documents: `[type]-[source]--[description].md` or `docs-[doc-name].md` (e.g., `blog-alexop-from-tasks-to-swarms.md`, `docs-rlm--recursive-language-models.md`)
- Synthesis documents: `SYNTHESIS.md` (one per research domain)
- README files: `README.md` (entry point for each domain)
- Configuration: `.md` format for plugin docs, `.json` for plugin metadata (proposed)

**Directories:**
- Research domains: Lowercase, hyphen-separated (e.g., `claude-plugin`, `claude-agent-teams`, `prompt-engineering`)
- GSD planning: Hidden prefix `.planning/` with subdirectories `codebase/`, `phases/`, etc.

## Where to Add New Code

**New Plugin Skills:**
- Implementation: `plugins/<plugin-name>/skills/<skill-name>/SKILL.md` (future when plugins/ exists)
- Documentation: `plugins/<plugin-name>/skills/<skill-name>/references/` and `examples/`
- Pattern: Define in SKILL.md markdown, link to hook handlers in `plugins/<plugin-name>/hooks/scripts/`

**New Plugin Commands:**
- Implementation: `plugins/<plugin-name>/commands/` (future)
- Documentation: Inline in command markdown with `argument-hint` and `allowed-tools`
- Pattern: Commands are deterministic, often wrapped Node.js scripts with zero LLM overhead

**Node.js Scripts (Foundation Layer):**
- Location: `plugins/<plugin-name>/hooks/scripts/` or `plugins/<plugin-name>/agents/` (future)
- Current guidance: Proposed in `research/claude-plugin/BRAINSTORM.md` Section 8a-8c
- Naming: `workspace-indexer.mjs`, `path-resolver.mjs`, `repl-sandbox.mjs`, `nx-runner.mjs`, etc.

**Research Documents:**
- Location: `research/<domain>/` (create new domain if needed)
- Format: Markdown with clear source attribution
- Naming: Follow existing patterns (`blog-`, `docs-`, `paper-`, `yt-` prefixes)
- Process:
  1. Create file with source prefix and descriptive name
  2. Include source URL/citation at top
  3. Cross-reference in `README.md` of that domain
  4. Include in domain-specific SYNTHESIS.md if relevant

**New Research Domains:**
- Create: `research/<domain>/`
- Add: `README.md` (overview), `SYNTHESIS.md` (distilled findings)
- Register: Link from root project README (when created)

## Special Directories

**`research/`**
- Purpose: Knowledge repository
- Generated: No (hand-curated)
- Committed: Yes (core value of the repo)
- Maintenance: Actively updated as new articles, docs, papers found
- Lifecycle: Indefinite; serves as reference for plugin development

**`.planning/codebase/`**
- Purpose: GSD mapping and planning documents
- Generated: Yes (by `/gsd:map-codebase` command)
- Committed: Yes (consumed by `/gsd:plan-phase` and `/gsd:execute-phase`)
- Maintenance: Regenerated when codebase structure changes significantly
- Lifecycle: Maintained for the life of the project

**`.planning/phases/`** (when created)
- Purpose: Phase execution plans (created by `/gsd:plan-phase`)
- Generated: Yes (by planning agents)
- Committed: Yes (reference for phase execution)
- Maintenance: Created per phase, archived after completion

**`.planning/milestones/`** (when created)
- Purpose: Milestone tracking and versioning
- Generated: Partially (combined hand-written specs + generated tracking)
- Committed: Yes
- Maintenance: Organized by version (v1.0-phases, v1.1-phases, etc.)

## File Organization for Future Plugin Implementation

When `plugins/` is created, follow this structure:

```
plugins/rlm-nx-plugin/
├── .claude-plugin/
│   └── plugin.json              # Metadata, version, dependencies
├── README.md                    # User-facing plugin documentation
├── agents/
│   ├── haiku-searcher.md        # Agent definition
│   ├── haiku-classifier.md      # Agent definition
│   └── repl-executor.md         # Agent definition
├── commands/
│   ├── nx-deps.md               # Command definition
│   ├── nx-find.md
│   ├── nx-alias.md
│   └── status.md
├── skills/
│   ├── explore/
│   │   ├── SKILL.md             # /rlm:explore definition
│   │   ├── references/          # Reference docs
│   │   └── examples/            # Usage examples
│   ├── impact/
│   ├── analyze/
│   ├── test-gen/
│   ├── search/
│   ├── trace/
│   └── patterns/
├── hooks/
│   ├── hooks.json               # Event configuration
│   └── scripts/
│       ├── workspace-indexer.mjs        # Build workspace index
│       ├── path-resolver.mjs            # Resolve import paths
│       ├── repl-sandbox.mjs             # REPL environment
│       ├── nx-runner.mjs                # Safe Nx CLI wrapper
│       ├── handle-store.mjs             # Result storage
│       ├── cache-manager.mjs            # Result caching
│       └── token-benchmark.mjs          # Token metrics
└── AGENTS.md                    # Plugin-specific development guide
```

---

*Structure analysis: 2026-03-03*
