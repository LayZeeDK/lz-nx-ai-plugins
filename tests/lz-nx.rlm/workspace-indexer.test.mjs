import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

// Load fixtures using createRequire (not affected by vi.mock hoisting of node:fs)
const require = createRequire(import.meta.url);
const graphFixture = require('./fixtures/graph-output.json');
const tsconfigFixture = require('./fixtures/tsconfig-base.json');

// ─── workspace-indexer: transformGraphToIndex (pure function, no mocks needed) ───

describe('workspace-indexer > transformGraphToIndex', () => {
  let transformGraphToIndex;

  beforeEach(async () => {
    // Import the real module -- transformGraphToIndex is a pure function
    const mod = await import('#rlm/workspace-indexer.mjs');
    transformGraphToIndex = mod.transformGraphToIndex;
  });

  it('extracts projects with root, sourceRoot, type, tags, targets', () => {
    const index = transformGraphToIndex(graphFixture, {});

    expect(index.projects['my-app']).toEqual({
      root: 'apps/my-app',
      sourceRoot: 'apps/my-app/src',
      type: 'app',
      tags: ['type:app'],
      targets: {
        build: '@nx/webpack:webpack',
        serve: '@nx/webpack:dev-server',
        test: '@nx/jest:jest',
      },
    });
  });

  it('uses graph-level node.type, not data.projectType (e2e has type "e2e")', () => {
    const index = transformGraphToIndex(graphFixture, {});

    expect(index.projects['my-app-e2e'].type).toBe('e2e');
  });

  it('extracts only executor string from targets, not full config objects', () => {
    const index = transformGraphToIndex(graphFixture, {});
    const targets = index.projects['shared-utils'].targets;

    expect(targets.build).toBe('@nx/js:tsc');
    expect(targets.test).toBe('@nx/jest:jest');
    expect(typeof targets.build).toBe('string');
  });

  it('maps dependencies to { target, type } per project', () => {
    const index = transformGraphToIndex(graphFixture, {});

    expect(index.dependencies['my-app']).toEqual([
      { target: 'shared-utils', type: 'static' },
      { target: 'feature-auth', type: 'static' },
    ]);
    expect(index.dependencies['shared-utils']).toEqual([]);
    expect(index.dependencies['feature-auth']).toEqual([
      { target: 'shared-utils', type: 'static' },
    ]);
    expect(index.dependencies['my-app-e2e']).toEqual([
      { target: 'my-app', type: 'implicit' },
    ]);
  });

  it('includes meta with builtAt (ISO string) and projectCount', () => {
    const index = transformGraphToIndex(graphFixture, {});

    expect(index.meta.projectCount).toBe(4);
    expect(typeof index.meta.builtAt).toBe('string');
    expect(index.meta.builtAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('includes pathAliases in the returned index', () => {
    const aliases = {
      '@myorg/shared-utils': ['libs/shared-utils/src/index.ts'],
    };
    const index = transformGraphToIndex(graphFixture, aliases);

    expect(index.pathAliases).toEqual(aliases);
  });

  it('handles nodes with missing sourceRoot gracefully (null)', () => {
    const graphWithMissing = {
      graph: {
        nodes: {
          'no-source': {
            name: 'no-source',
            type: 'lib',
            data: { root: 'libs/no-source', tags: [], targets: {} },
          },
        },
        dependencies: { 'no-source': [] },
      },
    };
    const index = transformGraphToIndex(graphWithMissing, {});

    expect(index.projects['no-source'].sourceRoot).toBeNull();
  });

  it('handles nodes with missing tags (defaults to empty array)', () => {
    const graphWithMissing = {
      graph: {
        nodes: {
          'no-tags': {
            name: 'no-tags',
            type: 'lib',
            data: {
              root: 'libs/no-tags',
              sourceRoot: 'libs/no-tags/src',
              targets: {},
            },
          },
        },
        dependencies: { 'no-tags': [] },
      },
    };
    const index = transformGraphToIndex(graphWithMissing, {});

    expect(index.projects['no-tags'].tags).toEqual([]);
  });
});
