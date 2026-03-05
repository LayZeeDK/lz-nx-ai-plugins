---
phase: quick-4
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - plugins/lz-nx.rlm/project.json
  - plugins/lz-nx.rlm/tsconfig.json
  - plugins/lz-nx.rlm/tsconfig.lib.json
  - plugins/lz-nx.rlm/eslint.config.mjs
  - tests/lz-nx.rlm/project.json
  - tests/lz-nx.rlm/tsconfig.json
  - tests/lz-nx.rlm/tsconfig.spec.json
  - tests/lz-nx.rlm/vitest.config.mjs
  - tests/lz-nx.rlm/eslint.config.mjs
  - tests/lz-nx.rlm/src/alias-command.test.ts
  - tests/lz-nx.rlm/src/deps-command.test.ts
  - tests/lz-nx.rlm/src/find-command.test.ts
  - tests/lz-nx.rlm/src/index-loader.test.ts
  - tests/lz-nx.rlm/src/nx-runner.test.ts
  - tests/lz-nx.rlm/src/path-resolver.test.ts
  - tests/lz-nx.rlm/src/workspace-indexer.test.ts
  - tests/lz-nx.rlm/src/workspace-indexer-io.test.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "Plugin and test project configs follow Nx generated defaults"
    - "typecheck target is inferred by @nx/js/typescript plugin, not manually defined"
    - "test target is inferred by @nx/vite/plugin, not manually defined"
    - "Test files live under src/ directory following Nx conventional structure"
    - "All existing tests still pass (111/111)"
    - "Typecheck and lint pass for both projects"
  artifacts:
    - path: "plugins/lz-nx.rlm/project.json"
      provides: "Nx-aligned plugin project config with empty targets (inferred)"
      contains: "projectType"
    - path: "plugins/lz-nx.rlm/tsconfig.json"
      provides: "Solution tsconfig with references to tsconfig.lib.json"
      contains: "references"
    - path: "plugins/lz-nx.rlm/tsconfig.lib.json"
      provides: "Library compilation config for plugin scripts"
      contains: "scripts/**/*.mjs"
    - path: "tests/lz-nx.rlm/tsconfig.json"
      provides: "Solution tsconfig with references to tsconfig.spec.json"
      contains: "references"
    - path: "tests/lz-nx.rlm/tsconfig.spec.json"
      provides: "Vitest-specific compilation config"
      contains: "vitest/globals"
    - path: "tests/lz-nx.rlm/vitest.config.mjs"
      provides: "Nx-aligned Vitest config using nxViteTsPaths()"
      contains: "nxViteTsPaths"
    - path: "tests/lz-nx.rlm/src/"
      provides: "Conventional test file location"
  key_links:
    - from: "plugins/lz-nx.rlm/tsconfig.json"
      to: "plugins/lz-nx.rlm/tsconfig.lib.json"
      via: "references"
      pattern: "tsconfig\\.lib\\.json"
    - from: "tests/lz-nx.rlm/tsconfig.json"
      to: "tests/lz-nx.rlm/tsconfig.spec.json"
      via: "references"
      pattern: "tsconfig\\.spec\\.json"
    - from: "tests/lz-nx.rlm/vitest.config.mjs"
      to: "tsconfig.base.json"
      via: "nxViteTsPaths()"
      pattern: "nxViteTsPaths"
---

<objective>
Align plugin and test project configurations with Nx defaults to leverage inferred targets and conventional structure.

Purpose: Remove manual target definitions that duplicate what Nx plugins infer automatically, adopt the standard solution-style tsconfig pattern with references, move test files into `src/` for conventional Nx project structure, and use `nxViteTsPaths()` instead of manual Vite resolve aliases.

Output: Both projects follow Nx conventions with inferred targets, proper tsconfig references, project-level eslint configs, and conventional folder structure.
</objective>

<execution_context>
@C:/Users/LarsGyrupBrinkNielse/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/LarsGyrupBrinkNielse/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/01.1-nx-project-setup-linting/01.1-01-SUMMARY.md
@AGENTS.md

<interfaces>
<!-- Current workspace Nx plugin configuration from nx.json -->
<!-- @nx/js/typescript infers `typecheck` target from tsconfig.json (noEmit) or tsconfig.lib.json (build) -->
<!-- @nx/vite/plugin infers `test` from vitest.config.mjs/mts, `build` from vite.config.ts -->
<!-- @nx/eslint/plugin infers `lint` from eslint.config.mjs presence -->

From tsconfig.base.json:
```json
{
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "paths": {
      "#rlm/*": ["./plugins/lz-nx.rlm/scripts/*"]
    }
  }
}
```

Nx default project.json pattern (from @nx/js:lib generator):
```json
{
  "name": "project-name",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "path/to/project/src",
  "projectType": "library",
  "tags": [],
  "targets": {}
}
```

Nx default tsconfig.json (solution-style with references):
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { ... },
  "files": [],
  "include": [],
  "references": [
    { "path": "./tsconfig.lib.json" },
    { "path": "./tsconfig.spec.json" }
  ]
}
```

Nx default vitest.config.mts:
```typescript
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/path/to/project',
  plugins: [nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  test: {
    name: 'project-name',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/path/to/project',
      provider: 'v8',
    },
  },
});
```

Nx default project-level eslint.config.mjs:
```javascript
import baseConfig from "../../eslint.config.mjs";

export default [...baseConfig];
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Align plugin project (plugins/lz-nx.rlm) with Nx defaults</name>
  <files>
    plugins/lz-nx.rlm/project.json,
    plugins/lz-nx.rlm/tsconfig.json,
    plugins/lz-nx.rlm/tsconfig.lib.json,
    plugins/lz-nx.rlm/eslint.config.mjs
  </files>
  <action>
**1. Update `plugins/lz-nx.rlm/project.json`:**

Replace the current project.json (which has an explicit `typecheck` target) with Nx-default structure. Remove the explicit `typecheck` target entirely -- the `@nx/js/typescript` plugin in `nx.json` will infer it from `tsconfig.json` automatically. The inferred target uses `production` + `^production` namedInputs which is the standard Nx caching pattern.

```json
{
  "name": "lz-nx-rlm",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "plugins/lz-nx.rlm/scripts",
  "projectType": "library",
  "tags": ["type:plugin"],
  "// targets": "to see all targets run: nx show project lz-nx-rlm --web",
  "targets": {}
}
```

**2. Convert `plugins/lz-nx.rlm/tsconfig.json` to solution-style with references:**

The current `tsconfig.json` serves as both solution and compilation config. Split it into a solution `tsconfig.json` that references a new `tsconfig.lib.json`.

New `tsconfig.json` (solution-style, no files/include -- delegates to references):
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  },
  "files": [],
  "include": [],
  "references": [
    {
      "path": "./tsconfig.lib.json"
    }
  ]
}
```

Note: Do NOT include `module` or `moduleResolution` overrides -- these are already set in `tsconfig.base.json`. Do NOT include `noPropertyAccessFromIndexSignature` because the Nx default includes it but the existing project does not use it and adding it could cause type errors.

**3. Create `plugins/lz-nx.rlm/tsconfig.lib.json`:**

This moves the compilation-specific settings (allowJs, checkJs, include/exclude) out of the solution tsconfig.

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "allowJs": true,
    "checkJs": true,
    "noEmit": true,
    "composite": false,
    "declaration": false,
    "declarationMap": false,
    "emitDeclarationOnly": false,
    "rootDir": "scripts",
    "types": ["node"]
  },
  "include": ["scripts/**/*.mjs"],
  "exclude": ["node_modules"]
}
```

Key: Keep `noEmit: true`, `composite: false`, `declaration: false`, `declarationMap: false`, `emitDeclarationOnly: false` -- this is not a buildable library. The `@nx/js/typescript` plugin will see `noEmit: true` in `tsconfig.lib.json` and infer a `typecheck` target (not a `build` target) because the `build` config in `nx.json` looks for `tsconfig.lib.json` but only creates a build target when `declaration: true` or similar emit settings are present.

Actually, looking at the nx.json config more carefully:
```json
{
  "plugin": "@nx/js/typescript",
  "options": {
    "typecheck": { "targetName": "typecheck" },
    "build": { "targetName": "build", "configName": "tsconfig.lib.json" }
  }
}
```

The `@nx/js/typescript` plugin uses `tsconfig.lib.json` for the `build` target inference. Since `noEmit: true` is set, it should infer `typecheck` only, NOT `build`. Verify this after writing the configs by running `npm exec -- nx show project lz-nx-rlm --json` and confirming that only `typecheck` and `lint` targets are present (no `build` target).

**IMPORTANT:** If the `@nx/js/typescript` plugin DOES infer a `build` target from `tsconfig.lib.json` (even with `noEmit: true`), we have two options:
- Option A: Rename the file to something other than `tsconfig.lib.json` (e.g., `tsconfig.check.json`) so it doesn't match the `configName: "tsconfig.lib.json"` pattern.
- Option B: Keep `tsconfig.lib.json` and accept the inferred build target (it would be a no-op with noEmit).

Prefer Option A if needed -- rename to avoid an unwanted inferred target.

**4. Create `plugins/lz-nx.rlm/eslint.config.mjs`:**

Nx default pattern -- project-level config that extends root:
```javascript
import baseConfig from "../../eslint.config.mjs";

export default [...baseConfig];
```

**5. After writing all files, verify:**
- Run `npm exec -- nx show project lz-nx-rlm --json` and confirm targets are inferred correctly (typecheck + lint, no manual targets).
- Run `npm exec -- nx run lz-nx-rlm:typecheck` to confirm typecheck still passes.
- Run `npm exec -- nx run lz-nx-rlm:lint` to confirm lint still passes.
  </action>
  <verify>
    <automated>npm exec -- nx run-many -t typecheck,lint -p lz-nx-rlm</automated>
  </verify>
  <done>Plugin project.json has empty targets (typecheck/lint inferred), tsconfig uses solution-style with references to tsconfig.lib.json, project-level eslint.config.mjs exists. `nx show project lz-nx-rlm` shows inferred typecheck and lint targets only.</done>
</task>

<task type="auto">
  <name>Task 2: Align test project (tests/lz-nx.rlm) with Nx defaults and move test files to src/</name>
  <files>
    tests/lz-nx.rlm/project.json,
    tests/lz-nx.rlm/tsconfig.json,
    tests/lz-nx.rlm/tsconfig.spec.json,
    tests/lz-nx.rlm/vitest.config.mjs,
    tests/lz-nx.rlm/eslint.config.mjs,
    tests/lz-nx.rlm/src/alias-command.test.ts,
    tests/lz-nx.rlm/src/deps-command.test.ts,
    tests/lz-nx.rlm/src/find-command.test.ts,
    tests/lz-nx.rlm/src/index-loader.test.ts,
    tests/lz-nx.rlm/src/nx-runner.test.ts,
    tests/lz-nx.rlm/src/path-resolver.test.ts,
    tests/lz-nx.rlm/src/workspace-indexer.test.ts,
    tests/lz-nx.rlm/src/workspace-indexer-io.test.ts
  </files>
  <action>
**1. Move test files into `src/` directory using `git mv`:**

```bash
mkdir -p tests/lz-nx.rlm/src
for f in tests/lz-nx.rlm/*.test.ts; do
  git mv "$f" tests/lz-nx.rlm/src/
done
```

Also move the `fixtures/` directory into `src/`:
```bash
git mv tests/lz-nx.rlm/fixtures tests/lz-nx.rlm/src/fixtures
```

**2. Update `tests/lz-nx.rlm/project.json`:**

Add standard Nx fields. Keep the `type:test` tag. Set `sourceRoot` to `tests/lz-nx.rlm/src`.

```json
{
  "name": "lz-nx-rlm-test",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "tests/lz-nx.rlm/src",
  "projectType": "library",
  "tags": ["type:test"],
  "// targets": "to see all targets run: nx show project lz-nx-rlm-test --web",
  "targets": {}
}
```

Note: Do NOT add `implicitDependencies` on `lz-nx-rlm` -- Nx infers the dependency via the `#rlm/*` path alias import.

**3. Convert `tests/lz-nx.rlm/tsconfig.json` to solution-style with references:**

Current tsconfig.json has all settings flat. Convert to solution-style:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  },
  "files": [],
  "include": [],
  "references": [
    {
      "path": "./tsconfig.spec.json"
    }
  ]
}
```

**4. Create `tests/lz-nx.rlm/tsconfig.spec.json`:**

Move the test-specific settings here. Update paths to reflect `src/` subdirectory:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "../../dist/out-tsc",
    "types": ["vitest/globals", "vitest/importMeta", "vite/client", "node", "vitest"],
    "allowJs": true,
    "checkJs": true,
    "composite": false,
    "declaration": false,
    "declarationMap": false,
    "emitDeclarationOnly": false,
    "noEmit": true,
    "noUnusedLocals": false,
    "paths": {
      "#rlm/*": ["../../plugins/lz-nx.rlm/scripts/*"]
    }
  },
  "include": [
    "vite.config.ts",
    "vite.config.mts",
    "vitest.config.ts",
    "vitest.config.mts",
    "vitest.config.mjs",
    "src/**/*.test.ts",
    "src/**/*.spec.ts",
    "src/**/*.d.ts",
    "../../plugins/lz-nx.rlm/scripts/**/*.mjs"
  ],
  "exclude": ["node_modules"]
}
```

Key differences from Nx default `tsconfig.spec.json`:
- Keep `allowJs: true`, `checkJs: true` (needed for resolving the plugin `.mjs` imports)
- Keep `noUnusedLocals: false` (test files sometimes have intentionally unused destructured vars)
- Keep the `#rlm/*` path alias (must be redeclared in tsconfig.spec.json because it extends tsconfig.json which no longer has project-specific paths)
- Include `../../plugins/lz-nx.rlm/scripts/**/*.mjs` (needed for typecheck to validate the plugin source)
- Include `vitest.config.mjs` (the current config file extension) in the include list

**5. Update `tests/lz-nx.rlm/vitest.config.mjs` to use Nx-standard pattern:**

Replace the manual `resolve.alias` with `nxViteTsPaths()` which reads `#rlm/*` from `tsconfig.base.json` automatically:

```javascript
import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/tests/lz-nx.rlm',
  plugins: [nxViteTsPaths()],
  test: {
    name: 'lz-nx-rlm-test',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/tests/lz-nx.rlm',
      provider: 'v8',
    },
  },
});
```

Key changes:
- Uses `nxViteTsPaths()` instead of manual `resolve.alias` for `#rlm`
- Adds `cacheDir` per Nx convention
- Adds `test.name` for test reporting
- Changes `include` to search `src/` subdirectory
- Adds coverage config per Nx default
- Adds `watch: false` and `globals: true` per Nx default

**6. Create `tests/lz-nx.rlm/eslint.config.mjs`:**

```javascript
import baseConfig from "../../eslint.config.mjs";

export default [...baseConfig];
```

**7. Keep `tests/lz-nx.rlm/package.json` as-is.** The `"type": "module"` is required for `import.meta` support under `moduleResolution: nodenext`. This is a deviation from the default Nx generated test project (which doesn't need a package.json) but is necessary for our `.mjs` plugin scripts.

**8. After writing all files, verify:**
- Run `npm exec -- nx show project lz-nx-rlm-test --json` and confirm targets are inferred correctly.
- Run `npm exec -- nx run lz-nx-rlm-test:test` to confirm all 111 tests pass.
- Run `npm exec -- nx run lz-nx-rlm-test:typecheck` to confirm typecheck passes.
- Run `npm exec -- nx run lz-nx-rlm-test:lint` to confirm lint passes.

**IMPORTANT:** Test files use `import('#rlm/...')` for dynamic imports in the SIFERS `setup()` pattern. The `nxViteTsPaths()` plugin resolves these from `tsconfig.base.json` paths. Verify this works by running the tests -- if any fail with "Cannot find module '#rlm/...'", the path resolution is broken and you need to debug the vitest config.

**IMPORTANT:** The fixture files in `src/fixtures/` are JSON files referenced by tests via relative paths like `'./fixtures/graph-output.json'`. After moving to `src/`, the relative path FROM a test file TO fixtures stays the same (`'./fixtures/graph-output.json'`). But verify the tests actually use the fixtures directory -- read a couple test files to check the import paths. If they use `import.meta.dirname` + relative paths, the move should be transparent. If they use paths relative to the project root, those will break and need updating.
  </action>
  <verify>
    <automated>npm exec -- nx run-many -t typecheck,lint,test -p lz-nx-rlm-test</automated>
  </verify>
  <done>Test project follows Nx conventions: solution tsconfig with tsconfig.spec.json reference, vitest.config.mjs uses nxViteTsPaths(), test files are in src/ directory, project-level eslint.config.mjs exists. All 111 tests pass, typecheck and lint are clean.</done>
</task>

<task type="auto">
  <name>Task 3: Full cross-project verification</name>
  <files></files>
  <action>
Run the full verification suite across both projects to confirm nothing is broken:

1. `npm exec -- nx run-many -t typecheck,lint,test` -- all targets pass for both projects
2. `npm exec -- nx format:check --all` -- formatting is clean (run `npm exec -- nx format --all` first if needed)
3. `npm exec -- nx show project lz-nx-rlm --json` -- confirm only inferred targets (typecheck, lint), no manual targets
4. `npm exec -- nx show project lz-nx-rlm-test --json` -- confirm inferred targets (typecheck, test, lint), verify no unwanted targets like `nx-release-publish` (if present, it's because the project has a package.json -- this is acceptable as it's a no-op)
5. Verify no test files remain in `tests/lz-nx.rlm/` root (only config files + package.json + src/ directory)
6. Verify `tests/lz-nx.rlm/src/` contains all 8 test files and the fixtures/ directory

If `nx format:check` fails, run `npm exec -- nx format --all` to fix formatting.
  </action>
  <verify>
    <automated>npm exec -- nx run-many -t typecheck,lint,test && npm exec -- nx format:check --all</automated>
  </verify>
  <done>Both projects pass all Nx targets (typecheck, lint, test). Formatting is clean. No regressions from the configuration alignment.</done>
</task>

</tasks>

<verification>
- `npm exec -- nx run-many -t typecheck,lint,test` passes for both `lz-nx-rlm` and `lz-nx-rlm-test`
- `npm exec -- nx format:check --all` is clean
- `npm exec -- nx show project lz-nx-rlm --json` shows only inferred targets (no explicit typecheck)
- `npm exec -- nx show project lz-nx-rlm-test --json` shows inferred targets
- All 111 tests pass
- Test files are in `tests/lz-nx.rlm/src/` not the project root
</verification>

<success_criteria>
- Both project.json files follow Nx default structure with $schema, sourceRoot, projectType, empty targets
- Plugin tsconfig uses solution-style references (tsconfig.json -> tsconfig.lib.json)
- Test tsconfig uses solution-style references (tsconfig.json -> tsconfig.spec.json)
- Vitest config uses nxViteTsPaths() instead of manual resolve.alias
- Both projects have project-level eslint.config.mjs
- Test files are in src/ subdirectory following Nx conventions
- All Nx targets (typecheck, lint, test) pass for both projects
</success_criteria>

<output>
After completion, create `.planning/quick/4-align-project-configurations-with-nx-def/4-SUMMARY.md`
</output>
