---
name: deps
description: Print dependency tree for an Nx project using the workspace index (zero LLM tokens)
argument-hint: <project> [--reverse] [--depth N]
disable-model-invocation: true
allowed-tools: Bash(node *)
---

Run the dependency tree command for the specified Nx project.

Execute this command and display its raw output directly to the user without modification:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/deps-command.mjs $ARGUMENTS
```

If the command exits with a non-zero code, display the error output to the user.
