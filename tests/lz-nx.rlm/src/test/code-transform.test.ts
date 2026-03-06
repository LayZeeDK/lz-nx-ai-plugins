import { describe, it, expect } from 'vitest';

const { transformDeclarations } = await import('#rlm/shared/code-transform.mjs');

// ─── code-transform: transformDeclarations (pure function, no mocks needed) ───

describe('code-transform > transformDeclarations', () => {
  it('transforms const to Object.defineProperty with writable:false', () => {
    const result = transformDeclarations('const x = 42;');

    expect(result).toContain('Object.defineProperty(globalThis, "x"');
    expect(result).toContain('writable: false');
    expect(result).toContain('enumerable: true');
    expect(result).toContain('configurable: true');
  });

  it('transforms let to globalThis assignment', () => {
    const result = transformDeclarations("let y = 'hello';");

    expect(result).toContain("globalThis.y = 'hello';");
    expect(result).not.toContain('Object.defineProperty');
  });

  it('transforms var to globalThis assignment', () => {
    const result = transformDeclarations('var z = [];');

    expect(result).toContain('globalThis.z = [];');
    expect(result).not.toContain('Object.defineProperty');
  });

  it('does NOT transform indented declarations (inside blocks)', () => {
    const code = 'if (true) {\n  const x = 42;\n}';
    const result = transformDeclarations(code);

    expect(result).toContain('const x = 42;');
    expect(result).not.toContain('globalThis.x');
    expect(result).not.toContain('Object.defineProperty');
  });

  it('transforms multiple declarations in same code block', () => {
    const code = 'const a = 1;\nlet b = 2;\nvar c = 3;';
    const result = transformDeclarations(code);

    expect(result).toContain('Object.defineProperty(globalThis, "a"');
    expect(result).toContain('globalThis.b = 2;');
    expect(result).toContain('globalThis.c = 3;');
  });

  it('passes through code with no declarations unchanged', () => {
    const code = 'console.log("hello");\nprint(42);';
    const result = transformDeclarations(code);

    // Should contain 'use strict' prefix but otherwise unchanged
    expect(result).toContain('console.log("hello");');
    expect(result).toContain('print(42);');
  });

  it('transforms const with single-line arrow function', () => {
    const result = transformDeclarations('const fn = () => { return 42; };');

    expect(result).toContain('Object.defineProperty(globalThis, "fn"');
    expect(result).toContain('value:');
    expect(result).toContain('writable: false');
  });

  it('transforms const with single-line object literal', () => {
    const result = transformDeclarations('const obj = { a: 1, b: 2 };');

    expect(result).toContain('Object.defineProperty(globalThis, "obj"');
    expect(result).toContain('value:');
    expect(result).toContain('writable: false');
  });

  it('handles const without trailing semicolon gracefully', () => {
    const result = transformDeclarations('const x = 42');

    expect(result).toContain('Object.defineProperty(globalThis, "x"');
    expect(result).toContain('writable: false');
    // Should not throw, should produce valid-looking output
    expect(typeof result).toBe('string');
  });

  it('prepends use strict to transformed code', () => {
    const result = transformDeclarations('let x = 1;');

    expect(result).toMatch(/^'use strict';/);
  });

  it('produces syntactically valid output for const x = 42;', () => {
    const result = transformDeclarations('const x = 42;');

    // The result should be valid JavaScript - verify by attempting to parse
    // Simple check: balanced parens and braces
    const openParens = (result.match(/\(/g) || []).length;
    const closeParens = (result.match(/\)/g) || []).length;
    const openBraces = (result.match(/\{/g) || []).length;
    const closeBraces = (result.match(/\}/g) || []).length;

    expect(openParens).toBe(closeParens);
    expect(openBraces).toBe(closeBraces);
  });

  it('produces syntactically valid output for const with object literal', () => {
    const result = transformDeclarations('const obj = { a: 1, b: 2 };');

    const openParens = (result.match(/\(/g) || []).length;
    const closeParens = (result.match(/\)/g) || []).length;
    const openBraces = (result.match(/\{/g) || []).length;
    const closeBraces = (result.match(/\}/g) || []).length;

    expect(openParens).toBe(closeParens);
    expect(openBraces).toBe(closeBraces);
  });
});
