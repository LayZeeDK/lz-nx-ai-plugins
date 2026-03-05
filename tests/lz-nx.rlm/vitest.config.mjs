import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const scriptsDir = resolve(import.meta.dirname, '../../plugins/lz-nx.rlm/scripts');

export default defineConfig({
  test: {
    include: ['**/*.test.mjs'],
    root: import.meta.dirname,
  },
  resolve: {
    alias: {
      '#rlm': scriptsDir,
    },
  },
});
