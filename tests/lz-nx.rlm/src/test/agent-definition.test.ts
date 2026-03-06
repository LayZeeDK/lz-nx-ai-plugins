import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

// ─── agent-definition: structural tests for repl-executor agent ───

describe('agent-definition > repl-executor', () => {
  const agentPath = resolve(
    import.meta.dirname,
    '../../../../plugins/lz-nx.rlm/agents/repl-executor.md'
  );

  function setup() {
    const content = readFileSync(agentPath, 'utf8');

    // Split into YAML frontmatter and body
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

    if (!fmMatch) {
      throw new Error('Agent file does not have valid YAML frontmatter');
    }

    const rawFrontmatter = fmMatch[1];
    const body = fmMatch[2];

    // Parse flat YAML frontmatter manually (no YAML library)
    const frontmatter: Record<string, string | string[]> = {};
    const lines = rawFrontmatter.split('\n');
    let currentKey = '';
    let collectingArray = false;
    let collectingMultiline = false;
    let multilineValue = '';

    for (const line of lines) {
      if (collectingMultiline) {
        if (/^\S/.test(line) && !line.startsWith(' ') && !line.startsWith('\t')) {
          // New key starts, finish multiline
          frontmatter[currentKey] = multilineValue.trim();
          collectingMultiline = false;
          // Fall through to process this line as a new key
        } else {
          multilineValue += line.trimStart() + '\n';
          continue;
        }
      }

      if (collectingArray) {
        const itemMatch = line.match(/^\s+-\s+(.+)$/);

        if (itemMatch) {
          (frontmatter[currentKey] as string[]).push(itemMatch[1]);
          continue;
        } else {
          collectingArray = false;
          // Fall through to process this line as a new key
        }
      }

      const kvMatch = line.match(/^(\w[\w-]*):\s*(.*)$/);

      if (kvMatch) {
        currentKey = kvMatch[1];
        const value = kvMatch[2].trim();

        if (value === '|' || value === '>') {
          collectingMultiline = true;
          multilineValue = '';
        } else if (value === '') {
          // Possible array or multiline follows
          frontmatter[currentKey] = [];
          collectingArray = true;
        } else {
          frontmatter[currentKey] = value;
        }
      }
    }

    if (collectingMultiline) {
      frontmatter[currentKey] = multilineValue.trim();
    }

    return { content, frontmatter, body };
  }

  it('agent file exists at plugins/lz-nx.rlm/agents/repl-executor.md', () => {
    // readFileSync in setup() will throw if the file doesn't exist
    const { content } = setup();

    expect(content.length).toBeGreaterThan(0);
  });

  it('frontmatter contains name: repl-executor', () => {
    const { frontmatter } = setup();

    expect(frontmatter['name']).toBe('repl-executor');
  });

  it('frontmatter contains model: sonnet', () => {
    const { frontmatter } = setup();

    expect(frontmatter['model']).toBe('sonnet');
  });

  it('frontmatter tools array includes exactly Bash and Read', () => {
    const { frontmatter } = setup();
    const tools = frontmatter['tools'];

    expect(Array.isArray(tools)).toBe(true);
    expect(tools).toContain('Bash');
    expect(tools).toContain('Read');
    expect((tools as string[]).length).toBe(2);
  });

  it('frontmatter contains a non-empty description', () => {
    const { frontmatter } = setup();

    expect(typeof frontmatter['description']).toBe('string');
    expect((frontmatter['description'] as string).length).toBeGreaterThan(0);
  });

  it('system prompt contains <phase name="explore"> XML tag', () => {
    const { body } = setup();

    expect(body).toContain('<phase name="explore">');
  });

  it('system prompt contains <phase name="answer"> XML tag', () => {
    const { body } = setup();

    expect(body).toContain('<phase name="answer">');
  });

  it('system prompt contains <globals> section with all 12 global names', () => {
    const { body } = setup();
    const globalNames = [
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
    ];

    expect(body).toContain('<globals>');

    for (const name of globalNames) {
      expect(body).toContain(name);
    }
  });

  it('system prompt contains <guardrails> section', () => {
    const { body } = setup();

    expect(body).toContain('<guardrails>');
  });

  it('system prompt contains <role> section', () => {
    const { body } = setup();

    expect(body).toContain('<role>');
  });

  it('system prompt references repl-sandbox.mjs invocation pattern', () => {
    const { body } = setup();

    expect(body).toMatch(/repl-sandbox\.mjs/);
  });

  it('system prompt does NOT contain instructions to use Task tool or spawn sub-agents', () => {
    const { body } = setup();
    const lowerBody = body.toLowerCase();

    expect(lowerBody).not.toContain('task tool');
    expect(lowerBody).not.toContain('task(');
    expect(lowerBody).not.toContain('spawn sub-agent');
    expect(lowerBody).not.toContain('sub-task');
    expect(lowerBody).not.toContain('agent tool');
  });

  it('system prompt contains first-call FINAL guard', () => {
    const { body } = setup();

    expect(body).toMatch(
      /first.*sandbox.*call.*must not.*FINAL|first.*call.*MUST NOT.*FINAL|never.*call.*FINAL.*first/i
    );
  });

  it('system prompt does NOT use heredoc+pipe pattern for sandbox invocation', () => {
    const { body } = setup();

    expect(body).not.toMatch(/cat\s+<<.*\|/);
  });

  it('system prompt uses temp file approach for sandbox invocation', () => {
    const { body } = setup();

    expect(body).toMatch(/< \/tmp\/repl-code/);
  });
});
