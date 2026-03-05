import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock child_process before importing nx-runner
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

const { execSync } = await import('node:child_process');
const { runNx, runNxGraph } = await import('#rlm/nx-runner.mjs');

describe('nx-runner', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('CLAUDE_PROJECT_DIR', '/fake/workspace');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('runNx', () => {
    it('returns parsed JSON when expectJson is true', () => {
      const fakeGraph = { graph: { nodes: {}, dependencies: {} } };
      execSync.mockReturnValue(JSON.stringify(fakeGraph));

      const result = runNx('graph --print', { expectJson: true });

      expect(result.data).toEqual(fakeGraph);
      expect(result.error).toBeNull();
    });

    it('returns raw string when expectJson is false', () => {
      execSync.mockReturnValue('project1\nproject2\n');

      const result = runNx('show projects');

      expect(result.data).toBe('project1\nproject2\n');
      expect(result.error).toBeNull();
    });

    it('rejects disallowed commands', () => {
      const result = runNx('dangerous-command');

      expect(result.data).toBeNull();
      expect(result.error).toBe(
        '[ERROR] Command not allowed: nx dangerous-command',
      );
      expect(execSync).not.toHaveBeenCalled();
    });

    it('allows graph --print', () => {
      execSync.mockReturnValue('{}');

      runNx('graph --print');

      expect(execSync).toHaveBeenCalled();
    });

    it('allows show projects', () => {
      execSync.mockReturnValue('');

      runNx('show projects');

      expect(execSync).toHaveBeenCalled();
    });

    it('allows show project with extra args', () => {
      execSync.mockReturnValue('{}');

      runNx('show project my-app --json', { expectJson: true });

      expect(execSync).toHaveBeenCalled();
    });

    it('allows list', () => {
      execSync.mockReturnValue('');

      runNx('list');

      expect(execSync).toHaveBeenCalled();
    });

    it('allows report', () => {
      execSync.mockReturnValue('');

      runNx('report');

      expect(execSync).toHaveBeenCalled();
    });

    it('allows daemon', () => {
      execSync.mockReturnValue('');

      runNx('daemon');

      expect(execSync).toHaveBeenCalled();
    });

    it('rejects run command', () => {
      const result = runNx('run my-app:build');

      expect(result.data).toBeNull();
      expect(result.error).toContain('Command not allowed');
    });

    it('rejects generate command', () => {
      const result = runNx('generate @nx/react:app');

      expect(result.data).toBeNull();
      expect(result.error).toContain('Command not allowed');
    });

    it('rejects migrate command', () => {
      const result = runNx('migrate latest');

      expect(result.data).toBeNull();
      expect(result.error).toContain('Command not allowed');
    });

    it('rejects reset command on its own', () => {
      const result = runNx('reset');

      expect(result.data).toBeNull();
      expect(result.error).toContain('Command not allowed');
    });

    it('sets NX_TUI, NX_INTERACTIVE, NX_NO_CLOUD env vars', () => {
      execSync.mockReturnValue('');

      runNx('show projects');

      const callArgs = execSync.mock.calls[0];
      const options = callArgs[1];

      expect(options.env.NX_TUI).toBe('false');
      expect(options.env.NX_INTERACTIVE).toBe('false');
      expect(options.env.NX_NO_CLOUD).toBe('true');
    });

    it('defaults maxBuffer to 10MB', () => {
      execSync.mockReturnValue('');

      runNx('graph --print');

      const callArgs = execSync.mock.calls[0];
      const options = callArgs[1];

      expect(options.maxBuffer).toBe(10 * 1024 * 1024);
    });

    it('sets windowsHide to true', () => {
      execSync.mockReturnValue('');

      runNx('show projects');

      const callArgs = execSync.mock.calls[0];
      const options = callArgs[1];

      expect(options.windowsHide).toBe(true);
    });

    it('returns truncated error message on execSync failure', () => {
      const longError = 'E'.repeat(1000);
      const err = new Error('exec failed');
      err.stderr = longError;
      execSync.mockImplementation(() => {
        throw err;
      });

      const result = runNx('show projects');

      expect(result.data).toBeNull();
      expect(result.error).toHaveLength(500);
    });

    it('prefers stdout over stderr for error message extraction', () => {
      const err = new Error('exec failed');
      err.stdout = 'stdout error message';
      err.stderr = 'stderr error message';
      execSync.mockImplementation(() => {
        throw err;
      });

      const result = runNx('show projects');

      expect(result.error).toBe('stdout error message');
    });

    it('uses npx nx for command execution', () => {
      execSync.mockReturnValue('');

      runNx('show projects');

      const callArgs = execSync.mock.calls[0];

      expect(callArgs[0]).toBe('npx nx show projects');
    });

    it('uses CLAUDE_PROJECT_DIR as cwd', () => {
      execSync.mockReturnValue('');

      runNx('show projects');

      const callArgs = execSync.mock.calls[0];
      const options = callArgs[1];

      expect(options.cwd).toBe('/fake/workspace');
    });

    it('defaults timeout to 60000ms', () => {
      execSync.mockReturnValue('');

      runNx('show projects');

      const callArgs = execSync.mock.calls[0];
      const options = callArgs[1];

      expect(options.timeout).toBe(60000);
    });

    it('returns error when JSON parse fails with expectJson', () => {
      execSync.mockReturnValue('not valid json');

      const result = runNx('graph --print', { expectJson: true });

      expect(result.data).toBeNull();
      expect(result.error).toContain('Unexpected non-JSON output');
    });
  });

  describe('runNxGraph', () => {
    it('calls runNx with graph --print and expectJson true', () => {
      const fakeGraph = { graph: { nodes: {}, dependencies: {} } };
      execSync.mockReturnValue(JSON.stringify(fakeGraph));

      const result = runNxGraph();

      expect(result.data).toEqual(fakeGraph);
      expect(result.error).toBeNull();

      const callArgs = execSync.mock.calls[0];

      expect(callArgs[0]).toBe('npx nx graph --print');
    });

    it('retries once after nx reset on failure', () => {
      const fakeGraph = { graph: { nodes: {}, dependencies: {} } };

      // First call: graph --print fails
      // Second call: nx reset succeeds
      // Third call: graph --print succeeds
      execSync
        .mockImplementationOnce(() => {
          throw new Error('graph failed');
        })
        .mockImplementationOnce(() => '') // nx reset
        .mockReturnValueOnce(JSON.stringify(fakeGraph));

      const result = runNxGraph();

      expect(result.data).toEqual(fakeGraph);
      expect(result.error).toBeNull();

      // Verify nx reset was called between attempts
      expect(execSync.mock.calls).toHaveLength(3);
      expect(execSync.mock.calls[0][0]).toBe('npx nx graph --print');
      expect(execSync.mock.calls[1][0]).toBe('npx nx reset');
      expect(execSync.mock.calls[2][0]).toBe('npx nx graph --print');
    });

    it('returns error if retry also fails', () => {
      execSync
        .mockImplementationOnce(() => {
          throw new Error('first fail');
        })
        .mockImplementationOnce(() => '') // nx reset
        .mockImplementationOnce(() => {
          throw new Error('second fail');
        });

      const result = runNxGraph();

      expect(result.data).toBeNull();
      expect(result.error).toBeTruthy();
    });
  });
});

describe('output-format', () => {
  let info, warn, error, success;
  let stdoutSpy, stderrSpy;

  beforeEach(async () => {
    const mod = await import('#rlm/shared/output-format.mjs');
    info = mod.info;
    warn = mod.warn;
    error = mod.error;
    success = mod.success;

    stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it('info writes [INFO] message to stdout', () => {
    info('msg');

    expect(stdoutSpy).toHaveBeenCalledWith('[INFO] msg\n');
  });

  it('error writes [ERROR] message to stderr', () => {
    error('msg');

    expect(stderrSpy).toHaveBeenCalledWith('[ERROR] msg\n');
  });

  it('warn writes [WARN] message to stderr', () => {
    warn('msg');

    expect(stderrSpy).toHaveBeenCalledWith('[WARN] msg\n');
  });

  it('success writes [OK] message to stdout', () => {
    success('msg');

    expect(stdoutSpy).toHaveBeenCalledWith('[OK] msg\n');
  });

  it('does not contain emojis in output', () => {
    info('test');
    success('test');
    warn('test');
    error('test');

    const allCalls = [
      ...stdoutSpy.mock.calls.map((c) => c[0]),
      ...stderrSpy.mock.calls.map((c) => c[0]),
    ];

    for (const call of allCalls) {
      // Check no multi-byte Unicode characters (emoji range)
      const hasEmoji =
        /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{FE00}-\u{FE0F}]|[\u{1F900}-\u{1F9FF}]|[\u{200D}]|[\u{23CF}]|[\u{23E9}-\u{23F3}]|[\u{23F8}-\u{23FA}]|[\u{2934}-\u{2935}]|[\u{25AA}-\u{25FE}]|[\u{2B05}-\u{2B07}]|[\u{2B1B}-\u{2B1C}]|[\u{3030}]|[\u{303D}]|[\u{3297}]|[\u{3299}]/u.test(
          call,
        );

      expect(hasEmoji).toBe(false);
    }
  });
});
