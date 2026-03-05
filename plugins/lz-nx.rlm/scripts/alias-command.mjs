/**
 * Bidirectional alias resolution command.
 *
 * Resolves input as either an alias or path, displaying all fallback paths
 * per alias with arrow output format. Shows partial match headers, summary
 * footer for 2+ matches, wildcard warnings, and no-match hints with real data.
 *
 * Exports:
 * - runAlias(input, index) -> { output, exitCode }
 *
 * Entry point: parses process.argv when run directly.
 */

import { loadIndex } from './shared/index-loader.mjs';
import { error } from './shared/output-format.mjs';
import { resolveAlias } from './path-resolver.mjs';

/**
 * Run bidirectional alias resolution and format output.
 *
 * @param {string} input - Alias or path to resolve.
 * @param {object} index - Workspace index from loadIndex.
 * @returns {{ output: string, exitCode: number }}
 */
export function runAlias(input, index) {
  if (!input) {
    return {
      output: '[ERROR] Missing required argument: <alias-or-path>',
      exitCode: 1,
    };
  }

  // Check for wildcard input
  if (input.includes('*')) {
    return {
      output:
        '[WARN] Wildcard patterns are not resolved. Wildcard path mappings (@org/*) violate Nx module boundary rules.',
      exitCode: 0,
    };
  }

  const pathAliases = index.pathAliases || {};
  const resolution = resolveAlias(input, pathAliases);

  if (resolution.error) {
    return {
      output: '[ERROR] ' + resolution.error,
      exitCode: 1,
    };
  }

  // No matches
  if (resolution.results.length === 0) {
    const lines = [];

    lines.push("[WARN] No match for '" + input + "'");

    // Build hint with real data from the index
    const aliasKeys = Object.keys(pathAliases);

    if (aliasKeys.length > 0) {
      const firstAlias = aliasKeys[0];
      const firstPath = pathAliases[firstAlias][0];

      lines.push(
        'Hint: Try an alias (' + firstAlias + ') or path (' + firstPath + ')',
      );
    }

    return {
      output: lines.join('\n'),
      exitCode: 0,
    };
  }

  const lines = [];
  let totalResultLines = 0;

  if (resolution.partial) {
    // Determine if partial matches are alias-side or path-side
    const direction = resolution.results[0].direction;

    if (direction === 'alias->path') {
      lines.push('Partial matches (alias):');

      for (const result of resolution.results) {
        // result.to is string[] for alias->path
        const paths = Array.isArray(result.to) ? result.to : [result.to];

        for (const path of paths) {
          lines.push('  ' + result.from + ' -> ' + path);
          totalResultLines++;
        }
      }
    } else {
      lines.push('Partial matches (path):');

      for (const result of resolution.results) {
        lines.push('  ' + result.from + ' -> ' + result.to);
        totalResultLines++;
      }
    }

    // Truncation note if applicable (resolveAlias already truncates at 20)
    if (totalResultLines >= 20) {
      lines.push('[WARN] Showing 20 of possibly more matches.');
    }

    lines.push(totalResultLines + ' matches');
  } else {
    // Exact matches
    for (const result of resolution.results) {
      if (result.direction === 'alias->path') {
        // result.to is string[] for alias->path
        const paths = Array.isArray(result.to) ? result.to : [result.to];

        for (const path of paths) {
          lines.push(input + ' -> ' + path);
          totalResultLines++;
        }
      } else {
        // path->alias: result.from is the alias, result.to is the path
        lines.push(input + ' -> ' + result.from);
        totalResultLines++;
      }
    }

    // Summary footer only for 2+ result lines
    if (totalResultLines >= 2) {
      lines.push(totalResultLines + ' matches');
    }
  }

  return {
    output: lines.join('\n'),
    exitCode: 0,
  };
}

// ─── Entry point ───

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith('alias-command.mjs') ||
    process.argv[1].endsWith('alias-command'));

if (isMain) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0].startsWith('--')) {
    error('Missing required argument: <alias-or-path>');
    process.exit(1);
  }

  const input = args[0];
  const workspaceRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  try {
    const index = loadIndex(workspaceRoot);
    const { output, exitCode } = runAlias(input, index);

    process.stdout.write(output + '\n');
    process.exit(exitCode);
  } catch (err) {
    error(err.message);
    process.exit(1);
  }
}
