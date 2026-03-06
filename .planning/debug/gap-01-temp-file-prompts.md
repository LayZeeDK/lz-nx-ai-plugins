---
status: diagnosed
trigger: "GAP-01 — Permission prompts block autonomous execution of repl-executor sandbox invocation cycle"
created: 2026-03-06T14:00:00Z
updated: 2026-03-06T14:30:00Z
---

## Current Focus

hypothesis: Three separate Bash commands (write temp file, redirect stdin, cleanup) each trigger Claude Code security heuristics that cannot be bypassed via allowed-tools or agent tools frontmatter
test: Analyzed Claude Code permission model via docs, GitHub issues, and code inspection
expecting: Confirmed -- shell redirects, out-of-tree writes, and heredocs are flagged regardless of permission config
next_action: Return diagnosis with fix directions

## Symptoms

expected: repl-executor agent runs sandbox invocations autonomously without triggering any permission prompts
actual: Each REPL iteration triggers 3 permission prompts (write temp file to /tmp, stdin redirect with <, rm -f /tmp cleanup). Total of 3N prompts for N iterations.
errors: "Prompt 1: cat > /tmp/repl-code.js << 'REPL_EOF' (write outside project tree). Prompt 2: node repl-sandbox.mjs < /tmp/repl-code.js (input redirection flagged as 'could read sensitive files'). Prompt 3: rm -f /tmp/repl-code.js (cleanup outside project tree)."
reproduction: Run `/lz-nx.rlm:explore "How many projects are there?"` -- every sandbox iteration prompts 3 times
started: Since 03-03 gap closure replaced heredoc+pipe with temp-file+redirect pattern

## Eliminated

- hypothesis: "heredoc+pipe pattern avoids prompts"
  evidence: "03-03 gap closure already replaced this. Original AGENTS.md documents that heredoc+pipe triggers prompts, and GitHub issue #25341 and #30880 confirm heredocs corrupt settings.local.json. This was the PRIOR approach and it also triggered prompts."
  timestamp: 2026-03-06T14:05:00Z

- hypothesis: "agent tools: [Bash] frontmatter auto-allows all Bash commands including redirects"
  evidence: "GitHub issue #25526 confirms subagents don't properly inherit parent Bash permissions. GitHub issue #14595 documents that pipe/redirect handling is 'unpredictable and undocumented'. The tools field grants tool ACCESS but does not bypass security heuristics for shell operators, redirects, or out-of-tree paths."
  timestamp: 2026-03-06T14:10:00Z

- hypothesis: "Using allowed-tools Bash patterns with wildcards would match redirect commands"
  evidence: "GitHub issue #13137 and #10298 confirm that Bash permission patterns with wildcards do NOT match commands containing redirects (< > |). Issue #29967 confirms the suggested pattern from the prompt dialog is a no-op for piped commands. This is a known, unfixed limitation."
  timestamp: 2026-03-06T14:12:00Z

- hypothesis: "Writing temp file inside project tree (.cache/) instead of /tmp/ would fix all 3 prompts"
  evidence: "This would fix prompts 1 and 3 (out-of-tree write/delete) but NOT prompt 2. The stdin redirect (< file) is independently flagged as 'could read sensitive files' regardless of file location. GitHub issue #13137 specifically confirms redirects are not matchable by permission patterns."
  timestamp: 2026-03-06T14:15:00Z

## Evidence

- timestamp: 2026-03-06T14:05:00Z
  checked: repl-executor.md sandbox invocation pattern (lines 49-73)
  found: Three-step pattern uses (1) `cat > /tmp/repl-code.js << 'REPL_EOF'` (heredoc write to /tmp), (2) `node repl-sandbox.mjs ... < /tmp/repl-code.js` (stdin redirect), (3) `rm -f /tmp/repl-code.js` (out-of-tree delete). Each step is a separate Bash call.
  implication: Three independent security triggers per iteration -- out-of-tree path, heredoc, stdin redirect, out-of-tree delete.

- timestamp: 2026-03-06T14:08:00Z
  checked: repl-sandbox.mjs CLI entry point (lines 200-282)
  found: Sandbox reads code from stdin via `readFileSync(0, 'utf8')` (fd 0). It parses CLI args for --index, --session, --workspace-root, --plugin-root. Code MUST arrive on stdin. No alternative input method exists (no --code flag, no --file flag).
  implication: The sandbox is hardcoded to read from stdin. Any solution must either (a) deliver code via stdin or (b) modify the sandbox to accept code via another channel.

- timestamp: 2026-03-06T14:10:00Z
  checked: Claude Code permission model documentation and GitHub issues
  found: (1) Bash permission wildcards do NOT match commands with redirects (<, >, |) -- issues #13137, #10298. (2) Heredocs corrupt settings.local.json -- issues #25341, #30880. (3) Subagent tools field grants tool access but does NOT bypass security heuristics -- issue #25526. (4) $() substitution always triggers prompts -- documented in AGENTS.md. (5) Pipe handling is 'unpredictable and undocumented' -- issue #14595.
  implication: There is NO configuration-based solution. The permission model cannot be configured to allow redirects or pipes. The fix must be architectural -- eliminate shell operators from the command entirely.

- timestamp: 2026-03-06T14:15:00Z
  checked: Claude Code system prompt guidance (from Piebald-AI/claude-code-system-prompts)
  found: System prompt says "Prefer Write tool instead of cat heredoc or echo redirection." This confirms the platform's own guidance is to avoid shell-based file creation.
  implication: The Write tool is the sanctioned approach for creating files from within Claude Code agents.

- timestamp: 2026-03-06T14:18:00Z
  checked: SKILL.md session path pattern (line 97)
  found: Session files already use `.cache/` inside the workspace tree (`${WORKSPACE_ROOT}/.cache/repl-session-${SESSION_ID}.json`). This establishes precedent for using in-tree `.cache/` for ephemeral files.
  implication: A temp code file at `.cache/repl-code-${SESSION_ID}.js` would follow the existing pattern and stay in-tree.

- timestamp: 2026-03-06T14:20:00Z
  checked: Whether `echo` piped to node would work without prompts
  found: GitHub issue #14595 documents that pipe behavior is inconsistent and often triggers prompts. AGENTS.md explicitly lists `&&`/`||` as prompt triggers. Even `echo "code" | node script.mjs` would trigger the pipe heuristic. Additionally, for multi-line JavaScript code, echo is impractical.
  implication: Pipe-based delivery is not viable.

- timestamp: 2026-03-06T14:22:00Z
  checked: Whether node -e with inline code would work
  found: `node -e "code"` avoids file and redirect issues entirely. However: (a) JavaScript code containing quotes must be escaped, which is fragile for complex code; (b) multi-line code requires careful escaping; (c) the sandbox expects stdin, not -e; (d) $() inside the -e string would trigger prompts. Most critically, the agent generates arbitrary JavaScript -- quote escaping would be a constant failure point.
  implication: Inline -e is too fragile for arbitrary user-generated code.

- timestamp: 2026-03-06T14:25:00Z
  checked: Whether the sandbox can be modified to accept a --file flag
  found: Adding `--file <path>` to repl-sandbox.mjs would let the CLI read code from a file instead of stdin. The command becomes `node repl-sandbox.mjs --index X --session Y --file .cache/repl-code.js` -- NO redirects, NO pipes, NO heredocs, NO out-of-tree paths. This is a plain command with arguments, which is fully matchable by Bash permission patterns.
  implication: This is the cleanest architectural fix. Combined with using the Write tool to create the code file, it eliminates ALL three prompt triggers.

## Resolution

root_cause: |
  The repl-executor sandbox invocation pattern uses three shell features that Claude Code's security heuristics flag as requiring manual approval, and NONE of these can be bypassed via configuration:

  1. **Heredoc write to /tmp** (`cat > /tmp/repl-code.js << 'REPL_EOF'`): Triggers TWO heuristics -- (a) writing outside the project tree, and (b) heredoc syntax. Claude Code's own system prompt says "Prefer Write tool instead of cat heredoc."

  2. **Stdin redirect** (`< /tmp/repl-code.js`): Flagged as "could read sensitive files." Bash permission wildcards do NOT match commands containing redirects (GitHub issues #13137, #10298). This is a known, unfixed platform limitation.

  3. **Out-of-tree delete** (`rm -f /tmp/repl-code.js`): Flagged for operating outside the project tree.

  The fundamental issue is that the sandbox's ONLY input channel is stdin (fd 0 via readFileSync(0)), which forces the use of either redirects or pipes -- both of which are blocked by security heuristics that cannot be configured away.

fix: ""
verification: ""
files_changed: []

---

## Fix Direction

### Recommended Approach: Write tool + --file flag (eliminates ALL prompts)

This is a two-part change:

**Part A: Add --file flag to repl-sandbox.mjs**

Modify the CLI entry point to accept `--file <path>` as an alternative to stdin:

```javascript
// In the CLI entry point section of repl-sandbox.mjs:
const filePath = getArg('--file');

let code;
if (filePath) {
  code = readFileSync(filePath, 'utf8');
} else {
  code = readFileSync(0, 'utf8');
}
```

This is backward-compatible -- stdin still works when --file is not provided.

**Part B: Change repl-executor.md invocation pattern**

Replace the three-step temp-file pattern with a two-step pattern:

1. **Use the Write tool** (not Bash `cat >`) to write the code file:
   - Path: `.cache/repl-code.js` (inside project tree)
   - The Write tool is a native Claude Code tool -- it NEVER triggers permission prompts

2. **Run the sandbox with --file** (no redirect, no pipe):
   ```bash
   node ${PLUGIN_ROOT}/scripts/repl-sandbox.mjs \
     --index ${INDEX_PATH} \
     --session ${SESSION_PATH} \
     --workspace-root ${WORKSPACE_ROOT} \
     --plugin-root ${PLUGIN_ROOT} \
     --file .cache/repl-code.js
   ```

3. **Delete the code file** (inside project tree, no prompt):
   ```bash
   rm -f .cache/repl-code.js
   ```

**Why this eliminates ALL prompts:**

| Step | Old Pattern | Trigger | New Pattern | Trigger |
|------|-------------|---------|-------------|---------|
| Write code | `cat > /tmp/...` via Bash | heredoc + out-of-tree | Write tool to `.cache/` | None (native tool) |
| Execute | `node ... < /tmp/...` via Bash | stdin redirect | `node ... --file .cache/...` via Bash | None (plain args) |
| Cleanup | `rm -f /tmp/...` via Bash | out-of-tree path | `rm -f .cache/...` via Bash | None (in-tree) |

The execute command is now a simple `node script.mjs --flag value` pattern with no shell operators, which is fully matchable by `Bash(node *)` permission patterns if needed.

### Alternative Approaches Considered and Rejected

**A. Move temp file to .cache/ but keep stdin redirect:**
- Fixes prompts 1 and 3 (in-tree paths) but NOT prompt 2 (redirect `<` is independently flagged)
- Partial fix only

**B. Use echo pipe (`echo "code" | node ...`):**
- Pipes are inconsistently handled (GitHub #14595)
- Multi-line code in echo is impractical
- Would likely still trigger prompts

**C. Use node -e with inline code:**
- Quote escaping for arbitrary JavaScript is fragile
- $() in code strings would trigger prompts
- Not viable for multi-line generated code

**D. Use environment variable to pass code:**
- Shell variable assignment with $() triggers prompts
- Code length may exceed environment variable limits
- Would need sandbox modification anyway

**E. Use --code CLI argument:**
- Shell argument length limits apply
- Quoting/escaping for arbitrary code is fragile
- Similar issues to node -e

### Files That Need Changes

1. `plugins/lz-nx.rlm/scripts/repl-sandbox.mjs` -- Add --file flag to CLI entry point (~5 lines)
2. `plugins/lz-nx.rlm/agents/repl-executor.md` -- Replace three-step invocation with Write+run+cleanup pattern
3. `tests/lz-nx.rlm/src/test/agent-definition.test.ts` -- Update structural tests (temp-file approach test -> --file approach test, no heredoc check)

### Risk Assessment

- **Backward compatible**: stdin path still works (tests, programmatic API usage)
- **Minimal change surface**: ~5 lines in sandbox, ~20 lines in agent prompt, test updates
- **No new dependencies**: Uses existing Write tool and standard CLI argument parsing
- **Cross-platform**: File paths use project-relative `.cache/` which works on all platforms
- **Session isolation**: If multiple sessions run concurrently, use session-scoped filenames (`.cache/repl-code-${SESSION_ID}.js`)
