# Phase 1: Foundation + Commands - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Plugin shell, workspace indexer, path resolver, Nx runner, and three deterministic commands (deps, find, alias) delivering immediate user value with zero LLM tokens. Users can install the plugin, build a workspace index, and run commands that return useful results scoped to Nx projects.

</domain>

<decisions>
## Implementation Decisions

### Command output style

#### deps command
- Markdown nested list format (not ASCII tree) -- saves tokens in Claude's context
- Root project without `- ` prefix, children indented with `- ` at zero indent
- Name only per node (no type/tags)
- `--reverse` flag for reverse dependencies (who depends on this project)
- `--depth N` flag to limit tree depth (default: full depth)
- Shared subtrees: expand first occurrence, `^` marker on subsequent
- Circular deps: mark with `!` and stop recursing
- Legend line at bottom: `^ = deduped, ! = circular`
- Summary footer with deduped and circular counts: `N nodes (X direct, Y unique, Z deduped, W circular)`

#### find command (UPGRADED from roadmap)
- **Content search**, not file-name search -- project-scoped `git grep` via workspace index
- Resolves `--project` filter to source roots, runs `git grep` scoped to those roots
- Default: search all projects; truncate at 20 matches with warning suggesting `--project` to narrow
- `--project` supports glob patterns (e.g., `shared-*`) and comma-separated exact names
- Fixed string matching by default; regex via `/pattern/` delimiters (no `--regex` flag)
- `--context N` flag for surrounding context lines (default: matched line only)
- Output: line number + matched line, grouped by project, with summary footer

#### alias command
- Arrow direction: `input -> resolved` (alias->path or path->alias depending on input)
- No summary footer for single matches; footer with count for 2+ matches

#### Cross-cutting
- No `--json` flag -- skip for v0.0.1 (REPL provides structured access)
- Human-readable only

### Index lifecycle

#### Storage
- Location: `tmp/lz-nx.rlm/workspace-index.json` in user's workspace
- Gitignored via existing `tmp/` rule in Nx workspaces
- Scripts access via `process.cwd()` or `$CLAUDE_PROJECT_DIR`
- Scripts reference themselves via `${CLAUDE_PLUGIN_ROOT}/scripts/...`

#### Index schema (slim, transformed from raw nx graph --print)
- Single file containing projects, dependencies, pathAliases, meta
- Projects: `root`, `sourceRoot` (when present), `type` (app/lib/e2e), `tags`, `targets` (name -> executor only)
- Dependencies: `{ target, type }` where type is static/dynamic/implicit
- Path aliases from `tsconfig.base.json` -- exact mappings only, wildcard patterns ignored (non-compliant with enforce-module-boundaries)
- Meta: `builtAt`, `projectCount`
- ~50-100KB vs ~1.4MB raw for 149 projects (nrwl/nx measured)

#### Staleness detection
- Compare mtime of index file against `.nx/workspace-data/`, `tsconfig.base.json`, AND `nx.json`
- Three stat calls -- O(1) regardless of workspace size
- Research question: Can nx sync generators or nx watch replace this heuristic?

#### Build behavior
- Auto-build on first use (index missing)
- Auto-rebuild when stale detected (synchronous, blocks command)
- Single status line: `[INFO] Rebuilding workspace index...` / `[OK] Built (N projects, Xs)`
- No separate `/lz-nx.rlm:index` command -- auto-build/rebuild is sufficient

#### Error recovery
- On `nx graph --print` failure: auto-run `nx reset`, then retry once
- If retry fails: show raw Nx error (user must fix their environment)
- No partial graph support -- Nx treats graph build as all-or-nothing

### Find command scope (content search)
- Upgraded from filesystem glob to project-scoped content search (`git grep`)
- Token savings come from scoping search to specific project source roots
- Unscoped search truncates at 20 matches to prevent output flooding
- Project filter resolves via workspace index -- Claude doesn't need to know directory layout

### Alias resolution behavior
- Auto-detect direction: check alias keys first (exact), then path values (exact), then substring fallback
- Unscoped aliases (no `@` prefix) supported -- lookup order handles them
- Wildcard path mappings (`@org/*`) ignored with warning explaining they violate Nx module boundaries
- Substring fallback when no exact match, truncated at 20
- Substring results indicate which side matched: `Partial matches (alias):` or `Partial matches (path):`
- Reverse lookup (path->alias) returns all matches, not just first
- Multiple path arrays per alias: show all paths (TypeScript fallback resolution)
- No-match output: `[WARN] No match for '<input>'` with hint using real aliases/paths from the workspace index
- Summary footer only when 2+ matches

### Cross-command error patterns
- Unified error format across all three commands
- `[ERROR] Project 'name' not found (N indexed)` with hint to check `nx show projects`
- `[INFO] Building workspace index...` / `[OK] Built (N projects, Xs)` for auto-build
- `[ERROR] Missing required argument: <pattern|project|alias>` for missing input
- Index auto-builds transparently before command output

### Key environment variables for nx-runner
- `JAVA_HOME` -- Gradle plugins need this; set from environment, don't override
- `NX_TUI=false` -- prevents TUI escape sequences in stdout (CRITICAL)
- `NX_INTERACTIVE=false` -- prevents prompts that hang child process
- `NX_NO_CLOUD=true` -- skip Nx Cloud checks
- `NX_DAEMON=false` -- only for testing (disables daemon, slower)

### Claude's Discretion
- Exact truncation warning message wording
- Internal implementation of project glob matching
- Error message formatting details beyond the decided patterns
- Index file internal structure optimizations

</decisions>

<specifics>
## Specific Ideas

- Token efficiency is the guiding principle -- every output decision should minimize tokens in Claude's conversation context
- Deps uses markdown nested list (not ASCII tree) specifically because it's more token-efficient for LLM consumption
- Find was upgraded from filesystem glob to content search because the original spec had no token savings over existing Glob tool
- Deduped marker `^` ("see above") and circular marker `!` ("warning") chosen for ASCII/cp1252 safety and single-character token cost
- The brainstorm's `--tag` and `--type` filters for find are deferred -- `--project` with glob is sufficient for v0.0.1
- Alias hint on no-match uses real data from the workspace index (e.g., `Hint: Try an alias (@consensus/shared-utils) or path (libs/shared-utils/src/index.ts)`)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- No existing plugin code yet -- Phase 1 builds the foundation from scratch
- Plugin structure conventions from `plugin-dev` plugin guide the directory layout

### Established Patterns
- `${CLAUDE_PLUGIN_ROOT}` for all intra-plugin path references (commands, skills, hooks)
- `$CLAUDE_PROJECT_DIR` / `process.cwd()` for user's workspace root
- `import.meta.url` for sibling file resolution within scripts

### Integration Points
- Plugin installs into Claude Code's plugin system via `.claude-plugin/plugin.json`
- Commands auto-discovered from `commands/` directory
- Workspace index stored in user's workspace `tmp/lz-nx.rlm/` (gitignored)
- Nx CLI accessed via `execSync` in nx-runner with mandatory env vars

### Research items for phase researcher
1. Can nx sync generators be local scripts or do they require npm packages?
2. Does nx watch support project graph change detection?
3. Could a SessionStart hook launch nx watch as background process?
4. Simplest Nx-native index rebuild satisfying zero-npm-deps constraint?
5. Does `windowsHide: true` in execSync suppress cmd.exe popups on Windows?
6. Is there an Nx-native way to skip broken plugins from graph computation?
7. Verify .nx/workspace-data mtime behavior is reliable for staleness in real Nx workspaces
8. Explore nrwl/nx local clone and Nx docs (via MCP) for sync generator setup

</code_context>

<deferred>
## Deferred Ideas

- `--tag` filter for find command (search by Nx project tags) -- future enhancement
- `--type` filter for find command (search by file type: test, source, config) -- future enhancement
- `/lz-nx.rlm:status` command for session metrics and token benchmarking -- deferred to later milestone (OBSV-02)
- Remove index build status logs once mechanism is proven stable -- later milestone polish

</deferred>

---

*Phase: 01-foundation-commands*
*Context gathered: 2026-03-04*
