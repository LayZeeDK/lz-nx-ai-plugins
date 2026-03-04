/**
 * Project name filtering with glob and comma-separated patterns.
 *
 * Supports:
 * - Exact match: "my-app"
 * - Glob with *: "shared-*"
 * - Comma-separated: "my-app,feature-auth"
 * - Mixed: "*-auth,shared-*"
 *
 * Only `*` wildcard is supported -- per RESEARCH.md, this is the only
 * wildcard needed for project names.
 *
 * Exports:
 * - filterProjects(pattern, projectNames) -> string[]
 */

/**
 * Filter project names against a pattern string.
 *
 * @param {string} pattern - Pattern string (exact, glob with *, or comma-separated).
 * @param {string[]} projectNames - Array of project names to filter against.
 * @returns {string[]} Deduplicated array of matching project names.
 */
export function filterProjects(pattern, projectNames) {
  const segments = pattern.split(',').map(s => s.trim()).filter(Boolean);
  const matches = new Set();

  for (const segment of segments) {
    if (segment.includes('*')) {
      // Convert glob pattern to regex: escape special regex chars, replace * with .*
      const escaped = segment.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp('^' + escaped.replace(/\*/g, '.*') + '$');

      for (const name of projectNames) {
        if (regex.test(name)) {
          matches.add(name);
        }
      }
    } else {
      // Exact match
      if (projectNames.includes(segment)) {
        matches.add(segment);
      }
    }
  }

  return [...matches];
}
