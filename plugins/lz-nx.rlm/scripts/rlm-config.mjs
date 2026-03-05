/**
 * RLM guardrails configuration loader.
 *
 * Loads configuration by merging three layers:
 * 1. Hardcoded DEFAULTS (always present)
 * 2. Plugin defaults from lz-nx.rlm.config.json in plugin root
 * 3. User overrides from .claude/lz-nx.rlm.config.json in workspace root
 *
 * User overrides win over plugin defaults, which win over hardcoded defaults.
 * Missing or invalid config files are handled gracefully (no crashes).
 *
 * @module rlm-config
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Default guardrail values.
 *
 * @type {{
 *   maxIterations: number,
 *   maxTimeout: number,
 *   maxConsecutiveErrors: number,
 *   maxStaleOutputs: number,
 *   maxNoCodeTurns: number,
 *   maxDepth: number
 * }}
 */
export const DEFAULTS = {
  maxIterations: 20,
  maxTimeout: 120,
  maxConsecutiveErrors: 3,
  maxStaleOutputs: 3,
  maxNoCodeTurns: 3,
  maxDepth: 2,
};

/**
 * Load RLM guardrails configuration.
 *
 * Merges: DEFAULTS <- plugin config <- user overrides.
 * Missing or invalid config files are silently ignored (defaults used).
 *
 * @param {string} pluginRoot - Plugin root directory
 * @param {string} workspaceRoot - User workspace root
 * @returns {typeof DEFAULTS} Merged configuration
 */
export function loadConfig(pluginRoot, workspaceRoot) {
  let pluginConfig = {};

  try {
    const raw = readFileSync(
      join(pluginRoot, 'lz-nx.rlm.config.json'),
      'utf8',
    );
    pluginConfig = JSON.parse(raw);
  } catch {
    // Use hardcoded defaults for this layer
  }

  let userConfig = {};

  try {
    const raw = readFileSync(
      join(workspaceRoot, '.claude', 'lz-nx.rlm.config.json'),
      'utf8',
    );
    userConfig = JSON.parse(raw);
  } catch {
    // No user overrides
  }

  return { ...DEFAULTS, ...pluginConfig, ...userConfig };
}
