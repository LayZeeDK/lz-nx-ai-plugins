/**
 * Safe Nx CLI wrapper with command allowlisting, mandatory environment
 * variables, and error recovery.
 *
 * All Nx CLI calls go through this module to enforce:
 * - Command allowlisting (read-only operations only)
 * - Mandatory env vars (NX_TUI, NX_INTERACTIVE, NX_NO_CLOUD)
 * - Consistent maxBuffer, timeout, and windowsHide options
 * - Error message extraction and truncation
 */

import { execSync } from 'node:child_process';

/** Read-only command prefixes allowed through the runner. */
const SAFE_PREFIXES = [
  'show projects',
  'show project',
  'graph --print',
  'list',
  'report',
  'daemon',
];

/** Mandatory environment variables for all Nx CLI calls. */
const NX_ENV = {
  NX_TUI: 'false',
  NX_INTERACTIVE: 'false',
  NX_NO_CLOUD: 'true',
};

/** Default maxBuffer: 10MB (large workspaces produce 2-4MB of JSON). */
const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;

/** Default timeout: 60 seconds. */
const DEFAULT_TIMEOUT = 60000;

/**
 * Check whether a command is allowed by the safe prefix allowlist.
 * Checks if the command starts with any safe prefix. Additional arguments
 * and flags after the prefix are permitted (e.g., "show project my-app --json").
 *
 * @param {string} command - The raw command string (without "nx" prefix).
 * @returns {boolean}
 */
function isAllowed(command) {
  const trimmed = command.trim();

  return SAFE_PREFIXES.some(
    (prefix) => trimmed === prefix || trimmed.startsWith(prefix + ' '),
  );
}

/**
 * Run an Nx CLI command safely.
 *
 * @param {string} command - The Nx command to run (without "nx" prefix).
 * @param {object} [options] - Options for the command.
 * @param {number} [options.maxBuffer] - Max buffer size in bytes (default: 10MB).
 * @param {number} [options.timeout] - Timeout in ms (default: 60000).
 * @param {boolean} [options.expectJson] - Parse stdout as JSON.
 * @returns {{ data: string|object|null, error: string|null }}
 */
export function runNx(command, options = {}) {
  if (!isAllowed(command)) {
    return { data: null, error: '[ERROR] Command not allowed: nx ' + command };
  }

  const workspaceRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  try {
    const stdout = execSync('npx nx ' + command, {
      encoding: 'utf8',
      maxBuffer: options.maxBuffer || DEFAULT_MAX_BUFFER,
      cwd: workspaceRoot,
      env: { ...process.env, ...NX_ENV },
      timeout: options.timeout || DEFAULT_TIMEOUT,
      windowsHide: true,
    });

    if (options.expectJson) {
      try {
        return { data: JSON.parse(stdout), error: null };
      } catch {
        return {
          data: null,
          error: 'Unexpected non-JSON output: ' + stdout.slice(0, 200),
        };
      }
    }

    return { data: stdout, error: null };
  } catch (err) {
    const message = err.stdout || err.stderr || err.message;

    return { data: null, error: message.slice(0, 500) };
  }
}

/**
 * Convenience function for `nx graph --print` with retry logic.
 * On failure, runs `nx reset` and retries once.
 *
 * @returns {{ data: object|null, error: string|null }}
 */
export function runNxGraph() {
  const graphOptions = {
    expectJson: true,
    maxBuffer: DEFAULT_MAX_BUFFER,
  };

  const firstAttempt = runNx('graph --print', graphOptions);

  if (firstAttempt.error === null) {
    return firstAttempt;
  }

  // Recovery: run nx reset, then retry once
  const workspaceRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  try {
    execSync('npx nx reset', {
      encoding: 'utf8',
      cwd: workspaceRoot,
      env: { ...process.env, ...NX_ENV },
      timeout: DEFAULT_TIMEOUT,
      windowsHide: true,
    });
  } catch {
    // nx reset failure is not fatal -- still attempt retry
  }

  return runNx('graph --print', graphOptions);
}
