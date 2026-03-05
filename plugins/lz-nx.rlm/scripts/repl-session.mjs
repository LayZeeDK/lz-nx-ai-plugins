/**
 * REPL session state persistence.
 *
 * Provides read/write for session state JSON files.
 * Filters out non-serializable values (functions, circular references)
 * and excludes built-in global names from the persisted state.
 *
 * @module repl-session
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Read session state from a JSON file.
 *
 * Returns an empty object if the file does not exist or contains invalid JSON.
 *
 * @param {string} sessionPath - Path to session JSON file
 * @returns {Record<string, unknown>} Session state
 */
export function readSession(sessionPath) {
  try {
    return JSON.parse(readFileSync(sessionPath, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Write session state to a JSON file.
 *
 * Extracts only JSON-serializable values from the sandbox object.
 * Excludes built-in global names, functions, and values that fail
 * JSON.stringify (e.g., circular references).
 *
 * Creates the parent directory if it does not exist.
 *
 * @param {string} sessionPath - Path to session JSON file
 * @param {Record<string, unknown>} sandbox - VM sandbox object
 * @param {Set<string>} builtinNames - Names of built-in globals to exclude
 */
export function writeSession(sessionPath, sandbox, builtinNames) {
  /** @type {Record<string, unknown>} */
  const state = {};

  for (const [key, value] of Object.entries(sandbox)) {
    if (builtinNames.has(key)) {
      continue;
    }

    if (typeof value === 'function') {
      continue;
    }

    try {
      JSON.stringify(value);
      state[key] = value;
    } catch {
      // Skip non-serializable values (circular refs, etc.)
    }
  }

  mkdirSync(dirname(sessionPath), { recursive: true });
  writeFileSync(sessionPath, JSON.stringify(state), 'utf8');
}
