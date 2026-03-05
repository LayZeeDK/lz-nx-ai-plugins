import { describe, it, expect, vi } from 'vitest';

// Hoist mock references so they're accessible inside vi.mock factories
const { mockReadFileSync } = vi.hoisted(() => ({
  mockReadFileSync: vi.fn(),
}));

// Mock node:fs
vi.mock('node:fs', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;

  return {
    ...actual,
    readFileSync: mockReadFileSync,
  };
});

// ─── rlm-config: loadConfig and DEFAULTS ───

describe('rlm-config > DEFAULTS', () => {
  async function setup() {
    const { DEFAULTS } = await import('#rlm/rlm-config.mjs');

    return { DEFAULTS };
  }

  it('exports DEFAULTS with all six guardrail values', async () => {
    const { DEFAULTS } = await setup();

    expect(DEFAULTS).toEqual({
      maxIterations: 20,
      maxTimeout: 120,
      maxConsecutiveErrors: 3,
      maxStaleOutputs: 3,
      maxNoCodeTurns: 3,
      maxDepth: 2,
    });
  });
});

describe('rlm-config > loadConfig', () => {
  async function setup() {
    vi.clearAllMocks();
    const { loadConfig, DEFAULTS } = await import('#rlm/rlm-config.mjs');

    return { loadConfig, DEFAULTS };
  }

  it('returns DEFAULTS when no config files exist on disk', async () => {
    const { loadConfig, DEFAULTS } = await setup();

    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const config = loadConfig('/fake/plugin', '/fake/workspace');

    expect(config).toEqual(DEFAULTS);
  });

  it('merges plugin config over DEFAULTS', async () => {
    const { loadConfig } = await setup();

    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.includes('plugin')) {
        return JSON.stringify({ maxIterations: 30 });
      }

      throw new Error('ENOENT');
    });

    const config = loadConfig('/fake/plugin', '/fake/workspace');

    expect(config.maxIterations).toBe(30);
    expect(config.maxTimeout).toBe(120); // from DEFAULTS
  });

  it('merges user config over DEFAULTS', async () => {
    const { loadConfig } = await setup();

    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.includes('.claude')) {
        return JSON.stringify({ maxTimeout: 60 });
      }

      throw new Error('ENOENT');
    });

    const config = loadConfig('/fake/plugin', '/fake/workspace');

    expect(config.maxTimeout).toBe(60);
    expect(config.maxIterations).toBe(20); // from DEFAULTS
  });

  it('merges DEFAULTS <- plugin <- user (user wins)', async () => {
    const { loadConfig } = await setup();

    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.includes('.claude')) {
        return JSON.stringify({ maxIterations: 10 });
      }

      if (filePath.includes('plugin')) {
        return JSON.stringify({ maxIterations: 30, maxTimeout: 60 });
      }

      throw new Error('ENOENT');
    });

    const config = loadConfig('/fake/plugin', '/fake/workspace');

    expect(config.maxIterations).toBe(10); // user wins over plugin
    expect(config.maxTimeout).toBe(60); // plugin wins over defaults
  });

  it('partial user config: other fields use defaults', async () => {
    const { loadConfig, DEFAULTS } = await setup();

    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.includes('.claude')) {
        return JSON.stringify({ maxIterations: 10 });
      }

      throw new Error('ENOENT');
    });

    const config = loadConfig('/fake/plugin', '/fake/workspace');

    expect(config.maxIterations).toBe(10);
    expect(config.maxTimeout).toBe(DEFAULTS.maxTimeout);
    expect(config.maxConsecutiveErrors).toBe(DEFAULTS.maxConsecutiveErrors);
    expect(config.maxStaleOutputs).toBe(DEFAULTS.maxStaleOutputs);
    expect(config.maxNoCodeTurns).toBe(DEFAULTS.maxNoCodeTurns);
    expect(config.maxDepth).toBe(DEFAULTS.maxDepth);
  });

  it('invalid JSON in config file: falls back gracefully (uses defaults)', async () => {
    const { loadConfig, DEFAULTS } = await setup();

    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.includes('plugin')) {
        return 'not valid json {{{';
      }

      throw new Error('ENOENT');
    });

    const config = loadConfig('/fake/plugin', '/fake/workspace');

    expect(config).toEqual(DEFAULTS);
  });
});
