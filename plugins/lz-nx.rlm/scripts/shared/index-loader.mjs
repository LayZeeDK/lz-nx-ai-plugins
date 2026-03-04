/**
 * Index loader with staleness detection and auto-rebuild.
 *
 * Loads the workspace index from disk, checking staleness via O(1) mtime
 * comparison against three watch paths. Auto-builds on first use and
 * auto-rebuilds when the index is stale.
 *
 * Exports:
 * - loadIndex(workspaceRoot) - Returns the workspace index, auto-building if needed
 */

import { statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildIndex } from '../workspace-indexer.mjs';

const INDEX_DIR = join('tmp', 'lz-nx.rlm');
const INDEX_FILE = 'workspace-index.json';

/**
 * Get the mtime of a file in milliseconds, or null if the file does not exist.
 *
 * @param {string} filePath - Absolute path to the file.
 * @returns {number|null} The mtime in milliseconds, or null.
 */
function getMtime(filePath) {
  try {
    return statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * Check whether the index is stale by comparing its mtime against three
 * watch paths. Returns true if any watch path is newer than the index.
 *
 * Watch paths:
 * 1. .nx/workspace-data/ - Nx daemon writes here on graph changes
 * 2. tsconfig.base.json - Path alias changes
 * 3. nx.json - Workspace configuration changes
 *
 * @param {string} workspaceRoot - Absolute path to the workspace root.
 * @param {string} indexPath - Absolute path to the index file.
 * @returns {boolean} True if the index is stale or missing.
 */
function isStale(workspaceRoot, indexPath) {
  const indexMtime = getMtime(indexPath);

  if (indexMtime === null) {
    return true;
  }

  const watchPaths = [
    join(workspaceRoot, '.nx', 'workspace-data'),
    join(workspaceRoot, 'tsconfig.base.json'),
    join(workspaceRoot, 'nx.json'),
  ];

  for (const watchPath of watchPaths) {
    const watchMtime = getMtime(watchPath);

    if (watchMtime !== null && watchMtime > indexMtime) {
      return true;
    }
  }

  return false;
}

/**
 * Load the workspace index, auto-building if the index is missing or stale.
 *
 * @param {string} workspaceRoot - Absolute path to the workspace root.
 * @returns {object} The parsed workspace index.
 */
export function loadIndex(workspaceRoot) {
  const indexPath = join(workspaceRoot, INDEX_DIR, INDEX_FILE);

  if (isStale(workspaceRoot, indexPath)) {
    buildIndex(workspaceRoot);
  }

  return JSON.parse(readFileSync(indexPath, 'utf8'));
}
