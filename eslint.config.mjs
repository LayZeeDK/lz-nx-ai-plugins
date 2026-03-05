import nx from '@nx/eslint-plugin';
import eslintConfigPrettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import-x';

export default [
  // Nx recommended presets
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],

  // Global ignores
  {
    ignores: ['**/dist', '**/out-tsc', '**/node_modules', '**/tmp'],
  },

  // Module boundary enforcement (all source files)
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.mjs'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: false,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            {
              sourceTag: 'type:plugin',
              onlyDependOnLibsWithTags: ['type:plugin'],
            },
            {
              sourceTag: 'type:test',
              onlyDependOnLibsWithTags: ['type:plugin', 'type:test'],
            },
          ],
        },
      ],
    },
  },

  // Import ordering (all source files)
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.mjs'],
    plugins: {
      'import-x': importPlugin,
    },
    rules: {
      'import-x/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
          ],
          'newlines-between': 'ignore',
        },
      ],
    },
  },

  // Prettier must be LAST (disables conflicting rules)
  eslintConfigPrettier,
];
