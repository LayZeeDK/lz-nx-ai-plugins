/**
 * Dependency tree command.
 *
 * Prints a markdown nested list dependency tree for a named project.
 * Supports --reverse (who depends on this) and --depth N flags.
 * Marks deduped subtrees with ^ and circular deps with !.
 *
 * Exports:
 * - renderDepsTree(projectName, index, options) -> { output, exitCode }
 *
 * Entry point: parses process.argv when run directly.
 */

import { loadIndex } from './shared/index-loader.mjs';
import { error } from './shared/output-format.mjs';

/**
 * @typedef {{ target: string, type: string }} Dep
 * @typedef {Record<string, Dep[]>} DepsMap
 * @typedef {{ root: string, sourceRoot: string | null, type: string, tags: string[], targets: Record<string, string> }} ProjectEntry
 * @typedef {{ projects: Record<string, ProjectEntry>, dependencies: DepsMap, pathAliases: Record<string, string[]>, meta: { builtAt: string, projectCount: number } }} WorkspaceIndex
 */

/**
 * Build a reverse adjacency list from the forward dependency graph.
 *
 * @param {DepsMap} dependencies - Forward deps map { [name]: Array<{ target, type }> }.
 * @returns {Record<string, string[]>} Reverse deps map { [name]: string[] }.
 */
function buildReverseDeps(dependencies) {
  /** @type {Record<string, string[]>} */
  const reverse = {};

  for (const name of Object.keys(dependencies)) {
    reverse[name] = [];
  }

  for (const [source, deps] of Object.entries(dependencies)) {
    for (const dep of deps) {
      if (!reverse[dep.target]) {
        reverse[dep.target] = [];
      }

      reverse[dep.target].push(source);
    }
  }

  return reverse;
}

/**
 * Render a dependency tree as markdown nested list.
 *
 * @param {string} projectName - Root project name.
 * @param {WorkspaceIndex} index - Workspace index from loadIndex.
 * @param {{ reverse?: boolean, depth?: number }} [options] - Options.
 * @returns {{ output: string, exitCode: number }}
 */
export function renderDepsTree(projectName, index, options = {}) {
  if (!projectName) {
    return {
      output: '[ERROR] Missing required argument: <project>',
      exitCode: 1,
    };
  }

  if (!index.projects[projectName]) {
    return {
      output:
        "[ERROR] Project '" +
        projectName +
        "' not found (" +
        index.meta.projectCount +
        ' indexed). Try: nx show projects',
      exitCode: 1,
    };
  }

  const maxDepth = options.depth !== undefined ? options.depth : Infinity;
  const isReverse = options.reverse === true;

  // Build adjacency list based on direction
  /** @type {(name: string) => string[]} */
  let getChildren;

  if (isReverse) {
    const reverseDeps = buildReverseDeps(index.dependencies);
    getChildren = (name) => reverseDeps[name] || [];
  } else {
    getChildren = (name) =>
      (index.dependencies[name] || []).map((d) => d.target);
  }

  const lines = [];
  const firstOccurrences = new Set();
  let totalNodes = 0;
  let directCount = 0;
  let dedupCount = 0;
  let circularCount = 0;
  const uniqueNames = new Set();

  /**
   * Recursively print the tree.
   *
   * @param {string} name - Current node name.
   * @param {number} depth - Current depth level.
   * @param {Set<string>} visited - Nodes visited in the current path (for circular detection).
   */
  function printTree(name, depth, visited) {
    totalNodes++;
    uniqueNames.add(name);

    if (depth === 0) {
      // Root node: no prefix
      lines.push(name);
    } else {
      const indent = '  '.repeat(depth);
      let suffix = '';

      if (visited.has(name)) {
        // Circular dependency
        suffix = ' !';
        circularCount++;
        lines.push(indent + '- ' + name + suffix);

        return;
      }

      if (firstOccurrences.has(name)) {
        // Deduped subtree
        suffix = ' ^';
        dedupCount++;
        lines.push(indent + '- ' + name + suffix);

        return;
      }

      lines.push(indent + '- ' + name + suffix);
    }

    firstOccurrences.add(name);

    if (depth >= maxDepth) {
      return;
    }

    const children = getChildren(name);

    if (depth === 0) {
      directCount = children.length;
    }

    visited.add(name);

    for (const child of children) {
      printTree(child, depth + 1, visited);
    }

    visited.delete(name);
  }

  printTree(projectName, 0, new Set());

  lines.push('');
  lines.push('^ = deduped, ! = circular');
  lines.push(
    totalNodes +
      ' nodes (' +
      directCount +
      ' direct, ' +
      uniqueNames.size +
      ' unique, ' +
      dedupCount +
      ' deduped, ' +
      circularCount +
      ' circular)',
  );

  return {
    output: lines.join('\n'),
    exitCode: 0,
  };
}

// ─── Entry point ───

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith('deps-command.mjs') ||
    process.argv[1].endsWith('deps-command'));

if (isMain) {
  const args = process.argv.slice(2);
  let projectName = null;
  let reverse = false;
  let depth = undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--reverse') {
      reverse = true;
    } else if (args[i] === '--depth' && i + 1 < args.length) {
      depth = parseInt(args[i + 1], 10);
      i++;
    } else if (!args[i].startsWith('--')) {
      projectName = args[i];
    }
  }

  const workspaceRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  if (!projectName) {
    error('Missing required argument: <project>');
    process.exit(1);
  }

  try {
    const index = loadIndex(workspaceRoot);
    const { output, exitCode } = renderDepsTree(projectName, index, {
      reverse,
      depth,
    });

    process.stdout.write(output + '\n');
    process.exit(exitCode);
  } catch (err) {
    error(/** @type {Error} */ (err).message);
    process.exit(1);
  }
}
