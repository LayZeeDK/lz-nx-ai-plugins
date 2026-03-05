import { describe, it, expect, beforeEach } from 'vitest';

// ─── Fixture: workspace index with path aliases ───
const fixtureIndex = {
  projects: {
    'my-app': {
      root: 'apps/my-app',
      sourceRoot: 'apps/my-app/src',
      type: 'app',
      tags: ['type:app'],
      targets: { build: '@nx/webpack:webpack' },
    },
    'shared-utils': {
      root: 'libs/shared-utils',
      sourceRoot: 'libs/shared-utils/src',
      type: 'lib',
      tags: ['type:util'],
      targets: { build: '@nx/js:tsc' },
    },
    'feature-auth': {
      root: 'libs/feature-auth',
      sourceRoot: 'libs/feature-auth/src',
      type: 'lib',
      tags: ['scope:auth'],
      targets: { build: '@nx/js:tsc' },
    },
  },
  dependencies: {},
  pathAliases: {
    '@myorg/shared-utils': ['libs/shared-utils/src/index.ts'],
    '@myorg/feature-auth': ['libs/feature-auth/src/index.ts'],
  },
  meta: {
    builtAt: '2026-03-04T00:00:00.000Z',
    projectCount: 3,
  },
};

// ─── Fixture with multi-path alias ───
const multiPathIndex = {
  ...fixtureIndex,
  pathAliases: {
    ...fixtureIndex.pathAliases,
    '@myorg/utils': [
      'libs/utils/src/index.ts',
      'libs/utils-compat/src/index.ts',
    ],
  },
};

describe('alias-command > runAlias', () => {
  let runAlias;

  beforeEach(async () => {
    const mod = await import('#rlm/alias-command.mjs');
    runAlias = mod.runAlias;
  });

  // ─── Exact alias -> path ───

  it('resolves alias to all paths: "@myorg/shared-utils -> libs/shared-utils/src/index.ts"', () => {
    const { output, exitCode } = runAlias('@myorg/shared-utils', fixtureIndex);

    expect(exitCode).toBe(0);
    expect(output).toContain('@myorg/shared-utils -> libs/shared-utils/src/index.ts');
  });

  it('alias with multiple fallback paths shows each path on its own line', () => {
    const { output, exitCode } = runAlias('@myorg/utils', multiPathIndex);

    expect(exitCode).toBe(0);
    expect(output).toContain('@myorg/utils -> libs/utils/src/index.ts');
    expect(output).toContain('@myorg/utils -> libs/utils-compat/src/index.ts');
  });

  // ─── Exact path -> alias ───

  it('resolves path to alias: "libs/shared-utils/src/index.ts -> @myorg/shared-utils"', () => {
    const { output, exitCode } = runAlias('libs/shared-utils/src/index.ts', fixtureIndex);

    expect(exitCode).toBe(0);
    expect(output).toContain('libs/shared-utils/src/index.ts -> @myorg/shared-utils');
  });

  // ─── Arrow direction ───

  it('arrow direction is always "input -> resolved"', () => {
    const aliasResult = runAlias('@myorg/shared-utils', fixtureIndex);

    expect(aliasResult.output).toContain('@myorg/shared-utils ->');

    const pathResult = runAlias('libs/shared-utils/src/index.ts', fixtureIndex);

    expect(pathResult.output).toContain('libs/shared-utils/src/index.ts ->');
  });

  // ─── Summary footer ───

  it('no summary footer for single match', () => {
    const { output } = runAlias('@myorg/shared-utils', fixtureIndex);

    // Single alias with single path = 1 result line, no "N matches"
    expect(output).not.toMatch(/\d+ match(es)?$/m);
  });

  it('summary footer with count for 2+ result lines', () => {
    const { output } = runAlias('@myorg/utils', multiPathIndex);

    // 2 paths = 2 result lines -> should have "2 matches"
    expect(output).toContain('2 matches');
  });

  // ─── Partial matches ───

  it('partial matches show header: "Partial matches (alias):"', () => {
    const { output, exitCode } = runAlias('shared', fixtureIndex);

    expect(exitCode).toBe(0);
    expect(output).toContain('Partial matches (alias):');
  });

  it('partial path matches show header: "Partial matches (path):"', () => {
    // Use a substring that matches only in paths, not aliases
    // "src/index.ts" appears in paths but not as an alias key
    const indexWithDistinctPaths = {
      ...fixtureIndex,
      pathAliases: {
        '@org/foo': ['unique-dir/src/index.ts'],
      },
    };
    const { output } = runAlias('unique-dir', indexWithDistinctPaths);

    expect(output).toContain('Partial matches (path):');
  });

  // ─── Truncation ───

  it('substring results truncated at 20 with warning', () => {
    const manyAliases = {};

    for (let i = 0; i < 25; i++) {
      manyAliases['@org/common-lib-' + i] = ['libs/common-lib-' + i + '/src/index.ts'];
    }

    const bigIndex = {
      ...fixtureIndex,
      pathAliases: manyAliases,
    };
    const { output } = runAlias('common', bigIndex);

    // Should mention truncation
    const arrowLines = output.split('\n').filter(l => l.includes('->'));

    expect(arrowLines.length).toBeLessThanOrEqual(20);
    expect(output).toMatch(/20/);
  });

  // ─── No match ───

  it('no match outputs "[WARN] No match for \'<input>\'" with hint', () => {
    const { output, exitCode } = runAlias('nonexistent-xyz', fixtureIndex);

    expect(exitCode).toBe(0);
    expect(output).toContain("[WARN] No match for 'nonexistent-xyz'");
    expect(output).toContain('Hint:');
  });

  it('hint format uses actual data from index', () => {
    const { output } = runAlias('nonexistent-xyz', fixtureIndex);

    // Hint should reference a real alias and path from the index
    expect(output).toContain('@myorg/');
    expect(output).toContain('libs/');
  });

  // ─── Wildcard warning ───

  it('wildcard input warns about ignored wildcard patterns', () => {
    const { output, exitCode } = runAlias('@myorg/my-app/*', fixtureIndex);

    expect(exitCode).toBe(0);
    expect(output).toContain('[WARN]');
    expect(output).toMatch(/[Ww]ildcard/);
  });

  // ─── Missing argument ───

  it('missing argument outputs error', () => {
    const { output, exitCode } = runAlias(undefined, fixtureIndex);

    expect(exitCode).toBe(1);
    expect(output).toContain('[ERROR] Missing required argument: <alias-or-path>');
  });

  // ─── Exit codes ───

  it('exit code 0 on success, 1 on error', () => {
    const successResult = runAlias('@myorg/shared-utils', fixtureIndex);

    expect(successResult.exitCode).toBe(0);

    const errorResult = runAlias(undefined, fixtureIndex);

    expect(errorResult.exitCode).toBe(1);
  });
});
