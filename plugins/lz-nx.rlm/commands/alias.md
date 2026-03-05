---
name: alias
description: Resolve tsconfig path aliases bidirectionally
argument-hint: <alias-or-path>
disable-model-invocation: true
allowed-tools: Bash(node *)
---

Run the alias resolution command for the specified alias or path.

Execute this command and display its raw output directly to the user without modification:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/alias-command.mjs $ARGUMENTS
```

If the command exits with a non-zero code, display the error output to the user.
