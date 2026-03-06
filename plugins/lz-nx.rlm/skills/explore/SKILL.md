---
name: explore
description: >
  Explore an Nx workspace by asking natural language questions.
  Navigates via the REPL fill/solve loop and returns only the
  distilled answer without intermediate exploration results.
argument-hint: <question> [--debug]
disable-model-invocation: true
---

Follow these steps exactly to handle the user's explore request.

## Step 1: Validate input

Check if `$ARGUMENTS` is empty or blank.

**If empty or blank (no question provided):** Respond with a usage hint and stop. Do NOT spawn the agent.

Example usage hint:

```
Usage: /lz-nx.rlm:explore <question> [--debug]

Ask a natural language question about your Nx workspace.

Examples:
  /lz-nx.rlm:explore "How many projects are there?"
  /lz-nx.rlm:explore "What projects depend on shared-utils?"
  /lz-nx.rlm:explore "Which projects have a build target?" --debug
```

**If non-empty:** Extract the question and detect the `--debug` flag.

Parse `--debug`: if `$ARGUMENTS` contains `--debug` as a standalone token (at start, end, or middle), set debug mode ON and strip the `--debug` flag from the question text. The remaining text is the question.

## Step 2: Determine paths

Run the following Bash command to get the workspace root:

```bash
git rev-parse --show-toplevel
```

Store the result as `WORKSPACE_ROOT`.

Then construct:

- `PLUGIN_ROOT`: The plugin root is the `lz-nx.rlm` plugin directory. Determine it by navigating up two levels from `${CLAUDE_SKILL_DIR}` (which resolves to `plugins/lz-nx.rlm/skills/explore/`). Use this Bash command:

  ```bash
  dirname "$(dirname "${CLAUDE_SKILL_DIR}")"
  ```

  If the result is a relative path, resolve it to an absolute path using the workspace root.

- `INDEX_PATH`: `${WORKSPACE_ROOT}/tmp/lz-nx.rlm/workspace-index.json`
- `SESSION_PATH`: Will be constructed in Step 5 after generating the session ID.

## Step 3: Ensure workspace index exists

Check if the workspace index file exists at `INDEX_PATH`:

```bash
[ -f "${INDEX_PATH}" ] && echo "exists" || echo "missing"
```

- If **missing**: Inform the user that the workspace index is being built, then run:

  ```bash
  node "${PLUGIN_ROOT}/scripts/workspace-indexer.mjs"
  ```

  Wait for the indexer to complete before proceeding.

- If **exists**: Proceed to the next step.

## Step 4: Load config

Read `maxIterations`, `maxConsecutiveErrors`, and `maxStaleOutputs` from the config files. Check the user override first, then fall back to the plugin default:

1. User override: `${WORKSPACE_ROOT}/.claude/lz-nx.rlm.config.json`
2. Plugin default: `${PLUGIN_ROOT}/lz-nx.rlm.config.json`

Read whichever config file exists and extract the values. If neither file has a value, use these defaults:

- `maxIterations`: 20
- `maxConsecutiveErrors`: 3
- `maxStaleOutputs`: 3

## Step 5: Generate session ID and session path

Generate a unique session ID using a timestamp (e.g., the current epoch milliseconds).

Construct `SESSION_PATH`: `${WORKSPACE_ROOT}/.cache/repl-session-${SESSION_ID}.json`

## Step 6: Spawn the repl-executor agent

Use the Task tool to spawn the `repl-executor` agent with these parameters:

- **description**: "Explore Nx workspace: [first 60 chars of question]"
- **prompt**: Construct the prompt containing all context the agent needs:

  ```
  Answer this question about the Nx workspace:

  QUESTION: <the user's question with --debug stripped>

  Context:
  - PLUGIN_ROOT=<absolute path to plugin>
  - WORKSPACE_ROOT=<absolute path to workspace>
  - INDEX_PATH=<absolute path to workspace index>
  - SESSION_PATH=<absolute path to session file>
  - MAX_ITERATIONS=<value from config>
  - MAX_CONSECUTIVE_ERRORS=<value from config>
  - MAX_STALE_OUTPUTS=<value from config>
  ```

- **max_turns**: Set to `maxIterations + 2` (the external safety net -- provides headroom for non-code agent turns beyond the REPL iteration budget)

Wait for the agent to complete.

## Step 7: Relay the result

The agent returns plain text containing the FINAL answer.

- If the agent completed successfully (returned a response): Relay the answer to the user verbatim.
- If the agent did not complete (max_turns reached without a response, or the agent returned an error): Inform the user: "Exploration did not complete within the iteration limit. The session file is preserved for inspection."

If `--debug` was set, append a diagnostic footer after the answer:

```
---
[DEBUG] Iterations: <count of agent turns>
[DEBUG] Duration: <elapsed time>
```

## Step 8: Clean up session

After relaying the result:

- If the agent completed successfully (returned a FINAL answer): Delete the session file at `SESSION_PATH`:

  ```bash
  rm -f "${SESSION_PATH}"
  ```

- If the agent did not complete: Keep the session file for post-mortem inspection. Inform the user of its location: "Session file preserved at: ${SESSION_PATH}"
