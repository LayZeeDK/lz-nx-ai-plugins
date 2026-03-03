# Claude Code Features and Availability

> **Audience**: Developers using Claude Code CLI
> **Purpose**: Comprehensive feature reference with availability status
> **Last Updated**: 2026-01-20

---

## Quick Reference

| Feature | Status | Availability |
|---------|--------|--------------|
| Skills | **GA** | Production Ready |
| Custom Commands | **GA** | Production Ready |
| Context Management | **GA** | Production Ready |
| Extended Thinking | **GA** | Production Ready |
| Structured Outputs | **Beta** | `--json-schema` flag works (use with fallback) |
| Interleaved Thinking | **GA** | Enabled by default in CLI |
| Effort Parameter | **N/A** | API key users only (not subscription) |

---

## Verification Summary (Local Testing 2026-01-20)

| Feature | CLI Status | Test Result |
|---------|------------|-------------|
| Extended Thinking | Available | Works in conversation mode |
| Structured Outputs | Available | `--json-schema` returns `structured_output` field |
| Interleaved Thinking | Available | Enabled by default; thinking blocks appear between tool calls |
| Effort Parameter | Not Available | "Custom betas are only available for API key users" |

**Verified by local CLI testing:**

```bash
# Structured Outputs - WORKS
claude --print --model haiku --output-format json \
  --json-schema '{"type":"object","properties":{"greeting":{"type":"string"}},"required":["greeting"]}' \
  "Say hello"
# Returns: {"structured_output":{"greeting":"..."}}

# Effort Parameter - FAILS
claude --print --model opus --betas effort-2025-11-24 "Hello"
# Error: "Custom betas are only available for API key users"
```

---

## Core Features (Production Ready)

### 1. Skills (Agent Skills)

**Status**: GA - Production Ready

Skills are multi-file workflow packages that enable complex, multi-step automation. They live in `.claude/skills/` and can include supporting files (templates, reference docs, etc.).

**Directory structure:**

```
.claude/skills/
├── my-skill/
│   ├── skill.md          # Main skill definition
│   └── templates/        # Optional supporting files
└── another-skill/
    └── skill.md
```

**How to create a skill:**

1. Create directory: `mkdir -p .claude/skills/my-skill`
2. Create `skill.md` with instructions
3. Invoke via Skill tool or autocomplete

**When to use skills vs commands:**

| Use Case | Use Skills | Use Commands |
|----------|------------|--------------|
| Complex multi-step workflows | Yes | |
| Needs supporting files | Yes | |
| Simple prompt shortcuts | | Yes |
| Single-file prompts | | Yes |
| Auto-invocation on context | Yes | |

**Cross-reference**: See [SKILLS-ARCHITECTURE.md](./SKILLS-ARCHITECTURE.md) for design patterns

---

### 2. Custom Commands

**Status**: GA - Production Ready

Commands are single-file prompt shortcuts that provide quick access to common prompts. They live in `.claude/commands/` as markdown files.

**Directory structure:**

```
.claude/commands/
├── review.md           # Invoked as /review
├── test-unit.md        # Invoked as /test-unit
└── docs/
    └── generate.md     # Invoked as /docs/generate (namespaced)
```

**How to create a command:**

1. Create file: `.claude/commands/my-command.md`
2. Write prompt instructions in markdown
3. Invoke via `/my-command` in Claude Code sessions

**Cross-reference**: See [COMMANDS-AND-CONTEXT.md](./COMMANDS-AND-CONTEXT.md) for usage patterns

---

### 3. Context Management

**Status**: GA - Production Ready

Built-in commands for monitoring and optimizing context window usage.

| Command | Purpose |
|---------|---------|
| `/context` | Check current token usage |
| `/compact` | Run context compaction |
| `/help` | View all available commands |

**Best practices:**

- Run `/compact` proactively during long sessions
- Monitor context with `/context` before large operations
- Use shell prefix `!` for direct bash execution (saves tokens)

**Cross-reference**: See [COMMANDS-AND-CONTEXT.md](./COMMANDS-AND-CONTEXT.md) for optimization strategies

---

### 4. Extended Thinking

**Status**: GA - Production Ready

Extended thinking enables the model to "think" before responding, improving quality for complex reasoning tasks.

**How it works:**

- Model receives a "thinking budget" (minimum 1,024 tokens)
- Thinking tokens are separate from response tokens
- Thinking content is visible in verbose mode

**Cost considerations:**

- Thinking tokens billed as output: **$5/M tokens** (Haiku 4.5)
- A 4K budget adds ~$0.02 per request
- Higher budgets (16K-64K) recommended for complex reasoning

**When to enable:**

- Complex dependency analysis
- Multi-step reasoning tasks
- Ambiguity detection and resolution
- **Skip for**: Simple pattern matching, mechanical transformations

**Configuration example** (for skill/command development):

```markdown
## Model Configuration

**Extended Thinking**: Enabled
**Budget**: 2048 tokens (light reasoning) | 4096 tokens (medium) | 16384 tokens (heavy)
```

**Cross-reference**: See [MODEL-OPTIMIZATION-OPUS.md](./MODEL-OPTIMIZATION-OPUS.md) for advanced thinking strategies

---

## Beta Features (Available in CLI)

### Structured Outputs (VERIFIED WORKING)

**Status**: Public beta (since Nov 2025) - [Claude Blog](https://www.anthropic.com/news/structured-outputs)

Structured Outputs ensures the model returns JSON conforming to a provided schema.

**CLI usage:**

```bash
claude --print --model haiku --output-format json \
  --json-schema '{"type":"object","properties":{"name":{"type":"string"},"count":{"type":"integer"}},"required":["name","count"]}' \
  "Create a greeting with a count"
```

**Requirements:**

- `--output-format json` (required)
- `--print` (required for non-interactive use)
- `--json-schema '{"type":"object",...}'` (your schema)

**Response format:**

```json
{
  "structured_output": {
    "name": "Hello",
    "count": 42
  }
}
```

**Risk**: Beta feature - API may change before GA

**Recommendation**: Use with fallback pattern:

```
Try: claude --json-schema '...' "prompt"
If: JSON parse error or schema mismatch
Then: Retry without --json-schema, parse response manually
```

---

## Available in CLI (Auto-Enabled)

### Interleaved Thinking (VERIFIED WORKING)

**Status**: GA in CLI - Enabled by default (verified 2026-01-20)

Interleaved thinking enables Claude to reason between tool calls, improving quality for multi-step agentic workflows.

**How it works in CLI:**

```
∴ Thinking…                    ← Initial reasoning
  "I need to read these files..."

● Read(file1.json)             ← Tool execution
● Read(file2.md)

∴ Thinking…                    ← INTERLEAVED thinking (after tool results)
  "Now comparing the results..."
  [detailed analysis]

● Final response               ← Output
```

**Key benefits:**

- Reason about tool results before deciding next steps
- Chain multiple tool calls with reasoning in between
- Make nuanced decisions based on intermediate results

**API vs CLI difference:**

| Environment | Status | Configuration |
|-------------|--------|---------------|
| Claude Code CLI | Enabled by default | No configuration needed |
| Messages API | Beta | Requires `interleaved-thinking-2025-05-14` header |

**To disable** (if needed): Add `DISABLE_INTERLEAVED_THINKING` to your system prompt.

**Reference**: [Extended Thinking Docs](https://platform.claude.com/docs/en/build-with-claude/extended-thinking)

---

## Not Available in CLI

### Effort Parameter (VERIFIED NOT WORKING)

**Status**: API key users only - [Effort Docs](https://platform.claude.com/docs/en/build-with-claude/effort)

The effort parameter controls thinking budget with semantic levels (low/medium/high).

**CLI flag exists:** `--betas effort-2025-11-24`

**Error message:**

```
Custom betas are only available for API key users
```

**Affects**: Opus 4.5 only (not Haiku or Sonnet)

**Recommendation**: Skip for subscription users. Use Extended Thinking directly instead (manually specify thinking budget).

---

## Wrong Use Case for CLI

These features exist but don't apply to typical CLI workflows:

| Feature | Why Not Applicable |
|---------|-------------------|
| **Prompt Caching** | Requires repeated identical context (batch processing use case) |
| **Batch API** | Async processing with 24h window; CLI is synchronous |
| **RAG / Contextual Retrieval** | Requires vector database infrastructure |
| **Hybrid Retrieval (BM25 + Embeddings)** | Requires retrieval system setup |

**When these would apply:**

- **Prompt Caching**: Document Q&A systems with static knowledge bases
- **Batch API**: Processing hundreds of files overnight
- **RAG**: Knowledge base search, documentation assistants

---

## How to Verify Features

### Check Installation

```bash
claude --version
claude --help
```

### Test Skills

```bash
# Check skills directory exists
ls .claude/skills/

# Create test skill
mkdir -p .claude/skills/test-skill
cat > .claude/skills/test-skill/skill.md << 'EOF'
---
name: test-skill
description: Test skill for verification
---
# Test Skill
Respond with: "Skills are working!"
EOF

# In Claude Code session, invoke via Skill tool or /test-skill
```

### Test Commands

```bash
# Check commands directory exists
ls .claude/commands/

# Create test command
cat > .claude/commands/test-command.md << 'EOF'
# Test Command
Respond with: "Commands are working!"
EOF

# In Claude Code session: /test-command
```

### Test Context Management

```
# In Claude Code session:
/context      # Check token usage
/compact      # Optimize context
/help         # List all commands
```

### Test Structured Outputs

```bash
claude --print --model haiku --output-format json \
  --json-schema '{"type":"object","properties":{"test":{"type":"boolean"}},"required":["test"]}' \
  "Return true for test"
# Should return: {"structured_output":{"test":true}}
```

---

## Version Information

| Property | Value |
|----------|-------|
| Minimum version | 2.1.x |
| Context window | 200,000 tokens |
| Maximum output | 64,000 tokens |
| Extended thinking minimum | 1,024 tokens |

**Sources:**

- [Context windows - Claude Docs](https://platform.claude.com/docs/en/build-with-claude/context-windows)
- [What's new in Claude 4.5 - Claude Docs](https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-5)

---

## Related Documentation

| Document | Description |
|----------|-------------|
| [SKILLS-ARCHITECTURE.md](./SKILLS-ARCHITECTURE.md) | Skill design patterns and namespacing |
| [COMMANDS-AND-CONTEXT.md](./COMMANDS-AND-CONTEXT.md) | Commands and context optimization |
| [TASK-SPAWNING-GUIDE.md](./TASK-SPAWNING-GUIDE.md) | Parallel agent execution |
| [LARGE-FILE-CHUNKING.md](./LARGE-FILE-CHUNKING.md) | Context management for large files |
| [MODEL-OPTIMIZATION-HAIKU.md](./MODEL-OPTIMIZATION-HAIKU.md) | Haiku 4.5 patterns |
| [MODEL-OPTIMIZATION-SONNET.md](./MODEL-OPTIMIZATION-SONNET.md) | Sonnet 4.5 patterns |
| [MODEL-OPTIMIZATION-OPUS.md](./MODEL-OPTIMIZATION-OPUS.md) | Opus 4.5 extended thinking |

---

## External Resources

### Official Documentation

- [Claude Code: Best practices for agentic coding](https://www.anthropic.com/engineering/claude-code-best-practices)
- [Extended thinking - Claude Docs](https://platform.claude.com/docs/en/build-with-claude/extended-thinking)
- [Structured outputs - Claude Blog](https://www.anthropic.com/news/structured-outputs)
- [Effort parameter - Claude Docs](https://platform.claude.com/docs/en/build-with-claude/effort)

### Community Guides

- [Awesome Claude Code - GitHub](https://github.com/hesreallyhim/awesome-claude-code)
- [Shipyard | Claude Code CLI Cheatsheet](https://shipyard.build/blog/claude-code-cheat-sheet/)

---

**Version**: 1.0.0
**Last Updated**: 2026-01-20
