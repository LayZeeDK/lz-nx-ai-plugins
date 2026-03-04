---
name: find
description: Search file contents scoped to Nx projects using the workspace index (zero LLM tokens)
argument-hint: <pattern> [--project <name|glob>] [--context N]
disable-model-invocation: true
allowed-tools: Bash(node *)
---

Run the project-scoped content search command for the specified pattern.

Execute this command and display its raw output directly to the user without modification:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/find-command.mjs $ARGUMENTS
```

If the command exits with a non-zero code, display the error output to the user.
