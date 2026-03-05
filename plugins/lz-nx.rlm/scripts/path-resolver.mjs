/**
 * Bidirectional path alias resolver.
 *
 * Resolves tsconfig path aliases in both directions:
 * - alias -> path (e.g., "@myorg/shared-utils" -> ["libs/shared-utils/src/index.ts"])
 * - path -> alias (e.g., "libs/shared-utils/src/index.ts" -> "@myorg/shared-utils")
 *
 * Resolution order:
 * 1. Exact alias key match
 * 2. Exact path value match (any element in any alias's path array)
 * 3. Substring fallback on alias keys
 * 4. Substring fallback on path values
 *
 * Substring results are truncated at 20 matches.
 *
 * Exports:
 * - resolveAlias(input, pathAliases) -> { results, partial, error? }
 */

/** Maximum number of substring match results to return. */
const MAX_RESULTS = 20;

/**
 * Resolve an alias or path bidirectionally against a path aliases map.
 *
 * @param {string} input - The alias or path to resolve.
 * @param {object} pathAliases - Map of alias to paths array (values are string[]).
 * @returns {{ results: Array<{ from: string, to: string|string[], direction: string }>, partial: boolean, error?: string }}
 */
export function resolveAlias(input, pathAliases) {
  if (!input) {
    return { results: [], partial: false, error: 'Missing required argument' };
  }

  // Step 1: Exact alias match
  if (pathAliases[input] !== undefined) {
    return {
      results: [
        {
          from: input,
          to: pathAliases[input],
          direction: 'alias->path',
        },
      ],
      partial: false,
    };
  }

  // Step 2: Exact path match (check all aliases' path arrays)
  const exactPathMatches = [];

  for (const [alias, paths] of Object.entries(pathAliases)) {
    if (paths.includes(input)) {
      exactPathMatches.push({
        from: alias,
        to: input,
        direction: 'path->alias',
      });
    }
  }

  if (exactPathMatches.length > 0) {
    return { results: exactPathMatches, partial: false };
  }

  // Step 3: Substring fallback on alias keys
  const aliasSubstringMatches = [];

  for (const [alias, paths] of Object.entries(pathAliases)) {
    if (alias.includes(input)) {
      aliasSubstringMatches.push({
        from: alias,
        to: paths,
        direction: 'alias->path',
      });
    }
  }

  if (aliasSubstringMatches.length > 0) {
    const truncated = aliasSubstringMatches.slice(0, MAX_RESULTS);

    return { results: truncated, partial: true };
  }

  // Step 4: Substring fallback on path values
  const pathSubstringMatches = [];

  for (const [alias, paths] of Object.entries(pathAliases)) {
    for (const pathValue of paths) {
      if (pathValue.includes(input)) {
        pathSubstringMatches.push({
          from: alias,
          to: pathValue,
          direction: 'path->alias',
        });
      }
    }
  }

  if (pathSubstringMatches.length > 0) {
    const truncated = pathSubstringMatches.slice(0, MAX_RESULTS);

    return { results: truncated, partial: true };
  }

  // No match
  return { results: [], partial: false };
}
