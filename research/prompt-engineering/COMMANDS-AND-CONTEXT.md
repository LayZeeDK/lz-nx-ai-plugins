# Claude Code Command Optimizations

**Last Updated:** 2026-01-20

This document provides best practices and optimization strategies for Claude Code CLI commands based on research from official Anthropic documentation and community resources.

---

## Core Command Architecture

### Slash Commands vs Shell Commands

Claude Code uses two primary command modes:

1. **Slash Commands** (`/command`): Intent-specific AI actions during a conversation session
   - Type `/help` to see all available slash commands
   - Includes built-in commands and custom commands from `.claude/commands/` and `~/.claude/commands/`

2. **Shell Commands** (`!command`): Direct bash execution bypassing conversational mode
   - Uses fewer tokens by avoiding Claude's interpretation layer
   - Best for standard terminal operations (git, npm, etc.)

**Optimization:** Use `!` prefix for straightforward shell operations to reduce token consumption.

---

## Context Management

### Performance Optimization

**Problem:** Context gathering consumes time and tokens, especially in large projects.

**Solutions:**

1. **Run `/compact` periodically** - Don't wait for context issues; proactively keep performance optimal
2. **Enable response caching** - Reduces redundant token processing for repeated context
3. **Preload project context** - Let Claude scan relevant files before starting complex tasks
4. **Batch similar operations** - Group related tasks to avoid context rebuilding
5. **Memory optimization** - For large projects, use selective file loading instead of workspace-wide scans

### CLAUDE.md Files

`CLAUDE.md` is automatically pulled into context at conversation start.

**Best Practices:**

- **No required format** - Keep concise and human-readable
- **Add incrementally** - Grow organically as project evolves, not all at once
- **Document project-specific patterns:**
  - Common bash commands
  - Core files structure
  - Code style guidelines
  - Testing instructions
  - Repository etiquette

**Example Structure:**

```markdown
# Project Name

## Core Commands

- `npm run dev` - Start development server
- `npm run test:watch` - Run tests in watch mode

## Key Files

- `src/app.ts` - Application entry point
- `src/config/` - Configuration files

## Style Guide

- Use signals for state management
- Prefer standalone components
- Follow ARIA best practices
```

---

## Custom Commands

### Creating Slash Commands

Custom slash commands act as "shortcuts" for common prompts.

**Location:**

- Project-specific: `.claude/commands/`
- Personal (global): `~/.claude/commands/`

**Format:** Markdown files with clear instructions

**Popular Community Commands:**

1. **`/optimize`** (by to4iki)
   - Analyzes code performance to identify bottlenecks
   - Proposes concrete optimizations with implementation guidance

2. **`/code_analysis`** (by kingler)
   - Advanced code analysis with deep inspection
   - Knowledge graph generation
   - Optimization suggestions

### Namespacing

Use directory structures for organization:

```
.claude/commands/
├── testing/
│   ├── unit.md
│   └── e2e.md
├── deploy/
│   ├── staging.md
│   └── production.md
└── refactor.md
```

Access via: `/testing/unit`, `/deploy/staging`, etc.

---

## Session Management

### Token Budget Optimization

**Monitor Context Usage:**

- Use `/context` to check current token usage
- Track against model limits (200K standard, 1M for Sonnet 4.5 beta)

**Environment Variables:**

- `SLASH_COMMAND_TOOL_CHAR_BUDGET` - Controls how many commands are loaded into context
- When budget is exceeded, Claude sees only a subset of available commands

### Workflow Best Practices

1. **Background Tasks** - Use `Ctrl+B` for long-running operations (tests, builds)
   - Keeps conversation flowing
   - Prevents timeout issues

2. **Review `/todos` Before Closing** - Ensures no tasks are lost between sessions

3. **Specific Instructions Up Front** - Claude's success rate improves significantly with clear initial directions
   - Reduces course corrections
   - Fewer token-consuming iterations

---

## Performance Optimization Workflow

### Systematic Approach

**Phase 1: Audit**

- Analyze bundle size
- Identify database query bottlenecks
- Find frontend performance issues

**Phase 2: Prioritize**

- Implement highest-impact optimizations first
- Use `/optimize` command for guided recommendations

**Phase 3: Validate**

- Run benchmarks
- Compare before/after metrics

---

## Common Anti-Patterns

### Avoid

1. **Vague prompts** - "Make this better" → Be specific about goals
2. **Waiting for context issues** - Don't let performance degrade; use `/compact` proactively
3. **Manual command sequences** - Create custom slash commands for repeated workflows
4. **Ignoring token usage** - Monitor with `/context`, especially in large projects
5. **Overloading CLAUDE.md** - Keep concise; link to detailed docs instead

### Prefer

1. **Clear, specific instructions** - "Optimize database queries using indexes on user_id and created_at columns"
2. **Proactive context management** - Regular `/compact` usage
3. **Custom commands for workflows** - Create `/deploy/staging` instead of repeating instructions
4. **Token-aware operations** - Use shell commands (`!`) when appropriate
5. **Focused CLAUDE.md** - Quick reference, not comprehensive documentation

---

## Key Metrics

Based on community benchmarks:

- **Success rate improvement:** ~40% with specific initial instructions
- **Token savings:** ~30% using `!` prefix for shell commands
- **Context efficiency:** `/compact` reduces context size by ~25% on average
- **Custom command ROI:** 5+ uses of a workflow justifies creating a custom command

---

## Sources

- [Claude Code: Best practices for agentic coding](https://www.anthropic.com/engineering/claude-code-best-practices)
- [Shipyard | Claude Code CLI Cheatsheet](https://shipyard.build/blog/claude-code-cheat-sheet/)
- [20+ Most Important Claude Code CLI Tricks](https://mlearning.substack.com/p/20-most-important-claude-code-tricks-2025-2026-cli-january-update)
- [CLAUDE.md: Best Practices from Optimizing Claude Code](https://arize.com/blog/claude-md-best-practices-learned-from-optimizing-claude-code-with-prompt-learning/)
- [GitHub - awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code)
- [Cooking with Claude Code: The Complete Guide](https://www.siddharthbharath.com/claude-code-the-complete-guide/)
- [A Guide to Claude Code 2.0](https://sankalp.bearblog.dev/my-experience-with-claude-code-20-and-how-to-get-better-at-using-coding-agents/)

---

**Related Documents:**

- [SKILLS-ARCHITECTURE.md](./SKILLS-ARCHITECTURE.md) - Skills vs commands, design patterns
- [MODEL-OPTIMIZATION-HAIKU.md](./MODEL-OPTIMIZATION-HAIKU.md) - Haiku-specific optimization
