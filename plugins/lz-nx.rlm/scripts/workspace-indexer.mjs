/**
 * Workspace indexer: transforms raw `nx graph --print` output and tsconfig
 * path aliases into a slim JSON index (~50-100KB for large workspaces).
 *
 * Exports:
 * - buildIndex(workspaceRoot) - Full pipeline: run graph, read aliases, transform, write
 * - transformGraphToIndex(graphOutput, pathAliases) - Pure transform (testable without I/O)
 * - readPathAliases(workspaceRoot) - Read tsconfig paths, filter wildcards, preserve arrays
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { runNxGraph } from './nx-runner.mjs';
import { info, success, error } from './shared/output-format.mjs';

const INDEX_DIR = join('tmp', 'lz-nx.rlm');
const INDEX_FILE = 'workspace-index.json';

/**
 * Extract a slim target summary from the full target configuration.
 * Maps each target name to its executor string only.
 *
 * @param {object|undefined} targets - The full targets config from a graph node.
 * @returns {object} Map of target name to executor string.
 */
function extractTargetSummary(targets) {
  const summary = {};

  for (const [name, config] of Object.entries(targets || {})) {
    summary[name] = config.executor || 'unknown';
  }

  return summary;
}

/**
 * Transform raw `nx graph --print` output into a slim workspace index.
 *
 * Uses graph-level `node.type` (not `data.projectType`) to correctly classify
 * e2e projects as "e2e" rather than "application" (Pitfall 7).
 *
 * @param {object} graphOutput - The parsed JSON from `nx graph --print`.
 * @param {object} pathAliases - Alias-to-paths map from readPathAliases.
 * @returns {object} The workspace index { projects, dependencies, pathAliases, meta }.
 */
export function transformGraphToIndex(graphOutput, pathAliases) {
  const { graph } = graphOutput;
  const projects = {};
  const dependencies = {};

  for (const [name, node] of Object.entries(graph.nodes)) {
    projects[name] = {
      root: node.data.root,
      sourceRoot: node.data.sourceRoot || null,
      type: node.type, // Graph-level type, NOT data.projectType (Pitfall 7)
      tags: node.data.tags || [],
      targets: extractTargetSummary(node.data.targets),
    };

    dependencies[name] = (graph.dependencies[name] || []).map((dep) => ({
      target: dep.target,
      type: dep.type,
    }));
  }

  return {
    projects,
    dependencies,
    pathAliases,
    meta: {
      builtAt: new Date().toISOString(),
      projectCount: Object.keys(projects).length,
    },
  };
}

/**
 * Read tsconfig path aliases from the workspace.
 *
 * Tries tsconfig.base.json first, falls back to tsconfig.json (Pitfall 8).
 * Filters out wildcard patterns (entries containing "*").
 * Preserves the full path array per alias for TypeScript fallback resolution.
 *
 * @param {string} workspaceRoot - Absolute path to the workspace root.
 * @returns {object} Map of alias to paths array (values are string[]).
 */
export function readPathAliases(workspaceRoot) {
  let tsconfig = null;

  // Try tsconfig.base.json first, fall back to tsconfig.json
  try {
    const raw = readFileSync(join(workspaceRoot, 'tsconfig.base.json'), 'utf8');
    tsconfig = JSON.parse(raw);
  } catch {
    try {
      const raw = readFileSync(join(workspaceRoot, 'tsconfig.json'), 'utf8');
      tsconfig = JSON.parse(raw);
    } catch {
      return {};
    }
  }

  const paths = tsconfig?.compilerOptions?.paths;

  if (!paths) {
    return {};
  }

  const aliases = {};

  for (const [alias, pathArray] of Object.entries(paths)) {
    // Filter out wildcard patterns (entries containing "*")
    if (alias.includes('*')) {
      continue;
    }

    // Preserve the full path array (TypeScript fallback resolution)
    aliases[alias] = pathArray;
  }

  return aliases;
}

/**
 * Build the workspace index from Nx CLI output and tsconfig.
 *
 * Pipeline:
 * 1. Run `nx graph --print` via nx-runner
 * 2. Read path aliases from tsconfig
 * 3. Transform to slim index
 * 4. Write to tmp/lz-nx.rlm/workspace-index.json
 *
 * @param {string} workspaceRoot - Absolute path to the workspace root.
 * @returns {object} The built workspace index.
 * @throws {Error} If nx graph --print fails.
 */
export function buildIndex(workspaceRoot) {
  info('Rebuilding workspace index...');

  const { data: graphData, error: graphError } = runNxGraph();

  if (graphError) {
    error(graphError);
    throw new Error('Failed to build workspace index: ' + graphError);
  }

  const pathAliases = readPathAliases(workspaceRoot);
  const index = transformGraphToIndex(graphData, pathAliases);

  const indexDir = join(workspaceRoot, INDEX_DIR);
  const indexPath = join(indexDir, INDEX_FILE);

  mkdirSync(indexDir, { recursive: true });
  writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8');

  success('Built (' + index.meta.projectCount + ' projects)');

  return index;
}
