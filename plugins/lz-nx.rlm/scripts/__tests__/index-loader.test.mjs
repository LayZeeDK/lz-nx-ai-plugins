import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoist mock references so they're accessible inside vi.mock factories
const { mockStatSync, mockReadFileSync } = vi.hoisted(() => ({
  mockStatSync: vi.fn(),
  mockReadFileSync: vi.fn(),
}));

const { mockBuildIndex } = vi.hoisted(() => ({
  mockBuildIndex: vi.fn(),
}));

// Mock node:fs
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    statSync: mockStatSync,
    readFileSync: mockReadFileSync,
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

// Mock workspace-indexer (index-loader imports buildIndex from it)
vi.mock('../workspace-indexer.mjs', () => ({
  buildIndex: mockBuildIndex,
  transformGraphToIndex: vi.fn(),
  readPathAliases: vi.fn(),
}));

// ─── index-loader ───

describe('index-loader', () => {
  let loadIndex;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../shared/index-loader.mjs');
    loadIndex = mod.loadIndex;
  });

  it('returns parsed index when file exists and is not stale', () => {
    const fakeIndex = { projects: {}, meta: { builtAt: '2026-01-01' } };

    mockStatSync.mockImplementation((filePath) => {
      if (typeof filePath === 'string' && filePath.includes('workspace-index.json')) {
        return { mtimeMs: 2000 };
      }

      // Watch paths: older than index
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

      // All watch paths missing
      const err = new Error('ENOENT');
      err.code = 'ENOENT';
      throw err;
    });

    mockReadFileSync.mockReturnValue(JSON.stringify(fakeIndex));

    const result = loadIndex('/fake/workspace');

    expect(result).toEqual(fakeIndex);
    expect(mockBuildIndex).not.toHaveBeenCalled();
  });

  it('loadIndex triggers buildIndex when index does not exist (directory creation handled by buildIndex)', () => {
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
