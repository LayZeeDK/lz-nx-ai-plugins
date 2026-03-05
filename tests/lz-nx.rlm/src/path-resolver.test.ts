import { describe, it, expect } from 'vitest';

// Build aliases map from the tsconfig-base fixture format
// Values are arrays (TypeScript fallback resolution)
const aliases = {
  '@myorg/shared-utils': ['libs/shared-utils/src/index.ts'],
  '@myorg/feature-auth': ['libs/feature-auth/src/index.ts'],
};

interface ResolveResult {
  results: Array<{ from: string; to: string | string[]; direction: string }>;
  partial: boolean;
  error?: string;
}

describe('path-resolver > resolveAlias', () => {
  async function setup() {
    const { resolveAlias } = await import('#rlm/path-resolver.mjs');

    return { resolveAlias };
  }

  // ─── Exact alias match ───

  it('resolveAlias("@myorg/shared-utils", aliases) returns exact alias->paths match with full paths array', async () => {
    const { resolveAlias } = await setup();
    const result = resolveAlias('@myorg/shared-utils', aliases);

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toEqual({
      from: '@myorg/shared-utils',
      to: ['libs/shared-utils/src/index.ts'],
      direction: 'alias->path',
    });
    expect(result.partial).toBe(false);
  });

  it('resolveAlias for alias with multiple fallback paths returns all paths in `to` array', async () => {
    const { resolveAlias } = await setup();
    const multiAliases = {
      '@myorg/utils': [
        'libs/utils/src/index.ts',
        'libs/utils-compat/src/index.ts',
      ],
    };

    const result = resolveAlias('@myorg/utils', multiAliases);

    expect(result.results).toHaveLength(1);
    expect(result.results[0].to).toEqual([
      'libs/utils/src/index.ts',
      'libs/utils-compat/src/index.ts',
    ]);
    expect(result.results[0].direction).toBe('alias->path');
    expect(result.partial).toBe(false);
  });

  // ─── Exact path match ───

  it('resolveAlias("libs/shared-utils/src/index.ts", aliases) returns exact path->alias match', async () => {
    const { resolveAlias } = await setup();
    const result = resolveAlias('libs/shared-utils/src/index.ts', aliases);

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toEqual({
      from: '@myorg/shared-utils',
      to: 'libs/shared-utils/src/index.ts',
      direction: 'path->alias',
    });
    expect(result.partial).toBe(false);
  });

  // ─── Priority: exact alias first, then exact path, then substring ───

  it('exact alias match checked first, then exact path match, then substring fallback', async () => {
    const { resolveAlias } = await setup();
    // Create a scenario where input matches both an alias key and a path value
    const ambiguousAliases = {
      'libs/shared': ['other/path.ts'],
      '@myorg/other': ['libs/shared'],
    };

    // "libs/shared" is both an alias key AND a path value
    // Should match as alias key first (exact alias match priority)
    const result = resolveAlias('libs/shared', ambiguousAliases);

    expect(result.results[0].direction).toBe('alias->path');
    expect(result.partial).toBe(false);
  });

  // ─── Substring fallback (alias side) ───

  it('substring fallback on alias side: resolveAlias("shared", aliases) returns partial matches containing "shared" in alias keys', async () => {
    const { resolveAlias } = await setup();
    const result = resolveAlias('shared', aliases);

    expect(result.results.length).toBeGreaterThanOrEqual(1);

    const aliasMatches = result.results.filter(
      (r: ResolveResult['results'][0]) => r.direction === 'alias->path',
    );

    expect(aliasMatches.length).toBeGreaterThanOrEqual(1);
    expect(
      aliasMatches.some(
        (r: ResolveResult['results'][0]) => r.from === '@myorg/shared-utils',
      ),
    ).toBe(true);
    expect(result.partial).toBe(true);
  });

  // ─── Substring fallback (path side) ───

  it('substring fallback on path side: resolveAlias("feature-auth", aliases) returns partial matches containing "feature-auth" in path values', async () => {
    const { resolveAlias } = await setup();
    const result = resolveAlias('feature-auth', aliases);

    // "feature-auth" appears as an alias key substring AND in path values
    expect(result.results.length).toBeGreaterThanOrEqual(1);
    expect(result.partial).toBe(true);
  });

  // ─── 20-match truncation ───

  it('substring results limited to 20 matches', async () => {
    const { resolveAlias } = await setup();
    const manyAliases: Record<string, string[]> = {};

    for (let i = 0; i < 25; i++) {
      manyAliases['@org/common-lib-' + i] = [
        'libs/common-lib-' + i + '/src/index.ts',
      ];
    }

    const result = resolveAlias('common', manyAliases);

    expect(result.results.length).toBeLessThanOrEqual(20);
    expect(result.partial).toBe(true);
  });

  // ─── Direction indicators ───

  it('results include direction indicator ("alias->path" or "path->alias")', async () => {
    const { resolveAlias } = await setup();
    const aliasResult = resolveAlias('@myorg/shared-utils', aliases);

    expect(aliasResult.results[0].direction).toBe('alias->path');

    const pathResult = resolveAlias('libs/shared-utils/src/index.ts', aliases);

    expect(pathResult.results[0].direction).toBe('path->alias');
  });

  // ─── Partial flag ───

  it('partial flag is true for substring matches, false for exact matches', async () => {
    const { resolveAlias } = await setup();
    const exactResult = resolveAlias('@myorg/shared-utils', aliases);

    expect(exactResult.partial).toBe(false);

    const substringResult = resolveAlias('shared', aliases);

    expect(substringResult.partial).toBe(true);
  });

  // ─── Empty input ───

  it('empty input returns error', async () => {
    const { resolveAlias } = await setup();
    const result = resolveAlias('', aliases);

    expect(result.results).toEqual([]);
    expect(result.error).toBeDefined();
  });

  it('undefined input returns error', async () => {
    const { resolveAlias } = await setup();
    // @ts-expect-error -- testing missing argument handling
    const result = resolveAlias(undefined, aliases);

    expect(result.results).toEqual([]);
    expect(result.error).toBeDefined();
  });

  // ─── No match ───

  it('no match returns empty results array', async () => {
    const { resolveAlias } = await setup();
    const result = resolveAlias('nonexistent-xyz', aliases);

    expect(result.results).toEqual([]);
    expect(result.partial).toBe(false);
  });

  // ─── Multiple path->alias matches ───

  it('multiple path->alias matches returned when same path appears in different aliases', async () => {
    const { resolveAlias } = await setup();
    const overlappingAliases = {
      '@myorg/utils-v1': ['libs/shared/utils.ts'],
      '@myorg/utils-v2': ['libs/shared/utils.ts'],
    };

    const result = resolveAlias('libs/shared/utils.ts', overlappingAliases);

    expect(result.results).toHaveLength(2);
    expect(
      result.results.every(
        (r: ResolveResult['results'][0]) => r.direction === 'path->alias',
      ),
    ).toBe(true);
    expect(result.partial).toBe(false);
  });
});
