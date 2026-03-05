/**
 * Print capture for REPL sandbox.
 *
 * Provides a print() function that captures output with per-call and per-turn
 * truncation limits. Handles type-specific formatting for arrays, objects,
 * null/undefined, and circular references.
 *
 * @module print-capture
 */

/**
 * Create a print capture instance with truncation limits.
 *
 * @param {number} [maxPerCall=2000] - Maximum characters per print() call
 * @param {number} [maxTotal=20000] - Maximum total characters per turn
 * @returns {{ print: (...args: unknown[]) => void, getOutput: () => string, getTotalChars: () => number }}
 */
export function createPrintCapture(maxPerCall = 2000, maxTotal = 20000) {
  let totalChars = 0;
  /** @type {string[]} */
  const outputs = [];

  /**
   * Format a single value for print output.
   *
   * @param {unknown} value
   * @returns {string}
   */
  function formatValue(value) {
    if (value === null || value === undefined) {
      return String(value);
    }

    if (typeof value !== 'object') {
      return String(value);
    }

    if (Array.isArray(value) && value.length > 5) {
      const preview = value
        .slice(0, 2)
        .map((v) => JSON.stringify(v))
        .join(', ');

      return (
        'Array(' +
        value.length +
        ') [' +
        preview +
        ', ... +' +
        (value.length - 2) +
        ' more]'
      );
    }

    try {
      const json = JSON.stringify(value, null, 2);

      if (json.length > 500) {
        return json.slice(0, 500) + '... [' + json.length + ' chars]';
      }

      return json;
    } catch {
      return String(value);
    }
  }

  /**
   * Capture formatted output from one or more values.
   * Silently stops capturing after maxTotal is reached.
   *
   * @param {...unknown} args - Values to print
   */
  function print(...args) {
    if (totalChars >= maxTotal) {
      return;
    }

    let text = args.map(formatValue).join(' ');

    if (text.length > maxPerCall) {
      text = text.slice(0, maxPerCall) + '... [' + text.length + ' chars]';
    }

    if (totalChars + text.length > maxTotal) {
      text =
        text.slice(0, maxTotal - totalChars) +
        '... [truncated, ' +
        maxTotal +
        ' char limit]';
    }

    totalChars += text.length;
    outputs.push(text);
  }

  return {
    print,
    getOutput: () => outputs.join('\n'),
    getTotalChars: () => totalChars,
  };
}
