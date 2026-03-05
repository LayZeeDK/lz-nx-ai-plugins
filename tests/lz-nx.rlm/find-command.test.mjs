import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mock child_process.spawnSync ───
const { mockSpawnSync } = vi.hoisted(() => {
  return { mockSpawnSync: vi.fn() };
});

vi.mock('node:child_process', () => ({
  spawnSync: mockSpawnSync,
}));

// ─── Fixture: workspace index matching graph-output.json structure ───
const fixtureIndex = {
  projects: {
    'my-app': {
      root: 'apps/my-app',
      sourceRoot: 'apps/my-app/src',
      type: 'app',
      tags: ['type:app'],
      targets: { build: '@nx/webpack:webpack' },
    },
    'shared-utils': {
      root: 'libs/shared-utils',
      sourceRoot: 'libs/shared-utils/src',
      type: 'lib',
      tags: ['type:util'],
      targets: { build: '@nx/js:tsc' },
    },
    'feature-auth': {
      root: 'libs/feature-auth',
      sourceRoot: 'libs/feature-auth/src',
      type: 'lib',
      tags: ['scope:auth'],
      targets: { build: '@nx/js:tsc' },
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
    'feature-auth': [
      { target: 'shared-utils', type: 'static' },
    ],
    'my-app-e2e': [
      { target: 'my-app', type: 'implicit' },
    ],
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

describe('find-command > runFind', () => {
  let runFind;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('#rlm/find-command.mjs');
    runFind = mod.runFind;
  });

  it('without --project runs git grep across entire workspace', () => {
    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: 'apps/my-app/src/main.ts:15:import { something } from \'@myorg/shared-utils\';\n',
      stderr: '',
    });

    const { output, exitCode } = runFind('something', fixtureIndex, {}, '/workspace');

    expect(exitCode).toBe(0);
    expect(mockSpawnSync).toHaveBeenCalledOnce();
    // Should not include specific sourceRoot paths (searches entire workspace)
    const callArgs = mockSpawnSync.mock.calls[0][1];
    const separatorIdx = callArgs.indexOf('--');

    // After '--' separator: pattern, then no sourceRoot paths for unscoped
    expect(callArgs[separatorIdx + 1]).toBe('something');
  });

  it('with --project scopes git grep to project sourceRoot', () => {
    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: 'apps/my-app/src/main.ts:15:import { something } from \'@myorg/shared-utils\';\n',
      stderr: '',
    });

    const { output, exitCode } = runFind('something', fixtureIndex, { project: 'my-app' }, '/workspace');

    expect(exitCode).toBe(0);
    const callArgs = mockSpawnSync.mock.calls[0][1];
    const separatorIdx = callArgs.indexOf('--');

    // After '--' separator: pattern, then sourceRoot paths
    expect(callArgs.slice(separatorIdx + 2)).toContain('apps/my-app/src');
  });

  it('with --project glob scopes to all matching project sourceRoots', () => {
    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: 'libs/shared-utils/src/index.ts:3:export function something() {\n',
      stderr: '',
    });

    const { output, exitCode } = runFind('something', fixtureIndex, { project: 'shared-*' }, '/workspace');

    expect(exitCode).toBe(0);
    const callArgs = mockSpawnSync.mock.calls[0][1];
    const separatorIdx = callArgs.indexOf('--');

    expect(callArgs.slice(separatorIdx + 2)).toContain('libs/shared-utils/src');
  });

  it('unscoped search truncates results at 20 matches with warning', () => {
    // Generate 25 match lines
    const matchLines = [];

    for (let i = 0; i < 25; i++) {
      matchLines.push('apps/my-app/src/file' + i + '.ts:' + (i + 1) + ':const pattern = "test";');
    }

    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: matchLines.join('\n') + '\n',
      stderr: '',
    });

    const { output, exitCode } = runFind('test', fixtureIndex, {}, '/workspace');

    expect(exitCode).toBe(0);
    // Should truncate and show warning
    expect(output).toContain('20');
    expect(output).toContain('25');
    expect(output).toMatch(/--project/);
  });

  it('--project scoped search shows all results (no truncation)', () => {
    const matchLines = [];

    for (let i = 0; i < 25; i++) {
      matchLines.push('apps/my-app/src/file' + i + '.ts:' + (i + 1) + ':const pattern = "test";');
    }

    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: matchLines.join('\n') + '\n',
      stderr: '',
    });

    const { output, exitCode } = runFind('test', fixtureIndex, { project: 'my-app' }, '/workspace');

    expect(exitCode).toBe(0);
    // Should not contain truncation warning
    expect(output).not.toMatch(/Showing \d+ of/);
  });

  it('fixed string matching by default (git grep -F flag)', () => {
    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: 'apps/my-app/src/main.ts:1:const x = "test";\n',
      stderr: '',
    });

    runFind('test.pattern', fixtureIndex, {}, '/workspace');

    const callArgs = mockSpawnSync.mock.calls[0][1];

    expect(callArgs).toContain('-F');
  });

  it('/pattern/ regex delimiters trigger regex mode (no -F flag)', () => {
    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: 'apps/my-app/src/main.ts:1:const x = "test";\n',
      stderr: '',
    });

    runFind('/test\\.pattern/', fixtureIndex, {}, '/workspace');

    const callArgs = mockSpawnSync.mock.calls[0][1];

    expect(callArgs).not.toContain('-F');
    // The pattern should have delimiters stripped
    const separatorIdx = callArgs.indexOf('--');

    expect(callArgs[separatorIdx + 1]).toBe('test\\.pattern');
  });

  it('--context N passes -C flag to git grep', () => {
    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: 'apps/my-app/src/main.ts:1:const x = "test";\n',
      stderr: '',
    });

    runFind('test', fixtureIndex, { context: 3 }, '/workspace');

    const callArgs = mockSpawnSync.mock.calls[0][1];

    expect(callArgs).toContain('-C3');
  });

  it('results grouped by project name with project header', () => {
    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: [
        'apps/my-app/src/main.ts:15:import { something } from \'@myorg/shared-utils\';',
        'apps/my-app/src/app.ts:8:import { auth } from \'@myorg/feature-auth\';',
        'libs/shared-utils/src/index.ts:3:export function something() {',
      ].join('\n') + '\n',
      stderr: '',
    });

    const { output } = runFind('import', fixtureIndex, {}, '/workspace');

    // Should have project headers
    expect(output).toContain('my-app');
    expect(output).toContain('shared-utils');
  });

  it('each result line shows "file:line: content" format', () => {
    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: 'apps/my-app/src/main.ts:15:import { something } from \'@myorg/shared-utils\';\n',
      stderr: '',
    });

    const { output } = runFind('import', fixtureIndex, {}, '/workspace');

    expect(output).toContain('apps/my-app/src/main.ts:15:');
  });

  it('summary footer with match count and project count', () => {
    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: [
        'apps/my-app/src/main.ts:15:import { something }',
        'libs/shared-utils/src/index.ts:3:export function something() {',
      ].join('\n') + '\n',
      stderr: '',
    });

    const { output } = runFind('something', fixtureIndex, {}, '/workspace');

    // Should have summary like "2 matches in 2 projects"
    expect(output).toMatch(/\d+ match(es)? in \d+ project/);
  });

  it('no matches returns informational message', () => {
    mockSpawnSync.mockReturnValue({
      status: 1,
      stdout: '',
      stderr: '',
    });

    const { output, exitCode } = runFind('nonexistent-xyz', fixtureIndex, {}, '/workspace');

    expect(exitCode).toBe(0);
    expect(output).toContain('No matches');
  });

  it('missing pattern argument returns error', () => {
    const { output, exitCode } = runFind(undefined, fixtureIndex, {}, '/workspace');

    expect(exitCode).toBe(1);
    expect(output).toContain('[ERROR]');
  });

  it('invalid --project name returns error with project count', () => {
    const { output, exitCode } = runFind('test', fixtureIndex, { project: 'nonexistent' }, '/workspace');

    expect(exitCode).toBe(1);
    expect(output).toContain('[ERROR]');
    expect(output).toContain('not found');
    expect(output).toContain('4 indexed');
  });

  it('git grep failure returns error message', () => {
    mockSpawnSync.mockReturnValue({
      status: 2,
      stdout: '',
      stderr: 'fatal: bad config',
    });

    const { output, exitCode } = runFind('test', fixtureIndex, {}, '/workspace');

    expect(exitCode).toBe(1);
    expect(output).toContain('[ERROR]');
  });
});
