/**
 * Shared output formatting utilities.
 * ASCII-only output for cp1252 compatibility (no emojis).
 */

/**
 * Print an informational message to stdout.
 * @param {string} message
 */
export function info(message) {
  process.stdout.write('[INFO] ' + message + '\n');
}

/**
 * Print a warning message to stderr.
 * @param {string} message
 */
export function warn(message) {
  process.stderr.write('[WARN] ' + message + '\n');
}

/**
 * Print an error message to stderr.
 * @param {string} message
 */
export function error(message) {
  process.stderr.write('[ERROR] ' + message + '\n');
}

/**
 * Print a success message to stdout.
 * @param {string} message
 */
export function success(message) {
  process.stdout.write('[OK] ' + message + '\n');
}
