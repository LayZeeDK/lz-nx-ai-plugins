import { describe, it, expect, vi } from 'vitest';

// Hoist mock references
const { mockReadFileSync, mockWriteFileSync, mockMkdirSync } = vi.hoisted(
  () => ({
    mockReadFileSync: vi.fn(),
    mockWriteFileSync: vi.fn(),
    mockMkdirSync: vi.fn(),
  }),
);

// Mock node:fs
vi.mock('node:fs', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;

  return {
    ...actual,
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
    mkdirSync: mockMkdirSync,
  };
});

// ─── repl-session: readSession and writeSession ───

describe('repl-session > readSession', () => {
  async function setup() {
    vi.clearAllMocks();
    const { readSession } = await import('#rlm/repl-session.mjs');

    return { readSession };
  }

  it('returns {} for nonexistent file', async () => {
    const { readSession } = await setup();

    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const result = readSession('/fake/session.json');

    expect(result).toEqual({});
  });

  it('returns parsed object for valid JSON', async () => {
    const { readSession } = await setup();
    const state = { count: 42, name: 'test' };

    mockReadFileSync.mockReturnValue(JSON.stringify(state));

    const result = readSession('/fake/session.json');

    expect(result).toEqual(state);
  });

  it('returns {} for invalid JSON', async () => {
    const { readSession } = await setup();

    mockReadFileSync.mockReturnValue('not valid json {{{');

    const result = readSession('/fake/session.json');

    expect(result).toEqual({});
  });
});

describe('repl-session > writeSession', () => {
  async function setup() {
    vi.clearAllMocks();
    const { writeSession } = await import('#rlm/repl-session.mjs');

    return { writeSession };
  }

  it('creates parent directory if needed', async () => {
    const { writeSession } = await setup();
    const sandbox = { x: 1 };
    const builtins = new Set<string>();

    writeSession('/fake/dir/session.json', sandbox, builtins);

    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('fake'),
      { recursive: true },
    );
  });

  it('excludes builtin names from state', async () => {
    const { writeSession } = await setup();
    const sandbox = { workspace: { projects: {} }, x: 1, print: () => {} };
    const builtins = new Set(['workspace', 'print']);

    writeSession('/fake/session.json', sandbox, builtins);

    const writtenJson = mockWriteFileSync.mock.calls[0][1] as string;
    const written = JSON.parse(writtenJson);

    expect(written).toEqual({ x: 1 });
    expect(written).not.toHaveProperty('workspace');
    expect(written).not.toHaveProperty('print');
  });

  it('excludes functions from state', async () => {
    const { writeSession } = await setup();
    const sandbox = {
      myFn: () => 42,
      count: 5,
    };
    const builtins = new Set<string>();

    writeSession('/fake/session.json', sandbox, builtins);

    const writtenJson = mockWriteFileSync.mock.calls[0][1] as string;
    const written = JSON.parse(writtenJson);

    expect(written).toEqual({ count: 5 });
    expect(written).not.toHaveProperty('myFn');
  });

  it('excludes values that fail JSON.stringify (circular refs)', async () => {
    const { writeSession } = await setup();
    const circular: Record<string, unknown> = { name: 'test' };
    circular.self = circular;
    const sandbox = { circular, safe: 'hello' };
    const builtins = new Set<string>();

    writeSession('/fake/session.json', sandbox, builtins);

    const writtenJson = mockWriteFileSync.mock.calls[0][1] as string;
    const written = JSON.parse(writtenJson);

    expect(written).toEqual({ safe: 'hello' });
    expect(written).not.toHaveProperty('circular');
  });

  it('preserves strings, numbers, booleans, null, arrays, plain objects', async () => {
    const { writeSession } = await setup();
    const sandbox = {
      str: 'hello',
      num: 42,
      bool: true,
      nil: null,
      arr: [1, 2, 3],
      obj: { a: 1, b: 'two' },
    };
    const builtins = new Set<string>();

    writeSession('/fake/session.json', sandbox, builtins);

    const writtenJson = mockWriteFileSync.mock.calls[0][1] as string;
    const written = JSON.parse(writtenJson);

    expect(written).toEqual(sandbox);
  });

  it('round-trip: writeSession then readSession returns the same serializable state', async () => {
    const { writeSession } = await setup();
    const { readSession } = await import('#rlm/repl-session.mjs');
    const sandbox = {
      count: 42,
      name: 'test',
      items: [1, 2, 3],
      config: { nested: true },
    };
    const builtins = new Set<string>();

    writeSession('/fake/session.json', sandbox, builtins);

    const writtenJson = mockWriteFileSync.mock.calls[0][1] as string;

    // Simulate readSession reading what was written
    mockReadFileSync.mockReturnValue(writtenJson);

    const result = readSession('/fake/session.json');

    expect(result).toEqual(sandbox);
  });
});
