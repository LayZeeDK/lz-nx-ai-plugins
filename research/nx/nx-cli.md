# Nx CLI Research

> Research on Nx CLI capabilities. Current workspace: **Nx 19.8.14**. Latest stable: **Nx 22.5.3**.
> Reference sandbox at `D:\projects\sandbox\nx22-3-angular21-0-vitest-browser-playwright` runs **Nx 22.3.1**.

## Sources

- [Nx Commands Reference](https://nx.dev/docs/reference/nx-commands)
- [Nx Cloud CLI Reference](https://nx.dev/docs/reference/nx-cloud-cli)
- [Nx Changelog](https://nx.dev/changelog)
- [Nx Blog: Oct 2025 Highlights](https://nx.dev/blog/nx-highlights-oct-2025)
- [Nx Cheatsheet (DEV Community)](https://dev.to/sakthicodes22/the-nx-cheatsheet-commands-for-daily-development-3h4k)

---

## Table of Contents

- [Core CLI Commands](#core-cli-commands)
  - [Running Tasks](#running-tasks)
  - [Affected & Smart Rebuilds](#affected--smart-rebuilds)
  - [Workspace Exploration](#workspace-exploration)
    - [nx graph](#nx-graph)
    - [nx graph via --graph flag on task commands](#nx-graph-via---graph-flag-on-task-commands)
    - [nx show project](#nx-show-project-projectname)
    - [nx show projects](#nx-show-projects)
    - [nx list](#nx-list)
    - [nx report](#nx-report)
    - [Quick Reference: Which Command When?](#quick-reference-which-command-when)
  - [Code Generation](#code-generation)
  - [Formatting](#formatting)
  - [Sync Generators](#sync-generators)
  - [File Watching](#file-watching)
- [Workspace Management](#workspace-management)
  - [Adding Plugins](#adding-plugins)
  - [Migrations & Upgrades](#migrations--upgrades)
  - [Repair & Reset](#repair--reset)
  - [Importing External Repos](#importing-external-repos)
  - [Initialization](#initialization)
- [Release Management](#release-management)
  - [nx release (Orchestrator)](#nx-release-orchestrator)
  - [nx release version](#nx-release-version)
  - [nx release changelog](#nx-release-changelog)
  - [nx release publish](#nx-release-publish)
  - [nx release plan (File-Based Versioning)](#nx-release-plan-file-based-versioning)
- [Terminal UI (TUI)](#terminal-ui-tui)
- [Nx Daemon](#nx-daemon)
- [AI Integration](#ai-integration)
  - [nx configure-ai-agents](#nx-configure-ai-agents)
  - [Nx MCP Server](#nx-mcp-server)
  - [MCP Server Tools](#mcp-server-tools)
  - [Self-Healing CI](#self-healing-ci)
- [Nx Cloud CLI](#nx-cloud-cli)
  - [Authentication](#authentication)
  - [CI Pipeline Commands](#ci-pipeline-commands)
  - [Nx Agents (Distributed Task Execution)](#nx-agents-distributed-task-execution)
  - [Remote Caching](#remote-caching)
- [Nx Enterprise / Powerpack](#nx-enterprise--powerpack)
- [What Changed: Nx 19 to Nx 22](#what-changed-nx-19-to-nx-22)
  - [Nx 20 (October 2024)](#nx-20-october-2024)
  - [Nx 21 (May 2025)](#nx-21-may-2025)
  - [Nx 22 (October 2025)](#nx-22-october-2025)
  - [Breaking Changes for 19.8 to 22.x Upgrade](#breaking-changes-for-198-to-22x-upgrade)
- [Nx 22.3 Sandbox Reference](#nx-223-sandbox-reference)

---

## Core CLI Commands

### Running Tasks

#### `nx run <project>:<target>[:configuration]`

Runs a single target for a project. Also supports **infix notation**: `nx build myapp` is equivalent to `nx run myapp:build`.

```bash
nx run myapp:build                        # run build target
nx run myapp:build:production             # with named configuration
nx build myapp --configuration=production # equivalent infix form
nx run myapp:build --graph                # preview task graph before running
nx run myapp:"build:test"                 # target name containing a colon
```

Key flags:
- `--configuration` / `-c` -- named configuration (e.g., `production`)
- `--graph` -- view/export task graph instead of running
- `--skipNxCache` / `--skipRemoteCache` -- bypass local or remote cache
- `--excludeTaskDependencies` -- skip dependent tasks
- `--outputStyle` -- `tui`, `dynamic`, `static`, `stream`, `stream-without-prefixes`
- `--tui` / `--no-tui` -- explicitly enable/disable Terminal UI
- `--tuiAutoExit` -- seconds before auto-closing TUI after completion

#### `nx run-many`

Runs a target across multiple (or all) projects in parallel.

```bash
nx run-many -t build test lint              # three targets on all projects
nx run-many -t test -p proj1 proj2          # specific projects
nx run-many -t build --parallel=5           # five concurrent workers
nx run-many -t test --projects='*-app'      # glob pattern
nx run-many -t test --projects='tag:type:ui'  # by project tag
nx run-many -t build --graph                # task graph preview
```

Key flags:
- `-t`, `--targets` -- one or more targets
- `-p`, `--projects` -- specific projects, globs, or `tag:` prefixes
- `--exclude` -- projects to skip
- `--parallel` -- concurrency (default 3; Nx 21.1+ auto-detects CPU count)
- `--nxBail` -- stop on first failure

#### `nx exec`

Executes an arbitrary shell command in the context of a project target. Useful for running one-off commands with Nx's project awareness.

### Affected & Smart Rebuilds

#### `nx affected`

Runs targets only for projects affected by changes, plus their dependents. Analyzes the dependency graph against a git diff.

```bash
nx affected -t test                              # test only what changed
nx affected -t lint test build                   # multiple targets
nx affected -t test --base=main --head=HEAD      # PR range
nx affected -t build --files=libs/mylib/src/index.ts  # specific changed file
nx affected -t=build --exclude='*,!tag:dotnet'   # only dotnet-tagged projects
nx affected -t=build --graph                     # preview task graph
```

Key flags:
- `-t`, `--targets` -- targets to run
- `--base` / `--head` -- git refs for comparison range (default: `main` / `HEAD`)
- `--files` -- explicit file list instead of git diff
- `--exclude` -- projects to skip (supports globs and `tag:` prefixes)
- `--parallel` -- max concurrent processes (default 3)
- `--nxBail` -- stop on first failure
- `--uncommitted` / `--untracked` -- include uncommitted or untracked files
- `--skipSync` -- skip running sync generators before tasks

### Workspace Exploration

#### `nx graph`

Opens an interactive browser-based visualization of the project dependency graph, or exports it as JSON/HTML. Supports two view modes: **project graph** (dependencies between projects) and **task graph** (execution order of specific targets).

```bash
# Interactive browser views
nx graph                                  # open interactive project graph
nx graph --focus=my-app                   # subgraph for one project and its ancestors/descendants
nx graph --exclude=shop-e2e              # hide specific projects
nx graph --groupByFolder                  # group project nodes by directory
nx graph --view=tasks --targets=build     # task graph for 'build' target
nx graph --affected                       # highlight affected projects

# Export / scripting
nx graph --file=output.json               # export graph data as JSON
nx graph --file=dep-graph.html            # export static HTML site
nx graph --print                          # full project graph as JSON to stdout

# Affected range (same flags as nx affected)
nx graph --affected --base=main --head=HEAD
nx graph --affected --files=libs/shared/src/index.ts
nx graph --affected --uncommitted
nx graph --affected --untracked

# Server options
nx graph --host=0.0.0.0 --port=4211      # bind to specific address/port
nx graph --watch                          # live-update as files change (default: true)
nx graph --open=false                     # don't auto-open browser
```

All flags:

| Flag | Type | Default | Description |
|---|---|---|---|
| `--view` | `projects` \| `tasks` | `projects` | Choose project graph or task graph |
| `--targets` | string | | Target(s) to show in task graph view |
| `--focus` | string | | Center on a project and its ancestors/descendants |
| `--exclude` | string | | Hide specific projects |
| `--affected` | boolean | | Highlight affected projects |
| `--groupByFolder` | boolean | | Group project nodes by directory |
| `--file` | string | | Output to file: `.json` for data, `.html` for static site |
| `--print` | boolean | | Print full graph as JSON to stdout |
| `--watch` | boolean | `true` | Auto-refresh browser as files change |
| `--open` | boolean | `true` | Auto-open browser |
| `--host` | string | | Bind graph server to specific IP address |
| `--port` | number | | Bind graph server to specific port |
| `--base` | string | | Base git ref for affected calculation |
| `--head` | string | | Head git ref for affected calculation |
| `--files` | string | | Explicit file list for affected calculation |
| `--uncommitted` | boolean | | Include uncommitted changes in affected |
| `--untracked` | boolean | | Include untracked changes in affected |
| `--verbose` | boolean | | Print additional information (e.g., stack traces) |

The `--print` JSON output includes the full project graph with nodes (project name, type, root, targets, tags) and dependencies between them.

#### `nx graph` via `--graph` flag on task commands

Any task-running command (`nx run`, `nx run-many`, `nx affected`) accepts a `--graph` flag to visualize the **task graph** for that specific invocation instead of executing the tasks.

```bash
nx build my-app --graph                   # task graph for building my-app
nx run-many -t build --graph              # task graph for building all projects
nx affected -t build --graph              # task graph for building affected projects
nx run-many -t lint test build --graph    # combined task graph for multiple targets
```

Clicking task nodes in the graph shows:
- Which executor runs the task
- Which inputs are used for the computation hash
- A link to the project's full configuration

#### `nx show project <projectName>`

Shows the fully resolved configuration for a single project. "Resolved" means all plugin-inferred targets, workspace defaults, and configuration merging have been applied -- you see exactly what Nx will use when running targets.

```bash
nx show project my-app                    # JSON to stdout (default)
nx show project my-app --json             # explicit JSON output
nx show project my-app --web              # rich browser view (default when interactive)
nx show project my-app --web --open=false # generate web view but don't open browser
```

All flags:

| Flag | Type | Default | Description |
|---|---|---|---|
| `--json` | boolean | | Output as JSON |
| `--web` | boolean | `true` (interactive) | Show in browser |
| `--open` | boolean | | Auto-open browser when using `--web` |
| `--verbose` | boolean | | Additional information (e.g., stack traces) |

Example output (JSON) shows: `root`, `name`, `projectType`, `sourceRoot`, `prefix`, `tags`, `implicitDependencies`, `targets` (with executor, options, configurations, inputs, outputs, dependsOn, cache, parallelism), and `metadata`.

#### `nx show projects`

Lists project names in the workspace, with powerful filtering for affected analysis, project type, target existence, tags, and glob patterns. Output is one project name per line by default.

```bash
# List all projects
nx show projects                              # one per line
nx show projects --json                       # JSON array
nx show projects --sep=,                      # comma-separated (useful for scripting)

# Filter by type
nx show projects --type app                   # applications only
nx show projects --type lib                   # libraries only
nx show projects --type e2e                   # e2e projects only

# Filter by target
nx show projects --with-target build          # projects that have a 'build' target
nx show projects --with-target serve          # projects that have a 'serve' target

# Filter by pattern (glob or tag)
nx show projects --projects='apps/*'          # glob by directory
nx show projects --projects='shared-*'        # glob by name prefix
nx show projects --projects='tag:scope:shop'  # by tag

# Affected projects
nx show projects --affected                   # affected by changes
nx show projects --affected --type app        # affected apps only
nx show projects --affected --exclude='*-e2e' # affected, excluding e2e projects
nx show projects --affected --base=main --head=HEAD

# Combine filters
nx show projects --type lib --with-target test --projects='tag:scope:shared'
```

All flags:

| Flag | Type | Default | Description |
|---|---|---|---|
| `--json` | boolean | | Output as JSON array |
| `-p`, `--projects` | string | | Filter by glob pattern or `tag:` prefix |
| `-t`, `--withTarget` | string | | Only projects that have a specific target |
| `--type` | `app` \| `lib` \| `e2e` | | Filter by project type |
| `--affected` | boolean | | Show only affected projects |
| `--exclude` | string | | Exclude projects matching pattern |
| `--sep` | string | `\n` | Output separator (e.g., `,` for comma-separated) |
| `--base` | string | | Base git ref for affected calculation |
| `--head` | string | | Head git ref for affected calculation |
| `--files` | string | | Explicit file list for affected calculation |
| `--uncommitted` | boolean | | Include uncommitted changes in affected |
| `--untracked` | boolean | | Include untracked changes in affected |
| `--verbose` | boolean | | Additional information |

Useful scripting patterns:

```bash
# Count projects by type
nx show projects --type lib | wc -l

# Pipe project names into another command
for p in $(nx show projects --with-target test); do nx test $p; done

# Comma-separated list for CI matrix
nx show projects --affected --with-target test --sep=,
```

#### `nx list`

Lists installed plugins and their available generators/executors. When called with a plugin name, shows the detailed capabilities of that plugin.

```bash
nx list                  # all installed plugins + available (not installed) plugins
nx list @nx/angular      # generators and executors from a specific plugin
```

Example output (abbreviated):

```
>  NX   Installed plugins:

   @nx/angular (executors, generators)
   @nx/eslint (executors, generators)
   @nx/vite (executors, generators)
   @nx/vitest (executors, generators)
   @nx/playwright (executors, generators)
   nx (executors, generators)

>  NX   Also available:

   @nx/cypress
   @nx/jest
   @nx/next
   @nx/react
   @nx/storybook
   ...
```

#### `nx report`

Prints all installed Nx plugin versions, Node.js version, OS, registered plugins, community plugins, and cache usage. Essential for bug reports and workspace diagnostics.

```bash
nx report
```

Example output:

```
 NX   Report complete - copy this into the issue template

Node           : 24.13.0
OS             : win32-arm64
npm            : 11.6.2

nx                : 22.3.1
@nx/angular       : 22.3.1
@nx/eslint        : 22.3.1
@nx/vite          : 22.3.1
@nx/vitest        : 22.3.1
typescript        : 5.9.3
---------------------------------------
Registered Plugins:
@nx/playwright/plugin
@nx/eslint/plugin
@nx/vite/plugin
@nx/vitest
---------------------------------------
Community plugins:
@analogjs/vite-plugin-angular : 2.1.3
---------------------------------------
Cache Usage: 0.00 B / 28.54 GB
```

#### Quick Reference: Which Command When?

| I want to... | Command |
|---|---|
| See all projects | `nx show projects` |
| See only apps / libs / e2e | `nx show projects --type app` |
| See projects with a specific target | `nx show projects --with-target serve` |
| See affected projects | `nx show projects --affected` |
| See full config for one project | `nx show project my-app` |
| See project config in browser | `nx show project my-app --web` |
| Visualize project dependencies | `nx graph` |
| Visualize one project's dependency tree | `nx graph --focus=my-app` |
| Visualize which projects are affected | `nx graph --affected` |
| Visualize task execution order | `nx graph --view=tasks --targets=build` |
| Preview task graph for a specific command | `nx build my-app --graph` |
| Export graph data for tooling | `nx graph --print` or `nx graph --file=out.json` |
| See installed plugins and capabilities | `nx list` |
| See generators for a plugin | `nx list @nx/angular` |
| Get version info for bug report | `nx report` |

### Code Generation

#### `nx generate` (alias: `nx g`)

Runs a generator to scaffold code. If the plugin is not installed, `nx generate` will install it first (equivalent to `nx add` + generate).

```bash
nx generate @nx/angular:component my-component
nx g @nx/angular:library my-lib
nx g component my-comp --dry-run          # preview without writing
```

### Formatting

#### `nx format:check` / `nx format:write`

Checks or applies Prettier formatting across the workspace.

```bash
nx format:check                           # check all (CI gate)
nx format:check --files=path/to/file      # check specific file
nx format:write                           # auto-format all
nx format:write --base=main --head=HEAD   # only changed files
```

Key flags:
- `--all` -- check/format all projects
- `--base` / `--head` -- only files changed in the given range
- `--files` -- explicit list of files
- `--projects` -- filter to specific projects

### Sync Generators

#### `nx sync` / `nx sync:check`

Runs all registered sync generators to keep derived files (e.g., TypeScript project references, `tsconfig.json` paths) up to date. Introduced in Nx 20 alongside TypeScript project references support.

```bash
nx sync            # apply all sync generators
nx sync:check      # check-only mode for CI (fails if changes needed)
```

Tasks automatically run sync before execution. Skip with `--skipSync`.

### File Watching

#### `nx watch`

Watches for file changes within specified projects and runs a command when changes are detected.

```bash
nx watch --projects=app -- echo $NX_PROJECT_NAME $NX_FILE_CHANGES
nx watch --projects=app1,app2 --includeDependentProjects -- echo $NX_PROJECT_NAME
nx watch --all -- nx build $NX_PROJECT_NAME
nx watch --projects=my-lib --initialRun -- nx build my-lib
```

Key flags:
- `--projects` / `-p` -- projects to watch
- `--all` -- watch all projects (including newly created ones)
- `--includeDependentProjects` / `-d` -- also watch dependent projects
- `--initialRun` / `-i` -- run the command once on startup before entering watch mode
- `--verbose` -- log commands before executing them

Environment variables available in the command:
- `$NX_PROJECT_NAME` -- the project that triggered the watch
- `$NX_FILE_CHANGES` -- space-separated list of changed files

---

## Workspace Management

### Adding Plugins

#### `nx add`

Installs a plugin and immediately runs its initialization generator.

```bash
nx add @nx/react                      # install matching version + auto-init
nx add @nx/react@17.0.0               # specific version
nx add non-core-nx-plugin             # community plugin at latest
```

Key flags:
- `--updatePackageScripts` -- update `package.json` scripts with inferred targets (default `true` for core plugins)

### Migrations & Upgrades

#### `nx migrate`

Automates upgrades between Nx versions. Generates a `migrations.json` file describing all code transformations needed, then applies them.

```bash
nx migrate latest                                    # update all Nx plugins to latest
nx migrate 22.3.1                                    # specific version
nx migrate latest --interactive                      # choose which updates to apply
nx migrate --run-migrations=migrations.json          # execute generated migrations
nx migrate --run-migrations --create-commits         # commit after each migration
nx migrate latest --from=nx@19.8.0 --exclude-applied-migrations
```

Key flags:
- `--from` -- override the detected starting version
- `--to` -- override target version for specific packages
- `--runMigrations` -- execute migrations from file (default `migrations.json`)
- `--createCommits` / `-C` -- commit after each migration
- `--commitPrefix` -- prefix for auto-commits (default: `chore: [nx migration] `)
- `--interactive` -- prompt for optional package updates
- `--excludeAppliedMigrations` -- skip already-applied migrations

Workflow:
1. `nx migrate latest` -- generates `migrations.json`
2. Review the file manually
3. `nx migrate --run-migrations` -- apply the changes
4. Delete `migrations.json` and commit

### Repair & Reset

#### `nx repair`

Runs all migrations from the `nx` package against the current repo to fix stale configuration. Useful when a repo was upgraded without `nx migrate`.

```bash
nx repair
```

#### `nx reset`

Clears cached Nx artifacts, metadata, and shuts down the daemon. Use when encountering strange build errors.

```bash
nx reset                   # full reset: cache + daemon + workspace data
nx reset --only-cache      # clear cached task outputs only
nx reset --only-daemon     # restart daemon only
nx reset --only-workspace-data  # clear workspace metadata only
nx reset --only-cloud      # reset Nx Cloud client only
```

### Importing External Repos

#### `nx import`

Imports code and git history from an external repository into the current workspace while preserving the full commit history.

```bash
nx import https://github.com/org/my-lib libs/my-lib
nx import https://github.com/org/big-mono --source=packages/utils --destination=libs/utils
nx import --ref=main --depth=100
```

Key flags:
- `--sourceRepository` -- remote URL of the source repo
- `--sourceDirectory` / `--source` -- subdirectory in the source repo to import
- `--destinationDirectory` / `--destination` -- target directory in the current workspace
- `--ref` -- branch from the source repo
- `--depth` -- limit clone depth for speed
- `--interactive` -- interactive mode (default `true`)

What it does:
1. Clones the source repository (optionally with limited depth)
2. Rewrites git history to place source files under the destination directory
3. Merges the rewritten history into the current repo
4. Analyzes the imported project and suggests relevant Nx plugins

Available since Nx 19. Plugin detection improved in Nx 20.

### Initialization

#### `nx init`

Adds Nx to an existing project or monorepo (zero-config adoption path).

```bash
nx init
nx init --nxCloud                             # connect to Nx Cloud during init
nx init --useDotNxInstallation                # install in .nx/ without modifying package.json
nx init --aiAgents=claude,copilot,cursor      # configure AI agents during init
```

---

## Release Management

### `nx release` (Orchestrator)

Orchestrates the full release workflow: **versioning** -> **changelog** -> **publishing**.

```bash
nx release --dry-run                    # preview all three phases
nx release --first-release              # first-time release (skip tag checks)
nx release                              # run all three phases
```

Shared flags:
- `--dry-run` / `-d` -- preview without writing or publishing
- `--groups` / `-g` -- target specific release groups
- `--projects` / `-p` -- target specific projects
- `--printConfig` -- print resolved release config and exit

Configuration in `nx.json`:
```json
{
  "release": {
    "projects": ["packages/*"],
    "releaseTag": {
      "pattern": "{projectName}@{version}",
      "requireSemver": true
    },
    "version": {
      "conventionalCommits": true
    },
    "changelog": {
      "workspaceChangelog": true
    }
  }
}
```

### `nx release version`

Bumps versions in `package.json` (or equivalent manifest files).

```bash
nx release version patch               # semver bump
nx release version 2.0.0               # exact version
nx release version prerelease --preid=alpha
```

Key flags:
- `--specifier` -- semver keyword (`major`, `minor`, `patch`, `prerelease`) or exact version
- `--preid` -- pre-release identifier (e.g., `alpha`, `beta`)
- `--first-release` -- skip checks requiring previous git tag
- `--git-commit`, `--git-tag`, `--git-push` -- auto-commit, tag, push after versioning

### `nx release changelog`

Generates `CHANGELOG.md` from git history or version plan files.

```bash
nx release changelog                         # auto-generate
nx release changelog --interactive=all       # edit before writing
```

Key flags:
- `--from` / `--to` -- git ref range
- `--interactive` / `-i` -- edit changelog in editor before applying (`all`, `workspace`, `projects`)
- `--git-commit`, `--git-tag`, `--git-push` -- automate git ops

### `nx release publish`

Publishes versioned projects to a registry (e.g., npm).

```bash
nx release publish                     # publish all
nx release publish --tag=next          # with dist-tag
nx release publish --registry=https://my-registry.example.com
```

Key flags:
- `--registry` -- override target registry URL
- `--tag` -- npm dist-tag (e.g., `latest`, `next`)
- `--access` -- `public` or `restricted`
- `--otp` -- one-time password for 2FA-protected publishing

### `nx release plan` (File-Based Versioning)

Creates version plan files specifying the desired semver bump and changelog entry per project. Alternative to conventional commits for teams that prefer explicit version planning.

```bash
nx release plan patch                   # create a version plan file
nx release plan:check                   # CI: verify every touched project has a plan
```

Key flags:
- `--bump` -- `major`, `minor`, `patch`, etc.
- `--message` / `-m` -- custom changelog entry text
- `--onlyTouched` -- only include projects changed by the current diff (default `true`)

Introduced in Nx 19.

---

## Terminal UI (TUI)

Introduced in Nx 21.0. Interactive terminal interface showing multiple running tasks in a split-pane view. Default output mode for local development from Nx 21 onward. **Windows support added in Nx 22.1.**

Features:
- Split-pane view: running tasks list + selected task's log output
- Arrow keys or Vim-style `h/j/k/l` navigation between tasks
- Press `?` for keyboard shortcut help
- Press `q` to exit
- Task focus mode (Nx 21.1) -- pin a single task's output full-screen
- Smooth scrolling (Nx 22) -- replaces pagination
- Live task duration estimates (Nx 21.3/21.4)

Configuration in `nx.json`:
```json
{
  "tui": {
    "enabled": false,
    "autoExit": 3
  }
}
```

Per-command control:
```bash
nx run-many -t build --no-tui         # disable TUI for this run
nx run-many -t build --tui            # force enable TUI
NX_TUI=false nx run-many -t build    # env var override
--outputStyle=tui                     # explicit style flag
--tuiAutoExit=5                       # 5-second auto-exit countdown
--tuiAutoExit=true                    # exit immediately after tasks finish
--tuiAutoExit=false                   # never auto-exit
```

TUI is automatically suppressed in CI environments (uses `static` output style).

---

## Nx Daemon

#### `nx daemon`

Background process that keeps the project graph in memory, dramatically speeding up repeated commands in large workspaces.

```bash
nx daemon            # print daemon status information
nx daemon --start    # manually start daemon
nx daemon --stop     # stop daemon
```

The daemon starts automatically on the first `nx` invocation and persists across commands.

---

## AI Integration

### `nx configure-ai-agents`

Configures agent instruction files, skills, and the Nx MCP server for supported AI coding assistants. Added in Nx 21.6.

```bash
nx configure-ai-agents                              # interactive setup
nx configure-ai-agents --agents=claude,copilot       # specific agents
nx configure-ai-agents --check=all                   # audit existing configs
nx configure-ai-agents --check=outdated              # check for outdated configs
```

Supported agents: `claude`, `codex`, `copilot`, `cursor`, `gemini`, `opencode`.

What it configures:
- Agent instruction files (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`, etc.)
- Agent skills (workspace exploration, code generation, task execution, CI monitoring)
- MCP server configuration

New workspaces created with `create-nx-workspace` automatically include AI configuration files from Nx 22 onward.

### Nx MCP Server

The MCP (Model Context Protocol) server connects AI coding agents to Nx workspace metadata, CI pipeline data, and current Nx documentation.

```bash
# Built-in from Nx 21.4+
nx mcp

# For Nx < 21.4
npx nx-mcp@latest
```

Options:
```bash
nx mcp --transport sse --port 9921   # HTTP/SSE transport instead of stdio
nx mcp --tools "*" "!nx_docs"        # exclude specific tools
nx mcp --tools "cloud_*"             # only cloud tools
nx mcp --no-minimal                  # enable all tools (not just default set)
nx mcp [workspacePath]               # specify workspace root
```

Manual configuration for Claude Code:
```bash
claude mcp add nx-mcp npx nx mcp
```

Via `.mcp.json`:
```json
{
  "servers": {
    "nx-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["nx", "mcp"]
    }
  }
}
```

### MCP Server Tools

**Default tools (minimal mode, Nx 22+):**
- `nx_docs` -- retrieve up-to-date Nx documentation sections
- `nx_current_running_tasks_details` -- list running TUI processes and task statuses
- `nx_current_running_task_output` -- retrieve output of a specific running task
- `nx_visualize_graph` -- open interactive graph in IDE (requires Nx Console)
- `ci_information` -- retrieve CI pipeline status and self-healing suggestions from Nx Cloud
- `update_self_healing_fix` -- apply or reject a self-healing CI fix
- `cloud_analytics_*` -- analytics tools for pipeline execution history

**Extended tools (with `--no-minimal`):**
- `nx_workspace` -- project graph and `nx.json` overview
- `nx_workspace_path` -- workspace root path
- `nx_project_details` -- full project configuration JSON
- `nx_available_plugins` -- list of available plugins
- `nx_generators` -- list of available generators
- `nx_generator_schema` -- schema for a specific generator
- `nx_run_generator` -- open Nx Console Generate UI with pre-filled options

In Nx 22, the philosophy shifted: workspace exploration and code generation are handled by **agent skills** (instruction files) rather than MCP tool calls -- more token-efficient.

### Self-Healing CI

Nx Cloud analyzes failing CI tasks and proposes fixes. The workflow:

1. PR triggers CI; a task fails
2. Nx Cloud analyzes the failure (logs, workspace structure, changed files)
3. A fix is proposed (visible in Nx Console IDE and via `ci_information` MCP tool)
4. Developer or AI agent reviews and applies: `nx apply-locally` or `update_self_healing_fix` MCP call
5. Fix is pushed and CI re-runs

Configuration in CI:
```bash
npx nx-cloud start-ci-run \
  --fix-tasks="*lint*,*format*" \
  --auto-apply-fixes="*lint*,*format*"
```

Commands:
```bash
nx apply-locally     # apply self-healing fix to local working tree
nx fix-ci            # alias for nx-cloud fix-ci
```

---

## Nx Cloud CLI

### Authentication

```bash
nx login [nxCloudUrl]      # browser-based OAuth, stores PAT in nxcloud.ini
nx logout                  # revoke and remove local token
nx connect                 # connect workspace to Nx Cloud
```

Config file locations:
- macOS/Linux: `$HOME/config/nxcloud/nxcloud.ini` or `$HOME/.nxcloud.ini`
- Windows: `%LOCALAPPDATA%/nxcloud/nxcloud.ini`

Non-interactive authentication:
```bash
npx nx-cloud configure --personalAccessToken=<token>
```

### CI Pipeline Commands

#### `nx-cloud start-ci-run`

Signals the beginning of a CI pipeline to Nx Cloud.

```bash
npx nx-cloud start-ci-run
npx nx-cloud start-ci-run --distribute-on="8 linux-medium-js" --stop-agents-after=lint,test,build
```

Key flags:
- `--distribute-on` -- agent configuration: `"8 linux-medium-js"` or path to YAML
- `--stop-agents-after` -- targets that signal when to terminate agents
- `--stop-agents-on-failure` -- terminate agents on failure (default `true`)
- `--with-env-vars` -- pass additional env vars to agents
- `--fix-tasks` -- glob patterns for tasks eligible for self-healing
- `--auto-apply-fixes` -- glob patterns for tasks where fixes are auto-applied to PRs

#### Other CI Commands

```bash
npx nx-cloud stop-all-agents       # terminate all agents for this run
npx nx-cloud complete-ci-run       # when --require-explicit-completion was set
npx nx-cloud cleanup               # remove temp marker files from accidental local run
nx record                          # record a non-Nx command in CI logs
nx view-logs                       # upload metrics and open analytics UI
```

#### `nx-cloud convert-to-nx-cloud-id`

Migrates from the legacy `nxCloudAccessToken` property to `nxCloudId` in `nx.json`. Required for Nx 19.7+ workspaces.

### Nx Agents (Distributed Task Execution)

Nx Agents are ephemeral CI machines managed by Nx Cloud. They start when `start-ci-run` is called and stop when work completes.

```yaml
# Typical CI pipeline
- run: npx nx-cloud start-ci-run --distribute-on="8 linux-medium-js" --stop-agents-after=lint,test,build
- run: nx affected -t lint
- run: nx affected -t test
- run: nx affected -t build
```

Dynamic scaling via YAML:
```yaml
# .nx/workflows/dynamic-changesets.yaml
distribute-on:
  small-changeset: 3 linux-medium-js
  medium-changeset: 6 linux-medium-js
  large-changeset: 10 linux-medium-js
```

```bash
npx nx-cloud start-ci-run --distribute-on=".nx/workflows/dynamic-changesets.yaml"
```

Per-command distribution control:
```bash
nx affected -t build --agents      # enable distribution for this command
nx affected -t build --no-agents   # disable distribution for this command
```

Manual distributed task execution (self-managed agents):
```bash
# Main job
npx nx-cloud start-ci-run --distribute-on=manual
nx affected -t build

# Each agent machine
NX_AGENT_NAME=agent-1 npx nx-cloud start-agent
```

### Remote Caching

Nx Cloud stores and shares task output caches across team members and CI runs. A task with identical inputs replays its cached result in milliseconds.

HTTP-based self-hosted caching (added in Nx 20.8): Teams can run their own remote cache endpoint without a full Nx Cloud subscription.

---

## Nx Enterprise / Powerpack

- **Polygraph** -- cross-repository dependency graph and governance for multi-repo organizations
- **Conformance** -- publish and enforce coding standards, generator rules, and refactoring patterns organization-wide
- **Nx Owners** -- project-level code ownership (compiles to file-based rules for VCS providers)
- **Dedicated infrastructure** -- self-hosted or managed Nx Cloud within your own cloud
- **Custom launch templates** -- configure Nx Agent machines with specific tooling and resources

---

## What Changed: Nx 19 to Nx 22

### Nx 20 (October 2024)

- **TypeScript project references** -- `create-nx-workspace --preset=ts` uses project references out of the box. `nx sync` auto-manages `tsconfig.json` references; `nx sync:check` validates in CI.
- **Package manager workspaces** -- TS preset uses `workspaces` in `package.json` for proper module linking.
- **Database-backed local cache** -- replaced file-based cache with SQLite for better performance at scale.
- **`nx import` improvements** -- plugin detection for imported projects, richer interactive mode.
- **`@nx/rspack` graduates from Labs** -- becomes fully supported.
- **`@nrwl` scope dropped** -- all packages now exclusively published under `@nx/*`.
- **Derived directories removed** -- generators now require explicit `--directory`.
- **ESLint v9 / flat config** -- new workspaces default to flat config.

### Nx 21 (May 2025)

- **Continuous tasks** -- tasks can be marked `continuous: true`, allowing other tasks to depend on long-running tasks (like `serve`) without waiting for them to exit. Enables `frontend:dev -> api:serve` pipelines natively.
- **Terminal UI (TUI)** -- interactive terminal for local development (see [TUI section](#terminal-ui-tui)).
- **Automatic CPU-based parallelism** (21.1) -- `--parallel` auto-detects available CPU cores.
- **Migrate UI in Nx Console** -- visual step-through of migrations, approve or reject each.
- **React Router plugin** -- `@nx/react-router` for framework mode.
- **Node minimum bumped to 20.19** -- Node 18 dropped.
- **Custom task runner API removed** -- replaced by `preTasksExecution`/`postTaskExecution` hooks.
- **`createNodesV1` removed** -- plugin authors must use `createNodesV2`.
- **`useLegacyCache` removed** -- database cache is now mandatory.
- **21.2** -- Angular 20, Storybook 9, Nest 11.
- **21.3** -- Jest 30, Angular 20.1, TUI live task durations.
- **21.4** -- Docker plugin (`@nx/docker`), `nx mcp` built-in command, Expo 53.
- **21.5** -- Vite 7, task graph multi-target support, Rspack webpack plugin conversion.
- **21.6** -- Angular 20.3, `nx configure-ai-agents` command, unified graph UI.

> **Security note:** Nx 21.5.0 and 21.6.0 were compromised by the S1ngularity malware attack and removed from npm. Use 21.5.1+ and 21.6.1+.

### Nx 22 (October 2025)

- **`@nx/dotnet` first-class plugin** -- auto-infers build/test/watch targets from `.csproj`/`.fsproj`/`.vbproj` files. All .NET projects get Nx caching, distributed execution, and self-healing CI.
- **`@nx/maven` plugin (experimental)** -- Maven support with caching and task distribution.
- **Self-Healing CI** -- Nx Cloud analyzes failing PRs and proposes verified fixes. GitLab support in testing at Nx 22 launch.
- **Project graph rewrite** -- composite mode renders workspaces with thousands of projects without crashing. Redesigned control panel.
- **pnpm catalog integration** -- `nx migrate` updates versions in `pnpm-workspace.yaml` catalogs.
- **Enhanced `nx release`** -- `ReleaseGraph` for graph-aware filtering; `updateDependents: "always"`.
- **TUI improvements** -- smooth scrolling, improved narrow display handling.
- **Module Federation** -- TypeScript solution-style support; ESM with MF (previously CJS only).
- **22.1** (Nov 2025) -- TUI on Windows; Next.js 16; Storybook 10; Vitest 4; new `@nx/vitest` plugin.
- **22.2** (Dec 2025) -- Expo 54; Nuxt v4; Storybook 10.1.
- **22.3** (Dec 2025) -- Angular 21; experimental `tsgo` compiler; Prettier v3.
- **22.4** (Jan 2026) -- patch releases.
- **22.5** (Feb 2026) -- patch releases. Latest: **22.5.3**.

### Breaking Changes for 19.8 to 22.x Upgrade

| Change | Version | Action Required |
|---|---|---|
| `@nrwl/*` packages removed | Nx 20 | Replace all `@nrwl/*` with `@nx/*` |
| `useLegacyCache` removed | Nx 21 | Remove from `nx.json`; database cache is mandatory |
| `createNodesV1` removed | Nx 21 | Migrate custom plugins to `createNodesV2` |
| Custom task runner API removed | Nx 21 | Migrate to `preTasksExecution`/`postTaskExecution` hooks |
| Node minimum raised to 20.19 | Nx 21 | Upgrade Node.js |
| `NX_DISABLE_DB` removed | Nx 22 | Remove from env |
| Legacy `nx release` versioning removed | Nx 22 | Cannot use `useLegacyVersioning: true` |
| `simpleName` generator option removed | Nx 22 | Update scripts using this flag |
| `useLegacyTypescriptPlugin` defaults `false` | Nx 22 | Test TS project graph behavior |
| `--legacy-peer-deps` no longer forced by npm | Nx 22 | Add to `.npmrc` if deps require it |
| `outputStyle=compact` removed | Nx 21 | Switch to `static`, `stream`, or `tui` |
| Angular 17 support removed | Nx 21.2 | Must be on Angular 18+ |
| Migrations prior to Nx 20 removed | Nx 22 | Must run `nx migrate` sequentially |

---

## Nx 22.3 Sandbox Reference

The sandbox workspace at `D:\projects\sandbox\nx22-3-angular21-0-vitest-browser-playwright` demonstrates an Nx 22.3 workspace with Angular 21, Vitest 4, and Playwright.

### Installed Nx Plugins

`@nx/angular`, `@nx/devkit`, `@nx/docker`, `@nx/esbuild`, `@nx/eslint`, `@nx/eslint-plugin`, `@nx/js`, `@nx/node`, `@nx/playwright`, `@nx/vite`, `@nx/vitest`, `@nx/web`, `@nx/workspace` -- all at 22.3.1.

### Workspace Structure

```
apps/
  api/           (Node.js backend, @nx/esbuild)
  shop/          (Angular 21 frontend, @angular/build:application)
  shop-e2e/      (Playwright E2E)
libs/
  api/products/  (API service library)
  shared/models/ (Shared data models)
  shop/
    feature-products/        (Angular feature)
    feature-product-detail/  (Angular feature)
    data/                    (Data access layer)
    shared-ui/               (UI components)
```

### Plugin Configuration in nx.json

```json
{
  "plugins": [
    { "plugin": "@nx/playwright/plugin", "options": { "targetName": "e2e" } },
    { "plugin": "@nx/eslint/plugin", "options": { "targetName": "lint" } },
    { "plugin": "@nx/docker", "options": { "buildTarget": "docker:build", "runTarget": "docker:run" } },
    { "plugin": "@nx/vite/plugin", "options": { "buildTargetName": "build", "serveTargetName": "serve" } },
    { "plugin": "@nx/vitest", "options": { "testTargetName": "vite:test" } }
  ]
}
```

### Key Technology Versions

- Angular 21.0.6, TypeScript 5.9.2, Vite 7.0.0, Vitest 4.0.9
- @analogjs/vite-plugin-angular + @analogjs/vitest-angular for SSR/testing
- ESLint 9.8.0 (flat config), Prettier 2.6.2, Express 4.21.2
- Playwright 1.36.0 with @vitest/browser-playwright

### Module Boundary Enforcement

```
scope:shared  -> can depend on: [scope:shared]
scope:shop    -> can depend on: [scope:shop, scope:shared]
scope:api     -> can depend on: [scope:api, scope:shared]
```

### Notable Patterns

- **Vitest as default test runner** (replaces Jest) with Analog.js Angular integration
- **`@nx/docker` plugin** auto-generates `docker:build` and `docker:run` targets
- **Plugin-based target inference** -- most targets are inferred from plugins rather than explicitly configured in `project.json`
- **Release configuration** for the `api` project with Docker integration
- **SQLite-based cache** in `.nx/cache/` (database-backed, not file-based)
