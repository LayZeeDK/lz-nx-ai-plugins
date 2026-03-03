# Claude Opus 4.5 Implementation Optimization Guide

**Model**: Claude Opus 4.5 (200K context, extended thinking, effort parameter, hybrid reasoning)

**Purpose**: Optimize implementation workflows for Claude Opus 4.5's strengths

**Related**: [MODEL-OPTIMIZATION-SONNET.md](./MODEL-OPTIMIZATION-SONNET.md), [MODEL-OPTIMIZATION-HAIKU.md](./MODEL-OPTIMIZATION-HAIKU.md)

**Note**: This guide documents **Claude Opus 4.5** - the most capable Claude model for complex reasoning and state-of-the-art software engineering.

---

## Model Characteristics for Implementation

### Claude Opus 4.5 Implementation Strengths

1. **State-of-the-Art Coding** - 80.9% on SWE-bench Verified (vs Sonnet 4.5's 77.2%)
2. **Hybrid Reasoning Model** - Pushes frontier for coding, agents, computer use
3. **Effort Parameter (BETA)** - Unique to Opus 4.5: control token usage (low/medium/high)
4. **Token Efficiency** - 76% fewer output tokens at medium effort (matches Sonnet best performance) ⚠️ **BETA FEATURE**
5. **Extended Thinking** - Up to 64K token budgets for deep reasoning
6. **Long-Horizon Excellence** - Best for complex, multi-step autonomous tasks
7. **Strongest Tool Use** - One of the best tool-using models available

**Sources**:

- [Introducing Claude Opus 4.5](https://www.anthropic.com/news/claude-opus-4-5)
- [Claude Opus 4.5](https://www.anthropic.com/claude/opus)
- [What's new in Claude 4.5 - Claude Docs](https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-5)

### Context Window Strategy

**Context Availability by Platform**:

| Platform           | 200K Context | 1M Context           | Recommendation                                |
| ------------------ | ------------ | -------------------- | --------------------------------------------- |
| **Claude Code**    | ✅ Available | ❌ **Not Available** | Opus limited to 200K (use Sonnet for 1M)      |
| **API Standard**   | ✅ Available | ❌ Not Available     | Use progressive disclosure for large features |

**⚠️ IMPORTANT**: Opus 4.5 is limited to **200K context only**. The 1M context window is exclusive to Sonnet 4.5.

**For Claude Code Users**:

- **<200K tokens**: Use 200K context with Opus (standard)
- **200K-1M tokens**: ❌ Switch to Sonnet 4.5 (Opus cannot handle this, 1M is Sonnet-only)
- **>1M tokens**: Use progressive disclosure (chunk into phases)

**For API Users**:

- **<200K tokens**: Use 200K context (standard)
- **>200K tokens**: Use progressive disclosure (REQUIRED - 1M not available)

**Pricing**: $5/M input, $25/M output (67% cheaper than previous Opus pricing)

**Sources**:

- [Introducing Claude Opus 4.5 - Anthropic](https://www.anthropic.com/news/claude-opus-4-5) - 200K context
- [1M Context for Sonnet - Anthropic](https://www.anthropic.com/news/1m-context) - 1M is Sonnet-exclusive

---

## Opus 4.5-Specific Optimizations

### Optimization 1: Effort Parameter for Token Control (Opus 4.5 ONLY)

**What it is**: Opus 4.5 is the **ONLY** Claude model with an effort parameter

**Research Finding**:

> "Claude Opus 4.5 is the only model that supports the effort parameter, allowing you to control how many tokens Claude uses when responding and trade off between response thoroughness and token efficiency."

**Source**: [Effort - Claude Docs](https://platform.claude.com/docs/en/build-with-claude/effort)

#### Effort Settings

| Effort     | Token Usage | Performance             | Use Case                             |
| ---------- | ----------- | ----------------------- | ------------------------------------ |
| **High**   | Maximum     | Best (default)          | Complex reasoning, difficult coding  |
| **Medium** | 76% fewer   | Matches Sonnet 4.5 best | Balanced speed/quality, daily work   |
| **Low**    | Minimal     | Fast, simple            | Classification, lookups, high-volume |

**Key Performance Data**:

> "At medium effort, Opus 4.5 matches Sonnet 4.5's best SWE-bench score while using 76% fewer output tokens. At highest effort, Opus 4.5 exceeds Sonnet 4.5 by 4.3 percentage points while using 48% fewer tokens."

**Sources**:

- [Effort - Claude Docs](https://platform.claude.com/docs/en/build-with-claude/effort)
- [Claude Opus 4.5 vs Sonnet 4.5 - DataStudios](https://www.datastudios.org/post/claude-opus-4-5-vs-claude-sonnet-4-5-full-report-and-comparison-of-features-performance-pricing-a)

#### Implementation Pattern

````markdown
<effort_parameter_strategy>

## For Implementation Workflows

**Default**: Medium effort
**Reasoning**: Matches Sonnet 4.5's best performance with 76% fewer tokens

**When to Override**:

- **High effort**: User explicitly requests "maximum quality" OR task marked "critical"
- **Low effort**: Simple boilerplate tasks (not recommended for implementation)

## Effort Configuration (Beta Feature)

**⚠️ IMPORTANT**: Effort parameter requires beta header:

```json
{
  "model": "claude-opus-4.5",
  "anthropic_beta": "effort-2025-11-24",
  "effort": "medium"
}
```
````

**Note**: Beta features should be used cautiously - verify availability before relying on effort parameter

## ⚠️ BETA Feature Stability Warning

The **effort parameter** is currently in BETA (as of 2026-01-15). This means:

- API may change without notice
- Parameter may be removed or redesigned
- Performance characteristics may shift
- Not recommended for production-critical workflows

**Recommendation**: Test thoroughly before depending on effort-based optimizations.

</effort_parameter_strategy>

````

**Optimization Impact**: 76% token reduction at medium effort (huge cost savings)

---

### Optimization 2: Extended Thinking Budget Configuration

**Research Finding**:

> "Extended thinking is available in Opus 4.5 and is recommended for complex problem-solving, coding work, and multi-step reasoning. The system supports up to 64,000 tokens of pure reasoning before delivering an answer."

**Sources**:
- [Building with extended thinking - Claude Docs](https://platform.claude.com/docs/en/build-with-claude/extended-thinking)
- [How to use thinking mode in claude 4.5 - CometAPI](https://www.cometapi.com/how-to-use-thinking-mode-in-claude-4-5/)

#### Extended Thinking Budget Guidelines (Opus 4.5)

| Task Complexity      | Budget      | Use Case                                    |
| -------------------- | ----------- | ------------------------------------------- |
| **Simple**           | None (0)    | Rename variable, fix typo                   |
| **Moderate**         | 4K-8K       | Add method, simple component                |
| **Complex**          | 16K-32K     | State management, error handling, a11y      |
| **Very Complex**     | 32K-64K     | Multi-component refactor, complex algorithms|

**Recommendation**: Start at **16K** for implementation tasks, increase to 32K+ for very complex

**Budget Management**:

> "Start at the minimum (1,024 tokens) and increase incrementally. Pick budget_tokens proportionally to the complexity of the task (start small for experiments; raise budget only if you observe material quality improvements)."

**Source**: [Building with extended thinking - Claude Docs](https://platform.claude.com/docs/en/build-with-claude/extended-thinking)

#### Implementation Pattern

```markdown
<extended_thinking_opus>

## Opus 4.5 Extended Thinking Strategy

**Combine with Effort Parameter**:

- **Medium effort** + **16K thinking** = Balanced implementation
- **High effort** + **32K thinking** = Maximum quality implementation

**For implementation workflows**:

1. **Phase 1 (Context)**: 8K budget - understand architecture
2. **Phase 3 (Implementation)**: 16K-32K budget - complex tasks only
3. **Phase 4 (Verification)**: 8K budget - integration check

**Opus-Specific Advantage**:

> "Claude Opus 4.5 automatically preserves all previous thinking blocks throughout conversations, maintaining reasoning continuity across extended multi-turn interactions"

**Source**: [How to use thinking mode in claude 4.5 - CometAPI](https://www.cometapi.com/how-to-use-thinking-mode-in-claude-4-5/)

**Benefit**: Thinking accumulates across tasks, improving later decisions

</extended_thinking_opus>
````

---

### Optimization 3: System Prompt Sensitivity (Opus 4.5 Specific)

**Research Finding**:

> "Claude Opus 4.5 is more responsive to the system prompt than previous models, and if your prompts were designed to reduce undertriggering on tools or skills, Claude Opus 4.5 may now overtrigger, with the fix being to dial back any aggressive language."

**Source**: [Prompting best practices - Claude Docs](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices)

#### Implementation Pattern

````markdown
<system_prompt_calibration>

## Tone Down Aggressive Language

**❌ Opus 4.5 May Overtrigger**:

```markdown
CRITICAL: You MUST use the Read tool when examining files!
REQUIRED: You MUST mark tasks complete immediately!
MANDATORY: You MUST run tests after each implementation!
```
````

**✅ Calibrated for Opus 4.5**:

```markdown
Use the Read tool to examine files.
Mark tasks complete after finishing them.
Run tests after each implementation.
```

## Why This Matters

Opus 4.5's increased sensitivity means:

- **Old prompts** with "MUST" / "CRITICAL" may cause over-triggering
- **Opus 4.5** responds to normal language without emphasis
- **Benefit**: Cleaner, more natural prompting style

</system_prompt_calibration>

````

---

### Optimization 4: Word Choice for Extended Thinking Modes

**Practical Observation**:

When extended thinking is disabled, using alternative wording to "think" can improve response quality. Consider using words like "evaluate," "consider," or "analyze" instead of "think" and its variants.

**Research Context**:

Extended thinking is optional in Opus 4.5 and can impact performance differently based on task type:
- For pattern matching and simple tasks, extended thinking may hurt performance
- For complex reasoning, extended thinking enables deeper analysis
- Opus 4.5 is a strong reasoner even without extended thinking enabled

**Sources**:
- [How to use thinking mode in claude 4.5 - CometAPI](https://www.cometapi.com/how-to-use-thinking-mode-in-claude-4-5/)
- [Thinking mode in Claude 4.5 - Medium](https://medium.com/@mkteam/thinking-mode-in-claude-4-5-all-you-need-to-know-353235942182)

**Note**: This is based on practical experience and community observations, not official Anthropic documentation.

#### Implementation Pattern

```markdown
<think_word_replacement>

## When Extended Thinking is ENABLED

**✅ Safe to use "think"**:

```markdown
Think deeply about edge cases before implementing.
````

**Reason**: Extended thinking mode handles "think" correctly

## When Extended Thinking is DISABLED

**⚠️ Consider alternative wording** (based on practical observations):

```markdown
Think about the architecture...
Think through the edge cases...
What do you think about...
```

**✅ Use alternatives**:

```markdown
Consider the architecture...
Evaluate the edge cases...
What's your analysis of...
```

**Alternative Words**:

- "think" → "consider", "evaluate", "analyze"
- "think about" → "consider", "assess", "examine"
- "think through" → "work through", "analyze", "reason about"

## For implementation workflows

**We use extended thinking** → Safe to use "think"

**But for clarity**, prefer alternatives anyway:

- "Evaluate edge cases"
- "Consider dependencies"
- "Analyze integration points"

</think_word_replacement>

````

---

### Optimization 5: Parallel Tool Use (Same as Sonnet 4.5)

Opus 4.5 inherits Sonnet 4.5's enhanced parallel tool call capabilities.

**Implementation Pattern**: Same as Sonnet 4.5 optimization

```markdown
<parallel_context_loading>

## Load Multiple Files Simultaneously

```typescript
// Execute in SINGLE message (parallel)
Read(FEATURE_DIR + '/requirements.md');
Read(FEATURE_DIR + '/design.md');
Read(FEATURE_DIR + '/tasks.md');
Read(FEATURE_DIR + '/data-model.md');
Read('guidelines.md');
````

**Speedup**: ~10-20x faster than sequential reads

</parallel_context_loading>

````

**Source**: Based on Sonnet 4.5 capabilities (Opus 4.5 inherits these)

---

### Optimization 6: First-Try Correctness & Deep Debugging

**Research Finding**:

> "Opus is tuned to be an 'expert coder,' and in tricky programming challenges, Opus has a higher chance of producing a correct and optimized solution on the first try. It also handles deep debugging better. Opus's stronger logical planning means it can keep track of intricate conditions and long code execution flows with less oversight."

**Sources**:
- [Claude Opus 4.5 vs Sonnet 4.5 - DataStudios](https://www.datastudios.org/post/claude-opus-4-5-vs-claude-sonnet-4-5-full-report-and-comparison-of-features-performance-pricing-a)
- [Claude Sonnet 4.5 vs Opus 4.5 - Cosmic](https://www.cosmicjs.com/blog/claude-sonnet-45-vs-opus-45-a-real-world-comparison)

#### Implementation Pattern

```markdown
<first_try_correctness>

## Leverage Opus 4.5's Expert Coding

**For complex tasks**:

1. **Enable extended thinking** (16K-32K budget)
2. **Use medium/high effort** (let Opus reason deeply)
3. **Minimal constraints** (trust expert judgment)

**Opus 4.5 will**:

- ✅ Produce correct solution on first try (higher success rate than Sonnet)
- ✅ Handle edge cases proactively
- ✅ Optimize code structure
- ✅ Track intricate conditions across long flows

**Example**:

```markdown
Task: Implement multi-panel component with state coordination

Opus 4.5 approach (medium effort + 16K thinking):
- Analyzes all edge cases (disabled panels, animations, SSR)
- Designs optimal state structure
- Implements with correct logic on first try
- Includes edge case handling without being asked

Sonnet 4.5 approach (extended thinking):
- May require iteration to cover all edge cases
- Needs explicit guidance on edge cases
````

**When to Use Opus 4.5 Over Sonnet 4.5**:

- ✅ Complex algorithms requiring intricate logic
- ✅ Deep debugging of subtle bugs (race conditions, timing issues)
- ✅ First-time correctness critical (production code, risky refactors)
- ✅ Long code execution flows with many conditions

</first_try_correctness>

````

---

### Optimization 7: Vision & Image Processing

**Research Finding**:

> "Claude Opus 4.5 has improved vision capabilities compared to previous Claude models and performs better on image processing and data extraction tasks, particularly when there are multiple images present in context."

**Source**: [Prompting best practices - Claude Docs](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices)

#### Implementation Pattern (For UI Development)

```markdown
<vision_for_ui_implementation>

## Leverage Opus 4.5's Vision Capabilities

**When implementing UI components**:

1. Take screenshot of reference design
2. Take screenshot of current implementation
3. Compare side-by-side with Opus 4.5

**Example Workflow**:

```markdown
Task: Implement component matching design spec

1. Screenshot: Reference design (from design tool)
2. Screenshot: Current implementation
3. Ask Opus 4.5: "Analyze these screenshots. What CSS classes or styling differences exist?"

Opus 4.5 output:
- Reference uses padding: 1rem on content area
- Our implementation missing content wrapper
- Reference has .is-active class on expanded items
- Our implementation uses [class.is-active] correctly ✓
````

**Crop Tool Technique**:

> "One technique found effective is to give Claude Opus 4.5 a crop tool or skill, with consistent uplift on image evaluations when Claude is able to 'zoom' in on relevant regions of an image."

**Source**: [Prompting best practices - Claude Docs](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices)

**For visual testing**: Use Playwright MCP to take screenshots, then ask Opus to analyze

</vision_for_ui_implementation>

````

---

## Implementation-Specific Optimizations (Shared with Sonnet 4.5)

### Optimization 8: Structured Prompting with XML Tags

Same as Sonnet 4.5 - use `<role>`, `<task>`, `<constraints>`, `<output_format>`

**Source**: [Prompting best practices - Claude Docs](https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/claude-4-best-practices)

### Optimization 9: Literal Instruction Following

Same as Sonnet 4.5 - Claude 4.x takes instructions literally

**Source**: [Prompting best practices - Claude Docs](https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/claude-4-best-practices)

### Optimization 10: Direct Communication (Skip Preamble)

Same as Sonnet 4.5 - be direct and explicit

---

## Complete Implementation Workflow Example

### Complex Feature Implementation (~200K tokens, 200K context)

```markdown
## Configuration

**Model**: Claude Opus 4.5
**Effort**: Medium (76% token savings, matches Sonnet best)
**Extended Thinking**: 16K budget for complex tasks
**Context**: 200K (standard)

---

## Phase 1: Context Loading (2 minutes)

**Parallel tool use** (15 seconds):
- Load requirements.md, design.md, tasks.md simultaneously
- Glob for implementation files
- Read guidelines

**Extended thinking** (8K budget, 1 minute):
- Understand architecture
- Identify critical dependencies
- Evaluate complexity level

**Opus 4.5 advantage**: Superior logical planning → better architecture understanding

---

## Phase 2: Implementation (First-Try Correctness)

### Task T1.1: Complex State Management (5 min)

**Effort**: Medium
**Extended thinking**: 32K budget (complex logic)

**Opus 4.5's approach**:

```typescript
// First try is correct - handles all edge cases
export class StatefulComponent {
  readonly #items = [];
  readonly multiMode = false;

  toggle(item) {
    if (item.disabled) return;

    if (!this.multiMode) {
      // Close all other items (exclusive mode)
      this.#items.forEach(i => {
        if (i !== item) i.expanded = false;
      });
    }

    item.expanded = !item.expanded;
  }

  // Edge case: Handle SSR (no DOM)
  afterContentInit() {
    if (isBrowser()) {
      // Only register items in browser
      this.#registerItems();
    }
  }
}
````

**Quality check**:

- ✅ Handles exclusive mode correctly (first try)
- ✅ Handles disabled state proactively
- ✅ Handles SSR edge case (without being asked)
- ✅ Clean, maintainable code

**Sonnet 4.5 comparison**: Might need iteration to catch SSR edge case

---

## Phase 3: Verification

**Extended thinking** (8K budget):

- Evaluate integration between tasks
- Consider edge cases across full implementation
- Assess test coverage completeness

**Opus advantage**: Stronger logical planning → better integration analysis

---

**Total time**: ~30 minutes
**Context used**: ~200K tokens
**Effort**: Medium (76% token savings vs high effort)
**Extended thinking**: 48K total (8K + 32K + 8K)
**Quality**: State-of-the-art (80.9% SWE-bench)
**First-try success**: Higher than Sonnet 4.5

````

---

## Model Selection Matrix

### Opus 4.5 vs. Sonnet 4.5 vs. Others

| Scenario                       | Best Choice         | Why                                       |
| ------------------------------ | ------------------- | ----------------------------------------- |
| **Complex reasoning required** | Opus 4.5            | 80.9% SWE-bench (vs Sonnet's 77.2%)       |
| **First-try correctness critical** | Opus 4.5        | Expert coder, higher success rate         |
| **Deep debugging**             | Opus 4.5            | Superior logical planning                 |
| **Daily development**          | Sonnet 4.5          | Faster, cheaper, 77.2% SWE-bench          |
| **Simple tasks**               | Haiku 4.5           | 90% of Sonnet, 3x cheaper, 2x faster      |
| **Cost-sensitive**             | Sonnet 4.5 / Haiku  | Opus is premium ($5/$25 vs $3/$15)        |
| **Large context (>200K)**      | Sonnet 4.5 (1M only) | ⚠️ Opus limited to 200K, use Sonnet for 1M |

**Recommendation**:

- **Use Opus 4.5**: Complex implementations, first-try correctness critical, deep debugging
- **Use Sonnet 4.5**: Daily work, good balance of speed/quality/cost
- **Use Haiku 4.5**: Simple tasks, high-volume, rapid iteration

---

## Effort + Extended Thinking Combinations

### For Different Task Complexities

| Task Type              | Effort | Extended Thinking | Total Token Usage | Use Case               |
| ---------------------- | ------ | ----------------- | ----------------- | ---------------------- |
| **Simple**             | Medium | None              | Low               | Quick refactors        |
| **Moderate**           | Medium | 8K                | Moderate          | Standard features      |
| **Complex**            | Medium | 16K               | Balanced          | **Default for Opus**   |
| **Very Complex**       | Medium | 32K               | Higher            | Multi-component logic  |
| **Critical/Production**| High   | 32K-64K           | Highest           | Maximum quality needed |

**Cost Optimization**:

- **Medium effort** saves 76% tokens vs high effort
- Still matches Sonnet 4.5's best performance
- For most implementations: Medium + 16K thinking is optimal

---

## Common Pitfalls & Solutions

### ❌ Pitfall 1: Using High Effort by Default

```markdown
❌ BAD: Always use high effort (wastes tokens)

✅ GOOD: Use medium effort (76% savings, same quality as Sonnet best)
Only override to high for critical tasks
````

**Solution**: Default to medium effort

---

### ❌ Pitfall 2: Aggressive System Prompts

```markdown
❌ BAD: "CRITICAL: You MUST use tools!"

✅ GOOD: "Use tools for file operations."
```

**Solution**: Opus 4.5 is more sensitive - use normal language

---

### ❌ Pitfall 3: Using "Think" Without Extended Thinking

```markdown
❌ BAD (extended thinking disabled):
"Think about the edge cases..."

✅ GOOD:
"Consider the edge cases..." OR enable extended thinking
```

**Solution**: Replace "think" with alternatives OR use extended thinking

---

### ❌ Pitfall 4: Not Leveraging First-Try Correctness

```markdown
❌ BAD: Use same TDD approach as Sonnet (error-first)

✅ GOOD: Let Opus implement complete solution first try

- Opus proactively handles edge cases
- Error-first TDD may be redundant for Opus
```

**Solution**: Trust Opus's expert coding - implement fully, then test

---

## Success Metrics

After optimization, expect:

**Quality** (vs. Sonnet 4.5):

- SWE-bench: 80.9% vs 77.2% (+3.7 points)
- First-try correctness: Higher
- Deep debugging: Superior
- Edge case handling: More proactive

**Cost** (with medium effort):

- 76% fewer output tokens vs high effort
- Matches Sonnet 4.5's best performance
- $5/$25 per million tokens

**Speed**:

- Slower than Sonnet 4.5 (more thorough reasoning)
- But higher success rate reduces iteration cycles

**When Opus 4.5 Wins**:

- Complex implementations: 15% improvement over Sonnet (fewer iterations)
- Deep debugging: 20% improvement (finds root cause faster)
- Long-horizon tasks: Better state tracking, fewer dead-ends

---

## Token Efficiency Comparison

**Same task, different effort levels**:

| Configuration                  | Tokens Used | SWE-bench Score       | Cost Efficiency |
| ------------------------------ | ----------- | --------------------- | --------------- |
| Opus 4.5 (high effort)         | 100K output | 80.9%                 | Baseline        |
| Opus 4.5 (medium effort)       | 24K output  | 77.2% (Sonnet's best) | 76% cheaper     |
| Sonnet 4.5 (extended thinking) | 50K output  | 77.2%                 | 2x Opus medium  |

**Key insight**: Opus 4.5 at medium effort = Sonnet 4.5's best, with 52% fewer tokens

---

## Research Sources

### Anthropic Official

- [Introducing Claude Opus 4.5](https://www.anthropic.com/news/claude-opus-4-5) - Model announcement, capabilities
- [Claude Opus 4.5](https://www.anthropic.com/claude/opus) - Product page
- [What's new in Claude 4.5 - Claude Docs](https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-5) - Feature overview
- [Prompting best practices - Claude Docs](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices) - System prompt sensitivity
- [Effort - Claude Docs](https://platform.claude.com/docs/en/build-with-claude/effort) - Effort parameter (beta)
- [Building with extended thinking - Claude Docs](https://platform.claude.com/docs/en/build-with-claude/extended-thinking) - Thinking budgets

### Extended Thinking & Word Choice

- [How to use thinking mode in claude 4.5 - CometAPI](https://www.cometapi.com/how-to-use-thinking-mode-in-claude-4-5/) - Extended thinking guidance, practical patterns
- [Thinking mode in Claude 4.5 - Medium](https://medium.com/@mkteam/thinking-mode-in-claude-4-5-all-you-need-to-know-353235942182) - Extended thinking control, when to avoid

### Performance Analysis

- [Claude Opus 4.5 vs Sonnet 4.5 - DataStudios](https://www.datastudios.org/post/claude-opus-4-5-vs-claude-sonnet-4-5-full-report-and-comparison-of-features-performance-pricing-a) - Performance comparison, token efficiency
- [Claude Sonnet 4.5 vs Opus 4.5 - Cosmic](https://www.cosmicjs.com/blog/claude-sonnet-45-vs-opus-45-a-real-world-comparison) - Real-world comparison
- [Claude Opus 4.5 Guide - Claude Fast](https://claudefa.st/blog/guide/performance/claude-opus-4-5-guide) - Performance guide
- [Claude Opus 4.5: Benchmarks, Agents, Tools - DataCamp](https://www.datacamp.com/blog/claude-opus-4-5) - Benchmark analysis

### Third-Party Analysis

- [How to use thinking mode in claude 4.5 - CometAPI](https://www.cometapi.com/how-to-use-thinking-mode-in-claude-4-5/) - Extended thinking, budget management
- [Claude Opus 4.5 vs GPT-5.2 Codex - Vertu](https://vertu.com/lifestyle/claude-opus-4-5-vs-gpt-5-2-codex-head-to-head-coding-benchmark-comparison/) - Model comparison

---

## Quick Reference Card

### Claude Opus 4.5 Optimization Checklist

```
✅ Medium effort (default) - 76% token savings, matches Sonnet best
✅ High effort (critical tasks) - Maximum quality, first-try correctness
✅ Extended thinking (16K-32K) - Complex reasoning, deep debugging
✅ Avoid aggressive language - "Use X" not "MUST use X"
✅ Replace "think" (if no extended thinking) - Use "consider", "evaluate"
✅ Parallel tool use - Load files simultaneously
✅ Trust first-try correctness - Less iteration needed than Sonnet
✅ Vision for UI tasks - Compare screenshots, crop for detail
✅ XML structure - Same as Sonnet 4.5
✅ Direct communication - Same as Sonnet 4.5
```

**Result**: State-of-the-art coding (80.9% SWE-bench) with token efficiency

---

## When to Use Opus 4.5 vs. Sonnet 4.5

### Decision Tree

```
Task complexity assessment:

IF task is simple (boilerplate, standard patterns):
  → Use Haiku 4.5 or Sonnet 4.5 (Opus overkill)

ELSE IF task is moderate (standard implementation):
  → Use Sonnet 4.5 (faster, cheaper, 77.2% SWE-bench)

ELSE IF task is complex AND first-try correctness critical:
  → ✅ Use Opus 4.5 (medium effort + extended thinking)
  → 80.9% SWE-bench, better first-try rate

ELSE IF deep debugging OR intricate logic:
  → ✅ Use Opus 4.5 (high effort + extended thinking)
  → Superior logical planning, root cause analysis

ELSE IF cost is primary concern:
  → Use Sonnet 4.5 or Haiku 4.5
```

### Cost-Benefit Analysis

| Model      | Cost (Input/Output) | SWE-bench | First-Try Rate | Best For              |
| ---------- | ------------------- | --------- | -------------- | --------------------- |
| Haiku 4.5  | $0.80/$4.00         | ~70%      | Moderate       | Simple tasks          |
| Sonnet 4.5 | $3.00/$15.00        | 77.2%     | Good           | Daily development     |
| Opus 4.5   | $5.00/$25.00        | **80.9%** | **Excellent**  | **Complex reasoning** |

**Opus 4.5 ROI**: Worth premium cost when:

- Reducing iteration cycles (first-try correctness)
- Critical production code (quality > cost)
- Complex debugging (faster root cause identification)
- Multi-component coordination (superior logical planning)

---

## Opus 4.5-Specific Best Practices

### 1. Leverage Effort Parameter for Cost Control

```markdown
**For most implementation tasks**:

- Use medium effort (76% token savings)
- Quality matches Sonnet 4.5's best
- Optimal cost/performance balance

**For critical/complex tasks**:

- Use high effort
- Maximum quality, first-try correctness
- Worth the token cost
```

### 2. Trust First-Try Implementations

```markdown
**Opus 4.5 approach**:

- Implement complete solution
- Run tests once
- High probability of passing first try

**vs. Sonnet 4.5 approach** (error-first TDD):

- Write test
- Get error
- Fix error
- Repeat

**Insight**: Opus's higher first-try rate makes error-first TDD less necessary
```

### 3. Use Vision for UI Components

```markdown
**When implementing UI**:

- Take screenshots of reference design
- Ask Opus to analyze and compare
- Leverage improved vision capabilities
- Consider crop tool for detailed regions
```

### 4. Calibrate System Prompt Language

```markdown
**Opus 4.5 is more sensitive**:

- Use normal language, not aggressive
- "Use X when..." not "CRITICAL: MUST use X"
- Cleaner, more natural prompts
```

---

**Related Documents:**

- [MODEL-OPTIMIZATION-SONNET.md](./MODEL-OPTIMIZATION-SONNET.md) - Sonnet 4.5 patterns
- [MODEL-OPTIMIZATION-HAIKU.md](./MODEL-OPTIMIZATION-HAIKU.md) - Haiku 4.5 patterns
- [TASK-SPAWNING-GUIDE.md](./TASK-SPAWNING-GUIDE.md) - Multi-agent orchestration

---

**Version**: 1.0.0
**Last Updated**: 2026-01-20
