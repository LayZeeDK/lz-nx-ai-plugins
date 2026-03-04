import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

// Load fixtures using createRequire (not affected by vi.mock hoisting of node:fs)
const require = createRequire(import.meta.url);
const graphFixture = require('./fixtures/graph-output.json');
const tsconfigFixture = require('./fixtures/tsconfig-base.json');

// ─── workspace-indexer (pure functions: transformGraphToIndex, readPathAliases) ───

describe('workspace-indexer', () => {
  describe('transformGraphToIndex', () => {
    let transformGraphToIndex;

    beforeEach(async () => {
      vi.resetModules();
      const mod = await import('../workspace-indexer.mjs');
      transformGraphToIndex = mod.transformGraphToIndex;
    });

    afterEach(() => {
      vi.restoreAllMocks();
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
      const aliases = { '@myorg/shared-utils': ['libs/shared-utils/src/index.ts'] };
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
              data: { root: 'libs/no-tags', sourceRoot: 'libs/no-tags/src', targets: {} },
            },
          },
          dependencies: { 'no-tags': [] },
        },
      };
      const index = transformGraphToIndex(graphWithMissing, {});

      expect(index.projects['no-tags'].tags).toEqual([]);
    });
  });

  describe('readPathAliases', () => {
    let readPathAliases;
    let mockReadFileSync;

    beforeEach(async () => {
      vi.resetModules();

      vi.mock('node:fs', async (importOriginal) => {
        const actual = await importOriginal();

        return {
          ...actual,
          readFileSync: vi.fn(),
          statSync: vi.fn(),
          writeFileSync: vi.fn(),
          mkdirSync: vi.fn(),
        };
      });

      const fsMod = await import('node:fs');
      mockReadFileSync = fsMod.readFileSync;

      const mod = await import('../workspace-indexer.mjs');
      readPathAliases = mod.readPathAliases;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('reads tsconfig.base.json and returns alias->paths map preserving full arrays', () => {
      mockReadFileSync.mockReturnValue(JSON.stringify(tsconfigFixture));

      const aliases = readPathAliases('/fake/workspace');

      expect(aliases['@myorg/shared-utils']).toEqual(['libs/shared-utils/src/index.ts']);
      expect(aliases['@myorg/feature-auth']).toEqual(['libs/feature-auth/src/index.ts']);
    });

    it('ignores wildcard patterns (entries containing "*")', () => {
      mockReadFileSync.mockReturnValue(JSON.stringify(tsconfigFixture));

      const aliases = readPathAliases('/fake/workspace');

      expect(aliases['@myorg/my-app/*']).toBeUndefined();
    });

    it('falls back to tsconfig.json if tsconfig.base.json missing', () => {
      const fallbackTsconfig = {
        compilerOptions: {
          baseUrl: '.',
          paths: { '@fallback/lib': ['libs/fallback/src/index.ts'] },
        },
      };

      mockReadFileSync.mockImplementation((filePath) => {
        if (typeof filePath === 'string' && filePath.includes('tsconfig.base.json')) {
          const err = new Error('ENOENT');
          err.code = 'ENOENT';
          throw err;
        }

        return JSON.stringify(fallbackTsconfig);
      });

      const aliases = readPathAliases('/fake/workspace');

      expect(aliases['@fallback/lib']).toEqual(['libs/fallback/src/index.ts']);
    });

    it('returns empty object if no tsconfig files exist', () => {
      mockReadFileSync.mockImplementation(() => {
        const err = new Error('ENOENT');
        err.code = 'ENOENT';
        throw err;
      });

      const aliases = readPathAliases('/fake/workspace');

      expect(aliases).toEqual({});
    });

    it('preserves all entries in each path array (TypeScript fallback resolution)', () => {
      const multiPathTsconfig = {
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '@myorg/utils': [
              'libs/utils/src/index.ts',
              'libs/utils-compat/src/index.ts',
            ],
          },
        },
      };
      mockReadFileSync.mockReturnValue(JSON.stringify(multiPathTsconfig));

      const aliases = readPathAliases('/fake/workspace');

      expect(aliases['@myorg/utils']).toEqual([
        'libs/utils/src/index.ts',
        'libs/utils-compat/src/index.ts',
      ]);
    });

    it('for "@myorg/shared-utils" returns single-element array preserved as array', () => {
      mockReadFileSync.mockReturnValue(JSON.stringify(tsconfigFixture));

      const aliases = readPathAliases('/fake/workspace');

      expect(Array.isArray(aliases['@myorg/shared-utils'])).toBe(true);
      expect(aliases['@myorg/shared-utils']).toHaveLength(1);
      expect(aliases['@myorg/shared-utils']).toEqual(['libs/shared-utils/src/index.ts']);
    });
  });

  describe('buildIndex', () => {
    let buildIndex;
    let mockRunNxGraph;
    let mockReadFileSync;
    let mockWriteFileSync;
    let mockMkdirSync;

    beforeEach(async () => {
      vi.resetModules();

      vi.mock('../nx-runner.mjs', () => ({
        runNxGraph: vi.fn(),
      }));

      vi.mock('node:fs', async (importOriginal) => {
        const actual = await importOriginal();

        return {
          ...actual,
          readFileSync: vi.fn(),
          writeFileSync: vi.fn(),
          mkdirSync: vi.fn(),
          statSync: vi.fn(),
        };
      });

      vi.mock('../shared/output-format.mjs', () => ({
        info: vi.fn(),
        success: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      }));

      const runnerMod = await import('../nx-runner.mjs');
      mockRunNxGraph = runnerMod.runNxGraph;

      const fsMod = await import('node:fs');
      mockReadFileSync = fsMod.readFileSync;
      mockWriteFileSync = fsMod.writeFileSync;
      mockMkdirSync = fsMod.mkdirSync;

      const mod = await import('../workspace-indexer.mjs');
      buildIndex = mod.buildIndex;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('calls runNxGraph, transforms result, writes index to tmp/lz-nx.rlm/workspace-index.json', () => {
      mockRunNxGraph.mockReturnValue({ data: graphFixture, error: null });

      // readPathAliases will try to read tsconfig.base.json -- return ENOENT
      mockReadFileSync.mockImplementation(() => {
        const err = new Error('ENOENT');
        err.code = 'ENOENT';
        throw err;
      });

      const result = buildIndex('/fake/workspace');

      expect(mockRunNxGraph).toHaveBeenCalled();
      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('lz-nx.rlm'),
        { recursive: true }
      );
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('workspace-index.json'),
        expect.any(String),
        'utf8'
      );
      expect(result.projects).toBeDefined();
      expect(result.meta.projectCount).toBe(4);
    });

    it('throws when runNxGraph returns an error', () => {
      mockRunNxGraph.mockReturnValue({ data: null, error: 'graph failed' });

      expect(() => buildIndex('/fake/workspace')).toThrow();
    });
  });
});

// ─── index-loader ───

describe('index-loader', () => {
  let loadIndex;
  let mockStatSync;
  let mockReadFileSync;
  let mockBuildIndex;

  beforeEach(async () => {
    vi.resetModules();

    vi.mock('../workspace-indexer.mjs', () => ({
      buildIndex: vi.fn(),
      transformGraphToIndex: vi.fn(),
      readPathAliases: vi.fn(),
    }));

    vi.mock('node:fs', async (importOriginal) => {
      const actual = await importOriginal();

      return {
        ...actual,
        readFileSync: vi.fn(),
        writeFileSync: vi.fn(),
        mkdirSync: vi.fn(),
        statSync: vi.fn(),
      };
    });

    const fsMod = await import('node:fs');
    mockStatSync = fsMod.statSync;
    mockReadFileSync = fsMod.readFileSync;

    const indexerMod = await import('../workspace-indexer.mjs');
    mockBuildIndex = indexerMod.buildIndex;

    const mod = await import('../shared/index-loader.mjs');
    loadIndex = mod.loadIndex;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns parsed index when file exists and is not stale', () => {
    const fakeIndex = { projects: {}, meta: { builtAt: '2026-01-01' } };

    mockStatSync.mockImplementation((filePath) => {
      if (typeof filePath === 'string' && filePath.includes('workspace-index.json')) {
        return { mtimeMs: 2000 };
      }

      return { mtimeMs: 1000 };
    });

    mockReadFileSync.mockReturnValue(JSON.stringify(fakeIndex));

    const result = loadIndex('/fake/workspace');

    expect(result).toEqual(fakeIndex);
    expect(mockBuildIndex).not.toHaveBeenCalled();
  });

  it('calls buildIndex when index file does not exist', () => {
    const fakeIndex = { projects: {}, meta: { builtAt: '2026-01-01' } };

    mockStatSync.mockImplementation((filePath) => {
      if (typeof filePath === 'string' && filePath.includes('workspace-index.json')) {
        const err = new Error('ENOENT');
        err.code = 'ENOENT';
        throw err;
      }

      return { mtimeMs: 1000 };
    });

    mockBuildIndex.mockReturnValue(fakeIndex);
    mockReadFileSync.mockReturnValue(JSON.stringify(fakeIndex));

    loadIndex('/fake/workspace');

    expect(mockBuildIndex).toHaveBeenCalledWith('/fake/workspace');
  });

  it('calls buildIndex when index is stale (watch path newer than index)', () => {
    const fakeIndex = { projects: {}, meta: { builtAt: '2026-01-01' } };

    mockStatSync.mockImplementation((filePath) => {
      if (typeof filePath === 'string' && filePath.includes('workspace-index.json')) {
        return { mtimeMs: 1000 };
      }

      if (typeof filePath === 'string' && filePath.includes('workspace-data')) {
        return { mtimeMs: 2000 };
      }

      return { mtimeMs: 500 };
    });

    mockBuildIndex.mockReturnValue(fakeIndex);
    mockReadFileSync.mockReturnValue(JSON.stringify(fakeIndex));

    loadIndex('/fake/workspace');

    expect(mockBuildIndex).toHaveBeenCalledWith('/fake/workspace');
  });

  it('isStale checks three watch paths: .nx/workspace-data/, tsconfig.base.json, nx.json', () => {
    const fakeIndex = { projects: {}, meta: { builtAt: '2026-01-01' } };
    const statCalls = [];

    mockStatSync.mockImplementation((filePath) => {
      statCalls.push(filePath);

      if (typeof filePath === 'string' && filePath.includes('workspace-index.json')) {
        return { mtimeMs: 2000 };
      }

      return { mtimeMs: 1000 };
    });

    mockReadFileSync.mockReturnValue(JSON.stringify(fakeIndex));

    loadIndex('/fake/workspace');

    const watchPathCalls = statCalls.filter(p =>
      p.includes('workspace-data') ||
      p.includes('tsconfig.base.json') ||
      p.includes('nx.json')
    );

    expect(watchPathCalls).toHaveLength(3);
  });

  it('isStale returns false when all watch paths are older than index', () => {
    const fakeIndex = { projects: {}, meta: { builtAt: '2026-01-01' } };

    mockStatSync.mockImplementation((filePath) => {
      if (typeof filePath === 'string' && filePath.includes('workspace-index.json')) {
        return { mtimeMs: 3000 };
      }

      return { mtimeMs: 1000 };
    });

    mockReadFileSync.mockReturnValue(JSON.stringify(fakeIndex));

    loadIndex('/fake/workspace');

    expect(mockBuildIndex).not.toHaveBeenCalled();
  });

  it('isStale handles missing watch paths gracefully (skip, do not crash)', () => {
    const fakeIndex = { projects: {}, meta: { builtAt: '2026-01-01' } };

    mockStatSync.mockImplementation((filePath) => {
      if (typeof filePath === 'string' && filePath.includes('workspace-index.json')) {
        return { mtimeMs: 2000 };
      }

      const err = new Error('ENOENT');
      err.code = 'ENOENT';
      throw err;
    });

    mockReadFileSync.mockReturnValue(JSON.stringify(fakeIndex));

    const result = loadIndex('/fake/workspace');

    expect(result).toEqual(fakeIndex);
    expect(mockBuildIndex).not.toHaveBeenCalled();
  });

  it('loadIndex triggers buildIndex when index does not exist (directory creation is handled by buildIndex)', () => {
    const fakeIndex = { projects: {}, meta: { builtAt: '2026-01-01' } };

    mockStatSync.mockImplementation((filePath) => {
      if (typeof filePath === 'string' && filePath.includes('workspace-index.json')) {
        const err = new Error('ENOENT');
        err.code = 'ENOENT';
        throw err;
      }

      return { mtimeMs: 1000 };
    });

    mockBuildIndex.mockReturnValue(fakeIndex);
    mockReadFileSync.mockReturnValue(JSON.stringify(fakeIndex));

    loadIndex('/fake/workspace');

    expect(mockBuildIndex).toHaveBeenCalled();
  });
});
