import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist mock references for loadConfig
const { mockLoadConfig } = vi.hoisted(() => ({
  mockLoadConfig: vi.fn(),
}));

// Mock rlm-config to control loadConfig behavior
vi.mock('#rlm/rlm-config.mjs', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;

  return {
    ...actual,
    loadConfig: mockLoadConfig,
  };
});

// Use a unique temp directory for test session files
const TEST_TMP = join(tmpdir(), 'repl-sandbox-test-' + Date.now());

// Minimal fixture workspace index for sandbox tests
const fixtureIndex = {
  projects: {
    'my-app': {
      root: 'apps/my-app',
      sourceRoot: 'apps/my-app/src',
      type: 'app',
      tags: [],
      targets: {},
    },
  },
  dependencies: { 'my-app': [] },
  pathAliases: {},
  meta: { builtAt: '2026-01-01T00:00:00.000Z', projectCount: 1 },
};

// Write a temp index file for all tests to share
let indexPath: string;

beforeEach(() => {
  vi.clearAllMocks();
  mkdirSync(TEST_TMP, { recursive: true });
  indexPath = join(TEST_TMP, 'workspace-index.json');
  writeFileSync(indexPath, JSON.stringify(fixtureIndex), 'utf8');

  // Default: loadConfig returns DEFAULTS-like values
  mockLoadConfig.mockReturnValue({
    maxIterations: 20,
    maxTimeout: 120,
    maxConsecutiveErrors: 3,
    maxStaleOutputs: 3,
    maxNoCodeTurns: 3,
    maxDepth: 2,
  });
});

// ─── repl-sandbox: executeSandbox - basic execution ───

describe('repl-sandbox > executeSandbox > basic execution', () => {
  async function setup() {
    const { executeSandbox } = await import('#rlm/repl-sandbox.mjs');

    return { executeSandbox };
  }

  it('executes simple print and returns output in SandboxResult', async () => {
    const { executeSandbox } = await setup();

    const result = executeSandbox('print("hello")', {
      indexPath,
      timeout: 5000,
    });

    expect(result.output).toBe('hello');
    expect(result.error).toBeNull();
    expect(result.final).toBeNull();
    expect(result.finalVar).toBeNull();
  });

  it('returns correct SandboxResult schema fields', async () => {
    const { executeSandbox } = await setup();

    const result = executeSandbox('print("test")', {
      indexPath,
      timeout: 5000,
    });

    expect(result).toHaveProperty('output');
    expect(result).toHaveProperty('variables');
    expect(result).toHaveProperty('final');
    expect(result).toHaveProperty('finalVar');
    expect(result).toHaveProperty('error');
    expect(typeof result.output).toBe('string');
    expect(typeof result.variables).toBe('object');
  });
});

// ─── repl-sandbox: executeSandbox - variables ───

describe('repl-sandbox > executeSandbox > variables', () => {
  async function setup() {
    const { executeSandbox } = await import('#rlm/repl-sandbox.mjs');

    return { executeSandbox };
  }

  it('persists const/let/var declarations in variables via code transform', async () => {
    const { executeSandbox } = await setup();

    const result = executeSandbox('const x = 42; print(x)', {
      indexPath,
      timeout: 5000,
    });

    expect(result.output).toBe('42');
    expect(result.variables).toHaveProperty('x', 42);
  });

  it('session state restores variables from previous turn', async () => {
    const { executeSandbox } = await setup();
    const sessionPath = join(TEST_TMP, 'session-persist.json');

    // First turn: set a variable
    executeSandbox('const x = 42;', {
      indexPath,
      sessionPath,
      timeout: 5000,
    });

    // Second turn: read the variable
    const result = executeSandbox('print(x)', {
      indexPath,
      sessionPath,
      timeout: 5000,
    });

    expect(result.output).toBe('42');
  });

  it('writes session state after execution', async () => {
    const { executeSandbox } = await import('#rlm/repl-sandbox.mjs');
    const { readFileSync } = await import('node:fs');
    const sessionPath = join(TEST_TMP, 'session-write.json');

    executeSandbox('const count = 99;', {
      indexPath,
      sessionPath,
      timeout: 5000,
    });

    const sessionData = JSON.parse(readFileSync(sessionPath, 'utf8'));

    expect(sessionData).toHaveProperty('count', 99);
  });
});

// ─── repl-sandbox: executeSandbox - FINAL and FINAL_VAR ───

describe('repl-sandbox > executeSandbox > FINAL and FINAL_VAR', () => {
  async function setup() {
    const { executeSandbox } = await import('#rlm/repl-sandbox.mjs');

    return { executeSandbox };
  }

  it('FINAL sets the final answer in result', async () => {
    const { executeSandbox } = await setup();

    const result = executeSandbox('FINAL("answer is 42")', {
      indexPath,
      timeout: 5000,
    });

    expect(result.final).toBe('answer is 42');
  });

  it('FINAL_VAR sets the final variable name in result', async () => {
    const { executeSandbox } = await setup();

    const result = executeSandbox('FINAL_VAR("results")', {
      indexPath,
      timeout: 5000,
    });

    expect(result.finalVar).toBe('results');
  });

  it('both FINAL and FINAL_VAR can be set in same turn', async () => {
    const { executeSandbox } = await setup();

    const result = executeSandbox(
      'FINAL("done"); FINAL_VAR("answer")',
      { indexPath, timeout: 5000 },
    );

    expect(result.final).toBe('done');
    expect(result.finalVar).toBe('answer');
  });
});

// ─── repl-sandbox: executeSandbox - error handling ───

describe('repl-sandbox > executeSandbox > error handling', () => {
  async function setup() {
    const { executeSandbox } = await import('#rlm/repl-sandbox.mjs');

    return { executeSandbox };
  }

  it('captures thrown errors in result.error', async () => {
    const { executeSandbox } = await setup();

    const result = executeSandbox('throw new Error("boom")', {
      indexPath,
      timeout: 5000,
    });

    expect(result.error).toContain('boom');
  });

  it('captures ReferenceError for undefined variables', async () => {
    const { executeSandbox } = await setup();

    const result = executeSandbox('undefinedVar.toString()', {
      indexPath,
      timeout: 5000,
    });

    expect(result.error).toBeTruthy();
  });
});

// ─── repl-sandbox: executeSandbox - timeout ───

describe('repl-sandbox > executeSandbox > timeout', () => {
  async function setup() {
    const { executeSandbox } = await import('#rlm/repl-sandbox.mjs');

    return { executeSandbox };
  }

  it('times out on infinite loops', async () => {
    const { executeSandbox } = await setup();

    const result = executeSandbox('while(true){}', {
      indexPath,
      timeout: 100,
    });

    expect(result.error).toBeTruthy();
    expect(result.error!.toLowerCase()).toContain('timed out');
  });
});

// ─── repl-sandbox: executeSandbox - security ───

describe('repl-sandbox > executeSandbox > security', () => {
  async function setup() {
    const { executeSandbox } = await import('#rlm/repl-sandbox.mjs');

    return { executeSandbox };
  }

  it('blocks eval() with code generation error', async () => {
    const { executeSandbox } = await setup();

    const result = executeSandbox('eval("1+1")', {
      indexPath,
      timeout: 5000,
    });

    expect(result.error).toBeTruthy();
    expect(result.error!.toLowerCase()).toMatch(/code generation from strings/i);
  });
});

// ─── repl-sandbox: executeSandbox - Object.prototype.toString patch ───

describe('repl-sandbox > executeSandbox > toString patch', () => {
  async function setup() {
    const { executeSandbox } = await import('#rlm/repl-sandbox.mjs');

    return { executeSandbox };
  }

  it('patches Object.prototype.toString to return JSON', async () => {
    const { executeSandbox } = await setup();

    const result = executeSandbox('print("val: " + {a:1})', {
      indexPath,
      timeout: 5000,
    });

    // Should contain JSON representation, not "[object Object]"
    expect(result.output).not.toContain('[object Object]');
    expect(result.output).toContain('"a"');
  });
});

// ─── repl-sandbox: executeSandbox - SHOW_VARS integration ───

describe('repl-sandbox > executeSandbox > SHOW_VARS integration', () => {
  async function setup() {
    const { executeSandbox } = await import('#rlm/repl-sandbox.mjs');

    return { executeSandbox };
  }

  it('SHOW_VARS works inside sandbox code', async () => {
    const { executeSandbox } = await setup();

    const result = executeSandbox(
      'const x = 42;\nconst name = "test";\nprint(SHOW_VARS())',
      { indexPath, timeout: 5000 },
    );

    expect(result.output).toContain('Variables:');
    expect(result.output).toContain('x');
    expect(result.output).toContain('name');
  });
});

// ─── repl-sandbox: executeSandbox - config-driven timeout ───

describe('repl-sandbox > executeSandbox > config-driven timeout', () => {
  async function setup() {
    const { executeSandbox } = await import('#rlm/repl-sandbox.mjs');

    return { executeSandbox };
  }

  it('calls loadConfig when options.timeout is absent', async () => {
    const { executeSandbox } = await setup();

    mockLoadConfig.mockReturnValue({
      maxIterations: 20,
      maxTimeout: 120,
      maxConsecutiveErrors: 3,
      maxStaleOutputs: 3,
      maxNoCodeTurns: 3,
      maxDepth: 2,
    });

    // Run without timeout option
    executeSandbox('print("hello")', {
      indexPath,
      pluginRoot: '/fake/plugin',
      workspaceRoot: '/fake/workspace',
    });

    expect(mockLoadConfig).toHaveBeenCalledWith('/fake/plugin', '/fake/workspace');
  });

  it('does NOT call loadConfig when options.timeout is provided', async () => {
    const { executeSandbox } = await setup();

    executeSandbox('print("hello")', {
      indexPath,
      timeout: 5000,
    });

    expect(mockLoadConfig).not.toHaveBeenCalled();
  });

  it('uses config.maxTimeout * 1000 as VM timeout when options.timeout absent', async () => {
    const { executeSandbox } = await setup();

    // Set a very short timeout via config to trigger timeout on infinite loop
    mockLoadConfig.mockReturnValue({
      maxIterations: 20,
      maxTimeout: 0.1, // 100ms
      maxConsecutiveErrors: 3,
      maxStaleOutputs: 3,
      maxNoCodeTurns: 3,
      maxDepth: 2,
    });

    const result = executeSandbox('while(true){}', {
      indexPath,
      pluginRoot: '/fake/plugin',
      workspaceRoot: '/fake/workspace',
    });

    expect(result.error).toBeTruthy();
    expect(result.error!.toLowerCase()).toContain('timed out');
  });

  it('uses DEFAULTS.maxTimeout when both pluginRoot and workspaceRoot are absent', async () => {
    const { executeSandbox } = await setup();

    // loadConfig with nulls should return DEFAULTS
    mockLoadConfig.mockReturnValue({
      maxIterations: 20,
      maxTimeout: 120,
      maxConsecutiveErrors: 3,
      maxStaleOutputs: 3,
      maxNoCodeTurns: 3,
      maxDepth: 2,
    });

    // Just verify it runs without error (timeout would be 120 * 1000 = 120000ms)
    const result = executeSandbox('print("ok")', { indexPath });

    expect(result.output).toBe('ok');
    expect(result.error).toBeNull();
    expect(mockLoadConfig).toHaveBeenCalledWith('', '');
  });
});

// ─── repl-sandbox: executeSandbox - no indexPath ───

describe('repl-sandbox > executeSandbox > no indexPath', () => {
  async function setup() {
    const { executeSandbox } = await import('#rlm/repl-sandbox.mjs');

    return { executeSandbox };
  }

  it('works without indexPath (empty workspace)', async () => {
    const { executeSandbox } = await setup();

    const result = executeSandbox('print("hello")', {
      timeout: 5000,
    });

    expect(result.output).toBe('hello');
    expect(result.error).toBeNull();
  });
});
