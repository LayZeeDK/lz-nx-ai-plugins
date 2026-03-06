import { describe, it, expect, vi } from 'vitest';

// Hoist mock references for node:child_process and node:fs
const { mockSpawnSync, mockReadFileSync } = vi.hoisted(() => ({
  mockSpawnSync: vi.fn(),
  mockReadFileSync: vi.fn(),
}));

// Mock node:child_process
vi.mock('node:child_process', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;

  return {
    ...actual,
    spawnSync: mockSpawnSync,
  };
});

// Mock node:fs
vi.mock('node:fs', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;

  return {
    ...actual,
    readFileSync: mockReadFileSync,
  };
});

// Hoist mock reference for runNx
const { mockRunNx } = vi.hoisted(() => ({
  mockRunNx: vi.fn(),
}));

// Mock nx-runner
vi.mock('#rlm/nx-runner.mjs', () => ({
  runNx: mockRunNx,
}));

// Fixture: workspace index matching the shape produced by transformGraphToIndex
const fixtureIndex = {
  projects: {
    'my-app': {
      root: 'apps/my-app',
      sourceRoot: 'apps/my-app/src',
      type: 'app',
      tags: ['type:app'],
      targets: { build: '@nx/webpack:webpack', test: '@nx/jest:jest' },
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
  },
  dependencies: {
    'my-app': [
      { target: 'shared-utils', type: 'static' },
      { target: 'feature-auth', type: 'static' },
    ],
    'shared-utils': [],
    'feature-auth': [{ target: 'shared-utils', type: 'static' }],
  },
  pathAliases: {},
  meta: { builtAt: '2026-01-01T00:00:00.000Z', projectCount: 3 },
};

// ─── repl-globals: BUILTIN_GLOBAL_NAMES ───

describe('repl-globals > BUILTIN_GLOBAL_NAMES', () => {
  async function setup() {
    const { BUILTIN_GLOBAL_NAMES } = await import(
      '#rlm/shared/repl-globals.mjs'
    );

    return { BUILTIN_GLOBAL_NAMES };
  }

  it('is a Set containing all 12 global names plus console', async () => {
    const { BUILTIN_GLOBAL_NAMES } = await setup();

    const expected = [
      'workspace',
      'projects',
      'deps',
      'dependents',
      'read',
      'files',
      'search',
      'nx',
      'print',
      'SHOW_VARS',
      'FINAL',
      'FINAL_VAR',
      'console',
    ];

    expect(BUILTIN_GLOBAL_NAMES).toBeInstanceOf(Set);

    for (const name of expected) {
      expect(BUILTIN_GLOBAL_NAMES.has(name)).toBe(true);
    }

    expect(BUILTIN_GLOBAL_NAMES.size).toBe(expected.length);
  });
});

// ─── repl-globals: createReplGlobals ───

describe('repl-globals > createReplGlobals > workspace and projects', () => {
  async function setup() {
    vi.clearAllMocks();
    const { createReplGlobals } = await import('#rlm/shared/repl-globals.mjs');
    const printCapture = { print: vi.fn(), getOutput: () => '', getTotalChars: () => 0 };
    const finalHandlers = {
      FINAL: vi.fn(),
      FINAL_VAR: vi.fn(),
      getFinalAnswer: () => null as string | null,
      getFinalVarName: () => null as string | null,
    };
    const globals = createReplGlobals(fixtureIndex, '/workspace', printCapture, finalHandlers);

    return { globals };
  }

  it('workspace returns the full index object', async () => {
    const { globals } = await setup();

    expect(globals.workspace).toBe(fixtureIndex);
  });

  it('projects returns index.projects', async () => {
    const { globals } = await setup();

    expect(globals.projects).toBe(fixtureIndex.projects);
  });
});

describe('repl-globals > createReplGlobals > deps', () => {
  async function setup() {
    vi.clearAllMocks();
    const { createReplGlobals } = await import('#rlm/shared/repl-globals.mjs');
    const printCapture = { print: vi.fn(), getOutput: () => '', getTotalChars: () => 0 };
    const finalHandlers = {
      FINAL: vi.fn(),
      FINAL_VAR: vi.fn(),
      getFinalAnswer: () => null as string | null,
      getFinalVarName: () => null as string | null,
    };
    const globals = createReplGlobals(fixtureIndex, '/workspace', printCapture, finalHandlers);

    return { globals };
  }

  it('returns dependency target names for valid project', async () => {
    const { globals } = await setup();

    expect(globals.deps('my-app')).toEqual(['shared-utils', 'feature-auth']);
  });

  it('returns empty array for project with no dependencies', async () => {
    const { globals } = await setup();

    expect(globals.deps('shared-utils')).toEqual([]);
  });

  it('returns error string for invalid project', async () => {
    const { globals } = await setup();

    const result = globals.deps('nonexistent');

    expect(result).toContain('[ERROR]');
    expect(result).toContain('nonexistent');
  });
});

describe('repl-globals > createReplGlobals > dependents', () => {
  async function setup() {
    vi.clearAllMocks();
    const { createReplGlobals } = await import('#rlm/shared/repl-globals.mjs');
    const printCapture = { print: vi.fn(), getOutput: () => '', getTotalChars: () => 0 };
    const finalHandlers = {
      FINAL: vi.fn(),
      FINAL_VAR: vi.fn(),
      getFinalAnswer: () => null as string | null,
      getFinalVarName: () => null as string | null,
    };
    const globals = createReplGlobals(fixtureIndex, '/workspace', printCapture, finalHandlers);

    return { globals };
  }

  it('returns projects that depend on shared-utils', async () => {
    const { globals } = await setup();
    const result = globals.dependents('shared-utils');

    expect(result).toContain('my-app');
    expect(result).toContain('feature-auth');
    expect(result.length).toBe(2);
  });

  it('returns empty array for project with no dependents', async () => {
    const { globals } = await setup();

    expect(globals.dependents('my-app')).toEqual([]);
  });

  it('returns error string for invalid project', async () => {
    const { globals } = await setup();

    const result = globals.dependents('nonexistent');

    expect(result).toContain('[ERROR]');
    expect(result).toContain('nonexistent');
  });
});

describe('repl-globals > createReplGlobals > read', () => {
  async function setup() {
    vi.clearAllMocks();
    const { createReplGlobals } = await import('#rlm/shared/repl-globals.mjs');
    const printCapture = { print: vi.fn(), getOutput: () => '', getTotalChars: () => 0 };
    const finalHandlers = {
      FINAL: vi.fn(),
      FINAL_VAR: vi.fn(),
      getFinalAnswer: () => null as string | null,
      getFinalVarName: () => null as string | null,
    };
    const globals = createReplGlobals(fixtureIndex, '/workspace', printCapture, finalHandlers);

    return { globals };
  }

  it('reads file content relative to workspaceRoot', async () => {
    const { globals } = await setup();

    mockReadFileSync.mockReturnValue('file content here');

    const result = globals.read('src/main.ts');

    expect(result).toBe('file content here');
  });

  it('returns error string on file read failure', async () => {
    const { globals } = await setup();

    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT: no such file');
    });

    const result = globals.read('nonexistent.ts');

    expect(result).toContain('[ERROR]');
  });

  it('returns lines from start to end when range provided', async () => {
    const { globals } = await setup();

    mockReadFileSync.mockReturnValue('line0\nline1\nline2\nline3\nline4');

    const result = globals.read('file.ts', 1, 3);

    expect(result).toBe('line1\nline2');
  });
});

describe('repl-globals > createReplGlobals > files', () => {
  async function setup() {
    vi.clearAllMocks();
    const { createReplGlobals } = await import('#rlm/shared/repl-globals.mjs');
    const printCapture = { print: vi.fn(), getOutput: () => '', getTotalChars: () => 0 };
    const finalHandlers = {
      FINAL: vi.fn(),
      FINAL_VAR: vi.fn(),
      getFinalAnswer: () => null as string | null,
      getFinalVarName: () => null as string | null,
    };
    const globals = createReplGlobals(fixtureIndex, '/workspace', printCapture, finalHandlers);

    return { globals };
  }

  it('runs git ls-files and returns matching paths', async () => {
    const { globals } = await setup();

    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: 'src/main.ts\nsrc/app.ts\n',
      stderr: '',
    });

    const result = globals.files('src/*.ts');

    expect(result).toEqual(['src/main.ts', 'src/app.ts']);
    expect(mockSpawnSync).toHaveBeenCalledWith(
      'git',
      ['ls-files', '--', 'src/*.ts'],
      expect.objectContaining({ cwd: '/workspace' }),
    );
  });

  it('returns empty array when no files match', async () => {
    const { globals } = await setup();

    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: '',
      stderr: '',
    });

    const result = globals.files('*.nonexistent');

    expect(result).toEqual([]);
  });
});

describe('repl-globals > createReplGlobals > search', () => {
  async function setup() {
    vi.clearAllMocks();
    const { createReplGlobals } = await import('#rlm/shared/repl-globals.mjs');
    const printCapture = { print: vi.fn(), getOutput: () => '', getTotalChars: () => 0 };
    const finalHandlers = {
      FINAL: vi.fn(),
      FINAL_VAR: vi.fn(),
      getFinalAnswer: () => null as string | null,
      getFinalVarName: () => null as string | null,
    };
    const globals = createReplGlobals(fixtureIndex, '/workspace', printCapture, finalHandlers);

    return { globals };
  }

  it('runs git grep and returns formatted results', async () => {
    const { globals } = await setup();

    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: 'src/main.ts:1:import { foo } from "bar";\nsrc/app.ts:5:const foo = 42;\n',
      stderr: '',
    });

    const result = globals.search('foo');

    expect(result).toContain('src/main.ts:1');
    expect(result).toContain('src/app.ts:5');
  });

  it('returns "No matches" when git grep finds nothing (status 1)', async () => {
    const { globals } = await setup();

    mockSpawnSync.mockReturnValue({
      status: 1,
      stdout: '',
      stderr: '',
    });

    const result = globals.search('zzz_nonexistent');

    expect(result).toBe('No matches');
  });

  it('returns error for git grep status > 1', async () => {
    const { globals } = await setup();

    mockSpawnSync.mockReturnValue({
      status: 2,
      stdout: '',
      stderr: 'fatal: bad pattern',
    });

    const result = globals.search('bad[pattern');

    expect(result).toContain('[ERROR]');
  });

  it('truncates results to 50 lines when more are returned', async () => {
    const { globals } = await setup();
    const lines = Array.from({ length: 60 }, (_, i) => `file.ts:${i}:match line ${i}`);

    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: lines.join('\n') + '\n',
      stderr: '',
    });

    const result = globals.search('match');
    const resultLines = result.split('\n');

    // Should have 50 lines of results + 1 truncation notice
    expect(resultLines.length).toBe(51);
    expect(resultLines[50]).toContain('60 total');
    expect(resultLines[50]).toContain('showing first 50');
  });

  it('scopes search to given paths', async () => {
    const { globals } = await setup();

    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: 'src/main.ts:1:foo\n',
      stderr: '',
    });

    globals.search('foo', ['src/']);

    expect(mockSpawnSync).toHaveBeenCalledWith(
      'git',
      ['grep', '-n', '--no-color', '-F', '--', 'foo', 'src/'],
      expect.objectContaining({ cwd: '/workspace' }),
    );
  });
});

describe('repl-globals > createReplGlobals > nx', () => {
  async function setup() {
    vi.clearAllMocks();
    const { createReplGlobals } = await import('#rlm/shared/repl-globals.mjs');
    const printCapture = { print: vi.fn(), getOutput: () => '', getTotalChars: () => 0 };
    const finalHandlers = {
      FINAL: vi.fn(),
      FINAL_VAR: vi.fn(),
      getFinalAnswer: () => null as string | null,
      getFinalVarName: () => null as string | null,
    };
    const globals = createReplGlobals(fixtureIndex, '/workspace', printCapture, finalHandlers);

    return { globals };
  }

  it('returns data on successful runNx call', async () => {
    const { globals } = await setup();

    mockRunNx.mockReturnValue({ data: 'project-a\nproject-b', error: null });

    const result = globals.nx('show projects');

    expect(result).toBe('project-a\nproject-b');
  });

  it('returns error string on failed runNx call', async () => {
    const { globals } = await setup();

    mockRunNx.mockReturnValue({ data: null, error: '[ERROR] Command not allowed: nx bad-cmd' });

    const result = globals.nx('bad-cmd');

    expect(result).toContain('[ERROR]');
  });
});

describe('repl-globals > createReplGlobals > print, FINAL, FINAL_VAR', () => {
  async function setup() {
    vi.clearAllMocks();
    const { createReplGlobals } = await import('#rlm/shared/repl-globals.mjs');
    const printCapture = { print: vi.fn(), getOutput: () => '', getTotalChars: () => 0 };
    const finalFn = vi.fn();
    const finalVarFn = vi.fn();
    const finalHandlers = {
      FINAL: finalFn,
      FINAL_VAR: finalVarFn,
      getFinalAnswer: () => null as string | null,
      getFinalVarName: () => null as string | null,
    };
    const globals = createReplGlobals(fixtureIndex, '/workspace', printCapture, finalHandlers);

    return { globals, printCapture, finalFn, finalVarFn };
  }

  it('print is the printCapture.print function', async () => {
    const { globals, printCapture } = await setup();

    expect(globals.print).toBe(printCapture.print);
  });

  it('FINAL calls finalHandlers.FINAL', async () => {
    const { globals, finalFn } = await setup();

    globals.FINAL('the answer');

    expect(finalFn).toHaveBeenCalledWith('the answer');
  });

  it('FINAL_VAR calls finalHandlers.FINAL_VAR', async () => {
    const { globals, finalVarFn } = await setup();

    globals.FINAL_VAR('results');

    expect(finalVarFn).toHaveBeenCalledWith('results');
  });
});

describe('repl-globals > createReplGlobals > SHOW_VARS', () => {
  async function setup() {
    vi.clearAllMocks();
    const { createReplGlobals, BUILTIN_GLOBAL_NAMES } = await import(
      '#rlm/shared/repl-globals.mjs'
    );
    const printCapture = { print: vi.fn(), getOutput: () => '', getTotalChars: () => 0 };
    const finalHandlers = {
      FINAL: vi.fn(),
      FINAL_VAR: vi.fn(),
      getFinalAnswer: () => null as string | null,
      getFinalVarName: () => null as string | null,
    };

    return { createReplGlobals, BUILTIN_GLOBAL_NAMES, printCapture, finalHandlers };
  }

  it('returns formatted variable list excluding builtins', async () => {
    const { createReplGlobals, printCapture, finalHandlers } = await setup();
    const globals = createReplGlobals(fixtureIndex, '/workspace', printCapture, finalHandlers);

    // Simulate a sandbox with user variables + builtins
    const sandbox: Record<string, unknown> = {
      ...globals,
      console: { log: globals.print },
      count: 42,
      name: 'test',
      items: [1, 2, 3],
      helperFn: vi.fn(),
    };

    // SHOW_VARS needs to be given the sandbox reference
    // The factory should accept it or return a function that takes it
    const result = globals.SHOW_VARS(sandbox);

    expect(result).toContain('Variables:');
    expect(result).toContain('count');
    expect(result).toContain('number');
    expect(result).toContain('name');
    expect(result).toContain('string');
    expect(result).toContain('items');
    // Should exclude builtins
    expect(result).not.toContain('workspace (');
    expect(result).not.toContain('projects (');
    expect(result).not.toContain('deps (');
    expect(result).not.toContain('print (');
    expect(result).not.toContain('console (');
    // Should exclude functions
    expect(result).not.toContain('helperFn');
  });

  it('returns "Variables: (none)" when no user variables exist', async () => {
    const { createReplGlobals, printCapture, finalHandlers } = await setup();
    const globals = createReplGlobals(fixtureIndex, '/workspace', printCapture, finalHandlers);

    // Sandbox with only builtins
    const sandbox: Record<string, unknown> = {
      ...globals,
      console: { log: globals.print },
    };

    const result = globals.SHOW_VARS(sandbox);

    expect(result).toContain('Variables:');
    expect(result).toContain('(none)');
  });
});
