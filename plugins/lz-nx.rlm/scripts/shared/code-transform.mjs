/**
 * Code transformation for REPL variable persistence.
 *
 * Transforms top-level const/let/var declarations to globalThis assignments
 * so variables persist on the VM sandbox object between turns.
 *
 * - const -> Object.defineProperty(globalThis, "name", { value: expr, writable: false, ... })
 * - let/var -> globalThis.name = expr
 *
 * Only matches declarations at column 0 (start of line). Indented declarations
 * inside blocks (if/for/while) are NOT transformed.
 *
 * @module code-transform
 */

/**
 * Transform top-level const/let/var declarations to globalThis assignments.
 *
 * @param {string} code - Raw JavaScript code from LLM
 * @returns {string} Transformed code with 'use strict' prepended
 */
export function transformDeclarations(code) {
  // Phase 1: Replace let/var with globalThis.name =
  // Phase 2: Replace const with Object.defineProperty marker, then close it
  const DECL_RE = /^(const|let|var)\s+(\w+)\s*=/gm;

  // Track const declarations that need closing
  /** @type {Array<{ name: string, startIndex: number }>} */
  const constMarkers = [];

  // First pass: replace declaration keywords
  let transformed = code.replace(DECL_RE, (match, keyword, name, offset) => {
    if (keyword === 'const') {
      constMarkers.push({ name, startIndex: offset });

      return 'Object.defineProperty(globalThis, "' + name + '", { value:';
    }

    return 'globalThis.' + name + ' =';
  });

  // Second pass: for each const declaration, find the statement end and close
  // Process in reverse order so earlier indices remain valid
  if (constMarkers.length > 0) {
    transformed = closeConstDeclarations(transformed, constMarkers);
  }

  return '\'use strict\';\n' + transformed;
}

/**
 * Find the end of a statement starting from a given position and close
 * the Object.defineProperty call.
 *
 * @param {string} code - Code with Object.defineProperty markers
 * @param {Array<{ name: string, startIndex: number }>} markers - Const declaration markers
 * @returns {string} Code with closed Object.defineProperty calls
 */
function closeConstDeclarations(code, markers) {
  // We need to find each Object.defineProperty( marker in the transformed code
  // and locate the statement-ending semicolon to insert the closing properties
  const PROP_PREFIX = 'Object.defineProperty(globalThis, "';
  const CLOSING = ', writable: false, enumerable: true, configurable: true })';

  let result = code;

  // Process markers in reverse order to preserve string indices
  for (let i = markers.length - 1; i >= 0; i--) {
    const marker = markers[i];
    // Find the Object.defineProperty marker in the current result
    const markerText = 'Object.defineProperty(globalThis, "' + marker.name + '", { value:';
    const markerIndex = findNthOccurrence(result, markerText, countOccurrencesBefore(markers, i, marker.name));

    if (markerIndex === -1) {
      continue;
    }

    // Start searching for statement end after the marker
    const searchStart = markerIndex + markerText.length;
    const semiIndex = findStatementEnd(result, searchStart);

    if (semiIndex !== -1) {
      // Replace the semicolon with closing + semicolon
      result = result.slice(0, semiIndex) + CLOSING + ';' + result.slice(semiIndex + 1);
    } else {
      // No semicolon found - append closing at end of code
      result = result + CLOSING + ';';
    }
  }

  return result;
}

/**
 * Count how many markers before index i have the same name.
 *
 * @param {Array<{ name: string, startIndex: number }>} markers
 * @param {number} i
 * @param {string} name
 * @returns {number}
 */
function countOccurrencesBefore(markers, i, name) {
  let count = 0;

  for (let j = 0; j < i; j++) {
    if (markers[j].name === name) {
      count++;
    }
  }

  return count;
}

/**
 * Find the nth occurrence (0-based) of a substring.
 *
 * @param {string} str
 * @param {string} substr
 * @param {number} n
 * @returns {number} Index or -1
 */
function findNthOccurrence(str, substr, n) {
  let index = -1;
  let count = 0;

  while (count <= n) {
    index = str.indexOf(substr, index + 1);

    if (index === -1) {
      return -1;
    }

    if (count === n) {
      return index;
    }

    count++;
  }

  return -1;
}

/**
 * Find the end of a statement (semicolon at depth 0) starting from a position.
 * Tracks brace, bracket, and paren depth to handle nested expressions.
 *
 * @param {string} code
 * @param {number} start
 * @returns {number} Index of the semicolon, or -1 if not found
 */
function findStatementEnd(code, start) {
  let depth = 0;
  let inString = false;
  /** @type {string} */
  let stringChar = '';

  for (let i = start; i < code.length; i++) {
    const ch = code[i];
    const prev = i > 0 ? code[i - 1] : '';

    // Handle string literals
    if (inString) {
      if (ch === stringChar && prev !== '\\') {
        inString = false;
      }

      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      inString = true;
      stringChar = ch;

      continue;
    }

    // Track nesting depth
    if (ch === '(' || ch === '{' || ch === '[') {
      depth++;

      continue;
    }

    if (ch === ')' || ch === '}' || ch === ']') {
      depth--;

      continue;
    }

    // Semicolon at depth 0 ends the statement
    if (ch === ';' && depth === 0) {
      return i;
    }

    // Newline at depth 0 could be a statement end (no semicolon)
    if (ch === '\n' && depth === 0) {
      // Check if next non-whitespace line starts a new statement
      const rest = code.slice(i + 1).trimStart();

      if (
        rest.length === 0 ||
        rest.startsWith('const ') ||
        rest.startsWith('let ') ||
        rest.startsWith('var ') ||
        rest.startsWith('Object.defineProperty(globalThis') ||
        rest.startsWith('globalThis.') ||
        rest.startsWith('//') ||
        rest.startsWith('/*')
      ) {
        return i;
      }
    }
  }

  return -1;
}
