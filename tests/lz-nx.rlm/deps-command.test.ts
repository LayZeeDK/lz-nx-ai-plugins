import { describe, it, expect, beforeEach } from 'vitest';

// ─── Fixture: workspace index matching graph-output.json structure ───
// 4 projects: my-app, shared-utils, feature-auth, my-app-e2e
const projectNames = ['my-app', 'shared-utils', 'feature-auth', 'my-app-e2e'];

const fixtureIndex = {
  projects: {
    'my-app': {
      root: 'apps/my-app',
      sourceRoot: 'apps/my-app/src',
      type: 'app',
      tags: ['type:app'],
      targets: {
        build: '@nx/webpack:webpack',
        serve: '@nx/webpack:dev-server',
        test: '@nx/jest:jest',
      },
    },
    'shared-utils': {
      root: 'libs/shared-utils',
      sourceRoot: 'libs/shared-utils/src',
      type: 'lib',
      tags: ['type:util'],
      targets: { build: '@nx/js:tsc', test: '@nx/jest:jest' },
    },
    'feature-auth': {
      root: 'libs/feature-auth',
      sourceRoot: 'libs/feature-auth/src',
      type: 'lib',
      tags: ['scope:auth'],
      targets: { build: '@nx/js:tsc', test: '@nx/jest:jest' },
    },
    'my-app-e2e': {
      root: 'apps/my-app-e2e',
      sourceRoot: 'apps/my-app-e2e/src',
      type: 'e2e',
      tags: [],
      targets: { e2e: '@nx/cypress:cypress' },
    },
  },
  dependencies: {
    'my-app': [
      { target: 'shared-utils', type: 'static' },
      { target: 'feature-auth', type: 'static' },
    ],
    'shared-utils': [],
    'feature-auth': [{ target: 'shared-utils', type: 'static' }],
    'my-app-e2e': [{ target: 'my-app', type: 'implicit' }],
  },
  pathAliases: {
    '@myorg/shared-utils': ['libs/shared-utils/src/index.ts'],
    '@myorg/feature-auth': ['libs/feature-auth/src/index.ts'],
  },
  meta: {
    builtAt: '2026-03-04T00:00:00.000Z',
    projectCount: 4,
  },
};

// ─── Fixture with circular dependency ───
const circularIndex = {
  projects: {
    ...fixtureIndex.projects,
    'circular-lib': {
      root: 'libs/circular-lib',
      sourceRoot: 'libs/circular-lib/src',
      type: 'lib',
      tags: [],
      targets: { build: '@nx/js:tsc' },
    },
  },
  dependencies: {
    ...fixtureIndex.dependencies,
    'feature-auth': [
      { target: 'shared-utils', type: 'static' },
      { target: 'circular-lib', type: 'static' },
    ],
    'circular-lib': [{ target: 'feature-auth', type: 'static' }],
  },
  meta: {
    builtAt: '2026-03-04T00:00:00.000Z',
    projectCount: 5,
  },
};

// ─── project-filter tests ───

type CommandResult = { output: string; exitCode: number };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyIndex = any;

describe('project-filter > filterProjects', () => {
  let filterProjects: (pattern: string, projectNames: string[]) => string[];

  beforeEach(async () => {
    const mod = await import('#rlm/shared/project-filter.mjs');
    filterProjects = mod.filterProjects;
  });

  it('exact match: filterProjects("my-app", projectNames) returns ["my-app"]', () => {
    const result = filterProjects('my-app', projectNames);

    expect(result).toEqual(['my-app']);
  });

  it('glob with *: filterProjects("shared-*", projectNames) returns ["shared-utils"]', () => {
    const result = filterProjects('shared-*', projectNames);

    expect(result).toEqual(['shared-utils']);
  });

  it('comma-separated: filterProjects("my-app,feature-auth", projectNames) returns ["my-app", "feature-auth"]', () => {
    const result = filterProjects('my-app,feature-auth', projectNames);

    expect(result).toEqual(['my-app', 'feature-auth']);
  });

  it('no match: filterProjects("nonexistent", projectNames) returns []', () => {
    const result = filterProjects('nonexistent', projectNames);

    expect(result).toEqual([]);
  });

  it('mixed glob+comma: filterProjects("*-auth,shared-*", projectNames) returns ["feature-auth", "shared-utils"]', () => {
    const result = filterProjects('*-auth,shared-*', projectNames);

    expect(result).toEqual(['feature-auth', 'shared-utils']);
  });
});

// ─── deps-command tests ───

describe('deps-command > renderDepsTree', () => {
  let renderDepsTree: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    projectName: any,
    index: AnyIndex,
    options?: { reverse?: boolean; depth?: number },
  ) => CommandResult;

  beforeEach(async () => {
    const mod = await import('#rlm/deps-command.mjs');
    renderDepsTree = mod.renderDepsTree;
  });

  it('renders markdown nested list for my-app with correct indentation', () => {
    const { output, exitCode } = renderDepsTree('my-app', fixtureIndex);

    expect(exitCode).toBe(0);
    // Root project has no "- " prefix
    expect(output).toMatch(/^my-app$/m);
    // Children indented with "  - "
    expect(output).toContain('  - shared-utils');
    expect(output).toContain('  - feature-auth');
  });

  it('root project has no "- " prefix, children indented with "  - " at each level', () => {
    const { output } = renderDepsTree('my-app', fixtureIndex);
    const lines = output.split('\n').filter(Boolean);

    // First line is just the project name (no prefix)
    expect(lines[0]).toBe('my-app');
    // Direct children at level 1
    const directChildren = lines.filter(
      (l: string) => l.startsWith('  - ') && !l.startsWith('    - '),
    );

    expect(directChildren.length).toBeGreaterThanOrEqual(2);
  });

  it('--reverse flag shows who depends on shared-utils', () => {
    const { output, exitCode } = renderDepsTree('shared-utils', fixtureIndex, {
      reverse: true,
    });

    expect(exitCode).toBe(0);
    expect(output).toMatch(/^shared-utils$/m);
    // my-app and feature-auth both depend on shared-utils
    expect(output).toContain('my-app');
    expect(output).toContain('feature-auth');
  });

  it('--depth 1 limits to direct dependencies only', () => {
    const { output, exitCode } = renderDepsTree('my-app', fixtureIndex, {
      depth: 1,
    });

    expect(exitCode).toBe(0);
    // Direct deps shown
    expect(output).toContain('  - shared-utils');
    expect(output).toContain('  - feature-auth');
    // feature-auth's child (shared-utils at level 2) should NOT appear at deeper level
    expect(output).not.toContain('    - shared-utils');
  });

  it('shared subtree marked with "^" on subsequent occurrences (dedup)', () => {
    const { output } = renderDepsTree('my-app', fixtureIndex);

    // shared-utils appears first under my-app directly, then again under feature-auth
    // The second occurrence should have "^" marker
    const lines = output.split('\n');
    const sharedLines = lines.filter((l) => l.includes('shared-utils'));

    // At least one should have ^ marker
    expect(sharedLines.some((l) => l.includes('^'))).toBe(true);
    // At least one should NOT have ^ marker (first occurrence)
    expect(sharedLines.some((l) => !l.includes('^'))).toBe(true);
  });

  it('legend line at bottom: "^ = deduped, ! = circular"', () => {
    const { output } = renderDepsTree('my-app', fixtureIndex);

    expect(output).toContain('^ = deduped, ! = circular');
  });

  it('summary footer format: "N nodes (X direct, Y unique, Z deduped, W circular)"', () => {
    const { output } = renderDepsTree('my-app', fixtureIndex);

    // Expect pattern like "4 nodes (2 direct, 3 unique, 1 deduped, 0 circular)"
    expect(output).toMatch(
      /\d+ nodes \(\d+ direct, \d+ unique, \d+ deduped, \d+ circular\)/,
    );
  });

  it('nonexistent project returns error message', () => {
    const { output, exitCode } = renderDepsTree('nonexistent', fixtureIndex);

    expect(exitCode).toBe(1);
    expect(output).toContain("[ERROR] Project 'nonexistent' not found");
    expect(output).toContain('4 indexed');
  });

  it('missing argument returns error message', () => {
    const { output, exitCode } = renderDepsTree(undefined, fixtureIndex);

    expect(exitCode).toBe(1);
    expect(output).toContain('[ERROR] Missing required argument: <project>');
  });

  it('exit code 1 on error, 0 on success', () => {
    const successResult = renderDepsTree('my-app', fixtureIndex);

    expect(successResult.exitCode).toBe(0);

    const errorResult = renderDepsTree('nonexistent', fixtureIndex);

    expect(errorResult.exitCode).toBe(1);
  });

  it('circular dependency detected and marked with "!"', () => {
    const { output } = renderDepsTree('my-app', circularIndex);

    // Circular dep between feature-auth and circular-lib should produce "!" marker
    const lines = output.split('\n');
    const circularLines = lines.filter((l) => l.includes('!'));

    expect(circularLines.length).toBeGreaterThanOrEqual(1);
  });
});
