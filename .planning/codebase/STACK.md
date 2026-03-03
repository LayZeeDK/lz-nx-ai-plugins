# Technology Stack

**Analysis Date:** 2026-03-03

## Languages

**Primary:**
- JavaScript (ESM) - Plugin runtime scripts (.mjs), all executable code in `plugins/lz-nx.rlm/scripts/`
- TypeScript 5.9.x - Workspace tooling and type checking only; plugin scripts ship as plain `.mjs` (no compilation)
- Markdown (.md) - All Claude Code plugin definitions: agents, commands, skills, hooks

**Secondary:**
- JSON - Workspace index format, plugin manifests (`.claude-plugin/plugin.json`), hook configs (`hooks.json`), RLM configuration (`rlm-config.json`)

## Runtime

**Environment:**
- Node.js 24.x LTS (Krypton) - Required for plugin script execution; current runtime is v24.13.0
- Minimum version: Node.js >= 22.17.0 for stable `fs.glob` built-in; Node.js 24.x strongly recommended for `vm.createContext` improvements and V8 13.6 (ECMAScript 2025)
- Module format: ESM only (`.mjs` extension, `import`/`export` syntax); no CommonJS

**Package Manager:**
- npm 11.6.2
- Lockfile: `package-lock.json` present (lockfileVersion 3)

## Frameworks

**Core:**
- Nx 22.5.1 - Monorepo tooling, task runner, project graph, CLI for workspace exploration
- Claude Code plugin system (March 2026) - Plugin packaging and distribution; skills, agents, commands, hooks

**Testing (planned):**
- `node:test` (built-in, Node.js 24) - Zero-dependency unit testing for plugin scripts
- `node:assert` (built-in) - Test assertions in strict mode
- Nx workspace also has Vitest 4.x configured via `@nx/vitest` for any future Nx projects within the monorepo

**Build/Dev:**
- No build step - Plugin scripts run directly as `.mjs` files via `node scripts/foo.mjs`
- Vite 7.x (`@nx/vite`) - Available for Nx projects in the monorepo, not used by the plugin itself
- Prettier 3.x - Code formatting with `singleQuote: true`
- ESLint 8.57.x (`@nx/eslint`) - Linting via flat config (`.eslintrc.json` or `eslint.config.mjs` per project)
- jiti 2.4.2 - TypeScript config loader for Nx tooling

## Key Dependencies

**Critical (workspace-level devDependencies):**
- `nx` 22.5.1 - Core monorepo orchestration; target version for workspaces being analyzed is 19.8+
- `@nx/workspace` - Nx workspace plugin
- `@nx/js` 22.5.1 - JavaScript/TypeScript project support
- `@nx/node` - Node.js project support
- `@nx/vite` - Vite integration for Nx
- `@nx/vitest` - Vitest integration for Nx
- `@nx/web` 22.5.1 - Web project support
- `@nx/eslint` - ESLint integration for Nx
- `typescript` ~5.9.2 - TypeScript compiler
- `tslib` ^2.3.0 - TypeScript helper library

**Plugin runtime (zero npm dependencies):**
The `lz-nx.rlm` plugin ships with no npm dependencies. All functionality uses Node.js built-in modules only:
- `node:vm` - REPL sandbox isolation (`vm.createContext()`, `vm.Script`)
- `node:fs` / `node:fs/promises` - File reading (`read()` global) and glob-based file search (`files()` global)
- `node:child_process` - Nx CLI execution (`nx-runner.mjs`) and `git grep` wrapper (`search()` global)
- `node:path` - Cross-platform path manipulation
- `node:perf_hooks` - Execution timing
- `node:test` + `node:assert` - Unit testing

**External binaries (assumed present in environment):**
- `git` - Required by `search()` REPL global (`git grep` wrapper)
- `nx` (via `npx nx`) - Required by `nx-runner.mjs` in the workspace being analyzed

## Configuration

**Environment:**
- No `.env` files in this repository
- `ANTHROPIC_API_KEY` - Required for direct Claude API calls from the `llm_query()` REPL global (Option A implementation); read from environment at runtime
- RLM guardrails: `.claude/rlm-config.json` per workspace (optional override); defaults in `plugins/lz-nx.rlm/scripts/rlm-config.mjs`
  - `maxIterations`: 20
  - `maxDepth`: 1
  - `maxTimeout`: 120000 (2 minutes)
  - `maxConsecutiveErrors`: 3
  - `outputTruncation`: 2048 (bytes)
  - `sandboxTimeout`: 5000 (5 seconds per code block)

**Build:**
- `tsconfig.base.json` - Root TypeScript config: `target: es2022`, `module: nodenext`, `moduleResolution: nodenext`, `strict: true`, `isolatedModules: true`
- `tsconfig.json` - Extends base, no references yet (no Nx projects scaffolded yet)
- `nx.json` - Nx configuration with plugins: `@nx/js/typescript` (typecheck + build), `@nx/vite/plugin` (build + test + serve), `@nx/eslint/plugin` (lint)
- `.prettierrc` - `{ "singleQuote": true }`
- `.prettierignore` - Excludes `/dist`, `/coverage`, `/.nx/cache`, `/.nx/workspace-data`

## Platform Requirements

**Development:**
- Node.js 24.x LTS (FNM-managed on development machine)
- Git (required for `git grep` in search functionality)
- Cross-platform: macOS, Linux, Windows (Git Bash); all scripts use Node.js for cross-platform operations, no shell-specific commands
- Windows-specific: Git Bash for Bash tool; PowerShell for `claude` CLI; cp1252 encoding limitation requires no Unicode/emoji in scripts

**Production (plugin target environments):**
- Any Nx workspace with Node.js >= 22.17.0 installed
- Nx >= 19.8 in the workspace being analyzed (stable CLI API: `show projects --json`, `graph --print`, `show project <name>`)
- Claude Code >= January 2026 (unified skills/commands, `agent` hook type, background subagents, subagent `memory` field)
- Git >= 2.x (for `git grep`)
- No native module compilation required; no `node_modules` install step in the plugin itself

## Model Routing

The plugin uses Claude Code's native subagent system for model routing (not external API calls for primary workflow):

| Agent | Model | Config | Purpose |
|-------|-------|--------|---------|
| `repl-executor` | Sonnet | `model: sonnet` in frontmatter | REPL orchestration, code generation for workspace navigation |
| `haiku-searcher` | Haiku | `model: haiku` in frontmatter | Mechanical search sub-calls |
| Main conversation | inherit | User's chosen model | Plugin does not override |

Model aliases (`sonnet`, `haiku`, `opus`, `inherit`) map to current versions: Sonnet 4.6, Haiku 4.5, Opus 4.6 as of March 2026.

---

*Stack analysis: 2026-03-03*
