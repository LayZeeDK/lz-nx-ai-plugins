# Agents Guide

Guidelines for Claude when developing and maintaining plugins in this repository.

## Repository Purpose

A collection of Claude Code plugins focused on Nx and Recursive Language Models (RLMs).

## Platform Requirements

Plugins must support macOS, Linux, and Windows. You can assume:

- Node.js LTS is installed
- Git Bash is available on Windows via the Bash tool
- The `claude` CLI runs from PowerShell on Windows

Use Node.js scripts for cross-platform operations rather than shell-specific commands.

## Development Tooling

Use the `plugin-dev` Claude plugin to create and maintain plugins:

```
/plugin install plugin-dev@claude-plugins-official
```

## Plugin Architecture

### Directory Structure

Each plugin follows this structure:

```
plugins/<plugin-name>/
├── .claude-plugin/
│   └── plugin.json        # Plugin metadata and version
├── README.md              # User-facing documentation
├── agents/                # AI agent definitions
├── commands/              # Slash commands
├── hooks/
│   ├── hooks.json         # Hook configuration
│   └── scripts/           # Hook implementation scripts
└── skills/
    └── <skill-name>/
        ├── SKILL.md       # Skill definition
        ├── references/    # Reference documentation
        └── examples/      # Usage examples
```

### Conventions

**Tool Restrictions**: Commands should use `allowed-tools` to restrict available tools and prevent unintended modifications.

### allowed-tools Syntax

Use modern `Bash(command *)` syntax (wildcard only). The colon wildcard syntax `Bash(command :*)` is deprecated.

```yaml
# Correct - modern syntax
allowed-tools: Bash(nx build *), Bash(nx lint *), Read

# Deprecated - legacy syntax (avoid)
allowed-tools: Bash(nx build :*), Bash(nx lint :*), Read
```

Pattern examples:

| Pattern | Matches |
|---------|---------|
| `Bash(nx build *)` | `nx build`, `nx build my-app`, `nx build my-app --prod` |
| `Bash(nx *)` | All nx commands |
| `Bash(nx run *)` | All nx run targets |

For agents, use the array format: `tools: ["Bash", "Read", "Edit"]`

**Arguments**: Use `argument-hint` to document expected arguments. Parse values from `$ARGUMENTS`.

**Output Formatting**: Use fenced markdown code blocks with language identifiers for syntax highlighting.

**File Type Awareness**: Handle different file types appropriately (source code, config files, lock files, etc.).

### Plugin Distribution

Plugins are installed by cloning the entire repo. There is no `.npmignore` or `plugin.json` `exclude` field, so everything inside `plugins/<name>/` ships to end users.

**Rules:**
- Test files, test fixtures, and test runner configs (`vitest.config.*`, `jest.config.*`) MUST NOT live inside `plugins/<name>/`
- Place them under `tests/<plugin-name>/` at the repo root
- Source modules stay in `plugins/<name>/scripts/`
- Each test directory needs a `project.json` with a `-test` suffixed project name for Nx discovery (e.g., `lz-nx-rlm-test`)
- Use Vite `resolve.alias` in `vitest.config.mjs` to map `#rlm` (or similar) to the plugin's scripts directory

**Package manager:** This workspace uses `npm` (per `package-lock.json`) — always use `npm exec nx` not `pnpm nx`.

## Hooks

### Environment Variables

`${CLAUDE_PLUGIN_ROOT}` is substituted by the plugin system in `hooks.json` but **NOT** in command markdown files with `!` backtick syntax. For commands, use inline approaches or the `date` command (available via Git Bash on all platforms).

### PostToolUse Hook Output

Two approaches for adding information after tool execution:

| Approach | Behavior |
|----------|----------|
| `additionalContext` | Claude "considers" it but may paraphrase |
| `decision: "block"` with `reason` | Claude is automatically prompted and acts on it |

Use `decision: "block"` when you need Claude to take specific action:

```json
{
  "decision": "block",
  "reason": "Describe what Claude should do or tell the user."
}
```

### Hook Input Formats

PostToolUse hooks may receive different input formats. Handle both:

```javascript
const result = input.tool_result || input.tool_response?.stdout || '';
```

### Avoiding Command Substitution

Commands containing `$()` or backtick substitution trigger permission prompts regardless of `allowed-tools` patterns. This is a security feature.

```bash
# BAD - triggers permission prompt even with Bash(nx build *) allowed
nx build my-app --output-path=dist/$(date -u +"%Y%m%d-%H%M%SZ")

# GOOD - split into separate commands
date -u +"%Y%m%d-%H%M%SZ"    # Get timestamp first
nx build my-app --output-path=dist/<TIMESTAMP> # Then use the value
```

The `!` backtick preprocessing syntax also blocks `$()`:
```
# This will fail with "Command contains $() command substitution"
!`nx build my-app --output-path=dist/$(date -u +"%Y%m%d-%H%M%SZ")`
```

### Cross-Platform Timestamps

For timestamped output paths, use `date -u` which works on macOS, Linux, and Windows (via Git Bash). The `Z` suffix indicates UTC:

```bash
nx show projects                  # List available projects
date -u +"%Y%m%d-%H%M%SZ"         # Get UTC timestamp
nx build my-app --output-path=dist/<TIMESTAMP>
```

## Code Style

- Use Node.js for scripts requiring cross-platform compatibility

### No Emojis in Scripts

**Never use emojis or Unicode symbols in scripts.** Windows console uses codepage cp1252 by default, which cannot encode multi-byte UTF-8 characters.

**What breaks:**
- PowerShell scripts (`.ps1`): Parser confusion, `Unexpected token` errors
- Python scripts: `UnicodeEncodeError: 'charmap' codec can't encode character`
- Any script with redirected/piped output

**Why it happens:** When stdout is redirected or piped (common in CI/CD and automated tooling), Windows falls back to cp1252 encoding which only supports 256 characters—no emoji support.

**ASCII replacement table:**

| Emoji | Replacement |
|-------|-------------|
| `✓` | `[OK]` |
| `❌` | `[ERROR]` |
| `✅` | `[SUCCESS]` |
| `⚠️` | `[WARN]` |
| `⏭️` | `[SKIP]` |
| `🔧` | `[INFO]` |
| `📁` | `[DIR]` |
| `📄` | `[FILE]` |

**Example:**
```python
# BAD - fails on Windows
print("✅ Build successful!")

# GOOD - works everywhere
print("[SUCCESS] Build successful!")
```

## Content Search

Plugins are developed across macOS, Linux, and Windows. The right search tool depends on the contributor's platform.

| Tool | macOS / Linux | Windows x64 | Windows arm64 | Notes |
|------|:---:|:---:|:---:|-------|
| Grep tool (built-in) | works | works | broken | arm64-win32 vendored `rg.exe` has an argv[0] bug ([#27988](https://github.com/anthropics/claude-code/issues/27988)); x64 build is unaffected |
| `git grep` (via Bash) | works | works | works | Searches tracked files only; natively compiled on all platforms |
| `rg` (via Bash) | works | works | works (slow) | Native on x64; Chocolatey x86_64 build runs under QEMU on arm64 (~2.5x slower than `git grep`) |
| `grep` (via Bash) | works | works (slow) | works (slow) | Git Bash MSYS2 `grep -r` is slow and can produce incomplete results on Windows |

### Recommendations

- **Primary: `git grep`** — fastest on every platform, searches the git index directly, skips `.gitignore`d files automatically. Use for day-to-day content search.
  ```bash
  git grep -n "pattern"                             # tracked files, with line numbers
  git grep -l "pattern" -- "plugins/"               # files-with-matches in a subtree
  git grep -n -e "pattern1" --or -e "pattern2"      # multiple patterns (OR)
  ```
- **Fallback: `rg` or Grep tool** — needed when searching untracked or git-ignored files (`node_modules/`, `dist/`, build output) or using advanced features (PCRE2, `--type`, `--json`). On macOS/Linux the Grep tool and `rg` are interchangeable; on Windows arm64 only `rg` via Bash works (see table above).
  ```bash
  rg "pattern" path/to/search                       # recursive, respects .gitignore
  rg --no-ignore "pattern" node_modules/             # include git-ignored files
  ```
- **Limitation**: `git grep` only searches files tracked by git. It will **not** find matches in `.gitignore`d paths or untracked files. Fall back to `rg` for those.

## Testing Changes

After modifying plugin files, verify:

1. Scripts execute correctly on the current platform
2. Hook configurations are valid JSON
3. Markdown files render correctly
4. Commands work with expected arguments
