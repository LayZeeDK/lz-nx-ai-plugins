# External Integrations

**Analysis Date:** 2026-03-03

## APIs & External Services

**Claude Code Plugin System:**
- Service: Anthropic Claude Code (native plugin runtime)
- What it provides: Plugin packaging, auto-discovery, skill/agent/command/hook execution environment
- Integration: Plugin manifest at `plugins/lz-nx.rlm/.claude-plugin/plugin.json`; skills auto-invoked by context; agents spawned via Claude Code's subagent system
- No API key needed for plugin system itself

**~~Anthropic Claude API (direct)~~ (Eliminated):**
- The plugin exclusively targets Claude Code flat-rate subscriptions (Team, Max). All LLM calls — including `llm_query()` sub-calls — route through Claude Code's native subagent declarations. No direct Anthropic API dependency or SDK usage.

**Nx Claude Plugins Marketplace:**
- Service: GitHub repository `nrwl/nx-ai-agents-config`
- What it is used for: Plugin distribution and discovery; the `nx@nx-claude-plugins` marketplace is configured in `.claude/settings.json`
- Integration: `claude plugin install` resolves plugins from this marketplace source
- Config: `.claude/settings.json` defines `extraKnownMarketplaces.nx-claude-plugins.source` pointing to `github:nrwl/nx-ai-agents-config`

## Data Storage

**Databases:**
- None (no database dependency)

**Workspace Index (JSON file):**
- Type: Local JSON file written by `plugins/lz-nx.rlm/scripts/workspace-indexer.mjs`
- Location: `workspace-index.json` in the analyzed workspace (path TBD during Phase 1 implementation)
- Size: ~50-100KB for large workspaces (537 projects)
- Schema: Projects map, dependency adjacency list, reverse dependencies, tsconfig path aliases, stats
- Lifecycle: Written once per workspace session; incremental rebuild on git-detected `project.json` changes

**In-Memory Handle Store:**
- Type: In-process `Map<string, unknown[]>`
- Location: `plugins/lz-nx.rlm/scripts/handle-store.mjs`
- Lifecycle: Session-scoped; discarded when REPL context is reset
- Purpose: Large result sets (500+ matches) stored as handles; LLM sees lightweight stubs (`$res1: Array(247) [...]`)

**File Storage:**
- No cloud file storage
- All file access is local filesystem via `node:fs` in the REPL `read()` and `files()` globals, scoped to the analyzed workspace root

**Caching:**
- In-memory cache in `plugins/lz-nx.rlm/scripts/nx-runner.mjs`: 5-minute TTL for Nx CLI output (expensive commands like `nx graph --print` take 3-5 seconds on large workspaces)
- Nx's own task cache: `.nx/cache/` directory (standard Nx computation caching for build/test/lint targets)

## Authentication & Identity

**Auth Provider:**
- None (no user authentication, no API keys required)
- All LLM operations route through Claude Code's native subagent system under flat-rate subscriptions (Team, Max)

## Monitoring & Observability

**Error Tracking:**
- None (no external error tracking service)
- Errors are surfaced directly in the Claude Code conversation

**Logs:**
- No log files; all output goes to stdout/stderr captured by the Claude Code plugin system
- RLM execution loop appends sandbox output as user messages in the subagent's conversation context
- Scripts print ASCII-safe status messages (no Unicode/emoji due to Windows cp1252 constraint)

## CI/CD & Deployment

**Hosting:**
- No deployment target (plugin is distributed as a directory of `.mjs` scripts and `.md` files)
- Installation: `claude plugin install lz-nx.rlm@<marketplace>` or development mode via `claude --plugin-dir ./plugins/lz-nx.rlm`

**CI Pipeline:**
- Not configured (no CI workflow files detected in repository)
- Nx provides `nx affected` for selective task execution when CI is added

## Nx CLI Integration (Primary External Tool)

**Tool:** Nx CLI (`nx` binary in the workspace being analyzed)
- Invoked via `child_process.execSync` from `plugins/lz-nx.rlm/scripts/nx-runner.mjs`
- Invocation: `npx nx <command>` (uses the workspace's local Nx installation)
- Target Nx versions: 19.8+ through 22.5.x
- Allowlisted read-only commands:
  - `show projects --json` - Project listing with metadata filters
  - `show project <name> --json` - Per-project resolved configuration
  - `graph --print` - Full dependency graph as JSON
  - `report` - Workspace report
- Blocked commands: `build`, `test`, `lint`, `serve`, `generate`, `migrate`, `run`, and all mutation operations
- Timeout: 30 seconds per command
- Caching: Results cached in-memory with 5-minute TTL

**Tool:** git (`git grep`)
- Invoked from the REPL `search()` global via `child_process.spawnSync` with `shell: false` (avoids MSYS2 path munging on Windows and cmd.exe shell issues)
- Used for file content search scoped to Nx project source roots
- Assumed present in environment (Claude Code itself requires Git)
- Fallback: Node.js built-in `fs.globSync` + `readFileSync` + regex for non-git environments (see `.planning/quick/1-research-and-analyze-git-grep-and-altern/ANALYSIS.md`)

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None (HTTP hooks are a Claude Code plugin capability but not used in this plugin)

## Plugin System Hooks (Claude Code Native)

The plugin uses Claude Code's native hook system for automated behaviors (all deferred to a later milestone, not implemented in v0.0.1):

| Hook | Event | Purpose | Status |
|------|-------|---------|--------|
| SessionStart | Session initialization | Auto-rebuild workspace index when stale | Deferred (later milestone) |
| PreCompact | Context compaction | Preserve workspace context before auto-compaction | Deferred (later milestone) |
| PreToolUse | Tool intercept | Route index-answerable queries through REPL | Deferred (later milestone) |
| PostToolUse | After tool execution | Cache repeated search results | Deferred (later milestone) |

Hook scripts would live at `plugins/lz-nx.rlm/hooks/scripts/` with configuration in `plugins/lz-nx.rlm/hooks/hooks.json`.
Hook input arrives as JSON on stdin; output is JSON on stdout with optional `additionalContext` or `decision: "block"`.

## Environment Configuration

**Required env vars:**
- None. All LLM operations use Claude Code's native subagent system (flat-rate subscriptions). No API keys needed.

**Secrets location:**
- No secrets stored in repository
- `.env` files are gitignored
- No API keys required at runtime

---

*Integration audit: 2026-03-03*
