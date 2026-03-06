/**
 * REPL globals factory for the sandbox VM context.
 *
 * Creates all 12 workspace-aware globals that give the LLM access to
 * workspace data inside the REPL sandbox:
 * workspace, projects, deps, dependents, read, files, search, nx,
 * print, SHOW_VARS, FINAL, FINAL_VAR
 *
 * @module repl-globals
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runNx } from '../nx-runner.mjs';

/**
 * Set of all built-in global names injected into the sandbox.
 * Used by writeSession to exclude these from persisted state,
 * and by SHOW_VARS to filter them from the variable list.
 *
 * @type {Set<string>}
 */
export const BUILTIN_GLOBAL_NAMES = new Set([
  'workspace',
  'projects',
  'deps',
  'dependents',
  'read',
  'files',
  'search',
  'nx',
  'print',
  'SHOW_VARS',
  'FINAL',
  'FINAL_VAR',
  'console',
]);

/**
 * @typedef {object} WorkspaceIndex
 * @property {Record<string, object>} projects - Project entries keyed by name
 * @property {Record<string, Array<{ target: string, type: string }>>} dependencies - Dependency graph
 * @property {Record<string, string[]>} pathAliases - TypeScript path aliases
 * @property {{ builtAt: string, projectCount: number }} meta - Index metadata
 */

/**
 * @typedef {object} PrintCapture
 * @property {(...args: unknown[]) => void} print - Print function
 * @property {() => string} getOutput - Get captured output
 * @property {() => number} getTotalChars - Get total char count
 */

/**
 * @typedef {object} FinalHandlers
 * @property {(answer: string) => void} FINAL - Set the final answer
 * @property {(name: string) => void} FINAL_VAR - Set the final variable name
 * @property {() => string|null} getFinalAnswer - Get the final answer
 * @property {() => string|null} getFinalVarName - Get the final variable name
 */

/**
 * Create all 12 REPL globals for the sandbox VM context.
 *
 * @param {WorkspaceIndex} index - Workspace index object
 * @param {string} workspaceRoot - Absolute path to workspace root
 * @param {PrintCapture} printCapture - Print capture instance
 * @param {FinalHandlers} finalHandlers - FINAL/FINAL_VAR handlers
 * @returns {Record<string, unknown>} Object with all 12 globals
 */
export function createReplGlobals(index, workspaceRoot, printCapture, finalHandlers) {
  // Build reverse adjacency list once for dependents() lookups
  /** @type {Record<string, string[]>} */
  const reverseAdj = {};

  if (index.dependencies) {
    for (const [source, deps] of Object.entries(index.dependencies)) {
      for (const dep of deps) {
        if (!reverseAdj[dep.target]) {
          reverseAdj[dep.target] = [];
        }

        reverseAdj[dep.target].push(source);
      }
    }
  }

  /**
   * Get dependency target names for a project.
   *
   * @param {string} projectName
   * @returns {string[] | string}
   */
  function deps(projectName) {
    if (!index.projects || !index.projects[projectName]) {
      return '[ERROR] Project not found: ' + projectName;
    }

    return (index.dependencies[projectName] || []).map((d) => d.target);
  }

  /**
   * Get projects that depend on the given project.
   *
   * @param {string} projectName
   * @returns {string[] | string}
   */
  function dependents(projectName) {
    if (!index.projects || !index.projects[projectName]) {
      return '[ERROR] Project not found: ' + projectName;
    }

    return reverseAdj[projectName] || [];
  }

  /**
   * Read file content relative to workspaceRoot.
   *
   * @param {string} filePath - File path relative to workspace root
   * @param {number} [start] - Start line (0-indexed)
   * @param {number} [end] - End line (0-indexed, exclusive)
   * @returns {string}
   */
  function read(filePath, start, end) {
    try {
      const absPath = resolve(workspaceRoot, filePath);
      const content = readFileSync(absPath, 'utf8');

      if (start !== undefined && end !== undefined) {
        const lines = content.split('\n');

        return lines.slice(start, end).join('\n');
      }

      return content;
    } catch (err) {
      return '[ERROR] ' + /** @type {Error} */ (err).message;
    }
  }

  /**
   * List files matching a glob pattern using git ls-files.
   *
   * @param {string} glob - Glob pattern
   * @returns {string[]}
   */
  function files(glob) {
    const result = spawnSync('git', ['ls-files', '--', glob], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      windowsHide: true,
    });

    return result.stdout.trim().split('\n').filter(Boolean);
  }

  /**
   * Search tracked files for a pattern using git grep.
   *
   * @param {string} pattern - Fixed string pattern to search for
   * @param {string[]} [paths] - Optional paths to scope the search
   * @returns {string}
   */
  function search(pattern, paths) {
    const args = ['grep', '-n', '--no-color', '-F', '--', pattern];

    if (paths && paths.length > 0) {
      args.push(...paths);
    }

    const result = spawnSync('git', args, {
      cwd: workspaceRoot,
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 5 * 1024 * 1024,
    });

    if (result.status !== null && result.status > 1) {
      return '[ERROR] git grep failed: ' + (result.stderr || 'unknown error');
    }

    if (result.status === 1) {
      return 'No matches';
    }

    const lines = result.stdout.trim().split('\n').filter(Boolean);

    if (lines.length > 50) {
      const truncated = lines.slice(0, 50);
      truncated.push('... [' + lines.length + ' total, showing first 50]');

      return truncated.join('\n');
    }

    return lines.join('\n');
  }

  /**
   * Run an Nx CLI command and return the result.
   *
   * @param {string} command - Nx command (without "nx" prefix)
   * @returns {string | object | null}
   */
  function nxGlobal(command) {
    const result = runNx(command);

    if (result.error) {
      return result.error;
    }

    return result.data;
  }

  /**
   * Show formatted variable list excluding builtins.
   *
   * @param {Record<string, unknown>} sandbox - The VM sandbox object
   * @returns {string}
   */
  function SHOW_VARS(sandbox) {
    const entries = [];

    for (const [key, value] of Object.entries(sandbox)) {
      if (BUILTIN_GLOBAL_NAMES.has(key)) {
        continue;
      }

      if (typeof value === 'function') {
        continue;
      }

      /** @type {string} */
      let typeStr = typeof value;

      if (Array.isArray(value)) {
        typeStr = 'Array[' + value.length + ']';
      } else if (value === null) {
        typeStr = 'null';
      } else if (typeStr === 'object') {
        typeStr = 'object';
      }

      entries.push(key + ' (' + typeStr + ')');
    }

    if (entries.length === 0) {
      return 'Variables: (none)';
    }

    return 'Variables: ' + entries.join(', ');
  }

  return {
    workspace: index,
    projects: index.projects,
    deps,
    dependents,
    read,
    files,
    search,
    nx: nxGlobal,
    print: printCapture.print,
    SHOW_VARS,
    FINAL: finalHandlers.FINAL,
    FINAL_VAR: finalHandlers.FINAL_VAR,
  };
}
