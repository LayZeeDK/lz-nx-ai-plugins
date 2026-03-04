/**
 * Project-scoped content search command.
 *
 * Runs git grep scoped to project sourceRoots, groups results by project,
 * supports fixed string (default) and regex (/pattern/) modes.
 * Truncates unscoped results at 20 matches with warning.
 *
 * Exports:
 * - runFind(pattern, index, options, workspaceRoot) -> { output, exitCode }
 */

// Placeholder -- will be implemented in GREEN phase
export function runFind(pattern, index, options = {}, workspaceRoot = '.') {
  throw new Error('Not implemented');
}
