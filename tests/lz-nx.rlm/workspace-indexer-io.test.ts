import { createRequire } from 'node:module';
import { describe, it, expect, vi } from 'vitest';

interface NodeError extends Error {
  code?: string;
}

// Load fixtures using createRequire (not affected by vi.mock hoisting)
const require = createRequire(import.meta.url);
const graphFixture = require('./fixtures/graph-output.json');
const tsconfigFixture = require('./fixtures/tsconfig-base.json');

// Hoist mock references so they're accessible inside vi.mock factories
const { mockReadFileSync, mockWriteFileSync, mockMkdirSync, mockStatSync } =
  vi.hoisted(() => ({
    mockReadFileSync: vi.fn(),
    mockWriteFileSync: vi.fn(),
    mockMkdirSync: vi.fn(),
    mockStatSync: vi.fn(),
  }));

const { mockRunNxGraph } = vi.hoisted(() => ({
  mockRunNxGraph: vi.fn(),
}));

// Mock node:fs at the file level (hoisted)
vi.mock('node:fs', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;

  return {
    ...actual,
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
    mkdirSync: mockMkdirSync,
    statSync: mockStatSync,
  };
});

// Mock nx-runner
vi.mock('#rlm/nx-runner.mjs', () => ({
  runNxGraph: mockRunNxGraph,
}));

// Mock output-format to suppress output during tests
vi.mock('#rlm/shared/output-format.mjs', () => ({
  info: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}));

// ─── readPathAliases (needs fs mock) ───

describe('workspace-indexer > readPathAliases', () => {
  async function setup() {
    vi.clearAllMocks();
    const { readPathAliases } = await import('#rlm/workspace-indexer.mjs');

    return { readPathAliases };
  }

  it('reads tsconfig.base.json and returns alias->paths map preserving full arrays', async () => {
    const { readPathAliases } = await setup();
    mockReadFileSync.mockReturnValue(JSON.stringify(tsconfigFixture));

    const aliases = readPathAliases('/fake/workspace');

    expect(aliases['@myorg/shared-utils']).toEqual([
      'libs/shared-utils/src/index.ts',
    ]);
    expect(aliases['@myorg/feature-auth']).toEqual([
      'libs/feature-auth/src/index.ts',
    ]);
  });

  it('ignores wildcard patterns (entries containing "*")', async () => {
    const { readPathAliases } = await setup();
    mockReadFileSync.mockReturnValue(JSON.stringify(tsconfigFixture));

    const aliases = readPathAliases('/fake/workspace');

    expect(aliases['@myorg/my-app/*']).toBeUndefined();
  });

  it('falls back to tsconfig.json if tsconfig.base.json missing', async () => {
    const { readPathAliases } = await setup();
    const fallbackTsconfig = {
      compilerOptions: {
        baseUrl: '.',
        paths: { '@fallback/lib': ['libs/fallback/src/index.ts'] },
      },
    };

    mockReadFileSync.mockImplementation((filePath) => {
      if (
        typeof filePath === 'string' &&
        filePath.includes('tsconfig.base.json')
      ) {
        const err: NodeError = new Error('ENOENT');
        err.code = 'ENOENT';
        throw err;
      }

      return JSON.stringify(fallbackTsconfig);
    });

    const aliases = readPathAliases('/fake/workspace');

    expect(aliases['@fallback/lib']).toEqual(['libs/fallback/src/index.ts']);
  });

  it('returns empty object if no tsconfig files exist', async () => {
    const { readPathAliases } = await setup();
    mockReadFileSync.mockImplementation(() => {
      const err: NodeError = new Error('ENOENT');
      err.code = 'ENOENT';
      throw err;
    });

    const aliases = readPathAliases('/fake/workspace');

    expect(aliases).toEqual({});
  });

  it('preserves all entries in each path array (TypeScript fallback resolution)', async () => {
    const { readPathAliases } = await setup();
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

  it('for "@myorg/shared-utils" returns single-element array preserved as array', async () => {
    const { readPathAliases } = await setup();
    mockReadFileSync.mockReturnValue(JSON.stringify(tsconfigFixture));

    const aliases = readPathAliases('/fake/workspace');

    expect(Array.isArray(aliases['@myorg/shared-utils'])).toBe(true);
    expect(aliases['@myorg/shared-utils']).toHaveLength(1);
    expect(aliases['@myorg/shared-utils']).toEqual([
      'libs/shared-utils/src/index.ts',
    ]);
  });
});

// ─── buildIndex (needs fs + nx-runner mocks) ───

describe('workspace-indexer > buildIndex', () => {
  async function setup() {
    vi.clearAllMocks();
    const { buildIndex } = await import('#rlm/workspace-indexer.mjs');

    return { buildIndex };
  }

  it('calls runNxGraph, transforms result, writes index to tmp/lz-nx.rlm/workspace-index.json', async () => {
    const { buildIndex } = await setup();
    mockRunNxGraph.mockReturnValue({ data: graphFixture, error: null });

    // readPathAliases will try to read tsconfig.base.json -- return ENOENT
    mockReadFileSync.mockImplementation(() => {
      const err: NodeError = new Error('ENOENT');
      err.code = 'ENOENT';
      throw err;
    });

    const result = buildIndex('/fake/workspace');

    expect(mockRunNxGraph).toHaveBeenCalled();
    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('lz-nx.rlm'),
      { recursive: true },
    );
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('workspace-index.json'),
      expect.any(String),
      'utf8',
    );
    expect(result.projects).toBeDefined();
    expect(result.meta.projectCount).toBe(4);
  });

  it('throws when runNxGraph returns an error', async () => {
    const { buildIndex } = await setup();
    mockRunNxGraph.mockReturnValue({ data: null, error: 'graph failed' });

    expect(() => buildIndex('/fake/workspace')).toThrow();
  });
});
