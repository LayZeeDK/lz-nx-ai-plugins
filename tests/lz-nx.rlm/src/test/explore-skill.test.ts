import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const SKILL_PATH = resolve(
  import.meta.dirname,
  '../../../../plugins/lz-nx.rlm/skills/explore/SKILL.md'
);

describe('explore-skill > file existence', () => {
  function setup() {
    const content = readFileSync(SKILL_PATH, 'utf8');

    return { content };
  }

  it('exists at plugins/lz-nx.rlm/skills/explore/SKILL.md', () => {
    const { content } = setup();

    expect(content).toBeTruthy();
  });
});

describe('explore-skill > YAML frontmatter', () => {
  function setup() {
    const content = readFileSync(SKILL_PATH, 'utf8');
    const parts = content.split('---');
    const rawFrontmatter = parts[1] ?? '';
    const body = parts.slice(2).join('---');

    // Parse simple YAML key-value fields
    const frontmatter: Record<string, string | boolean> = {};

    for (const line of rawFrontmatter.split('\n')) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // Handle boolean fields like `disable-model-invocation: true`
      const match = trimmed.match(/^([a-z-]+):\s*(.+)$/);

      if (match) {
        const [, key, value] = match;
        const trimmedValue = value.trim();

        if (trimmedValue === 'true') {
          frontmatter[key] = true;
        } else if (trimmedValue === 'false') {
          frontmatter[key] = false;
        } else {
          frontmatter[key] = trimmedValue;
        }
      }
    }

    return { content, frontmatter, body, rawFrontmatter };
  }

  it('contains name: explore', () => {
    const { frontmatter } = setup();

    expect(frontmatter['name']).toBe('explore');
  });

  it('contains a non-empty description field', () => {
    const { rawFrontmatter } = setup();

    expect(rawFrontmatter).toMatch(/^description:/m);
  });

  it('contains argument-hint field', () => {
    const { frontmatter } = setup();

    expect(frontmatter['argument-hint']).toBeTruthy();
  });

  it('contains disable-model-invocation: true', () => {
    const { frontmatter } = setup();

    expect(frontmatter['disable-model-invocation']).toBe(true);
  });
});

describe('explore-skill > workflow content', () => {
  function setup() {
    const content = readFileSync(SKILL_PATH, 'utf8');
    const parts = content.split('---');
    const body = parts.slice(2).join('---');

    return { body };
  }

  it('references $ARGUMENTS for input validation', () => {
    const { body } = setup();

    expect(body).toMatch(/\$ARGUMENTS/);
  });

  it('contains no-question handling with usage hint', () => {
    const { body } = setup();

    // Should mention empty/blank arguments and provide usage guidance
    expect(body).toMatch(/empty|blank|no\s+question|usage/i);
  });

  it('references repl-executor agent for Task tool spawning', () => {
    const { body } = setup();

    expect(body).toMatch(/repl-executor/);
  });

  it('references workspace index path', () => {
    const { body } = setup();

    expect(body).toMatch(/workspace-index\.json/);
  });

  it('references config loading for maxIterations', () => {
    const { body } = setup();

    expect(body).toMatch(/lz-nx\.rlm\.config\.json|maxIterations/);
  });

  it('references max_turns for external safety net', () => {
    const { body } = setup();

    expect(body).toMatch(/max_turns/);
  });

  it('references --debug flag handling', () => {
    const { body } = setup();

    expect(body).toMatch(/--debug/);
  });

  it('references session cleanup', () => {
    const { body } = setup();

    // Should mention deleting/removing session file after completion
    expect(body).toMatch(/delete|clean\s*up|remove.*session/i);
  });
});
