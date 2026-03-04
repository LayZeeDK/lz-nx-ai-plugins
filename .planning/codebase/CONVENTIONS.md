# Coding Conventions

**Analysis Date:** 2026-03-03

## Status Note

This repository is in the planning phase. Plugin source code does not yet exist under
`plugins/lz-nx.rlm/`. All conventions below are derived from: (1) authoritative project
docs (`AGENTS.md`, `CLAUDE.md`), (2) workspace tooling config (`.prettierrc`,
`tsconfig.base.json`), and (3) the planned architecture documented in
`.planning/research/STACK.md` and `.planning/PROJECT.md`. These conventions are
prescriptive -- follow them when writing new code.

## Language and File Format

**Plugin scripts:** Plain JavaScript ESM (`.mjs` extension only).

- No TypeScript compilation step. Scripts run directly with `node scripts/foo.mjs`.
- No CommonJS (`require()`). Use `import`/`export` throughout.
- No `.ts` files in plugin scripts. TypeScript types expressed via JSDoc annotations.
- Target: Node.js 24 LTS (`node:` prefix on all built-in imports).

```javascript
// Correct - ESM with node: prefix
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, join } from 'node:path';

// Wrong - CommonJS
const fs = require('fs');
```

**Plugin definitions:** Markdown (`.md`) for skills, agents, commands, and hooks.

**Configuration:** JSON (`.json`) for `plugin.json`, `hooks.json`, and config files.

## Naming Patterns

**Files:**
- Plugin scripts: `kebab-case.mjs` (e.g., `workspace-indexer.mjs`, `repl-sandbox.mjs`)
- Plugin definitions (agents/commands/skills): `kebab-case.md` (e.g., `repl-executor.md`)
- Hook config: `hooks.json` (fixed name per plugin conventions)
- Plugin manifest: `plugin.json` (fixed name under `.claude-plugin/`)
- Skill definitions: `SKILL.md` (uppercase, fixed name per plugin conventions)

**Directories:**
- Plugin root: `plugins/<plugin-name>/` using dot-separated namespacing (e.g., `plugins/lz-nx.rlm/`)
- Subdirectories: lowercase, plural nouns matching Claude Code conventions:
  `agents/`, `commands/`, `skills/`, `hooks/`, `scripts/`
- Skill subdirectories: `skills/<skill-name>/` (kebab-case)

**JavaScript identifiers:**
- Functions: camelCase (e.g., `buildWorkspaceIndex`, `resolvePathAlias`)
- Variables: camelCase (e.g., `workspaceIndex`, `projectEntry`)
- Constants: SCREAMING_SNAKE_CASE for true constants (e.g., `DEFAULT_CONFIG`, `MAX_BUFFER`)
- Classes: PascalCase (e.g., `HandleStore`, `ReplSandbox`)

**REPL globals (user-facing):** lowercase, short, verb or noun (e.g., `deps()`, `search()`,
`files()`, `workspace`, `projects`). Terminal signals in UPPER_CASE: `FINAL()`,
`FINAL_VAR()`, `SHOW_VARS()`.

**Handle identifiers:** Dollar-prefixed, auto-incrementing (e.g., `$res1`, `$res2`).
Follows the Matryoshka convention established in architecture research.

## Code Style

**Formatting:**
- Tool: Prettier 3.x
- Config: `.prettierrc` -- single setting: `{ "singleQuote": true }`
- Single quotes for all strings in JavaScript
- Prettier handles indentation, line length, and all other formatting automatically

**Linting:**
- Tool: ESLint 9.x (Nx-managed, `@nx/eslint` plugin)
- Config: `eslint.config.mjs` per project (flat config format)
- Run via Nx: `pnpm nx lint <project>`

**TypeScript strict mode (for type checking):**

The root `tsconfig.base.json` enforces:
- `strict: true` -- enables all strict type checks
- `noUnusedLocals: true` -- no dead variables
- `noImplicitReturns: true` -- all code paths must return
- `noFallthroughCasesInSwitch: true` -- explicit breaks in switch
- `noImplicitOverride: true` -- explicit `override` keyword
- `isolatedModules: true` -- each file is independently compilable

Plugin scripts (`.mjs`) use JSDoc instead of TypeScript syntax but must be
consistent with these principles in spirit -- no unused variables, all returns
explicit, no implicit any.

## Control Flow and Returns

Insert a blank line before and after `if`, `for`, `while`, `switch`, `try`,
`catch`, `finally`, and `return` statements. Exception: skip the blank line when
the statement is the first or last line inside a block.

Always use braces for control flow bodies -- never braceless one-liners:

```javascript
// Correct
if (projects.size === 0) {
  throw new Error('[ERROR] No projects found in workspace index');
}

return result;

// Wrong - braceless
if (projects.size === 0) throw new Error('...');
```

## Import Organization

**Order:**
1. Node.js built-in modules (`node:` prefix)
2. Internal module imports (relative paths within the plugin)

```javascript
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { loadConfig } from './rlm-config.mjs';
import { HandleStore } from './handle-store.mjs';
```

No third-party npm imports. The plugin has zero external dependencies by design
(see `.planning/research/STACK.md`). Use only `node:` built-ins.

**Path aliases:** Not used in plugin scripts. Use relative imports with `.mjs`
extension. `tsconfig.base.json` defines workspace path aliases for library code,
but plugin scripts are standalone.

## Error Handling

**Error format:** Use ASCII prefix tags consistently for console output. Never
use Unicode/emoji (Windows cp1252 compatibility):

```javascript
// Correct ASCII prefix tags
console.error('[ERROR] Workspace index not found: ' + indexPath);
console.warn('[WARN] Nx daemon timeout, falling back to cache');
console.log('[OK] Workspace index built in ' + elapsed + 'ms');
console.log('[INFO] Processing ' + projectCount + ' projects');
console.log('[SKIP] Project already indexed: ' + name);
```

**Thrown errors:** Use `Error` with descriptive messages. Prefix with `[ERROR]`
to match the ASCII replacement convention:

```javascript
throw new Error('[ERROR] Command not in allowlist: ' + command);
```

**Guardrail error messages:** When RLM guardrails halt execution, return a
string starting with `[ERROR]` rather than throwing:

```javascript
return `[ERROR] Aborted after ${consecutiveErrors} consecutive errors. Last error: ${result.error}`;
return '[ERROR] Max iterations reached without FINAL answer.';
```

**execSync calls:** Always set `maxBuffer` explicitly. Default 200 KB is
insufficient for `nx graph --print` on large workspaces:

```javascript
const output = execSync('npx nx show projects --json', {
  encoding: 'utf8',
  maxBuffer: 10 * 1024 * 1024, // 10 MB
  timeout: 30_000,
});
```

**Async error propagation in REPL:** The VM sandbox wraps all code in async
IIFEs. Errors thrown inside the REPL block are captured and returned as
`result.error` -- they do not bubble to the caller. The execution loop checks
`result.error` after each iteration.

## Logging

**Framework:** `console` (no logging library; zero dependencies rule applies).

**Patterns:**
- Script progress output uses ASCII prefix tags: `[OK]`, `[ERROR]`, `[WARN]`,
  `[INFO]`, `[SKIP]`
- Script output goes to stdout (user-visible) or stderr (diagnostic only)
- No log files except when explicitly implementing telemetry features

## Comments

**When to comment:**
- Document the "why", not the "what"
- Security decisions and known limitations require comments (especially vm sandbox caveats)
- Non-obvious platform workarounds require inline explanation

**JSDoc for all exported functions:**

```javascript
/**
 * Builds the workspace index from Nx CLI output.
 *
 * @param {string} workspaceRoot - Absolute path to the Nx workspace root
 * @param {import('./rlm-config.mjs').RLMConfig} config - RLM configuration
 * @returns {Promise<import('./workspace-indexer.mjs').WorkspaceIndex>}
 */
export async function buildWorkspaceIndex(workspaceRoot, config) {
  // ...
}
```

**Typedef declarations for data structures:**

```javascript
/**
 * @typedef {Object} ProjectEntry
 * @property {string} name
 * @property {string} root - Source root relative to workspace
 * @property {'app' | 'lib' | 'e2e'} type
 * @property {string[]} tags
 * @property {string[]} targets - Available build targets
 */
```

## Module Design

**Exports:** Named exports only. No default exports. Each `.mjs` file exports
exactly what consumers need by name:

```javascript
// Correct
export function buildWorkspaceIndex(root, config) { ... }
export class HandleStore { ... }
export const DEFAULT_CONFIG = { ... };

// Wrong - avoid default exports
export default function buildWorkspaceIndex() { ... }
```

**Module responsibilities:** One primary concern per script file. The planned
scripts follow this pattern:
- `workspace-indexer.mjs` -- builds/reads workspace index only
- `path-resolver.mjs` -- path alias resolution only
- `repl-sandbox.mjs` -- VM sandbox execution only
- `handle-store.mjs` -- handle Map operations only
- `rlm-config.mjs` -- config loading and defaults only
- `nx-runner.mjs` -- Nx CLI wrapping and allowlisting only

**Barrel files:** Not used. Import directly from the specific `.mjs` file.

## Claude Code Plugin Conventions

**allowed-tools syntax:** Use modern wildcard-only syntax. The deprecated colon
syntax must not appear in any new plugin files:

```yaml
# Correct - modern syntax
allowed-tools: Bash(node scripts/*), Bash(npx nx show *), Read

# Wrong - deprecated
allowed-tools: Bash(node scripts/:*), Bash(npx nx show :*)
```

**Agents:** Use array format for tools in agent frontmatter:

```markdown
---
name: repl-executor
tools: ["Bash", "Read"]
model: sonnet
---
```

**Argument parsing:** Parse `$ARGUMENTS` from the markdown command/skill file.
Document expected arguments with `argument-hint` in frontmatter.

**Path references in scripts:** Use `node:path` functions to resolve paths
relative to `import.meta.url`. Never hardcode absolute paths:

```javascript
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(__dirname, '../.claude/rlm-config.json');
```

**CLAUDE_PLUGIN_ROOT:** Use only in `hooks.json` (substituted by the plugin
system). Do not use in command markdown files or script arguments -- it is not
substituted there.

**Hook output format:**
- Use `additionalContext` when Claude should consider information passively
- Use `decision: "block"` with `reason` when Claude must take specific action

```javascript
// Active intervention required
process.stdout.write(JSON.stringify({
  decision: 'block',
  reason: 'Workspace index is stale. Run: node scripts/workspace-indexer.mjs',
}));

// Passive context injection
process.stdout.write(JSON.stringify({
  additionalContext: 'Workspace has ' + projectCount + ' projects indexed.',
}));
```

**Hook input handling:** PostToolUse hooks receive different formats. Handle both:

```javascript
const result = input.tool_result || input.tool_response?.stdout || '';
```

## Cross-Platform Requirements

All plugin scripts must run identically on macOS, Linux, and Windows (Git Bash).

**Path separators:** Use `node:path` functions, never string concatenation.
Forward slashes work on all platforms -- never use backslashes.

**Shell commands:** Use `execSync` with explicit `encoding: 'utf8'` (Git Bash
on Windows is UTF-8). Set `maxBuffer: 10 * 1024 * 1024` on all `execSync` calls.

**Timestamps:** Use `date -u +"%Y%m%d-%H%M%SZ"` in bash contexts (works on
macOS, Linux, Windows via Git Bash). Use `Date.now()` or `new Date().toISOString()`
in Node.js scripts.

**Command substitution:** Never use `$()` in hook commands or `allowed-tools`
patterns -- triggers permission prompts regardless of allowlist configuration.
Split into separate commands instead.

**No emojis or Unicode in scripts:** Console output from scripts must use only
ASCII characters. Use prefix tags: `[OK]`, `[ERROR]`, `[WARN]`, `[INFO]`,
`[SKIP]`, `[DIR]`, `[FILE]`. This applies to all `.mjs`, `.ps1`, and `.py` scripts.

---

*Convention analysis: 2026-03-03*
