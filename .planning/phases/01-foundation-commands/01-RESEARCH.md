# Phase 1: Foundation + Commands - Research

**Researched:** 2026-03-04
**Domain:** Claude Code plugin architecture, Nx CLI programmatic usage, cross-platform Node.js scripting
**Confidence:** HIGH

## Summary

Phase 1 builds the lz-nx.rlm plugin from scratch: the plugin shell, workspace indexer, path resolver, Nx runner, and three deterministic commands (deps, find, alias). All components are pure Node.js (.mjs) with zero npm dependencies, targeting macOS, Linux, and Windows (Git Bash).

The research investigated Claude Code plugin structure (auto-discovered commands, skills, agents, hooks from standard directories), Nx CLI output schemas for programmatic consumption (`nx graph --print` as the sole data source), `tsconfig.base.json` path alias formats, `execSync` cross-platform behavior, and `git grep` as the primary search engine for the find command. The existing Nx CLI research document in `research/nx/nx-cli.md` provides verified JSON schemas, performance data, error handling patterns, and environment variables -- all directly usable by the planner.

**Primary recommendation:** Build as a standard Claude Code plugin using commands/ directory with markdown frontmatter. Use `nx graph --print` as the single data source for the workspace index (avoids N+1 per-project calls). Use `git grep` for the find command's content search. Store the index at `tmp/lz-nx.rlm/workspace-index.json` in the user's workspace.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **deps output**: Markdown nested list format, name only, `--reverse` and `--depth N` flags, `^` deduped / `!` circular markers, legend + summary footer
- **find command**: Content search via project-scoped `git grep`, `--project` with glob/comma patterns, fixed string default / `/pattern/` regex, `--context N`, 20-match truncation for unscoped, grouped by project with summary footer
- **alias command**: Arrow `input -> resolved`, auto-detect direction, wildcard `@org/*` ignored with warning, substring fallback truncated at 20, summary footer only for 2+ matches
- **Cross-cutting**: No `--json` flag for v0.0.1, human-readable only
- **Index storage**: `tmp/lz-nx.rlm/workspace-index.json` in user workspace, gitignored via `tmp/`
- **Index schema**: Single file with projects (root, sourceRoot, type, tags, targets name->executor), dependencies ({target, type}), pathAliases (exact only, no wildcards), meta (builtAt, projectCount)
- **Staleness**: Compare mtime of index against `.nx/workspace-data/`, `tsconfig.base.json`, AND `nx.json` -- three stat calls O(1)
- **Build behavior**: Auto-build on first use, auto-rebuild when stale, single status line, no separate index command
- **Error recovery**: On `nx graph --print` failure: auto-run `nx reset`, retry once; if retry fails: show raw error
- **Env vars**: `NX_TUI=false`, `NX_INTERACTIVE=false`, `NX_NO_CLOUD=true` mandatory
- **No separate index command**: Auto-build/rebuild is sufficient

### Claude's Discretion
- Exact truncation warning message wording
- Internal implementation of project glob matching
- Error message formatting details beyond the decided patterns
- Index file internal structure optimizations

### Deferred Ideas (OUT OF SCOPE)
- `--tag` filter for find command
- `--type` filter for find command
- `/lz-nx.rlm:status` command
- Remove index build status logs (later polish)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FOUND-01 | Workspace indexer builds JSON index from Nx CLI output (`nx graph --print` + `tsconfig.base.json`) | Nx CLI JSON schemas verified (GraphOutput, GraphNode, DependencyEdge), performance data (3.8s sandbox, ~5-15s 537 projects), maxBuffer 10MB required, error handling patterns documented |
| FOUND-02 | Path resolver translates between file paths and tsconfig path aliases bidirectionally | tsconfig.base.json format verified, alias-to-project mapping algorithm documented, edge cases (array values, baseUrl, wildcard exclusion) covered |
| FOUND-03 | Nx-runner wraps Nx CLI with allowlisting, timeout, caching, env vars, error detection | Safe command allowlist defined, env var block verified, error detection pattern (exit code + JSON parse) documented, `windowsHide: true` confirmed for Windows |
| CMD-01 | `/lz-nx.rlm:deps` prints dependency tree | Dependency data available in `nx graph --print` output as adjacency list, DependencyEdge schema provides source/target/type |
| CMD-02 | `/lz-nx.rlm:find` searches files scoped to Nx projects | `git grep` verified as primary tool (cross-platform, zero-dep, git-aware), source root scoping via workspace index |
| CMD-03 | `/lz-nx.rlm:alias` resolves tsconfig path aliases bidirectionally | Path alias format verified (always array, first entry, relative to baseUrl), bidirectional map construction algorithm documented |
| PLUG-01 | Plugin follows Claude Code plugin conventions | Plugin structure verified: `.claude-plugin/plugin.json` + auto-discovered `commands/` directory, `${CLAUDE_PLUGIN_ROOT}` for paths, frontmatter for metadata |
| PLUG-02 | All scripts cross-platform Node.js with zero npm dependencies | Node.js 24.13.0 available, `execSync`/`execFileSync` with `windowsHide: true`, `fs.readFileSync`, `JSON.parse`, `child_process.spawnSync('git', [...])` -- all zero-dep |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | LTS (24.x) | Runtime for all scripts | Constraint: zero npm deps, Node.js only |
| `node:child_process` | built-in | `execSync` for Nx CLI, `spawnSync` for git grep | Cross-platform, synchronous, zero deps |
| `node:fs` | built-in | Read `tsconfig.base.json`, write index, stat for staleness | Standard file operations |
| `node:path` | built-in | Cross-platform path manipulation | Windows/Unix path normalization |
| `git grep` | ships with Git | Content search for find command | Fastest cross-platform search, inherent .gitignore awareness |
| Nx CLI | user's workspace version | `nx graph --print` for workspace data | Plugin operates on user's Nx workspace |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:url` | built-in | `import.meta.url` for sibling file resolution | Scripts referencing other scripts within the plugin |
| `node:os` | built-in | Platform detection if needed | Only if platform-specific behavior required |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `git grep` | `rg` (ripgrep) | Better regex features but not guaranteed installed; QEMU-emulated on Windows arm64 (2.5x slower) |
| `execSync` | `spawnSync` | `spawnSync` avoids shell metachar issues but requires arg array; use `spawnSync` for git grep, `execSync` for Nx CLI |
| Single `nx graph --print` | Per-project `nx show project` calls | N+1 pattern takes ~18-27 min for 537 projects vs ~5-15s for single graph call |

**Installation:**
```bash
# No installation needed -- zero npm dependencies
# Plugin installs via Claude Code plugin system:
# /plugin install lz-nx.rlm  (from marketplace)
# claude --plugin-dir ./plugins/lz-nx.rlm  (local dev)
```

## Architecture Patterns

### Recommended Plugin Structure
```
plugins/lz-nx.rlm/
  .claude-plugin/
    plugin.json               # Plugin metadata (name, version, description)
  commands/
    deps.md                   # /lz-nx.rlm:deps slash command
    find.md                   # /lz-nx.rlm:find slash command
    alias.md                  # /lz-nx.rlm:alias slash command
  scripts/
    workspace-indexer.mjs     # Builds JSON index from nx graph --print + tsconfig
    path-resolver.mjs         # Bidirectional alias <-> path resolution
    nx-runner.mjs             # Safe Nx CLI wrapper with allowlist + env
    deps-command.mjs          # Dependency tree rendering logic
    find-command.mjs          # Project-scoped git grep wrapper
    alias-command.mjs         # Alias resolution logic
    shared/
      index-loader.mjs        # Load index, check staleness, trigger rebuild
      output-format.mjs       # Shared output formatting (status lines, errors)
      project-filter.mjs      # Glob/comma project name matching
```

### Pattern 1: Command Markdown with Script Execution
**What:** Each command is a markdown file in `commands/` that uses `!` backtick syntax to inject dynamic data and instructs Claude to run the underlying script.
**When to use:** All three commands (deps, find, alias).
**Why:** Commands are the correct Claude Code primitive for deterministic operations that need zero LLM interpretation. The command markdown provides the user-facing interface; the script does the work.

**Example (commands/deps.md):**
```yaml
---
name: deps
description: Print dependency tree for an Nx project
argument-hint: <project> [--reverse] [--depth N]
disable-model-invocation: true
allowed-tools: Bash(node *)
---

Run the deps command to show the dependency tree for the specified Nx project.

Execute this command and display its output directly to the user:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/deps-command.mjs $ARGUMENTS
```

If the command exits with a non-zero code, display the error output to the user.
```

### Pattern 2: Index-Loader with Staleness Check
**What:** Every command loads the workspace index through a shared loader that checks staleness before returning data.
**When to use:** All three commands share this pattern.
**Why:** Centralizes index lifecycle (auto-build, auto-rebuild, staleness detection) in one module.

**Example (scripts/shared/index-loader.mjs):**
```javascript
import { statSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const INDEX_DIR = 'tmp/lz-nx.rlm';
const INDEX_FILE = 'workspace-index.json';

export function loadIndex(workspaceRoot) {
  const indexPath = join(workspaceRoot, INDEX_DIR, INDEX_FILE);

  if (!indexExists(indexPath) || isStale(workspaceRoot, indexPath)) {
    rebuildIndex(workspaceRoot, indexPath);
  }

  return JSON.parse(readFileSync(indexPath, 'utf8'));
}

function isStale(workspaceRoot, indexPath) {
  const indexMtime = getMtime(indexPath);

  if (indexMtime === null) {
    return true;
  }

  // Three O(1) stat calls
  const sources = [
    join(workspaceRoot, '.nx', 'workspace-data'),
    join(workspaceRoot, 'tsconfig.base.json'),
    join(workspaceRoot, 'nx.json'),
  ];

  for (const source of sources) {
    const sourceMtime = getMtime(source);

    if (sourceMtime !== null && sourceMtime > indexMtime) {
      return true;
    }
  }

  return false;
}
```

### Pattern 3: Nx-Runner with Allowlist and Error Recovery
**What:** All Nx CLI calls go through a single runner that enforces command allowlisting, sets mandatory environment variables, and handles errors uniformly.
**When to use:** workspace-indexer.mjs calls nx-runner for `nx graph --print`.
**Why:** Security (no arbitrary command execution), reliability (env vars prevent TUI corruption), error recovery (auto `nx reset` + retry).

### Pattern 4: Script-per-Command Architecture
**What:** Each command has its own entry-point script (e.g., `deps-command.mjs`) that parses arguments, loads the index, and writes formatted output to stdout.
**When to use:** All commands.
**Why:** Keeps each command independently testable and debuggable. Scripts can be run standalone: `node scripts/deps-command.mjs my-project --reverse`.

### Anti-Patterns to Avoid
- **Don't read `nx graph --print` output inside the command script directly.** Always go through nx-runner.mjs for allowlisting and env var enforcement.
- **Don't use `process.cwd()` without fallback.** Use `process.env.CLAUDE_PROJECT_DIR || process.cwd()` for the workspace root. When invoked via Claude Code plugin, `process.cwd()` is the user's workspace.
- **Don't parse Nx error messages from stderr.** Nx writes most errors to stdout, not stderr. Check exit code first, then validate JSON parse.
- **Don't use `fs.existsSync` for staleness.** Use `statSync` to get mtime in a single call rather than separate exists + stat.
- **Don't use template literals for user-facing output.** Use string concatenation or format helpers to keep cp1252 compatibility (no emojis, no fancy Unicode).
- **Don't store full target configurations in the index.** Extract only `name -> executor` to keep index slim (~50-100KB vs ~2-4MB).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Content search | Custom file walker + regex | `git grep` via `spawnSync` | Handles .gitignore, binary detection, encoding, massive speedup over Node.js |
| Glob pattern matching for `--project` | Custom regex-based globber | `minimatch`-style matching with simple wildcard expansion | But since zero deps: hand-roll simple glob (only `*` wildcard needed for project names) |
| JSON pretty-printing | Custom formatter | `JSON.stringify(data, null, 2)` | Built-in, handles edge cases |
| Path normalization | Custom slashify | `path.posix.join` or `path.normalize` | Cross-platform path handling |
| Circular dependency detection | BFS with manual visited set | Standard graph traversal with visited Set | Simple enough to hand-roll, but use a proper Set not an array |

**Key insight:** The zero-npm-deps constraint means we hand-roll more than usual, but keep it to simple utilities (arg parsing, glob matching, tree formatting). The heavy lifting (search, Nx CLI interaction, file I/O) uses Node.js builtins and Git.

## Common Pitfalls

### Pitfall 1: Nx Writes Errors to stdout
**What goes wrong:** Code checks stderr for errors, misses Nx error messages, treats corrupted output as valid JSON.
**Why it happens:** Unlike most CLI tools, Nx writes error messages (project not found, invalid git ref, etc.) to stdout, not stderr. Only usage help errors go to stderr.
**How to avoid:** Check exit code first (non-zero = error). Then attempt `JSON.parse(stdout)`. If exit code is 0 but parse fails, treat as unexpected error.
**Warning signs:** `SyntaxError: Unexpected token` when parsing Nx output.

### Pitfall 2: maxBuffer Overflow on Large Workspaces
**What goes wrong:** `execSync` throws `ERR_CHILD_PROCESS_STDIO_MAXBUFFER` on workspaces with 200+ projects.
**Why it happens:** Default `maxBuffer` is 1MB. `nx graph --print` for 537 projects produces 2-4MB of JSON.
**How to avoid:** Set `maxBuffer: 10 * 1024 * 1024` (10MB) for `nx graph --print` calls.
**Warning signs:** Command works on small workspaces, fails silently or throws on large ones.

### Pitfall 3: TUI Escape Sequences in stdout
**What goes wrong:** Nx output contains ANSI escape sequences, corrupting JSON parsing.
**Why it happens:** Nx 21+ defaults to TUI mode for local development. Without `NX_TUI=false`, even non-task commands may include escape codes.
**How to avoid:** Always set `NX_TUI: 'false'` in the env block. Also set `NX_DEFAULT_OUTPUT_STYLE: 'static'` as a fallback.
**Warning signs:** JSON parse errors with `\x1b[` sequences in the raw output.

### Pitfall 4: Windows cmd.exe Console Window Flash
**What goes wrong:** On Windows, `execSync` spawns a visible cmd.exe window that flashes briefly.
**Why it happens:** Windows creates a console window for child processes by default.
**How to avoid:** Pass `windowsHide: true` in `execSync`/`spawnSync` options. This uses the `UV_PROCESS_WINDOWS_HIDE` flag to suppress the console window.
**Warning signs:** Users on Windows report brief console flashes when running commands.

### Pitfall 5: `.nx/workspace-data/` Directory Staleness False Positives
**What goes wrong:** Index rebuilds too frequently because `.nx/workspace-data/` mtime changes even when the project graph hasn't changed.
**Why it happens:** The Nx daemon updates `file-map.json`, lock file hashes, and other metadata files inside `.nx/workspace-data/` on any file change, not just project graph changes. The directory mtime updates when any contained file is written.
**How to avoid:** Use the mtime of `.nx/workspace-data/` **directory** itself as a signal (any Nx-relevant change triggers a daemon update). Accept that some rebuilds may be unnecessary -- the rebuild is fast (5-15s) and correctness is more important than avoiding occasional redundant rebuilds. Alternatively, check `project-graph.json` mtime specifically instead of the directory.
**Warning signs:** Index rebuilds on every command invocation even when no projects changed.

### Pitfall 6: `$ARGUMENTS` with Command Substitution
**What goes wrong:** Commands containing `$()` or backtick substitution in `!` backtick preprocessing trigger permission prompts.
**Why it happens:** Claude Code security feature blocks command substitution in backtick-preprocessed commands.
**How to avoid:** Don't use `$()` inside `!` backtick commands in markdown. Pass arguments directly to the script and let the script handle all logic.
**Warning signs:** Permission prompts on every command invocation.

### Pitfall 7: graph type vs projectType Discrepancy for e2e Projects
**What goes wrong:** e2e projects misclassified as "application" type in the index.
**Why it happens:** In `nx graph --print` output, e2e projects have `type: "e2e"` at the GraphNode level but `data.projectType: "application"` inside the data object.
**How to avoid:** Use `node.type` (graph-level) for project type classification, not `node.data.projectType`.
**Warning signs:** Deps tree shows e2e projects as regular applications.

### Pitfall 8: tsconfig.base.json May Not Exist
**What goes wrong:** Script crashes with ENOENT when trying to read tsconfig.base.json.
**Why it happens:** Not all Nx workspaces have a `tsconfig.base.json`. Some use `tsconfig.json` with paths, others use TypeScript project references with `nx sync`.
**How to avoid:** Check for `tsconfig.base.json` first, fall back to `tsconfig.json`, handle missing paths gracefully (empty alias map).
**Warning signs:** Alias command fails on workspaces without tsconfig.base.json.

## Code Examples

Verified patterns from official sources and prior research.

### Nx-Runner Core Pattern
```javascript
// Source: research/nx/nx-cli.md (verified against Nx 22.3 sandbox)
import { execSync } from 'node:child_process';

const NX_ENV = {
  NX_TUI: 'false',
  NX_INTERACTIVE: 'false',
  NX_NO_CLOUD: 'true',
};

const SAFE_PREFIXES = [
  'show projects',
  'show project',
  'graph --print',
  'list',
  'report',
  'daemon',
];

export function runNx(command, options = {}) {
  const normalized = command.replace(/\s+--\S+/g, '').replace(/\s+\S+$/, '').trim();
  const allowed = SAFE_PREFIXES.some(prefix => normalized.startsWith(prefix));

  if (!allowed) {
    return { data: null, error: `[ERROR] Command not allowed: nx ${command}` };
  }

  const workspaceRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  try {
    const stdout = execSync(`npx nx ${command}`, {
      encoding: 'utf8',
      maxBuffer: options.maxBuffer || 1024 * 1024,
      cwd: workspaceRoot,
      env: { ...process.env, ...NX_ENV },
      timeout: options.timeout || 60000,
      windowsHide: true,
    });

    if (options.expectJson) {
      try {
        return { data: JSON.parse(stdout), error: null };
      } catch {
        return { data: null, error: `Unexpected non-JSON output: ${stdout.slice(0, 200)}` };
      }
    }

    return { data: stdout, error: null };
  } catch (err) {
    const message = err.stdout || err.stderr || err.message;

    return { data: null, error: message.slice(0, 500) };
  }
}
```

### Workspace Index Transform Pattern
```javascript
// Source: research/nx/nx-cli.md GraphOutput schema
// Transforms raw nx graph --print output to slim index

export function transformGraphToIndex(graphOutput, pathAliases) {
  const { graph } = graphOutput;
  const projects = {};
  const dependencies = {};

  for (const [name, node] of Object.entries(graph.nodes)) {
    projects[name] = {
      root: node.data.root,
      sourceRoot: node.data.sourceRoot || null,
      type: node.type, // Use graph-level type, NOT data.projectType
      tags: node.data.tags || [],
      targets: extractTargetSummary(node.data.targets),
    };

    dependencies[name] = (graph.dependencies[name] || []).map(dep => ({
      target: dep.target,
      type: dep.type,
    }));
  }

  return {
    projects,
    dependencies,
    pathAliases,
    meta: {
      builtAt: new Date().toISOString(),
      projectCount: Object.keys(projects).length,
    },
  };
}

function extractTargetSummary(targets) {
  const summary = {};

  for (const [name, config] of Object.entries(targets || {})) {
    summary[name] = config.executor || 'unknown';
  }

  return summary;
}
```

### Git Grep Scoped Search Pattern
```javascript
// Source: .planning/quick/1-research-and-analyze-git-grep-and-altern/ANALYSIS.md
import { spawnSync } from 'node:child_process';

export function searchInProjects(pattern, sourceRoots, options = {}) {
  const isRegex = pattern.startsWith('/') && pattern.endsWith('/');
  const searchPattern = isRegex ? pattern.slice(1, -1) : pattern;
  const args = ['grep', '-n', '--no-color'];

  if (!isRegex) {
    args.push('-F'); // Fixed string matching
  }

  if (options.context) {
    args.push(`-C${options.context}`);
  }

  args.push('--', searchPattern);

  if (sourceRoots.length > 0) {
    args.push(...sourceRoots);
  }

  const result = spawnSync('git', args, {
    cwd: process.env.CLAUDE_PROJECT_DIR || process.cwd(),
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 5 * 1024 * 1024,
  });

  // Exit code 1 means no matches (not an error)
  if (result.status > 1) {
    return { matches: [], error: result.stderr || 'git grep failed' };
  }

  return { matches: parseGitGrepOutput(result.stdout), error: null };
}

function parseGitGrepOutput(stdout) {
  if (!stdout) {
    return [];
  }

  return stdout.trim().split('\n').map(line => {
    const firstColon = line.indexOf(':');
    const secondColon = line.indexOf(':', firstColon + 1);
    const file = line.slice(0, firstColon);
    const lineNum = parseInt(line.slice(firstColon + 1, secondColon), 10);
    const content = line.slice(secondColon + 1);

    return { file, line: lineNum, content };
  });
}
```

### Staleness Detection Pattern
```javascript
// Source: CONTEXT.md staleness decision + .nx/workspace-data/ mtime verification
import { statSync } from 'node:fs';
import { join } from 'node:path';

export function isIndexStale(workspaceRoot, indexPath) {
  let indexMtime;

  try {
    indexMtime = statSync(indexPath).mtimeMs;
  } catch {
    return true; // Index doesn't exist
  }

  const watchPaths = [
    join(workspaceRoot, '.nx', 'workspace-data'),
    join(workspaceRoot, 'tsconfig.base.json'),
    join(workspaceRoot, 'nx.json'),
  ];

  for (const watchPath of watchPaths) {
    try {
      const mtime = statSync(watchPath).mtimeMs;

      if (mtime > indexMtime) {
        return true;
      }
    } catch {
      // Source doesn't exist -- skip (e.g., no tsconfig.base.json)
    }
  }

  return false;
}
```

### Plugin Manifest
```json
{
  "name": "lz-nx.rlm",
  "version": "0.0.1",
  "description": "RLM-powered Nx workspace navigation -- deterministic commands and REPL-driven exploration for large monorepos",
  "author": {
    "name": "Lars Gyrup Brink Nielsen"
  },
  "repository": "https://github.com/LayZeeDK/lz-nx-ai-plugins",
  "license": "MIT",
  "keywords": ["nx", "monorepo", "rlm", "workspace", "navigation"]
}
```

### Command Markdown Pattern
```yaml
---
name: deps
description: Print dependency tree for an Nx project using the workspace index (zero LLM tokens)
argument-hint: <project> [--reverse] [--depth N]
disable-model-invocation: true
allowed-tools: Bash(node *)
---

Run the dependency tree command for the specified Nx project.

Execute this command and display its raw output directly to the user without modification:

node ${CLAUDE_PLUGIN_ROOT}/scripts/deps-command.mjs $ARGUMENTS

If the command exits with a non-zero code, display the error output.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `.claude/commands/` directory | `skills/` directory with `SKILL.md` | 2025-2026 | Commands still work but skills are recommended; for deterministic scripts, commands are simpler |
| `nx show project` per project | `nx graph --print` single call | Always available | Eliminates N+1 pattern (18-27 min -> 5-15s for 537 projects) |
| `nx dep-graph` | `nx graph` | Nx 15+ | Old alias still works but deprecated |
| `nx print-affected` | `nx show projects --affected --json` | Nx 19 | Old command removed |
| `.nx/cache/project-graph.json` | `.nx/workspace-data/project-graph.json` | Nx 19.2 | Cache directory moved |
| File-based Nx cache | SQLite-based cache (`.nx/cache/` db) | Nx 20 | No impact on plugin (we read project graph, not task cache) |
| `createNodesV1` | `createNodesV2` | Nx 21 | Affects only Nx plugin authors, not CLI consumers |

**Deprecated/outdated:**
- `nx print-affected`: Removed in Nx 19. Use `nx show projects --affected --json`.
- `@nrwl/*` packages: Dropped in Nx 20. All now `@nx/*`.
- `useLegacyCache`: Removed in Nx 21. Database cache mandatory.
- `outputStyle=compact`: Removed in Nx 21. Use `static`, `stream`, or `tui`.

## Research Questions Answered

### Q1: Can nx sync generators be local scripts or do they require npm packages?
**Answer:** Sync generators are Nx plugin features that auto-manage derived files (TypeScript project references, tsconfig paths). They require being registered as Nx plugins in `nx.json`. They are NOT suitable for workspace index rebuilding -- they are designed for keeping TypeScript configs in sync, not for building custom JSON indexes.
**Confidence:** MEDIUM -- based on Nx docs and observable behavior.

### Q2: Does nx watch support project graph change detection?
**Answer:** No. `nx watch` monitors **file changes** within workspace projects, not project graph structural changes. It triggers on file modifications and provides `NX_PROJECT_NAME` and `NX_FILE_CHANGES` environment variables. It does NOT detect new projects being added, dependencies changing, or graph structure modifications. The staleness heuristic (mtime of `.nx/workspace-data/`, `tsconfig.base.json`, `nx.json`) is the correct approach.
**Confidence:** HIGH -- verified via official Nx docs.

### Q3: Could a SessionStart hook launch nx watch as background process?
**Answer:** Not applicable for Phase 1 (hooks are deferred). But the answer is: technically possible but inadvisable. `nx watch` is a long-running process that would persist across the Claude Code session lifetime. Managing its lifecycle (start, stop, error recovery) adds complexity. The mtime staleness check is simpler and sufficient.
**Confidence:** HIGH -- architectural assessment.

### Q4: Simplest Nx-native index rebuild satisfying zero-npm-deps constraint?
**Answer:** `nx graph --print` + `fs.readFileSync('tsconfig.base.json')`. One CLI call + one file read. The script transforms the output to a slim JSON index. No Nx plugins, sync generators, or watch processes needed.
**Confidence:** HIGH -- verified against Nx 22.3 sandbox.

### Q5: Does `windowsHide: true` in execSync suppress cmd.exe popups on Windows?
**Answer:** Yes. The `windowsHide` option uses Node.js's `UV_PROCESS_WINDOWS_HIDE` flag to prevent the subprocess console window from appearing. It is available on all `child_process` methods (`execSync`, `spawnSync`, `execFileSync`, etc.). It is ignored on non-Windows platforms. One caveat: combining `windowsHide: true` with `detached: true` has a known bug on some Windows versions (Node.js issue #21825), but since we use synchronous calls (not detached), this doesn't apply.
**Confidence:** HIGH -- verified via Node.js official documentation.

### Q6: Is there an Nx-native way to skip broken plugins from graph computation?
**Answer:** Not directly. If a plugin throws during graph computation, `nx graph --print` fails. The recovery strategy (auto `nx reset`, retry once) handles most transient issues. For persistent plugin failures, the user must fix their Nx configuration.
**Confidence:** MEDIUM -- based on Nx error handling patterns.

### Q7: Verify .nx/workspace-data mtime behavior for staleness
**Answer:** Verified. The `.nx/workspace-data/` directory contains `project-graph.json` (419KB in current workspace), `file-map.json`, and various hash files. The Nx daemon updates these files when it detects file changes. The directory mtime updates when any contained file is written. For more precise staleness, check `project-graph.json` mtime specifically. The daemon writes to `project-graph.json` whenever the project graph is recomputed (new project added, dependency changed, etc.).
**Confidence:** HIGH -- verified by inspecting actual `.nx/workspace-data/` directory contents and file timestamps.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.x (devDependency in workspace) |
| Config file | none -- see Wave 0 |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FOUND-01 | Workspace indexer transforms nx graph output to slim JSON | unit | `npx vitest run plugins/lz-nx.rlm/scripts/__tests__/workspace-indexer.test.mjs -t "indexer"` | Wave 0 |
| FOUND-02 | Path resolver translates aliases bidirectionally | unit | `npx vitest run plugins/lz-nx.rlm/scripts/__tests__/path-resolver.test.mjs -t "resolver"` | Wave 0 |
| FOUND-03 | Nx-runner enforces allowlist, env vars, error handling | unit | `npx vitest run plugins/lz-nx.rlm/scripts/__tests__/nx-runner.test.mjs -t "runner"` | Wave 0 |
| CMD-01 | deps command outputs correct tree format | unit | `npx vitest run plugins/lz-nx.rlm/scripts/__tests__/deps-command.test.mjs -t "deps"` | Wave 0 |
| CMD-02 | find command scopes git grep to project source roots | unit | `npx vitest run plugins/lz-nx.rlm/scripts/__tests__/find-command.test.mjs -t "find"` | Wave 0 |
| CMD-03 | alias command resolves bidirectionally with fallbacks | unit | `npx vitest run plugins/lz-nx.rlm/scripts/__tests__/alias-command.test.mjs -t "alias"` | Wave 0 |
| PLUG-01 | plugin.json valid, commands discoverable | smoke | Manual: `claude --plugin-dir ./plugins/lz-nx.rlm` then `/lz-nx.rlm:deps` | Manual-only: requires Claude Code runtime |
| PLUG-02 | Scripts work cross-platform | integration | `node plugins/lz-nx.rlm/scripts/deps-command.mjs --help` (all platforms) | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `plugins/lz-nx.rlm/vitest.config.mjs` -- Vitest config for plugin tests
- [ ] `plugins/lz-nx.rlm/scripts/__tests__/workspace-indexer.test.mjs` -- covers FOUND-01
- [ ] `plugins/lz-nx.rlm/scripts/__tests__/path-resolver.test.mjs` -- covers FOUND-02
- [ ] `plugins/lz-nx.rlm/scripts/__tests__/nx-runner.test.mjs` -- covers FOUND-03
- [ ] `plugins/lz-nx.rlm/scripts/__tests__/deps-command.test.mjs` -- covers CMD-01
- [ ] `plugins/lz-nx.rlm/scripts/__tests__/find-command.test.mjs` -- covers CMD-02
- [ ] `plugins/lz-nx.rlm/scripts/__tests__/alias-command.test.mjs` -- covers CMD-03
- [ ] `plugins/lz-nx.rlm/scripts/__tests__/fixtures/` -- mock graph data, tsconfig data
- [ ] Test utilities for mocking `execSync` / `spawnSync` responses

## Open Questions

1. **`process.env.CLAUDE_PROJECT_DIR` reliability**
   - What we know: `$CLAUDE_PROJECT_DIR` is set by Claude Code to the user's project directory. `process.cwd()` is also the user's workspace when scripts run via the Bash tool.
   - What's unclear: Is `CLAUDE_PROJECT_DIR` always set, or only in certain invocation contexts? Is it the same as `process.cwd()`?
   - Recommendation: Use `process.env.CLAUDE_PROJECT_DIR || process.cwd()` as the workspace root. Both should resolve to the same directory, but the fallback ensures robustness.

2. **Package manager prefix for `nx` commands**
   - What we know: CLAUDE.md says to prefix nx commands with the workspace's package manager. The user's workspace may use npm, pnpm, or yarn.
   - What's unclear: How to detect the package manager reliably in a zero-dep script.
   - Recommendation: Use `npx nx` as the default (works with npm and most setups). Can detect `pnpm-lock.yaml` or `yarn.lock` for smarter routing later. For Phase 1, `npx nx` is sufficient.

3. **Vitest configuration for plugin tests**
   - What we know: Vitest 4.x is a devDependency. No vitest config exists yet. Tests need to run from the repo root targeting plugin scripts.
   - What's unclear: Whether Vitest can import .mjs files from the plugin directory without a project-level config.
   - Recommendation: Create a `vitest.config.mjs` at the plugin level or a workspace-level config that includes the plugin test directory.

## Sources

### Primary (HIGH confidence)
- `research/nx/nx-cli.md` -- Nx CLI JSON schemas, performance data, error handling, env vars (verified against Nx 22.3 sandbox)
- `.planning/quick/1-research-and-analyze-git-grep-and-altern/ANALYSIS.md` -- git grep cross-platform analysis
- [Node.js child_process documentation](https://nodejs.org/api/child_process.html) -- `execSync`, `spawnSync`, `windowsHide` option
- [Claude Code Plugins Reference](https://code.claude.com/docs/en/plugins-reference) -- plugin manifest schema, component auto-discovery, `${CLAUDE_PLUGIN_ROOT}`
- [Claude Code Skills Documentation](https://code.claude.com/docs/en/skills) -- SKILL.md format, frontmatter fields, `$ARGUMENTS`, `allowed-tools`, `disable-model-invocation`
- [Nx Workspace Watching](https://nx.dev/docs/guides/tasks--caching/workspace-watching) -- `nx watch` capabilities and limitations

### Secondary (MEDIUM confidence)
- [Nx Daemon Documentation](https://nx.dev/docs/concepts/nx-daemon) -- daemon file watching, auto-shutdown, graph caching behavior
- [GitHub: Daemon file watcher issues](https://github.com/nrwl/nx/issues/33781) -- `.nx/workspace-data/` mtime behavior under daemon
- [GitHub: windowsHide with detached](https://github.com/nodejs/node/issues/21825) -- known limitation (not applicable to sync calls)

### Tertiary (LOW confidence)
- None -- all critical findings verified with primary sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all components are built-in Node.js modules + Git, verified against docs
- Architecture: HIGH -- plugin structure verified against official Claude Code plugin reference, Nx CLI patterns verified against sandbox
- Pitfalls: HIGH -- all pitfalls derived from verified JSON schemas, actual error testing, and confirmed platform behaviors
- Validation: MEDIUM -- Vitest config details need to be confirmed during Wave 0

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (stable domain -- Node.js builtins, Nx CLI, Claude Code plugin API)

> **Correction (2026-03-05):** This research document contains two inaccurate claims about "zero LLM tokens":
> - Pattern 1 (line 119): "Commands are the correct Claude Code primitive for deterministic operations that need zero LLM interpretation." In fact, `disable-model-invocation: true` only prevents Claude from *automatically* invoking the command. When a user invokes it, the model still reads the command markdown, calls the Bash tool, and processes the output.
> - Command Markdown Pattern (line 491): The `description` field template includes "(zero LLM tokens)."
>
> These claims originated from conflating two different invocation paths: (1) the REPL sandbox path, where script functions are called directly as VM globals — genuinely zero model involvement, and (2) the Claude Code command path, where the model mediates the invocation. The scripts themselves are deterministic (no LLM calls), but the Claude Code command wrapper is not token-free. See CLI-01 in REQUIREMENTS.md for standalone CLI tracking.
