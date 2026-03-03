# Coding Conventions

**Analysis Date:** 2026-03-03

## Project Overview

This is a Claude Code plugin repository focused on Nx and Recursive Language Models (RLMs). The codebase is organized around plugin development following Claude plugin architecture. Established conventions are documented in `AGENTS.md`.

## Naming Patterns

**Files:**
- Plugin directories: `plugins/<plugin-name>/` (kebab-case)
- Metadata files: `.claude-plugin/plugin.json` (plugin configuration)
- Documentation: `README.md` (user-facing), `SKILL.md` (skill definitions)
- Scripts: lowercase with hyphens for multi-word names
- Test files: `*.test.ts`, `*.spec.ts` suffix pattern (when tests are added)

**Directories:**
- Plugin root: `plugins/<plugin-name>/`
- Agent definitions: `agents/`
- Command definitions: `commands/`
- Hook system: `hooks/` with `hooks.json` config and `scripts/` subdirectory
- Skills: `skills/<skill-name>/` (kebab-case)
- Skill references: `references/` (within skill directory)
- Skill examples: `examples/` (within skill directory)
- Research: `research/<topic>/` (organization by research area)
- Planning: `.planning/codebase/` (generated documents)

**Functions:**
- Handler functions: descriptive verb-based names (e.g., `handleBuild`, `validateInput`, `parseArguments`)
- Utility functions: noun-based names describing what they operate on (e.g., `formatOutput`, `extractMetadata`)
- Hook handlers: prefixed with context (e.g., `postToolUseHandler`, `preCommandHandler`)

**Variables:**
- camelCase for all JavaScript/TypeScript variables and function parameters
- Boolean variables: prefix with `is`, `has`, `can`, or `should` (e.g., `isEnabled`, `hasError`, `canProceed`)
- Constants: UPPER_SNAKE_CASE for module-level constants
- Configuration objects: camelCase keys in JSON/object definitions

**Types/Interfaces:**
- PascalCase for TypeScript interfaces, types, and classes
- Use `I` prefix for interfaces only if disambiguating from classes (not required)
- Exported types live at module top-level, not nested
- Type files: `*.types.ts` or `*.d.ts` pattern (when creating shared types)

## Code Style

**Formatting:**
- Prettier configuration (if used): 2-space indentation standard
- Line length: 80-120 characters (soft limit)
- No trailing semicolons in favor of ASI (Automatic Semicolon Insertion)
- Single quotes for strings (when configured)

**Linting:**
- ESLint configuration enforced for TypeScript/JavaScript code
- Rules focus on preventing common mistakes and ensuring consistency
- Modern syntax preferred: ES2020+
- Use of `const` and `let`, avoid `var`

**Node.js Scripts:**
- Cross-platform compatibility required (macOS, Linux, Windows)
- Use Node.js for scripts requiring cross-platform operations
- Avoid shell-specific commands; use Node.js alternatives
- No emoji or Unicode symbols in script output (Windows cp1252 limitation) — use ASCII replacements like `[OK]`, `[ERROR]`, `[SUCCESS]`, `[WARN]`, `[SKIP]`, `[INFO]`

## Import Organization

**Order:**
1. Built-in Node.js modules (`fs`, `path`, `util`, etc.)
2. External npm packages and dependencies
3. Internal modules and utilities (relative imports with `../` or alias paths)
4. Type-only imports (optional separate group if many)

**Path Aliases:**
- Use configured aliases for common paths (if TypeScript `paths` config exists)
- Relative imports for adjacent files
- Absolute imports from project root for shared utilities

**Example:**
```javascript
import fs from 'fs';
import path from 'path';
import { parseArguments } from '@utils/parse';
import { parseHookInput } from './hook-input-parser';
```

## Error Handling

**Patterns:**
- Errors are thrown as `Error` instances or custom error classes
- Hook scripts use structured output with `decision: "block"` and `reason` fields to communicate errors to Claude
- Validation errors should include specific details about what failed
- Never silently catch and ignore errors; either handle or propagate
- Use try-catch for hook scripts that parse potentially invalid input

**Example Pattern:**
```javascript
const result = input.tool_result || input.tool_response?.stdout || '';

if (!result) {
  return {
    decision: 'block',
    reason: 'Tool execution failed or returned no output. Please check the command syntax.'
  };
}
```

## Logging

**Framework:** console (Node.js built-in)

**Patterns:**
- Use `console.log()` for standard output
- Use `console.error()` for error messages and diagnostics
- Use `console.warn()` for warnings
- Prefix log messages with context (e.g., `[INFO]`, `[WARN]`, `[ERROR]`)
- Avoid excessive logging in production code
- Include relevant context: variable values, error messages, timestamps when helpful

**Example:**
```javascript
console.log('[INFO] Processing build for project:', projectName);
if (buildResult.failed) {
  console.error('[ERROR] Build failed:', buildResult.error);
}
```

## Comments

**When to Comment:**
- Document non-obvious logic and decisions
- Explain WHY code does something, not WHAT it does (code should be self-documenting)
- Comment complex algorithms or workarounds
- Use comments to explain hook behavior and integration points
- Document assumptions about external inputs or API contracts

**JSDoc/TSDoc:**
- Use JSDoc for public functions and exports
- Include parameter types, return types, and brief description
- Mark deprecated code with `@deprecated` tag
- Example: Document hook scripts with their input/output format

**Example:**
```javascript
/**
 * Parses hook input which may come in different formats from the plugin system.
 * @param {object} input - The hook input object
 * @returns {string} The extracted tool result or response
 */
function extractToolResult(input) {
  return input.tool_result || input.tool_response?.stdout || '';
}
```

## Function Design

**Size:**
- Keep functions focused on a single responsibility
- Aim for <50 lines; break down longer functions
- Hook handlers may be longer but should be well-structured

**Parameters:**
- Maximum 3-4 parameters; use object destructuring for more
- Name parameters descriptively
- Provide default values for optional parameters
- Document parameter meaning in JSDoc

**Return Values:**
- Functions should return consistent types
- Hook scripts return structured objects with `decision` and `reason` fields
- Use early returns to reduce nesting
- For errors in hooks, return `{ decision: 'block', reason: '...' }` to communicate with Claude

**Example:**
```javascript
function validateCommand({ command, allowedPatterns }) {
  const isAllowed = allowedPatterns.some(pattern =>
    matchPattern(command, pattern)
  );

  if (!isAllowed) {
    return {
      decision: 'block',
      reason: `Command not allowed: ${command}`
    };
  }

  return { decision: 'allow' };
}
```

## Module Design

**Exports:**
- Export only what needs to be public
- Use named exports for clarity
- Re-export utility functions from index files (barrel exports) for convenience
- Prefer CommonJS or ES modules consistently (project-wide decision)

**Barrel Files:**
- `index.ts/index.js` files can re-export common utilities
- Use sparingly to avoid circular dependencies
- Helpful for organizing hooks and skill utilities

**Plugin Structure:**
Each plugin uses this structure:
- `.claude-plugin/plugin.json` - Plugin metadata and version
- `README.md` - User-facing documentation
- `agents/` - AI agent definitions (multiple agent files allowed)
- `commands/` - Slash command definitions (multiple command files allowed)
- `hooks/hooks.json` - Hook configuration with environment variable substitution
- `hooks/scripts/` - Hook implementation scripts (typically JavaScript)
- `skills/<skill-name>/SKILL.md` - Skill definition
- `skills/<skill-name>/references/` - Reference documentation for skill
- `skills/<skill-name>/examples/` - Usage examples for skill

## Hook Scripts

**PostToolUse Hooks:**
- Receive input in two possible formats; handle both:
  - `input.tool_result` (direct string)
  - `input.tool_response?.stdout` (nested response object)
- Always check for empty/null results before processing
- Return structured output: `{ decision: 'block', reason: 'message' }` to communicate with Claude
- Use `additionalContext` for supplementary information Claude may consider
- Use `decision: 'block'` with `reason` when Claude must take specific action

**Hook Implementation Pattern:**
```javascript
module.exports = async (input) => {
  const result = input.tool_result || input.tool_response?.stdout || '';

  if (!result || result.length === 0) {
    return {
      decision: 'block',
      reason: 'Tool produced no output'
    };
  }

  // Process result...

  return {
    decision: 'allow',
    additionalContext: 'Processed successfully'
  };
};
```

## Command Definition

**allowed-tools Syntax:**
- Use modern wildcard syntax: `Bash(command *)` (not deprecated colon syntax `Bash(command :*)`)
- Restrict available tools based on command purpose
- Pattern examples:
  - `Bash(nx build *)` - Allows `nx build`, `nx build my-app`, `nx build my-app --prod`
  - `Bash(nx *)` - Allows all nx commands
  - `Bash(nx run *)` - Allows all nx run targets

**Avoiding Command Substitution:**
- Commands with `$()` or backtick substitution trigger permission prompts even with `allowed-tools` patterns
- Split into separate commands: get timestamp first, then use the value
- Bad: `nx build --output-path=dist/$(date -u +"%Y%m%d-%H%M%SZ")`
- Good: First run `date -u +"%Y%m%d-%H%M%SZ"`, then use the timestamp value

**Cross-Platform Timestamps:**
- Use `date -u +"%Y%m%d-%H%M%SZ"` which works on macOS, Linux, and Windows (Git Bash)
- The `Z` suffix indicates UTC

## Testing Changes

After modifying plugin files, verify:
1. Scripts execute correctly on the current platform (test cross-platform)
2. Hook configurations are valid JSON
3. Markdown files render correctly
4. Commands work with expected arguments
5. Plugin structure follows established conventions

---

*Convention analysis: 2026-03-03*
