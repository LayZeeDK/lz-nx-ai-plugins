# Claude Code Skills Architecture

**Last Updated:** 2026-01-20

This document provides optimization strategies for Claude Code Skills (formerly Agent Skills), including when to use skills vs commands and how to structure them for maximum effectiveness.

---

## Skills vs Slash Commands: Key Differences

### Conceptual Model

| Aspect         | Slash Commands                   | Skills                                                 |
| -------------- | -------------------------------- | ------------------------------------------------------ |
| **Definition** | Single-file Markdown prompts     | Multi-file workflow packages with supporting resources |
| **Invocation** | User types `/command` explicitly | Claude can auto-invoke OR user can trigger manually    |
| **Scope**      | Simple, repeatable prompt        | Complex workflow with patterns, templates, scripts     |
| **Discovery**  | Terminal autocomplete (`/...`)   | Shown in Claude's tool list                            |
| **Packaging**  | Minimal (one .md file)           | Rich (directory with supporting files)                 |

### When to Use Each

**Use Slash Commands When:**

- You want explicit, repeatable terminal entry point
- Simple prompt substitution is sufficient
- Terminal discovery/autocomplete is important
- Single file suffices

**Use Skills When:**

- Complex workflow requires multiple steps
- Supporting files needed (templates, patterns, scripts)
- Claude should proactively apply the workflow
- Multiple related prompts should be packaged together

---

## Skills Architecture

### Tool Merging

**Important:** The `SlashCommand` tool has been merged into the `Skill` tool.

Claude now uses a unified `Skill` tool to programmatically invoke:

- Custom slash commands
- Agent Skills (richer workflows)

This simplification means Skills can act as both:

1. User-invoked commands (`/skill-name`)
2. Agent-invoked workflows (Claude decides when to apply)

### Directory Structure

**Skills typically live in:**

- Project: `.claude/skills/`
- Global: `~/.claude/skills/`

**Example Structure:**

```
.claude/skills/
├── feature-implementation/
│   ├── skill.md              # Main prompt
│   ├── templates/
│   │   ├── component.ts.hbs
│   │   └── test.spec.ts.hbs
│   └── patterns/
│       └── naming-conventions.md
└── code-review/
    ├── skill.md
    └── checklists/
        ├── security.md
        └── performance.md
```

---

## Context Budget Management

### Token Limits

**Key Configuration:**

- `SLASH_COMMAND_TOOL_CHAR_BUDGET` environment variable
- Controls how many skills/commands are loaded into Claude's context
- When budget exceeded, Claude sees only a subset

**Optimization Strategies:**

1. **Monitor Usage** - Use `/context` to check current token allocation
2. **Prioritize Skills** - Name frequently-used skills to appear first alphabetically
3. **Lazy Loading** - Structure skills to load supporting files only when invoked
4. **Concise Descriptions** - Keep skill metadata brief to fit more skills in budget

### Metadata Best Practices

Each skill should have clear, concise metadata:

```markdown
---
name: feature-implementation
description: Creates component with tests and docs
tags: component, testing
---
```

**Optimization:** Keep description under 60 characters to maximize skills in budget.

---

## Skill Design Patterns

### 1. Workflow Skills

**Purpose:** Multi-step processes that Claude executes autonomously

**Example: Feature Implementation**

```markdown
# Feature Implementation Skill

Execute these steps in order:

1. **Analyze Requirements**
   - Read specification from `docs/requirements/[feature-name].md`
   - Identify affected files using workspace search

2. **Plan Architecture**
   - Review similar components for patterns
   - Check `CLAUDE.md` for project conventions

3. **Implementation**
   - Use templates from `templates/` directory
   - Follow naming from `patterns/naming-conventions.md`

4. **Testing**
   - Generate unit tests
   - Add integration tests with assertions

5. **Documentation**
   - Update component README
   - Add JSDoc comments
```

**Optimization:** Break complex workflows into discrete, numbered steps for reliable execution.

### 2. Analysis Skills

**Purpose:** Deep inspection and reporting

**Example: Code Analysis**

```markdown
# Code Analysis Skill

Perform comprehensive analysis:

## 1. Structural Analysis

- Component hierarchy
- Dependency graph
- Circular dependency detection

## 2. Performance Analysis

- Bundle size contributors
- Render performance bottlenecks
- Memory leak patterns

## 3. Quality Metrics

- Test coverage gaps
- Accessibility violations
- Type safety issues

Generate report in `analysis-reports/[timestamp].md`
```

**Optimization:** Structure output consistently so reports are machine-readable for trend analysis.

### 3. Template Skills

**Purpose:** Code generation with supporting templates

**Directory Structure:**

```
template-skill/
├── skill.md
└── templates/
    ├── component.ts.hbs
    ├── spec.ts.hbs
    ├── story.ts.hbs
    └── README.md.hbs
```

**skill.md:**

```markdown
# Component Generator Skill

Generate component with:

1. Component file from `templates/component.ts.hbs`
2. Test file from `templates/spec.ts.hbs`
3. Story file from `templates/story.ts.hbs`
4. README from `templates/README.md.hbs`

Variables to populate:

- `{{componentName}}` - PascalCase component name
- `{{selector}}` - kebab-case selector
- `{{description}}` - Brief component description
```

**Optimization:** Use Handlebars templates for consistency across generated files.

### 4. Verification Skills

**Purpose:** Validate code against standards

**Example: Pre-Commit Check**

```markdown
# Pre-Commit Verification Skill

Run before committing:

1. **Lint** - `npm run lint`
2. **Format Check** - `npm run format:check`
3. **Type Check** - `npm run type-check`
4. **Tests** - `npm run test` (affected only)
5. **Build** - `npm run build` (affected projects)

If any step fails, report errors and halt commit.
```

**Optimization:** Run only affected checks to minimize time/tokens.

---

## Namespacing

### Hierarchical Organization

Skills support namespacing via directory structure:

```
.claude/skills/
├── frontend/
│   ├── component.md
│   ├── directive.md
│   └── service.md
├── testing/
│   ├── unit.md
│   ├── e2e.md
│   └── integration.md
└── deploy/
    ├── staging.md
    └── production.md
```

**Access:**

- `/frontend/component`
- `/testing/integration`
- `/deploy/staging`

**Optimization:** Use namespacing to:

- Group related skills logically
- Avoid name collisions
- Improve discoverability

---

## Auto-Invocation Strategies

### When Skills Should Be Proactive

Skills can be configured to trigger automatically when Claude detects certain contexts.

**Example: Test Runner Skill**

```markdown
# Test Runner Skill

**Auto-invoke when:**

- User writes new code in `src/**/*.ts`
- Code changes affect existing tests
- User says "implement [feature]"

**Steps:**

1. Identify affected test files
2. Run `npm run test -- [files]`
3. Report pass/fail status
4. If failures, analyze and suggest fixes
```

**Configuration Pattern:**

```markdown
---
name: test-runner
auto-invoke-conditions:
  - file-changes: 'src/**/*.ts'
  - keywords: ['implement', 'add feature', 'create component']
---
```

**Optimization:** Be selective with auto-invocation to avoid unwanted interruptions.

---

## Performance Optimization

### 1. Lazy Resource Loading

**Anti-Pattern:**

```markdown
# Heavy Skill (Bad)

Load all templates:

- [Contents of template1.hbs]
- [Contents of template2.hbs]
- [Contents of template3.hbs]
- ...
```

**Optimized:**

```markdown
# Efficient Skill (Good)

Templates available in `templates/` directory.
Load specific template as needed:

1. Ask user which template
2. Read `templates/[choice].hbs`
3. Populate variables
```

### 2. Incremental Workflows

Break long skills into stages with checkpoints:

```markdown
# Multi-Stage Feature Implementation

## Stage 1: Planning

- Analyze requirements
- Generate plan
- **Wait for user approval**

## Stage 2: Implementation

- Generate code
- Run tests
- **Report status**

## Stage 3: Documentation

- Update docs
- Create examples
- **Final review**
```

**Optimization:** Stage gates prevent wasted work if direction changes.

### 3. Caching Patterns

For analysis skills that are expensive to compute:

```markdown
# Caching Analysis Skill

1. Check if analysis exists: `analysis-cache/[file-hash].json`
2. If cache hit and file unchanged, return cached result
3. If cache miss or file changed:
   - Perform analysis
   - Save to cache
   - Return result

Cache invalidation: 24 hours or file modification
```

---

## Community Skills Repositories

**Production-Ready Skills:**

1. **wshobson/commands** - Production-ready slash commands for Claude Code
2. **qdhenry/Claude-Command-Suite** - Professional slash commands for:
   - Code review
   - Feature creation
   - Security auditing
   - Architectural analysis
3. **hesreallyhim/awesome-claude-code** - Curated list of commands and workflows

**Learning from Community:**

- Study popular skills for design patterns
- Adapt successful patterns to your project
- Contribute improvements back

---

## Testing Skills

### Validation Checklist

Before deploying a skill:

1. **Test invocation** - Does `/skill-name` work?
2. **Test auto-invocation** - Does Claude trigger it appropriately?
3. **Test with missing resources** - Graceful handling if templates/files missing?
4. **Test token usage** - Does it fit in context budget?
5. **Test output consistency** - Same inputs produce same outputs?

### Example Test Script

```bash
# Test skill invocation
claude-code --test-skill feature-implementation

# Test with mock inputs
claude-code --test-skill feature-implementation \
  --input '{"component": "TestComponent", "feature": "user-auth"}'

# Verify output matches expected
diff output/TestComponent.ts expected/TestComponent.ts
```

---

## Migration: Commands → Skills

### When to Upgrade

Migrate a slash command to a full skill when:

1. **Supporting files needed** - Templates, patterns, scripts
2. **Multi-step workflow emerges** - Command grows beyond simple prompt
3. **Reusable components** - Multiple commands share resources
4. **Auto-invocation desired** - Claude should apply proactively

### Migration Pattern

**Before (Slash Command):**

```
.claude/commands/
└── create-component.md
```

**After (Skill):**

```
.claude/skills/
└── create-component/
    ├── skill.md
    ├── templates/
    │   ├── component.ts.hbs
    │   └── test.spec.ts.hbs
    └── patterns/
        └── naming.md
```

**Update invocation:**

- Command: `/create-component`
- Skill: `/create-component` (same) OR auto-invoked

---

## Measuring Skill Effectiveness

### Key Metrics

1. **Invocation Frequency** - How often is skill used?
2. **Success Rate** - Does it complete without errors?
3. **Token Efficiency** - Tokens used vs value delivered
4. **Time Savings** - Manual time vs automated time
5. **Error Rate** - How often does output need correction?

### Optimization Feedback Loop

```
1. Deploy skill
   ↓
2. Monitor metrics
   ↓
3. Identify bottlenecks
   ↓
4. Refactor skill
   ↓
5. A/B test improvements
   ↓
6. Roll out optimized version
   ↓
(repeat)
```

---

## Best Practices Summary

### Do

1. **Clear naming** - Use descriptive, discoverable names
2. **Concise metadata** - Keep descriptions under 60 chars
3. **Modular design** - Break complex workflows into stages
4. **Lazy loading** - Load resources only when needed
5. **Consistent output** - Structure for machine-readability
6. **Document triggers** - Clear auto-invocation conditions
7. **Version control** - Track skill changes like code

### Avoid

1. **Monolithic skills** - Break large skills into smaller, focused ones
2. **Hardcoded paths** - Use relative paths and environment variables
3. **Implicit assumptions** - Document all prerequisites
4. **Noisy auto-invoke** - Be selective about automatic triggering
5. **Ignoring budget** - Monitor context token usage
6. **Stale skills** - Archive unused skills to free budget

---

## Sources

- [Slash commands - Claude Code Docs](https://code.claude.com/docs/en/slash-commands)
- [How to Use Claude Code: Skills, Commands, Agents, Plug-Ins](https://www.producttalk.org/how-to-use-claude-code-features/)
- [Understanding Claude Code: Skills vs Commands vs Subagents vs Plugins](https://www.youngleaders.tech/p/claude-skills-commands-subagents-plugins)
- [Claude Code customization guide: CLAUDE.md, skills, subagents explained](https://alexop.dev/posts/claude-code-customization-guide-claudemd-skills-subagents/)
- [GitHub - wshobson/commands](https://github.com/wshobson/commands)
- [GitHub - qdhenry/Claude-Command-Suite](https://github.com/qdhenry/Claude-Command-Suite)
- [Cooking with Claude Code: The Complete Guide](https://www.siddharthbharath.com/claude-code-the-complete-guide/)
- [Shipyard | Claude Code CLI Cheatsheet](https://shipyard.build/blog/claude-code-cheat-sheet/)

---

**Related Documents:**
- [COMMANDS-AND-CONTEXT.md](./COMMANDS-AND-CONTEXT.md) - Slash commands basics
- [SKILL-CREATION-CHECKLIST.md](./SKILL-CREATION-CHECKLIST.md) - Checklist for building skills
- [TASK-SPAWNING-GUIDE.md](./TASK-SPAWNING-GUIDE.md) - Multi-agent workflows
