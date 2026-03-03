# Technology Stack

**Analysis Date:** 2026-03-03

## Languages

**Primary:**
- TypeScript - Plugin development and RLM implementations
- Node.js/JavaScript - Scripts for workspace indexing, CLI wrappers, REPL sandboxes

**Secondary:**
- Markdown - Documentation and brainstorms
- JSON - Configuration files (Claude plugin format, hooks, tsconfig paths)
- Bash - Cross-platform shell scripting via Git Bash

## Runtime

**Environment:**
- Node.js LTS - Required platform for plugins and scripts (cross-platform via FNM)
- Git Bash - Available on Windows for CLI operations

**Package Manager:**
- npm - Primary (inferred from gitignore references to `npm-debug.log`)
- Lockfile: Not present (repository contains research and planning, no implementations yet)

## Frameworks & Platforms

**Claude Code Plugin System:**
- Claude Code SDK - Plugin development and deployment
- plugin-dev @claude-plugins-official - Development tooling
- Claude Code with Agent Teams - Multi-agent orchestration capability (documented in research)

**Codebase Context:**
- Nx Workspace - Target monorepo type for plugins (537 projects, ~1.5-2M LOC)
- Angular 18 - Primary frontend framework in target workspace
- TypeScript - Language for target workspace code

## Key Runtime Components

**REPL Environments:**
- Node.js vm.createContext() - Sandbox REPL isolation for RLM execution
- LocalREPL - Python REPL backend (documented in RLM research)
- DockerREPL - Container-based REPL backend

**CLI Integration:**
- Nx CLI - Project dependency graph, `nx show projects --json`, `nx graph --print`, `nx affected`
- TypeScript Compiler (tsc) - Type-aware code analysis
- Git - Repository navigation and file tracking

## Key Dependencies (Research Phase)

**RLM Implementations:**
- Official RLM library (alexzhang13/rlm) - Reference implementation
- Various community RLM libraries (TypeScript, Python, Deno variants)
- MCP (Model Context Protocol) servers - For external tool integration

**Claude Code Integration:**
- Agent Teams API - Multi-agent task orchestration
- Subagents API - Single-session task delegation
- Plugin hooks - SessionStart, PreToolUse, PostToolUse, PreCompact events

**Testing & Analysis:**
- Testing Library - Pattern compliance in target workspace
- Jest or Vitest - Test framework assumptions (from AGENTS.md patterns)

## Configuration

**Environment:**
- `.env` file support for plugin secrets and API keys (listed in gitignore)
- Local credential storage: `.env`, `.env.*` files (never read in analysis)
- Plugin root: `${CLAUDE_PLUGIN_ROOT}` variable available in hooks.json

**Build & Development:**
- TypeScript config: Expected `tsconfig.base.json` with path aliases in target workspace
- Claude plugin manifest: `.claude-plugin/plugin.json` per plugin
- Hook configuration: `hooks.json` per plugin
- VSCode workspace settings: `.vscode/settings.json`, `.vscode/launch.json`

**Target Workspace Configuration:**
- `nx.json` - Nx workspace configuration
- `project.json` - Per-project Nx configuration
- `tsconfig.base.json` - TypeScript path alias definitions
- `package.json` - Dependencies and scripts

## Platform Requirements

**Development:**
- macOS, Linux, or Windows 11+ with Git Bash
- Node.js LTS installed and available on PATH
- Claude CLI from PowerShell (Windows) or shell
- Git 2.37+ (for worktree support, native since Claude Code v2.1.49)

**Plugin Execution:**
- Claude Code environment with plugin system support
- Agent Teams capability for multi-agent features
- Access to target Nx workspace filesystem
- Permission to execute: `nx`, `git`, Node.js scripts

**Target Workspace Requirements (1.5-2M LOC):**
- Nx 19.8+
- Angular 18+
- ~1,700 components with standardized patterns
- 537 projects with dependency graph
- ComponentStore usage (connect-style architecture)
- Testing Library conventions

## Build & Deployment

**Plugin Development:**
- CLI commands: `/plugin install plugin-dev@claude-plugins-official`
- Plugin validation: Manifest and hook configuration validation
- No native build step (TypeScript plugins typically run interpreted)

**Script Execution:**
- Node.js scripts run via: `node scripts/workspace-indexer.mjs`
- Bash scripts run via Git Bash (cross-platform fallback)
- No compilation required for TypeScript in plugin context

**Target Workspace Interaction:**
- Nx CLI execution: `nx show projects --json`, `nx graph --print`, `nx affected --files ...`
- Git commands: File diff, project tracking
- TypeScript parsing: tsconfig.base.json for alias resolution

## Workspace Index Generation

**Source Data:**
- `nx show projects --json` - Project metadata and source roots
- `nx graph --print` - Dependency adjacency list
- `tsconfig.base.json` - Path aliases and compiler options
- `package.json` - Global dependencies and scripts
- Component registry (regex scan): `@Component({ selector: '...' })`
- Service registry (regex scan): `providedIn: 'root'`
- Route map: `app.routes.ts` and `loadChildren` patterns

**Output:**
- `.claude/workspace-index.json` - ~50-100KB structured representation
- Incremental rebuild based on file mtimes
- Component, service, store, and route registries

## Security & Credentials

**Never in Repository:**
- Environment variable files: `.env`, `.env.*`
- Credentials: `credentials.json`, `secrets.json`
- Private keys: `*.pem`, `*.key`, `id_rsa*`, `id_ed25519*`
- Package manager auth: `.npmrc`, `.pypirc`, `.netrc`

**Plugin Secrets:**
- Stored in Claude environment variables (not in repo)
- Referenced via `process.env.VAR_NAME` in scripts
- Never logged or exposed in plugin output

---

*Stack analysis: 2026-03-03*
