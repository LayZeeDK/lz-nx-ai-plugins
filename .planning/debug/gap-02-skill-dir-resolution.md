---
status: diagnosed
trigger: "GAP-02: ${CLAUDE_SKILL_DIR} not resolved in skill body -- LLM copies literal variable into Bash commands"
created: 2026-03-06T14:00:00Z
updated: 2026-03-06T14:30:00Z
---

## Current Focus

hypothesis: CONFIRMED -- see Resolution
test: n/a
expecting: n/a
next_action: Apply fix to SKILL.md Step 2

## Symptoms

expected: "SKILL.md Step 2 instructs the LLM to run `dirname \"${CLAUDE_SKILL_DIR}\"` in Bash. The LLM should resolve PLUGIN_ROOT to the absolute path of the plugin directory."
actual: "The LLM literally types `dirname \"${CLAUDE_SKILL_DIR}\"` into the Bash tool. This triggers a permission prompt for `${}` parameter substitution AND returns `.` instead of the actual path."
errors: "Permission prompt for ${} parameter substitution; dirname returns `.`"
reproduction: "Run `/lz-nx.rlm:explore \"What depends on lz-nx-rlm?\"` -- Step 2 path resolution fails"
started: "First UAT run (Test 3)"

## Eliminated

- hypothesis: "${CLAUDE_SKILL_DIR} is not substituted at all in skills"
  evidence: "Official docs (code.claude.com/docs/en/skills) confirm ${CLAUDE_SKILL_DIR} IS a supported string substitution variable in skill content. The v2.1.69 changelog introduced it."
  timestamp: 2026-03-06T14:05:00Z

- hypothesis: "The variable is substituted in the markdown text but the LLM doesn't use the substituted value"
  evidence: "The substitution DOES happen in the prose text, but the problem is WHERE the variable appears. It appears inside a fenced code block (```bash ... dirname \"${CLAUDE_SKILL_DIR}\" ... ```). The LLM reads the code block as a literal command template and types it verbatim into Bash. Even though the prose around it may show the expanded path, the LLM follows the code block literally."
  timestamp: 2026-03-06T14:10:00Z

## Evidence

- timestamp: 2026-03-06T14:05:00Z
  checked: "Official Claude Code skills documentation at code.claude.com/docs/en/skills"
  found: "The docs state ${CLAUDE_SKILL_DIR} is a supported string substitution. The description says: 'The directory containing the skill SKILL.md file. For plugin skills, this is the skill subdirectory within the plugin, not the plugin root. Use this in bash injection commands to reference scripts or files bundled with the skill, regardless of the current working directory.'"
  implication: "The docs specifically say 'Use this in bash injection commands' -- referring to the !`command` preprocessing syntax, NOT regular code blocks. String substitution replaces the variable IN THE SKILL TEXT that Claude reads, but this does not mean it becomes a shell environment variable."

- timestamp: 2026-03-06T14:08:00Z
  checked: "How string substitution works in skill content"
  found: "Claude Code's string substitution replaces ${CLAUDE_SKILL_DIR} with the actual path IN THE MARKDOWN TEXT before the LLM sees it. So if the skill says 'navigate up from ${CLAUDE_SKILL_DIR}', the LLM would see 'navigate up from /home/user/.claude/plugins/lz-nx.rlm/skills/explore'. BUT if it appears inside a fenced code block, the LLM sees: dirname \"/home/user/.claude/plugins/lz-nx.rlm/skills/explore\" -- which it then types literally into Bash. This SHOULD work, but only if the expansion actually happens."
  implication: "The substitution should work everywhere in the skill text, including code blocks. The question is whether the LLM is seeing the expanded value or the literal ${CLAUDE_SKILL_DIR}."

- timestamp: 2026-03-06T14:10:00Z
  checked: "UAT Test 3 report from .planning/phases/03-agent-explore/03-UAT.md"
  found: "User reported: dirname '${CLAUDE_SKILL_DIR}' triggered permission prompt for ${} parameter substitution and returned '.' instead of the actual path. The variable is not expanded by the shell when passed as a string argument."
  implication: "The ${} permission prompt means the Bash tool SAW the literal text ${CLAUDE_SKILL_DIR}. If substitution had worked, Bash would see a concrete path like dirname '/home/user/...' which would NOT trigger a ${} prompt. The fact that the ${} prompt triggered proves the variable was NOT substituted before the LLM copied it to Bash."

- timestamp: 2026-03-06T14:12:00Z
  checked: "Known bugs with variable substitution in commands"
  found: "GitHub issue #9354 (anthropics/claude-code) reports that ${CLAUDE_PLUGIN_ROOT} does NOT work in command markdown files -- the environment variable is undefined. The same plugin's command files (alias.md, deps.md, find.md) use ${CLAUDE_PLUGIN_ROOT} in code blocks. These commands have NOT been tested in live UAT yet. They likely have the SAME issue."
  implication: "There is a known, confirmed bug that plugin variable substitution does not work in command/skill markdown code blocks. This is a Claude Code platform bug, not a bug in our plugin."

- timestamp: 2026-03-06T14:15:00Z
  checked: "Distinction between !`command` preprocessing and ${VAR} string substitution"
  found: "The official docs describe two separate mechanisms: (1) String substitution: ${CLAUDE_SKILL_DIR}, $ARGUMENTS, ${CLAUDE_SESSION_ID} are replaced in the skill text before Claude sees it. (2) Dynamic context injection: !`command` runs a shell command and inserts its output. The docs specifically say CLAUDE_SKILL_DIR should be used 'in bash injection commands' (i.e., !`...` syntax). However, the docs also show ${CLAUDE_SESSION_ID} being used in plain text: 'Log the following to logs/${CLAUDE_SESSION_ID}.log:'"
  implication: "String substitution SHOULD work everywhere in skill text (including code blocks). If it did, the LLM would see the expanded path. The UAT evidence strongly suggests the substitution is NOT happening -- either because of a bug, or because the plugin system handles it differently than documented."

- timestamp: 2026-03-06T14:18:00Z
  checked: "The two-dirname approach and why it fails even if substitution worked"
  found: "SKILL.md Step 2 instructs: (1) Run dirname '${CLAUDE_SKILL_DIR}' to get skills dir, (2) Run dirname <result> to get plugin root. Even if substitution worked perfectly (e.g., expanding to /path/to/plugins/lz-nx.rlm/skills/explore), this requires TWO Bash commands. Each Bash command is a separate tool call. The LLM must store the intermediate result and use it in the next command. This is fragile and adds unnecessary complexity."
  implication: "The two-dirname approach is both broken (substitution issue) AND unnecessarily complex. A better approach exists."

- timestamp: 2026-03-06T14:20:00Z
  checked: "Alternative approach: derive PLUGIN_ROOT from WORKSPACE_ROOT"
  found: "The skill already resolves WORKSPACE_ROOT via git rev-parse --show-toplevel (Step 2, first part). The plugin name is known and fixed: lz-nx.rlm. The plugin always lives at plugins/lz-nx.rlm/ relative to the workspace root. Therefore PLUGIN_ROOT = ${WORKSPACE_ROOT}/plugins/lz-nx.rlm, which can be computed by the LLM directly from WORKSPACE_ROOT without any additional Bash commands."
  implication: "This is the simplest and most robust fix. No variable substitution needed, no dirname calls, no permission prompts. The LLM already has WORKSPACE_ROOT from Step 2's git rev-parse command."

- timestamp: 2026-03-06T14:22:00Z
  checked: "Whether the commands (alias.md, deps.md, find.md) have the same issue"
  found: "All three command files use ${CLAUDE_PLUGIN_ROOT} in bash code blocks: 'node ${CLAUDE_PLUGIN_ROOT}/scripts/alias-command.mjs $ARGUMENTS'. Per GitHub issue #9354, ${CLAUDE_PLUGIN_ROOT} does not resolve in command markdown. These commands have not been tested in UAT yet. They will exhibit the same class of bug: the LLM will type the literal ${CLAUDE_PLUGIN_ROOT} into Bash, which will either trigger a permission prompt or resolve to an empty string."
  implication: "GAP-02 is part of a broader class of bugs affecting all plugin variable usage in command/skill markdown code blocks. The commands will need the same class of fix."

## Resolution

root_cause: |
  SKILL.md Step 2 instructs the LLM to run `dirname "${CLAUDE_SKILL_DIR}"` as a
  Bash command. The problem has two layers:

  1. **Variable substitution may not work in code blocks**: Despite the official
     documentation listing ${CLAUDE_SKILL_DIR} as a supported string substitution,
     there is evidence (GitHub #9354 for ${CLAUDE_PLUGIN_ROOT}, and our UAT result)
     that the substitution either does not happen inside fenced code blocks, or does
     not happen at all in certain contexts. The UAT evidence is conclusive: the Bash
     tool received the literal text `${CLAUDE_SKILL_DIR}`, not an expanded path.

  2. **Even if substitution worked**: The LLM sees a code block containing
     `dirname "${CLAUDE_SKILL_DIR}"` and copies it verbatim into the Bash tool.
     Since `${...}` is shell parameter expansion syntax, the Bash tool's security
     heuristic flags it as potentially dangerous and triggers a permission prompt.
     If approved, the shell tries to expand `$CLAUDE_SKILL_DIR` as an environment
     variable -- which is NOT set in the shell environment -- and dirname gets an
     empty string, returning `.`.

  **The root cause is using ${CLAUDE_SKILL_DIR} inside a Bash code block in the
  skill's instruction text.** The LLM treats code blocks as literal command
  templates, the Bash tool flags the ${} syntax, and the shell has no such
  environment variable.

fix: |
  Replace the two-dirname approach with a direct path construction from
  WORKSPACE_ROOT. The skill already resolves WORKSPACE_ROOT via `git rev-parse
  --show-toplevel`. Since the plugin name and directory structure are known and
  fixed, PLUGIN_ROOT can be computed as:

    PLUGIN_ROOT = ${WORKSPACE_ROOT}/plugins/lz-nx.rlm

  This eliminates:
  - The `${CLAUDE_SKILL_DIR}` reference entirely
  - Both `dirname` Bash commands
  - The permission prompt trigger
  - The fragile two-step intermediate variable storage

  The fix is to rewrite SKILL.md Step 2 to instruct the LLM to construct
  PLUGIN_ROOT by appending `/plugins/lz-nx.rlm` to WORKSPACE_ROOT. No additional
  Bash commands needed.

  Additionally, the command files (alias.md, deps.md, find.md) use
  ${CLAUDE_PLUGIN_ROOT} in code blocks and will have the same class of bug.
  Those should be fixed separately (out of scope for this GAP-02 session) --
  they can either use the !`command` preprocessing syntax or derive the path
  from the workspace root.

verification: ""
files_changed: []
