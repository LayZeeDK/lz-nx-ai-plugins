---
status: diagnosed
trigger: "GAP-03: Agent uses node -e instead of Write tool for dependency query, triggering 3 permission prompts"
created: 2026-03-06T15:30:00Z
updated: 2026-03-06T15:30:00Z
---

## Current Focus

hypothesis: CONFIRMED -- see Resolution
test: n/a
expecting: n/a
next_action: Apply fixes to repl-executor.md agent definition

## Symptoms

expected: "repl-executor agent uses Write tool to create .cache/repl-code.js then runs sandbox via --file flag, as instructed in <execution> section"
actual: "Agent used node -e with inline fs.writeFileSync to write .cache/repl-code.js, and node -e with fs.readFileSync to read the session file. All 3 node -e commands triggered permission prompts."
errors: "3 permission prompts for node -e commands: (1) fs.writeFileSync to create code file, (2) fs.readFileSync to read session file, (3) another node -e for execution"
reproduction: "Run /lz-nx.rlm:explore 'What depends on lz-nx-rlm?' -- agent deviates from Write tool pattern on the more complex dependency query"
started: "UAT round 2, Test 2 (dependency query). Test 1 (simple counting query) passed with zero prompts."

## Eliminated

- hypothesis: "The Write tool is not available to the agent"
  evidence: "Frontmatter tools array includes Write: [Bash, Read, Write]. The simpler query (Test 1) used the Write tool correctly. Write is available."
  timestamp: 2026-03-06T15:05:00Z

- hypothesis: "The --file flag does not work"
  evidence: "Test 1 used --file successfully with zero prompts. The sandbox script correctly parses --file at line 229. The flag works."
  timestamp: 2026-03-06T15:06:00Z

- hypothesis: "The <execution> section instructions are missing or unclear about the Write tool"
  evidence: "Lines 52-57 explicitly say 'Write your code file using the Write tool (NOT Bash)' and 'The Write tool is a native Claude Code tool that never triggers permission prompts.' The instruction IS there and IS clear."
  timestamp: 2026-03-06T15:07:00Z

## Evidence

- timestamp: 2026-03-06T15:05:00Z
  checked: "repl-executor.md <role> section (lines 16-22)"
  found: "Line 17 says: 'Each turn, you generate ONE JavaScript code block and execute it via Bash.' This says 'execute it via Bash' without specifying the sandbox mechanism. The LLM could interpret 'execute via Bash' as license to use ANY Bash-based execution approach, including node -e."
  implication: "The <role> section creates ambiguity. It says 'via Bash' but the specific mechanism (Write tool + --file) is only documented later in <execution>. For complex queries where the LLM is under more cognitive load, the vague <role> instruction may override the specific <execution> instructions."

- timestamp: 2026-03-06T15:08:00Z
  checked: "Test 1 vs Test 2 query complexity"
  found: "Test 1: 'How many projects are there?' -- simple counting, likely answered in 2 iterations (explore: Object.keys(projects).length, answer: FINAL). Test 2: 'What depends on lz-nx-rlm?' -- dependency traversal, may require name resolution (lz-nx-rlm vs lz-nx.rlm), dependents() function, possibly multiple exploration steps. More complex queries increase cognitive load on the LLM, making it more likely to deviate from instructions."
  implication: "Query complexity is a contributing factor. Simple queries stay on the happy path. Complex queries that may involve errors or unexpected results push the LLM into 'improvise' mode where it falls back to pre-training patterns like node -e."

- timestamp: 2026-03-06T15:10:00Z
  checked: "Whether the agent tried to read the session file directly"
  found: "UAT report says the agent used node -e with fs.readFileSync to read the session file. The agent definition NEVER instructs reading the session file -- session state is managed transparently by the sandbox via --session flag. The SHOW_VARS() global is the documented way to inspect session variables. The agent went off-script to read the session file directly."
  implication: "The agent deviated from the documented workflow entirely -- not just the invocation pattern but the session management model. This suggests the LLM hit an unexpected situation (error? confusing output?) and abandoned the documented workflow in favor of ad-hoc debugging using node -e."

- timestamp: 2026-03-06T15:12:00Z
  checked: "Whether there is an explicit prohibition against node -e or fs.writeFileSync"
  found: "The <execution> section says 'using the Write tool (NOT Bash)' for the write step. It does NOT say 'NEVER use node -e' or 'NEVER use fs.writeFileSync/fs.readFileSync'. There is no global prohibition or negative instruction about alternative approaches."
  implication: "The instruction says what TO do but doesn't sufficiently warn against what NOT to do. LLMs respond well to explicit prohibitions. The '(NOT Bash)' parenthetical only addresses the write step -- it doesn't cover the broader category of node -e one-liners for arbitrary file operations."

- timestamp: 2026-03-06T15:15:00Z
  checked: "The <execution> section's instruction density and structure"
  found: "The sandbox invocation instructions are in a two-step numbered list inside the <execution> XML block. They use prose placeholders (PLUGIN_ROOT, etc.) that must be substituted. The bash code block on line 62 is a single long command with 5 flag-value pairs. For a subagent running Sonnet model with a complex multi-step query, the cognitive overhead of constructing this command correctly on every iteration is significant."
  implication: "The invocation pattern is correct but cognitively expensive. Each iteration requires: (1) composing the JavaScript code, (2) using the Write tool to a specific path, (3) constructing a long node command with 5 substituted paths. Under pressure (errors, unexpected results), the LLM may shortcut to node -e which is a single tool call instead of two (Write + Bash)."

- timestamp: 2026-03-06T15:18:00Z
  checked: "Whether the <role> section's 'execute it via Bash' creates a competing instruction"
  found: "The <role> section (line 17) is the FIRST substantive instruction the LLM sees after the frontmatter. It establishes the mental model: 'generate code and execute it via Bash.' The <execution> section (lines 41-85) comes later and specifies the exact mechanism. In LLM prompting, instructions that appear earlier and establish the initial framing have outsized influence. The vague 'via Bash' framing can override the later specific instructions, especially under cognitive load."
  implication: "This is a prompt structure issue. The <role> section should either specify the exact mechanism or at least not create ambiguity by saying 'via Bash' without qualification."

- timestamp: 2026-03-06T15:20:00Z
  checked: "Whether the spawn prompt from SKILL.md adds any conflicting context"
  found: "SKILL.md Step 6 constructs a minimal prompt: QUESTION + Context (paths and limits). It does NOT include any additional instructions about HOW to execute code. The agent relies entirely on its own system prompt (repl-executor.md) for execution methodology. The spawn prompt is clean -- it doesn't contribute to the confusion."
  implication: "The problem is entirely within repl-executor.md -- the spawn prompt is not a factor."

- timestamp: 2026-03-06T15:22:00Z
  checked: "LLM pre-training patterns for node -e"
  found: "node -e is an extremely common pattern in LLM training data for quick JavaScript execution. When an LLM needs to 'just run some JS' and is under cognitive pressure, node -e is a natural fallback. It's a single command, no file management needed, and appears in countless tutorials and Stack Overflow answers."
  implication: "The node -e fallback is a pre-training gravity well. The agent instructions must be strong enough to overcome this gravitational pull, especially under the increased cognitive load of complex queries."

## Resolution

root_cause: |
  The LLM deviated from the Write tool + --file invocation pattern because of a
  combination of three factors that compound during complex queries:

  **1. Ambiguous framing in <role> section (primary cause)**

  Line 17 of repl-executor.md says: "Each turn, you generate ONE JavaScript code
  block and execute it via Bash." This establishes "execute via Bash" as the mental
  model without specifying the exact mechanism. The LLM interprets this as license
  to use ANY Bash-based execution approach. For simple queries (Test 1), the LLM
  follows the more specific <execution> instructions. For complex queries (Test 2),
  when under higher cognitive load, the vague <role> framing dominates and the LLM
  falls back to familiar pre-training patterns like `node -e`.

  **2. No explicit prohibition of alternative approaches (amplifying factor)**

  The instructions say "using the Write tool (NOT Bash)" for the write step, but
  never explicitly prohibit `node -e`, `fs.writeFileSync()`, or `fs.readFileSync()`.
  LLMs respond strongly to explicit prohibitions. The absence of "NEVER use node -e"
  or "NEVER read/write files via Bash" leaves the door open for the LLM to
  rationalize alternative approaches when the documented pattern feels too complex.

  **3. Cognitive load scaling with query complexity (trigger)**

  The documented invocation pattern requires TWO tool calls per iteration (Write +
  Bash) and constructing a long command with 5 substituted path values. For the
  simple counting query, the overhead is manageable. For a dependency query that
  may involve name resolution errors, multiple exploration steps, and unexpected
  results, the LLM is under higher cognitive pressure and more likely to shortcut
  to a single `node -e` call which achieves the same goal with less ceremony.

  The session file reading (node -e with fs.readFileSync) further confirms the
  LLM went completely off-script -- it abandoned not just the invocation pattern
  but the entire session management model (which is transparent via --session flag).

fix: ""
verification: ""
files_changed: []

---

## Artifacts That Need Changing

### 1. `plugins/lz-nx.rlm/agents/repl-executor.md` -- <role> section (line 17)

**Current (ambiguous):**
```
Each turn, you generate ONE JavaScript code block and execute it via Bash.
```

**Problem:** "execute it via Bash" is vague and allows interpretation as any
Bash-based approach including `node -e`.

**Fix direction:** Replace with explicit reference to the two-step pattern:
```
Each turn, you write ONE JavaScript code block to .cache/repl-code.js using the
Write tool, then run the sandbox via Bash.
```

### 2. `plugins/lz-nx.rlm/agents/repl-executor.md` -- <execution> section

**Current:** Has positive instructions ("Use the Write tool") but no explicit
prohibitions.

**Fix direction:** Add a prominent prohibition block before or after the
invocation steps:

```markdown
**NEVER do any of the following:**
- NEVER use `node -e` to execute code. Always use the sandbox via --file.
- NEVER use `fs.writeFileSync()` in Bash. Always use the Write tool.
- NEVER use `fs.readFileSync()` in Bash to read files. Use the Read tool or
  sandbox globals (read(), SHOW_VARS()).
- NEVER read or write the session file directly. The sandbox manages session
  state transparently via the --session flag.
```

### 3. `plugins/lz-nx.rlm/agents/repl-executor.md` -- <role> section

**Fix direction:** Add a brief but firm constraint in the <role> block itself
(not just <execution>), since <role> is what the LLM sees first and what
establishes the mental model:

```
You MUST use the Write tool + sandbox --file pattern for ALL code execution.
NEVER use node -e, inline fs calls, or any other execution method.
```

## Missing

The following changes would prevent the LLM from deviating to `node -e`:

1. **Fix the <role> section** to explicitly reference the Write tool + --file
   pattern instead of vague "execute via Bash." This eliminates the ambiguous
   framing that creates a competing instruction.

2. **Add explicit prohibitions** against `node -e`, `fs.writeFileSync`,
   `fs.readFileSync`, and direct session file access. LLMs respond strongly
   to "NEVER do X" instructions. The current prompt only has positive
   instructions ("do this") but no negative guardrails ("never do that").

3. **Add prohibition to <role> section** (not just <execution>). The <role>
   section is the first instruction block and has outsized influence on the
   LLM's mental model. Placing the constraint there ensures it is established
   before the LLM encounters the detailed execution instructions.

4. **Consider adding a concrete example** of a complete iteration cycle (Write
   tool call + Bash command with actual-looking paths) to the <execution>
   section. Examples are powerful anchors that reduce the chance of deviation
   under cognitive load.

5. **Update structural tests** in `tests/lz-nx.rlm/src/test/agent-definition.test.ts`
   to verify:
   - The body contains "NEVER" + "node -e" (prohibition present)
   - The body contains "NEVER" + "fs.writeFileSync" (prohibition present)
   - The <role> section references Write tool (not just "Bash")
