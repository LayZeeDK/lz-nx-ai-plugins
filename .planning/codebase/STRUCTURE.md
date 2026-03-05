# Codebase Structure

**Analysis Date:** 2026-03-03

## Current State

This is an Nx monorepo workspace in early setup. No `plugins/` directory exists yet -- Phase 1 (Plugin Shell and Foundation) has not started. The structure below combines what currently exists with the planned structure from `.planning/PROJECT.md` and `AGENTS.md`.

## Current Directory Layout

```
lz-nx-ai-plugins/              # Nx workspace root
├── .claude/                   # Claude Code workspace config
│   └── settings.json          # Plugin marketplace and enablement config
├── .git/                      # Git repository
├── .gitignore                 # Ignore rules (dist, node_modules, .nx/cache, etc.)
├── .nx/                       # Nx cache and workspace data (git-ignored)
│   ├── cache/                 # Build/task output cache
│   └── workspace-data/        # Nx project graph cache
├── .planning/                 # GSD planning documents
│   ├── codebase/              # Codebase analysis docs (this directory)
│   ├── research/              # Researched architecture, stack, features, pitfalls
│   │   ├── ARCHITECTURE.md    # Planned architecture detail with code examples
│   │   ├── FEATURES.md        # Feature landscape, MVP definition, competitor analysis
│   │   ├── PITFALLS.md        # Security, cross-platform, and API pitfalls
│   │   ├── STACK.md           # Technology stack decisions with rationale
│   │   └── SUMMARY.md         # Research summary and phase implications
│   ├── config.json            # GSD workflow config
│   ├── PROJECT.md             # Core project definition, requirements, decisions
│   ├── REQUIREMENTS.md        # Formal requirements (FOUND-*, REPL-*, AGNT-*, etc.)
│   ├── ROADMAP.md             # 5-phase delivery roadmap
│   └── STATE.md               # Current execution position and context
├── .prettierignore            # Prettier ignore rules
├── .prettierrc                # Prettier config (single line: format settings)
├── AGENTS.md                  # Agent development guidelines (referenced by CLAUDE.md)
├── CLAUDE.md                  # Claude Code project instructions (@AGENTS.md + Nx plugin config)
├── LICENSE                    # MIT license
├── node_modules/              # npm dependencies (git-ignored)
├── nx.json                    # Nx workspace configuration (plugins, named inputs, target defaults)
├── package.json               # Workspace package manifest (devDependencies only, no scripts)
├── package-lock.json          # npm lockfile
├── research/                  # Research corpus (markdown documents)
│   ├── claude-agent-teams/    # Research on Claude Code agent team patterns
│   ├── claude-plugin/         # Plugin design brainstorm documents
│   │   ├── BRAINSTORM.md      # Detailed plugin design with token projections
│   │   └── BRAINSTORM_AGENT_TEAMS.md  # Agent team integration proposals
│   ├── nx/                    # Nx CLI capability research
│   ├── prompt-engineering/    # Prompt patterns for token efficiency
│   └── rlm/                   # RLM theory, implementations, benchmarks
│       ├── SYNTHESIS.md       # Synthesized RLM architecture and patterns
│       └── README.md          # Research index
├── tsconfig.base.json         # Base TypeScript compiler options (strict, ESM, es2022)
└── tsconfig.json              # Root tsconfig (extends base, no references yet)
```

## Planned Plugin Directory Layout

When `plugins/lz-nx.rlm/` is created (Phase 1), it will follow the convention defined in `AGENTS.md`:

```
plugins/
└── lz-nx.rlm/                 # The RLM Nx navigation plugin
    ├── .claude-plugin/
    │   └── plugin.json        # Plugin manifest: name, version, description
    ├── README.md              # User-facing documentation
    ├── agents/
    │   ├── repl-executor.md   # Sonnet agent: drives RLM fill/solve execution loop
    │   └── haiku-searcher.md  # Haiku agent: mechanical search sub-calls
    ├── commands/
    │   ├── deps.md            # /lz-nx.rlm:deps -- dependency tree (deterministic script)
    │   ├── find.md            # /lz-nx.rlm:find -- project-scoped file search (deterministic script)
    │   └── alias.md           # /lz-nx.rlm:alias -- tsconfig path alias resolution (deterministic script)
    ├── hooks/                 # Deferred to a later milestone (not in v0.0.1 scope)
    │   ├── hooks.json
    │   └── scripts/
    ├── scripts/               # Node.js foundation scripts (zero npm dependencies)
    │   ├── workspace-indexer.mjs   # Builds workspace-index.json from Nx CLI output
    │   ├── path-resolver.mjs       # Bidirectional tsconfig path alias resolution
    │   ├── repl-sandbox.mjs        # Node.js vm.createContext sandbox with workspace globals
    │   ├── handle-store.mjs        # In-memory Map for large result handle storage
    │   ├── rlm-config.mjs          # RLM guardrails config (maxIterations, maxTimeout, etc.)
    │   └── nx-runner.mjs           # Allowlisted read-only Nx CLI wrapper
    └── skills/
        └── explore/
            ├── SKILL.md           # /lz-nx.rlm:explore skill definition
            ├── references/        # Reference docs injected into skill context
            └── examples/          # Usage examples
```

## Directory Purposes

**`.claude/`:**
- Purpose: Claude Code workspace-level configuration
- Contains: `settings.json` -- plugin marketplace sources and enabled plugins
- Key files: `.claude/settings.json`

**`.planning/`:**
- Purpose: GSD workflow planning documents; consumed by `/gsd:plan-phase` and `/gsd:execute-phase`
- Contains: Project definition, requirements, roadmap, research documents, codebase analysis
- Key files: `.planning/PROJECT.md` (project definition), `.planning/ROADMAP.md` (phases), `.planning/REQUIREMENTS.md` (formal requirements), `.planning/STATE.md` (current position)
- Note: `.planning/codebase/` is written by `/gsd:map-codebase`; `.planning/research/` is written by `/gsd:research`

**`research/`:**
- Purpose: Research corpus -- external knowledge synthesized for planning decisions
- Contains: Markdown documents organized by topic area
- Key files: `research/rlm/SYNTHESIS.md` (RLM theory and implementations), `research/claude-plugin/BRAINSTORM.md` (detailed plugin design), `research/prompt-engineering/SYNTHESIS.md` (token efficiency patterns)
- Note: Read-only reference material; do not modify during implementation phases

**`plugins/lz-nx.rlm/scripts/` (planned):**
- Purpose: Foundation layer -- deterministic Node.js scripts with zero npm dependencies
- Contains: `.mjs` files using only Node.js built-in modules
- Key files: `workspace-indexer.mjs` (most critical -- converts 537-project workspace to navigable JSON), `repl-sandbox.mjs` (highest-risk component -- vm sandbox)

**`plugins/lz-nx.rlm/agents/` (planned):**
- Purpose: AI agent definitions that drive LLM-powered workflows
- Contains: Markdown files with YAML frontmatter for Claude Code agent registration
- Key files: `repl-executor.md` (Sonnet, drives fill/solve loop), `haiku-searcher.md` (Haiku, mechanical search)

**`plugins/lz-nx.rlm/skills/` (planned):**
- Purpose: User-invokable skills that coordinate agents and scripts
- Contains: Subdirectories per skill, each with `SKILL.md` plus optional `references/` and `examples/`
- Note: `skills/` is preferred over `commands/` for new LLM-powered interactions per updated Claude Code conventions

**`plugins/lz-nx.rlm/commands/` (planned):**
- Purpose: Slash commands that invoke deterministic Node.js scripts (scripts make no LLM calls; Claude Code still processes the invocation)
- Contains: Markdown files with `allowed-tools` restricting to `Bash(node *)` and `Read`

## Key File Locations

**Entry Points:**
- `plugins/lz-nx.rlm/.claude-plugin/plugin.json`: Plugin manifest -- auto-discovery by Claude Code
- `plugins/lz-nx.rlm/skills/explore/SKILL.md`: Primary user-facing RLM skill
- `plugins/lz-nx.rlm/commands/deps.md`: Dependency tree command

**Configuration:**
- `nx.json`: Nx workspace plugins (`@nx/js/typescript`, `@nx/vite/plugin`, `@nx/eslint/plugin`), named inputs, target defaults
- `tsconfig.base.json`: Shared TypeScript options (strict mode, ESM, es2022 target, `nodenext` module resolution)
- `.claude/settings.json`: Claude Code plugin marketplace registration
- `plugins/lz-nx.rlm/scripts/rlm-config.mjs`: RLM guardrail defaults (loadable from `.claude/rlm-config.json`)

**Core Logic (planned):**
- `plugins/lz-nx.rlm/scripts/workspace-indexer.mjs`: Workspace index builder (Foundation, Phase 1)
- `plugins/lz-nx.rlm/scripts/repl-sandbox.mjs`: Node.js vm sandbox with workspace globals (REPL Core, Phase 2)
- `plugins/lz-nx.rlm/scripts/handle-store.mjs`: Large result handle storage (REPL Core, Phase 2)
- `plugins/lz-nx.rlm/agents/repl-executor.md`: RLM execution loop agent (Agent Integration, Phase 4)

**Planning Documents:**
- `.planning/PROJECT.md`: Authoritative project definition, constraints, key decisions
- `.planning/ROADMAP.md`: 5-phase delivery plan with success criteria
- `.planning/research/ARCHITECTURE.md`: Detailed architecture with code examples and patterns

## Naming Conventions

**Files:**
- Plugin scripts: `kebab-case.mjs` (e.g., `workspace-indexer.mjs`, `repl-sandbox.mjs`, `handle-store.mjs`)
- Agent definitions: `kebab-case.md` (e.g., `repl-executor.md`, `haiku-searcher.md`)
- Command definitions: `kebab-case.md` (e.g., `deps.md`, `find.md`, `alias.md`)
- Skill definitions: `SKILL.md` (uppercase, inside a `skills/<skill-name>/` subdirectory)
- Planning documents: `UPPERCASE.md` (e.g., `PROJECT.md`, `ROADMAP.md`, `ARCHITECTURE.md`)
- Research documents: `UPPERCASE.md` or `kebab-case--kebab-case.md` (for external source notes)

**Directories:**
- Plugins: `plugins/<plugin-name>/` using dot-notation for namespaced names (e.g., `plugins/lz-nx.rlm/`)
- Skills: `skills/<skill-name>/` (lowercase, kebab-case)
- Research topics: `research/<topic>/` (lowercase, kebab-case)

**Plugin namespace convention:** `<author>-<domain>.<feature>` (e.g., `lz-nx.rlm` = LayZeeDK namespace, Nx domain, RLM feature)

**Script naming:** Foundation scripts use descriptive compound names (`workspace-indexer`, `path-resolver`, `handle-store`). Scripts that are command implementations use the command name as a suffix (e.g., `deps-tree.mjs` for the `/deps` command script).

## Where to Add New Code

**New plugin (future):**
- Create: `plugins/<namespace>.<feature>/` following the structure in `AGENTS.md`
- Manifest: `plugins/<namespace>.<feature>/.claude-plugin/plugin.json`
- Documentation: `plugins/<namespace>.<feature>/README.md`

**New foundation script (Phase 1-2):**
- Location: `plugins/lz-nx.rlm/scripts/<purpose>.mjs`
- Requirements: ESM format (`import`/`export`), Node.js built-in modules only, cross-platform (no shell-specific syntax), no emojis in output

**New slash command (Phase 3):**
- Location: `plugins/lz-nx.rlm/commands/<command-name>.md`
- Convention: Use `allowed-tools` to restrict tool access; command scripts are deterministic (no LLM calls in scripts, but Claude Code still processes invocation)

**New skill (Phase 5+):**
- Location: `plugins/lz-nx.rlm/skills/<skill-name>/SKILL.md`
- Optional: `plugins/lz-nx.rlm/skills/<skill-name>/references/` for injected reference docs
- Optional: `plugins/lz-nx.rlm/skills/<skill-name>/examples/` for usage examples

**New agent (Phase 4):**
- Location: `plugins/lz-nx.rlm/agents/<agent-name>.md`
- Convention: `tools: ["Bash", "Read"]` array format (not `allowed-tools`), `model: haiku/sonnet/opus/inherit`

**New research document:**
- Location: `research/<topic>/` for external source notes, `.planning/research/` for synthesized planning docs
- Note: Research documents are reference material; do not create them during implementation phases

**Hook script (later milestone, deferred):**
- Location: `plugins/lz-nx.rlm/hooks/scripts/<hook-name>.mjs`
- Config: `plugins/lz-nx.rlm/hooks/hooks.json` (use `${CLAUDE_PLUGIN_ROOT}` for portable paths)

## Special Directories

**`.nx/`:**
- Purpose: Nx build cache and workspace graph data
- Generated: Yes (by Nx CLI during tasks)
- Committed: No (`.gitignore`d: `.nx/cache`, `.nx/workspace-data`)

**`.planning/`:**
- Purpose: GSD workflow state and planning documents
- Generated: Partially (by `/gsd:` commands)
- Committed: Yes (project definition and plans are source-controlled)

**`research/`:**
- Purpose: Research corpus -- synthesized external knowledge
- Generated: No (human/AI authored during research phases)
- Committed: Yes (research is part of the project record)

**`node_modules/`:**
- Purpose: Nx and tooling dependencies (devDependencies in `package.json`)
- Generated: Yes (by `npm install`)
- Committed: No (`.gitignore`d)

**`plugins/` (planned, does not exist yet):**
- Purpose: The actual plugin deliverables of this workspace
- Generated: No (hand-authored per plugin conventions)
- Committed: Yes

---

*Structure analysis: 2026-03-03*
