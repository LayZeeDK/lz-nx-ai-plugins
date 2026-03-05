import { describe, it, expect } from 'vitest';

// ─── print-capture: createPrintCapture (pure function, no mocks needed) ───

describe('print-capture > createPrintCapture', () => {
  async function setup() {
    const { createPrintCapture } = await import(
      '#rlm/shared/print-capture.mjs'
    );

    return { createPrintCapture };
  }

  it('captures a simple string', async () => {
    const { createPrintCapture } = await setup();
    const { print, getOutput } = createPrintCapture();

    print('hello');

    expect(getOutput()).toBe('hello');
  });

  it('captures a number as string', async () => {
    const { createPrintCapture } = await setup();
    const { print, getOutput } = createPrintCapture();

    print(42);

    expect(getOutput()).toBe('42');
  });

  it('captures null as "null"', async () => {
    const { createPrintCapture } = await setup();
    const { print, getOutput } = createPrintCapture();

    print(null);

    expect(getOutput()).toBe('null');
  });

  it('captures undefined as "undefined"', async () => {
    const { createPrintCapture } = await setup();
    const { print, getOutput } = createPrintCapture();

    print(undefined);

    expect(getOutput()).toBe('undefined');
  });

  it('truncates arrays > 5 elements with Array(N) preview', async () => {
    const { createPrintCapture } = await setup();
    const { print, getOutput } = createPrintCapture();

    print([1, 2, 3, 4, 5, 6]);

    expect(getOutput()).toBe('Array(6) [1, 2, ... +4 more]');
  });

  it('shows full array when <= 5 elements', async () => {
    const { createPrintCapture } = await setup();
    const { print, getOutput } = createPrintCapture();

    print([1, 2, 3]);

    const output = getOutput();

    // Should be JSON representation, not truncated
    expect(output).not.toContain('Array(');
    expect(output).toContain('1');
    expect(output).toContain('2');
    expect(output).toContain('3');
  });

  it('truncates objects > 500 chars with "... [N chars]" suffix', async () => {
    const { createPrintCapture } = await setup();
    const { print, getOutput } = createPrintCapture();

    // Create an object that serializes to > 500 chars
    const largeObj: Record<string, string> = {};

    for (let i = 0; i < 50; i++) {
      largeObj['key' + i] = 'value' + i + '_'.repeat(10);
    }

    print(largeObj);

    const output = getOutput();

    expect(output.length).toBeLessThan(600);
    expect(output).toContain('... [');
    expect(output).toContain(' chars]');
  });

  it('truncates per-call output at 2000 chars', async () => {
    const { createPrintCapture } = await setup();
    const { print, getOutput } = createPrintCapture(2000, 20000);

    const longString = 'x'.repeat(3000);
    print(longString);

    const output = getOutput();

    expect(output.length).toBeLessThanOrEqual(2100); // allowing for suffix
    expect(output).toContain('... [');
    expect(output).toContain(' chars]');
  });

  it('silently stops capturing after maxTotal chars reached', async () => {
    const { createPrintCapture } = await setup();
    const { print, getOutput } = createPrintCapture(2000, 50);

    print('x'.repeat(40)); // 40 chars, within limit
    print('y'.repeat(80)); // Would exceed limit -- gets truncated
    print('z'.repeat(80)); // totalChars already >= maxTotal -- silently dropped

    const output = getOutput();

    // First print captured fully
    expect(output).toContain('x'.repeat(40));
    // Second print was truncated (not the full 80 y's)
    expect(output).not.toContain('y'.repeat(80));
    // Third print silently dropped entirely
    expect(output).not.toContain('z'.repeat(80));
  });

  it('joins multiple captured lines with newline', async () => {
    const { createPrintCapture } = await setup();
    const { print, getOutput } = createPrintCapture();

    print('line1');
    print('line2');
    print('line3');

    expect(getOutput()).toBe('line1\nline2\nline3');
  });

  it('falls back to String(value) for circular references', async () => {
    const { createPrintCapture } = await setup();
    const { print, getOutput } = createPrintCapture();

    const circular: Record<string, unknown> = { name: 'test' };
    circular.self = circular;

    print(circular);

    const output = getOutput();

    // Should not throw, should produce some string output
    expect(typeof output).toBe('string');
    expect(output.length).toBeGreaterThan(0);
  });

  it('handles multiple args: print("count:", 5) -> "count: 5"', async () => {
    const { createPrintCapture } = await setup();
    const { print, getOutput } = createPrintCapture();

    print('count:', 5);

    expect(getOutput()).toBe('count: 5');
  });

  it('returns 0 for getTotalChars when nothing printed', async () => {
    const { createPrintCapture } = await setup();
    const { getTotalChars } = createPrintCapture();

    expect(getTotalChars()).toBe(0);
  });

  it('returns empty string for getOutput when nothing printed', async () => {
    const { createPrintCapture } = await setup();
    const { getOutput } = createPrintCapture();

    expect(getOutput()).toBe('');
  });

  it('uses default maxPerCall=2000 and maxTotal=20000 when no args', async () => {
    const { createPrintCapture } = await setup();
    const { print, getOutput } = createPrintCapture();

    // Print within default limits
    print('hello');

    expect(getOutput()).toBe('hello');
  });
});
