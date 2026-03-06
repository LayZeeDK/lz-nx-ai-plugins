/**
 * REPL sandbox execution engine.
 *
 * Executes JavaScript code in an isolated VM context with 12 workspace-aware
 * globals. Reads code from stdin (CLI) or via the exported executeSandbox
 * function (tests/API).
 *
 * Output: SandboxResult JSON { output, variables, final, finalVar, error }
 *
 * @module repl-sandbox
 */

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { transformDeclarations } from './shared/code-transform.mjs';
import { createPrintCapture } from './shared/print-capture.mjs';
import { readSession, writeSession } from './repl-session.mjs';
import {
  createReplGlobals,
  BUILTIN_GLOBAL_NAMES,
} from './shared/repl-globals.mjs';
import { loadConfig } from './rlm-config.mjs';

/**
 * @typedef {object} SandboxResult
 * @property {string} output - Captured print output
 * @property {Record<string, unknown>} variables - User-defined variables (non-builtin, non-function, serializable)
 * @property {string|null} final - Final answer set via FINAL()
 * @property {string|null} finalVar - Final variable name set via FINAL_VAR()
 * @property {string|null} error - Error message if execution failed
 */

/**
 * @typedef {object} SandboxOptions
 * @property {string} [sessionPath] - Path to session state JSON file
 * @property {string} [indexPath] - Path to workspace index JSON file
 * @property {number} [timeout] - VM timeout in milliseconds
 * @property {string} [workspaceRoot] - Workspace root directory
 * @property {string} [pluginRoot] - Plugin root directory
 */

/**
 * Extract user-defined variables from the sandbox.
 *
 * Filters out builtin globals, functions, and non-serializable values.
 *
 * @param {Record<string, unknown>} sandbox - VM sandbox object
 * @returns {Record<string, unknown>}
 */
function extractState(sandbox) {
  /** @type {Record<string, unknown>} */
  const state = {};

  for (const [key, value] of Object.entries(sandbox)) {
    if (BUILTIN_GLOBAL_NAMES.has(key)) {
      continue;
    }

    if (typeof value === 'function') {
      continue;
    }

    try {
      JSON.stringify(value);
      state[key] = value;
    } catch {
      // Skip non-serializable values
    }
  }

  return state;
}

/**
 * Execute JavaScript code in an isolated VM sandbox.
 *
 * @param {string} code - JavaScript code to execute
 * @param {SandboxOptions} [options] - Execution options
 * @returns {SandboxResult}
 */
export function executeSandbox(code, options = {}) {
  // 1. Determine timeout
  let resolvedTimeout;

  if (typeof options.timeout === 'number') {
    resolvedTimeout = options.timeout;
  } else {
    const config = loadConfig(
      options.pluginRoot || '',
      options.workspaceRoot || '',
    );
    resolvedTimeout = config.maxTimeout * 1000;
  }

  // 2. Read session state
  const sessionState = options.sessionPath
    ? readSession(options.sessionPath)
    : {};

  // 3. Load workspace index
  /** @type {import('./shared/repl-globals.mjs').WorkspaceIndex} */
  let index = /** @type {*} */ ({});

  if (options.indexPath) {
    try {
      index = JSON.parse(readFileSync(options.indexPath, 'utf8'));
    } catch {
      // Empty index on failure
    }
  }

  // 4. Create print capture
  const printCapture = createPrintCapture(2000, 20000);

  // 5. Create final handlers
  /** @type {string|null} */
  let finalAnswer = null;
  /** @type {string|null} */
  let finalVarName = null;

  const finalHandlers = {
    FINAL: (/** @type {string} */ answer) => {
      finalAnswer = String(answer);
    },
    FINAL_VAR: (/** @type {string} */ name) => {
      finalVarName = String(name);
    },
    getFinalAnswer: () => finalAnswer,
    getFinalVarName: () => finalVarName,
  };

  // 6. Create REPL globals
  const globals = createReplGlobals(
    index,
    options.workspaceRoot || '',
    printCapture,
    finalHandlers,
  );

  // 7-8. Build sandbox object with session state, globals, and SHOW_VARS closure
  /** @type {Record<string, unknown>} */
  const sandbox = {
    ...sessionState,
    ...globals,
    console: {
      log: printCapture.print,
      error: printCapture.print,
      warn: printCapture.print,
    },
  };

  // Override SHOW_VARS to close over the sandbox reference
  sandbox.SHOW_VARS = () => /** @type {Function} */ (globals.SHOW_VARS)(sandbox);

  // 9. Create VM context with code generation blocked
  const ctx = vm.createContext(sandbox, {
    codeGeneration: { strings: false, wasm: false },
  });

  // 10. Patch Object.prototype.toString in the context (Hampton-io pattern)
  vm.runInContext(
    'Object.prototype.toString = function() { try { return JSON.stringify(this, null, 2); } catch(e) { return "[object Object]"; } };',
    ctx,
  );

  // 11. Transform code
  const transformedCode = transformDeclarations(code);

  // 12-13. Execute and catch errors
  /** @type {string|null} */
  let error = null;

  try {
    vm.runInContext(transformedCode, ctx, { timeout: resolvedTimeout });
  } catch (err) {
    const message = /** @type {Error} */ (err).message || String(err);

    if (message.includes('Script execution timed out')) {
      error = 'Script execution timed out after ' + resolvedTimeout + 'ms';
    } else {
      error = message;
    }
  }

  // 14. Write session state
  if (options.sessionPath) {
    writeSession(options.sessionPath, sandbox, BUILTIN_GLOBAL_NAMES);
  }

  // 15. Return SandboxResult
  return {
    output: printCapture.getOutput(),
    variables: extractState(sandbox),
    final: finalAnswer,
    finalVar: finalVarName,
    error,
  };
}

// ─── CLI entry point ───
// Guarded by process.argv check: only runs when invoked directly via node

const isCliInvocation =
  typeof process !== 'undefined' &&
  process.argv &&
  process.argv[1] &&
  (process.argv[1].endsWith('repl-sandbox.mjs') ||
    process.argv[1].endsWith('repl-sandbox'));

if (isCliInvocation && process.argv.includes('--index')) {
  // Read code from stdin (fd 0, cross-platform per CLAUDE.md)
  const code = readFileSync(0, 'utf8');

  // Parse CLI arguments
  const args = process.argv.slice(2);

  /**
   * @param {string} flag
   * @returns {string|undefined}
   */
  function getArg(flag) {
    const idx = args.indexOf(flag);

    if (idx !== -1 && idx + 1 < args.length) {
      return args[idx + 1];
    }

    return undefined;
  }

  const sessionPath = getArg('--session');
  const indexPathArg = getArg('--index');
  const timeoutArg = getArg('--timeout');
  const pluginRootArg = getArg('--plugin-root');
  const workspaceRootArg = getArg('--workspace-root');

  // Derive workspaceRoot
  let workspaceRoot = workspaceRootArg;

  if (!workspaceRoot && indexPathArg) {
    // Index is typically at tmp/lz-nx.rlm/workspace-index.json in workspace root
    // or could be anywhere -- use dirname of dirname as a heuristic
    const { dirname } = await import('node:path');
    workspaceRoot = dirname(dirname(indexPathArg));
  }

  if (!workspaceRoot) {
    workspaceRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  }

  // Derive pluginRoot
  let pluginRoot = pluginRootArg;

  if (!pluginRoot) {
    const { dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const thisFile = fileURLToPath(import.meta.url);
    // repl-sandbox.mjs is at plugins/lz-nx.rlm/scripts/repl-sandbox.mjs
    // Plugin root is plugins/lz-nx.rlm/
    pluginRoot = dirname(dirname(thisFile));
  }

  // Build options
  /** @type {SandboxOptions} */
  const cliOptions = {
    sessionPath,
    indexPath: indexPathArg,
    workspaceRoot,
    pluginRoot,
  };

  // Only set timeout if explicitly provided via CLI
  if (timeoutArg !== undefined) {
    cliOptions.timeout = Number(timeoutArg);
  }

  const result = executeSandbox(code, cliOptions);

  // Write JSON to stdout and exit
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(0);
}
