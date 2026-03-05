# Claude Sonnet 4.5 Implementation Optimization Guide

**Model**: Claude Sonnet 4.5 (200K context, extended thinking, implementation-optimized)

**Purpose**: Optimize implementation workflows for Claude Sonnet 4.5's strengths

**Related**: [MODEL-OPTIMIZATION-HAIKU.md](./MODEL-OPTIMIZATION-HAIKU.md), [MODEL-OPTIMIZATION-OPUS.md](./MODEL-OPTIMIZATION-OPUS.md)

---

## Model Characteristics for Implementation

### Claude Sonnet 4.5 Implementation Strengths

1. **30+ Hour Focus** - Can maintain context and goals across extended implementation sessions
2. **State-of-the-Art Code Editing** - 0% error rate on internal benchmarks (vs 9% on Sonnet 4)
3. **Enhanced Tool Use** - Parallel tool calls, speculative searches, multi-file context building
4. **Context Awareness** - Explicitly tracks token budget and optimizes usage
5. **Agentic Excellence** - 77.2% on SWE-bench Verified for real-world software tasks
6. **Extended Thinking** - Deep reasoning for architecture, error handling, edge cases

**Sources**:

- [Introducing Claude Sonnet 4.5](https://www.anthropic.com/news/claude-sonnet-4-5)
- [Claude Sonnet 4.5 coding model improves agentic capabilities | InfoWorld](https://www.infoworld.com/article/4066706/claude-sonnet-4-5-coding-model-improves-agentic-capabilities.html)
- [Is Sonnet 4.5 the best coding model in the world?](https://surgehq.ai/blog/sonnet-4-5-coding-model-evaluation)

### Context Window Strategy

**Context Availability by Platform**:

| Platform         | 200K Context | 1M Context       | Recommendation                                |
| ---------------- | ------------ | ---------------- | --------------------------------------------- |
| **Claude Code**  | ✅ Available | ✅ **Available** | Use 1M for large features (>200K tokens)      |
| **API Standard** | ✅ Available | ❌ Not Available | Use progressive disclosure for large features |

**For Claude Code Users**:

- **<200K tokens**: Use 200K context (standard)
- **200K-1M tokens**: Use 1M context (available, premium pricing: 2x input, 1.5x output)
- **>1M tokens**: Use progressive disclosure (chunk into phases)

**For API Standard Users**:

- **<200K tokens**: Use 200K context (standard)
- **>200K tokens**: Use progressive disclosure (REQUIRED - 1M not available)

**Source**: [Context windows - Claude Docs](https://docs.claude.com/en/docs/build-with-claude/context-windows)

---

## Implementation-Specific Optimizations

### Optimization 1: Phase-Based Implementation with Thinking Breaks

**Research Finding**:

> "Claude 4.x models offer thinking capabilities that can be especially helpful for tasks involving reflection after tool use or complex multi-step reasoning"

**Source**: [Prompting best practices - Claude Docs](https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/claude-4-best-practices)

#### Implementation Pattern

```markdown
<implementation_workflow>

## Phase 1: Deep Context Gathering (Research-First)

**Extended thinking budget**: 8K tokens

Before writing ANY code:

1. Read task list to understand FULL implementation scope
2. Read design document for architecture, tech stack, file structure
3. Read requirements for functional specifications
4. Read data model (if exists) for entity relationships
5. Read API contracts (if exists) for interface definitions
6. Glob for existing implementation files

**Thinking checkpoint**: Reflect on:

- What's the architectural approach?
- What are the critical dependencies?
- What edge cases need handling?
- What testing strategy is needed?

## Phase 2: Setup Verification (Systematic)

**No extended thinking needed** (mechanical tasks)

1. Verify ignore files (.gitignore, .dockerignore, etc.)
2. Check project setup (dependencies, build config)
3. Validate test environment
4. Create TODO list with TodoWrite

## Phase 3: Implementation (Test-Driven)

**Extended thinking budget**: 16K+ tokens per complex task

For each task from task list:

1. **Think first**: What's the smallest implementation that satisfies requirements?
2. **Write tests** (unit tests or integration tests)
3. **Implement to pass tests** (minimal viable implementation)
4. **Verify immediately** (run tests, check output)
5. **Think after**: Did I handle edge cases? Accessibility? Performance?

**Thinking checkpoints after each task**:

- Did tests pass?
- Are there untested edge cases?
- Does this match the specification's intent?
- Should I refactor before continuing?

## Phase 4: Integration Verification

**Extended thinking budget**: 8K tokens

1. Run full test suite
2. Verify linting passes
3. Check build succeeds
4. **Think deeply**: Are there integration issues between implemented tasks?

## Phase 5: Documentation & Commit

**No extended thinking needed** (mechanical)

1. Update tracking documents (mark tasks complete)
2. Create conventional commit(s)
3. Report completion summary

</implementation_workflow>
```

**Why this works**:

- **Reflection between phases** prevents tunnel vision
- **Extended thinking for complex tasks** improves code quality
- **Mechanical tasks without thinking** saves tokens for where reasoning matters

---

### Optimization 2: Parallel Tool Use for Context Building

**Research Finding**:

> "The model more effectively uses parallel tool calls, firing off multiple speculative searches simultaneously during research and reading several files at once to build context faster"

**Source**: [Introducing Claude Sonnet 4.5 in Amazon Bedrock - AWS](https://aws.amazon.com/blogs/aws/introducing-claude-sonnet-4-5-in-amazon-bedrock-anthropics-most-intelligent-model-best-for-coding-and-complex-agents/)

#### Implementation Pattern

````markdown
<parallel_context_loading>

## Step 1: Parallel File Discovery

Execute these searches **simultaneously** (not sequentially):

```typescript
// All fired in same message
Glob(pattern: "**/tasks.md")
Glob(pattern: "**/design.md")
Glob(pattern: "**/requirements.md")
Glob(pattern: "**/contracts/**/*.md")
Glob(pattern: "**/data-model.md")
```
````

**Speedup**: 5 parallel globs vs 5 sequential = 5x faster

## Step 2: Parallel File Reading

Once paths are known, read multiple files **simultaneously**:

```typescript
// All fired in same message
Read('docs/feature/requirements.md');
Read('docs/feature/design.md');
Read('docs/feature/tasks.md');
Read('docs/feature/data-model.md');
```

**Speedup**: 4 parallel reads vs 4 sequential = 4x faster

## Step 3: Parallel Implementation File Loading

```typescript
// Load all implementation files in parallel
Read('src/component/main.ts');
Read('src/component/main.spec.ts');
Read('src/component/main.stories.ts');
Read('src/component/types.ts');
```

</parallel_context_loading>

````

**Total speedup**: 10-20x faster context loading (seconds instead of minutes)

---

### Optimization 3: Minimal Implementation with Intentional Constraints

**Research Finding**:
> "Claude 4.x models have been trained for more precise instruction following. Claude 4.x takes you literally and does exactly what you ask for, nothing more."

**Source**: [Prompting best practices - Claude Docs](https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/claude-4-best-practices)

#### Implementation Pattern

```markdown
<minimal_implementation_constraints>

## Explicit Implementation Boundaries

**OUT OF SCOPE** (do NOT implement unless explicitly in task list):
- Performance optimizations beyond requirements
- Refactoring existing working code
- Additional features "while we're here"
- Documentation beyond JSDoc on changed functions
- Extra error handling beyond spec requirements
- Additional tests beyond coverage requirements

**IN SCOPE** (implement ONLY these):
- Exact requirements from task list
- Tests specified in task list
- Error handling specified in requirements
- Accessibility requirements from spec
- Type safety for changed code

## Why This Matters

Without explicit constraints, Sonnet 4.5's coding excellence may lead to:
- ❌ Over-engineering (adding abstractions not in spec)
- ❌ Scope creep (fixing unrelated issues)
- ❌ Extended implementation time (gold-plating)

With explicit constraints, Sonnet 4.5:
- ✅ Implements exactly what's needed
- ✅ Stays focused on task list
- ✅ Completes implementation faster

</minimal_implementation_constraints>
````

---

### Optimization 4: State Tracking with External Files

**Research Finding**:

> "Sonnet 4.5 maintains exceptional state tracking in external files, preserving goal-orientation across sessions"

**Source**: [Claude Sonnet 4.5 vs. GPT-5 Codex - Composio](https://composio.dev/blog/claude-sonnet-4-5-vs-gpt-5-codex-best-model-for-agentic-coding)

#### Implementation Pattern

````markdown
<state_tracking>

## Use Task List as State File

**Mark tasks as complete IMMEDIATELY after finishing**:

```markdown
### Core Implementation

- [x] T1.1: Implement component class
- [x] T1.2: Add expand/collapse methods
- [ ] T1.3: Implement ARIA attributes
- [ ] T1.4: Add keyboard navigation
```
````

**Why this works**:

- Sonnet 4.5 can read task file between turns to remember what's done
- Prevents re-implementing completed tasks
- Provides progress visibility to user
- Enables session resumption

## Progress Tracking Pattern

After completing each task:

1. **Edit task file** to mark task [X]
2. **Update TodoWrite** to reflect completion
3. **Verify test results** before marking complete
4. **Continue to next task**

**NEVER**:

- ❌ Batch-mark multiple tasks without implementing
- ❌ Mark task complete if tests fail
- ❌ Forget to update both task file AND TodoWrite

</state_tracking>

````

---

### Optimization 5: Error-First Implementation

**Research Finding**:
> "Claude Sonnet 4.5's edit capabilities are exceptional, going from 9% error rate on Sonnet 4 to 0% on internal code editing benchmarks"

**Source**: [Introducing Claude Sonnet 4.5](https://www.anthropic.com/news/claude-sonnet-4-5)

#### Implementation Pattern

```markdown
<error_first_implementation>

## TDD with Error Detection First

### Step 1: Write Failing Test

```typescript
// Unit test - EXPECT to fail initially
describe('Toggle Component', () => {
  it('should toggle state on click', async () => {
    const component = render(<Toggle />);
    const button = screen.getByRole('button', { name: /Toggle/ });

    // Test: toggle() method exists and flips state
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });
});
````

### Step 2: Run Test - Capture EXACT Error

```bash
npm run test -- Toggle
```

**Expected error**:

```
Error: Unable to find role="button" with name /Toggle/
```

### Step 3: Fix ONLY the Error

Don't implement the whole feature. Fix the ONE error:

```typescript
// Add button with correct name
<button role="button">Toggle</button>
```

### Step 4: Run Again - Capture NEXT Error

**Next error**:

```
Expected attribute aria-expanded="true" but got "false"
```

### Step 5: Fix ONLY That Error

```typescript
// Add aria-expanded binding
<button
  role="button"
  aria-expanded={expanded}>
  Toggle
</button>
```

**Repeat until all tests pass**

## Why This Works

- ✅ **0% error rate** - Sonnet 4.5's strength in precise edits
- ✅ **Incremental progress** - Each fix is small and verifiable
- ✅ **Prevents over-engineering** - Only implement what tests require
- ✅ **Clear feedback loop** - Error messages guide implementation

</error_first_implementation>

````

---

### Optimization 6: Extended Thinking for Complex Logic

**Research Finding**:
> "Extended thinking mode shows substantial performance gains on complex reasoning. Effectiveness rating: 10/10 for complex reasoning, 3/10 for simple queries."

**Source**: [We Tested 25 Popular Claude Prompt Techniques](https://www.dreamhost.com/blog/claude-prompt-engineering/)

#### Thinking Budget Guidelines for Implementation

| Task Complexity | Thinking Budget | Examples |
|----------------|----------------|----------|
| **Simple** | None (0) | Rename variable, add type annotation, fix typo |
| **Moderate** | 4K-8K | Add new method, implement simple component, add tests |
| **Complex** | 16K | State management, error handling, accessibility integration |
| **Very Complex** | 32K+ | Multi-component refactoring, architectural changes, complex algorithms |

#### Implementation Pattern

```markdown
<extended_thinking_for_implementation>

## When to Use Extended Thinking

### ✅ USE Extended Thinking (16K+ budget):

**Complex state management**:
```markdown
Task: Implement multi-panel component with state coordination
Complexity: Need to reason about:
- When to close other panels (exclusive mode)
- How to track which panels are open
- Edge cases: disabled items, animations, SSR
→ Extended thinking: 16K budget
````

**Error handling**:

```markdown
Task: Add comprehensive error diagnostics
Complexity: Need to reason about:

- What can go wrong (duplicate IDs, missing elements)
- When to throw errors vs warnings
- How to provide helpful error messages
  → Extended thinking: 16K budget
```

**Accessibility integration**:

```markdown
Task: Integrate ARIA for keyboard navigation
Complexity: Need to reason about:

- Which ARIA directives to use
- Focus management patterns
- Screen reader announcements
  → Extended thinking: 16K budget
```

### ❌ DON'T USE Extended Thinking:

**Mechanical tasks**:

- Marking tasks complete
- Running tests
- Committing changes
- Reading files

**Simple implementations**:

- Adding a signal: `readonly expanded = signal(false);`
- Adding an event: `readonly expand = new EventEmitter<void>();`
- Simple method: `toggle() { this.expanded = !this.expanded; }`

## Thinking Prompts for Complex Tasks

```markdown
<task>
Implement error diagnostics for component (REQ-001 through REQ-010)
</task>

<extended_thinking_prompt>
Think deeply about:

1. **Error categories**: What types of errors can occur?
   - Configuration errors (duplicate IDs)
   - Runtime errors (missing elements)
   - User errors (invalid input)

2. **Detection strategy**: When should we check?
   - On initialization (setup validation)
   - After content initialized (DOM validation)
   - Method calls (runtime validation)

3. **Error handling approach**: How to handle each?
   - Throw errors (blocking issues)
   - Console warnings (non-blocking issues)
   - ErrorHandler integration (diagnostic mode)

4. **Message design**: What information is helpful?
   - What went wrong
   - Where it happened
   - How to fix it

5. **Edge cases**:
   - What if user fixes error after init?
   - What about SSR (no DOM)?
   - What about dynamic content?

After thinking, implement the diagnostic system.
</extended_thinking_prompt>
```

</extended_thinking_for_implementation>

````

---

### Optimization 7: Structured XML for Multi-Phase Implementation

**Research Finding**:
> "Claude 4.x models respond well to structured prompts and effectively parse XML delimiters. XML works great, as do JSON and other labeled formats."

**Source**: [Claude 4 Best Practices - Official Docs](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices)

#### Implementation Pattern

```markdown
<xml_structured_implementation>

<role>
You are an expert implementation agent executing a systematic task-by-task implementation workflow for software components.
</role>

<implementation_phases>

<phase name="setup" extended_thinking="false">
- Run prerequisite checks script
- Load feature artifacts (requirements, design, tasks)
- Verify project setup (ignore files, dependencies)
- Create TODO list for tracking
</phase>

<phase name="implementation" extended_thinking="16K">
- FOR EACH task in task list (in order):
  - IF task requires tests: Write tests first (TDD)
  - IF task is complex: Use extended thinking to plan approach
  - Implement ONLY what's specified in task
  - Run tests immediately after implementation
  - IF tests fail: Fix before continuing
  - Mark task [X] in task file
  - Update TodoWrite status
- END FOR
</phase>

<phase name="verification" extended_thinking="8K">
- Run full test suite
- Run linter
- Run build
- Think: Any integration issues between tasks?
- IF failures: Fix before proceeding
</phase>

<phase name="completion" extended_thinking="false">
- Update tracking documents
- Create git commit(s) with conventional format
- Report summary to user
</phase>

</implementation_phases>

<constraints>
- ONLY implement tasks from task list (no scope creep)
- Write tests BEFORE implementation where specified
- Run tests AFTER each implementation
- Mark tasks complete IMMEDIATELY after finishing
- NEVER mark task complete if tests fail
- Use extended thinking for complex tasks only
- Use parallel tool calls for context loading
</constraints>

<success_criteria>
- All tasks marked [X] in task file
- All tests passing
- Linting clean
- Build successful
- Commits created with conventional format
- User receives completion summary
</success_criteria>

</xml_structured_implementation>
````

---

## Complete Implementation Workflow Example

### Small Feature Implementation (~90K tokens, 200K context)

````markdown
## Phase 1: Context Loading (2 minutes)

**Parallel tool use** (15 seconds):

- Load requirements.md, design.md, tasks.md simultaneously
- Glob for implementation files
- Read project guidelines

**Extended thinking** (1 minute, 8K budget):

- Understand architecture
- Identify critical dependencies
- Note testing requirements

**Output**: "Ready to implement. 8 tasks identified (3 P0, 3 P1, 2 P2)"

---

## Phase 2: Setup (1 minute)

**Mechanical tasks** (no thinking needed):

- Verify .gitignore contains node_modules/
- Check package.json dependencies
- Confirm test environment ready

**TodoWrite creation**:

- [ ] Setup verification (1 min)
- [ ] T1.1: Component class (5 min)
- [ ] T1.2: Expand/collapse methods (3 min)
- [ ] T1.3: ARIA attributes (5 min)
- [ ] T1.4: Keyboard navigation (8 min)
- [ ] T1.5: Tests (10 min)
- [ ] T1.6: Stories (7 min)
- [ ] T2.1: Styling (4 min)
- [ ] Verification (3 min)

---

## Phase 3: Implementation (25 minutes)

### Task T1.1: Component Class (5 min)

**Test First**:

```typescript
// component.spec.ts
it('should create component', () => {
  const fixture = TestBed.createComponent(MyComponent);
  expect(fixture.componentInstance).toBeTruthy();
});
```
````

**Run test** → Error: "Cannot find name 'MyComponent'"

**Implementation** (minimal):

```typescript
// component.ts
export class MyComponent {}
```

**Run test** → ✅ Pass

**Mark complete**: [X] T1.1 in tasks.md, update TodoWrite

---

### Task T1.2: Expand/Collapse Methods (3 min)

**Extended thinking** (4K budget):

- What's the smallest API that works?
- Should expanded be a signal/state?
- Do we need up() and down() or just toggle()?

**Test First**:

```typescript
it('should toggle expanded state', async () => {
  await userEvent.click(panel);
  expect(panel.getAttribute('aria-expanded')).toBe('true');
});
```

**Implementation**:

```typescript
export class MyComponent {
  expanded = false;
  toggle() {
    this.expanded = !this.expanded;
  }
}
```

**Run test** → ✅ Pass

**Mark complete**: [X] T1.2

---

[Continue for remaining tasks...]

---

## Phase 4: Verification (3 minutes)

**Run full suite**:

```bash
npm run test          # ✅ All passing
npm run lint          # ✅ No errors
npm run build         # ✅ Successful
```

**Extended thinking** (8K budget):

- Are there integration issues?
- Did I handle all edge cases from spec?
- Are ARIA attributes correctly applied?

**Conclusion**: All tasks complete, ready to commit

---

## Phase 5: Completion (1 minute)

**Update task file**: All tasks marked [X]

**Create commit**:

```bash
git commit -m "feat(component): implement core component

Implement 8 tasks from tasks.md:
- Component class with state
- Expand/collapse methods (toggle, up, down)
- ARIA attributes
- Keyboard navigation (Enter, Space)
- Unit tests with full coverage
- CSS class application

Tests: 15 new tests (all passing)
Coverage: 95% (meets requirement)

Closes: #123

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

**Report to user**:

```
✅ Implementation complete!

Tasks completed: 8/8
Time: 32 minutes
Tests: 15 new (all passing)
Commits: 1

Ready for PR review.
```

---

**Total time**: ~32 minutes
**Context used**: ~90K tokens (well within 200K)
**Extended thinking**: 36K tokens total (8K + 4K + 8K + 16K for complex tasks)
**Quality**: 0% error rate (tests passing, lint clean)

````

---

## Context Management for Large Features

### When Feature > 200K Tokens

**Progressive disclosure pattern**:

```markdown
<progressive_disclosure_implementation>

## Estimate Token Usage

```typescript
total_tokens =
  (spec lines × 20) +
  (plan lines × 20) +
  (tasks lines × 15) +
  (implementation files × 18)
````

IF total > 200K:

- **Claude Code**: Use 1M context OR progressive disclosure
- **API Standard**: Use progressive disclosure (REQUIRED - 1M not available)

## Progressive Disclosure Strategy (For Features >200K Tokens)

### Approach 1: Progressive Disclosure (API Standard OR Claude Code)

**When to use**: API standard (required), or Claude Code when managing costs

Split implementation into phases:

**Phase 1: Core Component** (load only core files)

- main.ts
- types.ts
- Basic tests

**Phase 2: Sub-components** (load sub-component files)

- item.ts
- content.ts
- Sub-component tests

**Phase 3: Integration** (load integration files)

- Styles
- Stories
- E2E tests

**Commit after each phase** to track progress

### Approach 2: 1M Context (Claude Code Only)

**When to use**: Claude Code users with features 200K-1M tokens

**Availability**: ✅ Available in Claude Code, ❌ Not available in API standard

Load everything at once:

- All spec artifacts
- All implementation files
- All test files
- Full context for reasoning

**Trade-off**: Higher cost (2x input, 1.5x output) but faster (no context switching)

**Pricing**: Premium rates apply when exceeding 200K tokens

</progressive_disclosure_implementation>

````

---

## Common Pitfalls & Solutions

### ❌ Pitfall 1: Implementing Too Much

```markdown
❌ BAD:
Task: "Add toggle() method"
Implementation: Adds toggle(), up(), down(), animation handling, error recovery, performance optimization

✅ GOOD:
Task: "Add toggle() method"
Implementation: Only adds toggle() method that flips state
(Other features implemented when their tasks are reached)
````

**Solution**: Use "OUT OF SCOPE" list in prompt constraints

---

### ❌ Pitfall 2: Not Using Parallel Tool Calls

```markdown
❌ BAD (Sequential):
Read("requirements.md")
[wait for response]
Read("design.md")
[wait for response]
Read("tasks.md")
[wait for response]
→ Total: ~3 minutes

✅ GOOD (Parallel):
Read("requirements.md")
Read("design.md")
Read("tasks.md")
[all execute simultaneously]
→ Total: ~30 seconds
```

**Solution**: Always load multiple files in same message

---

### ❌ Pitfall 3: Forgetting State Tracking

```markdown
❌ BAD:
[Implements 5 tasks]
[Doesn't mark any complete in task file]
[User can't see progress]
[Sonnet forgets what's done between sessions]

✅ GOOD:
[Implements T1.1]
[Marks T1.1 as [X] in task file immediately]
[Updates TodoWrite]
[Implements T1.2]
[Marks T1.2 as [X] in task file immediately]
[...]
```

**Solution**: Mark complete IMMEDIATELY after each task

---

### ❌ Pitfall 4: Extended Thinking for Simple Tasks

```markdown
❌ BAD:
Task: "Read requirements.md"
Extended thinking: 16K budget
→ Wastes tokens reasoning about how to read a file

✅ GOOD:
Task: "Read requirements.md"
No extended thinking
→ Just reads the file
```

**Solution**: Only use extended thinking for complex implementation logic

---

## Model Selection Matrix for Implementation

| Feature Characteristics          | Claude Code                           | API Standard                          |
| -------------------------------- | ------------------------------------- | ------------------------------------- |
| **Small feature (<200K tokens)** | Sonnet 4.5 (200K)                     | Sonnet 4.5 (200K)                     |
| **Large feature (200K-500K)**    | Sonnet 4.5 (1M)                       | Sonnet 4.5 (200K + progressive)       |
| **Complex logic + small**        | Sonnet 4.5 (200K + extended thinking) | Sonnet 4.5 (200K + extended thinking) |
| **Simple implementation**        | Haiku 4.5 (90% performance, cheaper)  | Haiku 4.5 (90% performance, cheaper)  |
| **Refactoring multi-component**  | Sonnet 4.5 (1M)                       | Sonnet 4.5 (200K + progressive)       |

---

## Success Metrics

After optimization, expect:

**Speed**:

- Context loading: 10-20x faster (parallel tool use)
- Implementation: 2-3x faster (focused scope, TDD)
- Overall: 30-50% time reduction

**Quality**:

- Test pass rate: 95%+ (error-first TDD)
- Lint errors: 0 (incremental verification)
- Code review issues: Minimal (minimal implementation)

**Cost**:

- 200K context: Standard pricing (both platforms)
- 1M context: 2x input, 1.5x output premium pricing (Claude Code only)
- Extended thinking: Included in usage (both platforms)

---

## Research Sources

### Anthropic Official

- [Introducing Claude Sonnet 4.5](https://www.anthropic.com/news/claude-sonnet-4-5) - 30+ hour focus, state-of-the-art code editing
- [Prompting best practices - Claude Docs](https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/claude-4-best-practices) - Extended thinking, literal following
- [Extended thinking tips - Claude Docs](https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/extended-thinking-tips) - Budget management, high-level instructions
- [Context windows - Claude Docs](https://docs.claude.com/en/docs/build-with-claude/context-windows) - 200K vs 1M context, pricing

### Performance Analysis

- [Claude Sonnet 4.5 coding model improves agentic capabilities | InfoWorld](https://www.infoworld.com/article/4066706/claude-sonnet-4-5-coding-model-improves-agentic-capabilities.html) - Agentic capabilities, tool use
- [Is Sonnet 4.5 the best coding model in the world?](https://surgehq.ai/blog/sonnet-4-5-coding-model-evaluation) - SWE-bench Verified performance
- [Claude Sonnet 4.5 vs. GPT-5 Codex - Composio](https://composio.dev/blog/claude-sonnet-4-5-vs-gpt-5-codex-best-model-for-agentic-coding) - State tracking, external files
- [Introducing Claude Sonnet 4.5 in Amazon Bedrock - AWS](https://aws.amazon.com/blogs/aws/introducing-claude-sonnet-4-5-in-amazon-bedrock-anthropics-most-intelligent-model-best-for-coding-and-complex-agents/) - Parallel tool use, enhanced coordination

### Community Insights

- [We Tested 25 Popular Claude Prompt Techniques](https://www.dreamhost.com/blog/claude-prompt-engineering/) - Extended thinking effectiveness (10/10 vs 3/10)
- [The Claude Sonnet 4.5 Prompting Playbook](https://www.pantaleone.net/blog/post/claude-sonnet-4-5-system-prompt-analysis) - XML structuring, system prompt patterns

---

**Related Documents:**

- [MODEL-OPTIMIZATION-HAIKU.md](./MODEL-OPTIMIZATION-HAIKU.md) - Haiku patterns for parallel workers
- [MODEL-OPTIMIZATION-OPUS.md](./MODEL-OPTIMIZATION-OPUS.md) - Opus patterns for complex reasoning
- [TASK-SPAWNING-GUIDE.md](./TASK-SPAWNING-GUIDE.md) - Multi-agent orchestration

---

**Version**: 1.0.0
**Last Updated**: 2026-01-20
