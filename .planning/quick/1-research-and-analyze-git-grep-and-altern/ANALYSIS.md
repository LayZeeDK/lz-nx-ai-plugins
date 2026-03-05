# Cross-Platform Search Tool Analysis for `search()` REPL Function

**Date:** 2026-03-04
**Purpose:** Evaluate candidate tools for implementing `search(pattern, paths?)` in the lz-nx.rlm REPL sandbox
**Decision scope:** Which external tool (or built-in approach) should the `search()` global use under the hood?

---

## 1. Context

### What `search()` Is

`search(pattern: string, paths?: string[]): SearchResult[]` is a synchronous global function exposed inside a Node.js `vm.createContext()` sandbox. It is one of several REPL globals (alongside `read()`, `files()`, `deps()`, `nx()`) that provide the LLM with programmatic workspace exploration.

**Contract (from FEATURES.md):**

```typescript
interface SearchResult {
  file: string; // relative path from workspace root
  line: number; // 1-based line number
  match: string; // the matching line content
}
```

- Input: regex or literal string pattern, optional array of directory paths to restrict search scope
- Output: `SearchResult[]` capped at 100 results
- Error handling: returns empty array on invalid pattern or no matches (never throws)
- Synchronous: the REPL sandbox is synchronous; `search()` blocks until results are ready

### Where It Runs

The `search()` function runs inside `repl-sandbox.mjs`, which is invoked as a separate Node.js process per REPL turn via `child_process`. The sandbox communicates with the `repl-executor` agent through stdin/stdout JSON. The search tool itself is called from within the sandbox's host-side code (the controlled wrapper), not from inside the VM context directly. This means `child_process.spawnSync` is available.

### Key Constraints

1. **Synchronous execution** -- must use `spawnSync` or `execFileSync`, not async APIs
2. **Cross-platform** -- macOS, Linux, Windows x64, Windows arm64 (the developer's own machine)
3. **No native modules** -- only Node.js LTS + git (PROJECT.md constraint)
4. **Result cap** -- 100 results maximum, to prevent context flooding
5. **Git-awareness preferred** -- should NOT search `node_modules/`, `dist/`, `.nx/`, or other gitignored paths
6. **Called from host-side code** -- not from within the VM context, so `child_process` is available

---

## 2. Candidates

### Candidate 1: `git grep` (via `child_process.spawnSync`)

A content search tool built into Git. Searches tracked files using the Git index, providing inherent `.gitignore` awareness. Available wherever Git is installed. Produces line-numbered output parseable into `{ file, line, match }`.

### Candidate 2: `rg` (ripgrep) (via `child_process.spawnSync`)

A high-performance search tool written in Rust. Uses parallel directory walking and memory-mapped file I/O. Respects `.gitignore` by default. Available as a standalone binary from package managers.

### Candidate 3: `grep` (via `child_process.spawnSync`)

The classic POSIX text search utility. Available on macOS/Linux natively and on Windows via Git Bash's MSYS2 layer. Single-threaded, no built-in `.gitignore` awareness.

### Candidate 4: Claude Code Grep Tool (vendored `rg.exe`)

The built-in Grep tool that Claude Code provides to agents during conversation. Uses a vendored ripgrep binary (`arm64-win32/rg.exe` on Windows arm64).

### Candidate 5: Node.js Built-in (`fs.globSync` + `fs.readFileSync` + regex)

A pure-Node.js approach using `fs.globSync()` (stable since Node.js 22.17) to enumerate files, `fs.readFileSync()` to read each file, and `String.match()` / `RegExp` to find matches. Zero external dependencies.

---

## 3. Comparison Matrix

| Dimension                          | `git grep` | `rg` (ripgrep) | `grep` (POSIX) | Grep Tool (vendored) | Node.js built-in |
| ---------------------------------- | :--------: | :------------: | :------------: | :------------------: | :--------------: |
| **A. Cross-platform availability** |   GREEN    |     YELLOW     |      RED       |         RED          |      YELLOW      |
| **B. Performance**                 |   GREEN    |     YELLOW     |      RED       |         N/A          |       RED        |
| **C. API ergonomics**              |   GREEN    |     GREEN      |     YELLOW     |         RED          |      YELLOW      |
| **D. Git-awareness**               |   GREEN    |     GREEN      |      RED       |        GREEN         |       RED        |
| **E. Dependency footprint**        |   GREEN    |      RED       |     YELLOW     |         RED          |      GREEN       |
| **F. Known pitfalls**              |   GREEN    |     YELLOW     |      RED       |         RED          |      YELLOW      |

**Legend:** GREEN = excellent fit, YELLOW = acceptable with caveats, RED = significant issues

---

## 4. Detailed Analysis

### 4A. `git grep`

#### A. Cross-platform availability -- GREEN

Git is a hard dependency of the plugin (the workspace is a git repository, and AGENTS.md assumes Git is available on all platforms). `git grep` ships with every Git installation:

| Platform      | Status | Notes                                          |
| ------------- | ------ | ---------------------------------------------- |
| macOS         | Works  | Natively compiled (Xcode or Homebrew Git)      |
| Linux         | Works  | Natively compiled (distro package manager)     |
| Windows x64   | Works  | Git for Windows, natively compiled             |
| Windows arm64 | Works  | Git for Windows arm64 build, natively compiled |

The critical advantage on Windows arm64: `git grep` runs natively (not under QEMU emulation), making it the fastest search tool on this platform. This is confirmed by CLAUDE.md's observation that git grep is ~2.5x faster than QEMU-emulated rg on arm64.

#### B. Performance -- GREEN

`git grep` searches the Git index directly, which gives it two performance advantages:

1. **No filesystem traversal** -- it reads the index (a single binary file mapping tracked paths to blobs), avoiding the overhead of recursive directory walking
2. **No `.gitignore` parsing at runtime** -- untracked/ignored files are simply not in the index

For the target use case (50K-100K tracked files in a large Nx monorepo), `git grep` is the fastest option on all platforms. On Windows arm64 specifically, it is ~2.5x faster than ripgrep running under QEMU x86_64 emulation.

The `--max-count` (`-m`) flag can limit results per file, and output can be piped through `head` (or limited programmatically after parsing), supporting the 100-result cap.

#### C. API ergonomics -- GREEN

The output format maps directly to `SearchResult[]`:

```
libs/shared/utils/src/lib/string.ts:42:export function capitalize(str: string) {
```

Format: `<file>:<line>:<match>` -- one per line, parseable with a single `split(':')` (taking care to limit splits to 3 for files with colons in content).

The `spawnSync` invocation is clean:

```javascript
const result = spawnSync(
  'git',
  ['grep', '-n', '--no-color', '-e', pattern, '--', ...paths],
  {
    cwd: workspaceRoot,
    encoding: 'utf8',
    env: { ...process.env, MSYS_NO_PATHCONV: '1' },
  },
);
```

Key API points:

- `-n` gives line numbers
- `--no-color` ensures no ANSI escape codes in output
- `-e pattern` safely passes the pattern (avoids ambiguity with patterns starting with `-`)
- `--` separates pattern from path arguments
- `-F` for literal string matching (default is basic regex)
- `-E` for extended regex
- `-m N` limits matches per file (can combine with result counting for the 100-result cap)
- Exit code 1 = no matches (not an error); exit code 0 = matches found; exit code 2 = error

Error handling: `spawnSync` returns `status` code. Status 1 with empty stdout means "no matches" -- return empty array. Status 2 or non-null `error` means pattern/command error -- return empty array per contract.

#### D. Git-awareness -- GREEN

Inherent. `git grep` only searches files tracked by Git. It does not search:

- `node_modules/` (gitignored)
- `dist/` and build output (gitignored)
- `.nx/` cache (gitignored)
- Any file matching `.gitignore` patterns

This is exactly what the REPL `search()` function needs -- the search scope should match what developers consider "the codebase."

#### E. Dependency footprint -- GREEN

Requires only Git, which is already a hard dependency of the plugin (the project is a Git repository, AGENTS.md lists Git as an assumed dependency, and the workspace indexer depends on it). No additional installation needed on any platform.

#### F. Known pitfalls -- GREEN (with mitigations)

**Pitfall 7 (MSYS2 path munging):** When `shell: true` is used on Windows, Git Bash's MSYS2 layer can corrupt arguments that look like Unix paths. Regex patterns containing `/` (e.g., `/api/v1/users`) are especially vulnerable.

**Mitigation:** Using `spawnSync('git', [...args])` with the default `shell: false` bypasses MSYS2 entirely. Arguments are passed directly to the `git` executable as an array, with no shell interpretation. Additionally, setting `MSYS_NO_PATHCONV: '1'` in the env provides defense-in-depth.

**Pitfall 8 (cmd.exe default shell):** When `shell: true` is used, Node.js defaults to `cmd.exe` on Windows, which has different quoting and syntax rules than Git Bash.

**Mitigation:** Same as above -- `spawnSync` with `shell: false` (the default) avoids this entirely. No shell is involved.

**Result:** Both Windows-specific pitfalls from PITFALLS.md are fully avoided by using `spawnSync` with argument arrays and `shell: false`.

---

### 4B. `rg` (ripgrep)

#### A. Cross-platform availability -- YELLOW

Ripgrep must be installed separately -- it is not bundled with Git, Node.js, or any OS.

| Platform      | Status       | Notes                                                                                     |
| ------------- | ------------ | ----------------------------------------------------------------------------------------- |
| macOS         | Works        | `brew install ripgrep`                                                                    |
| Linux         | Works        | `apt install ripgrep` / `dnf install ripgrep`                                             |
| Windows x64   | Works        | `choco install ripgrep` or `winget install ripgrep`                                       |
| Windows arm64 | Works (slow) | Chocolatey installs x86_64 binary; runs under QEMU emulation at ~2.5x performance penalty |

The YELLOW rating is because: (a) ripgrep is not guaranteed to be installed, and (b) on Windows arm64, the performance penalty from QEMU emulation makes it slower than the native `git grep` alternative.

#### B. Performance -- YELLOW

On macOS and Linux, ripgrep is extremely fast -- often faster than `git grep` for large directory trees due to parallel walking and mmap. However, on Windows arm64 (the developer's own hardware), the QEMU emulation penalty makes it ~2.5x slower than native `git grep`.

For the search() function in the REPL, where a user is waiting synchronously, this performance gap matters. A search that takes 200ms with `git grep` would take ~500ms with `rg` on the developer's primary machine.

#### C. API ergonomics -- GREEN

Ripgrep's output format is nearly identical to `git grep`:

```
libs/shared/utils/src/lib/string.ts:42:export function capitalize(str: string) {
```

It also supports `--json` output for machine-readable results, which would simplify parsing:

```json
{"type":"match","data":{"path":{"text":"libs/shared/utils/src/lib/string.ts"},"lines":{"text":"export function capitalize(str: string) {\n"},"line_number":42,...}}
```

The `--json` flag eliminates all parsing ambiguity (no need to worry about colons in filenames or match content).

#### D. Git-awareness -- GREEN

Ripgrep respects `.gitignore` by default. It reads `.gitignore`, `.rgignore`, and `.ignore` files. This provides the same effective search scope as `git grep` for most workspaces.

However, there is a subtle difference: `rg` respects gitignore patterns but still searches untracked files. `git grep` searches only tracked files. For the REPL use case, this difference is minimal -- new untracked files are unlikely to cause problems.

#### E. Dependency footprint -- RED

Ripgrep is a separate binary that must be installed by the user. The plugin constraint (PROJECT.md) states "Node.js LTS only, no native modules." While ripgrep is not a native module, requiring users to install it adds friction and a potential failure point ("search() not working" because `rg` is not on PATH).

#### F. Known pitfalls -- YELLOW

Ripgrep on Windows arm64 runs under QEMU emulation (Chocolatey installs the x86_64 binary). This means:

- ~2.5x slower than native alternatives
- Higher memory usage from emulation overhead
- Potential for rare QEMU-specific bugs

Additionally, CLAUDE.md documents a known bug (#27988) with the arm64-win32 vendored `rg.exe` in Claude Code where `argv[0]` leaks into the regex engine. While this specific bug affects the vendored binary (not a user-installed one), it illustrates the fragility of ripgrep on arm64 Windows.

---

### 4C. `grep` (POSIX)

#### A. Cross-platform availability -- RED

| Platform      | Status       | Notes                                                                          |
| ------------- | ------------ | ------------------------------------------------------------------------------ |
| macOS         | Works        | BSD grep (or GNU grep via Homebrew)                                            |
| Linux         | Works        | GNU grep, natively compiled                                                    |
| Windows x64   | Works (slow) | Via Git Bash MSYS2 layer; `grep -r` is slow and can produce incomplete results |
| Windows arm64 | Works (slow) | Same MSYS2 issues, plus running under QEMU-like translation                    |

The RED rating is because CLAUDE.md explicitly warns: "Git Bash's `grep -r` is ~14x slower than `git grep`, and its MSYS2 recursive glob produces incomplete results." This makes `grep` unreliable as a primary search tool on Windows.

#### B. Performance -- RED

`grep` is single-threaded and must traverse the entire directory tree for recursive searches. Without `.gitignore` awareness, it searches everything including `node_modules/` (which can be 100K+ files). On the target workspace (537 projects, 50K-100K tracked files, plus potentially 500K+ files in node_modules), a recursive grep would take 10-60 seconds -- far too slow for an interactive REPL.

#### C. API ergonomics -- YELLOW

Output format is similar to `git grep`:

```
libs/shared/utils/src/lib/string.ts:42:export function capitalize(str: string) {
```

However, constructing the command correctly is harder:

- Must manually exclude directories (`--exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.nx`)
- Different flags across BSD grep (macOS) and GNU grep (Linux)
- `-r` flag behavior differs between implementations

#### D. Git-awareness -- RED

No `.gitignore` awareness. `grep -r` searches all files in all directories, including `node_modules/`, `dist/`, `.nx/`, etc. Manually excluding directories is fragile and does not cover all `.gitignore` patterns.

#### E. Dependency footprint -- YELLOW

Available on macOS and Linux without installation. On Windows, available through Git Bash (which is already a dependency). However, the quality of the Windows implementation (MSYS2 grep) is poor.

#### F. Known pitfalls -- RED

- **Pitfall 7 applies:** MSYS2 path munging affects `grep` arguments on Windows
- **Pitfall 8 applies:** `cmd.exe` default shell breaks grep invocations from Node.js
- **Incomplete results on Windows:** CLAUDE.md explicitly warns about MSYS2 `grep -r` producing incomplete results
- **BSD vs GNU differences:** `-P` (Perl regex) not available on macOS BSD grep; `-r` follows symlinks on some implementations but not others

---

### 4D. Claude Code Grep Tool (vendored `rg.exe`)

#### A. Cross-platform availability -- RED (disqualified)

**The Claude Code Grep tool is NOT available from Node.js scripts.** It is a tool that Claude agents use during conversation via the tool-use protocol. The `search()` function runs inside `repl-sandbox.mjs`, which is a standalone Node.js process -- it has no access to Claude Code's internal tool system.

The tool cannot be invoked from `child_process`, imported as a module, or called via any API accessible to Node.js scripts. It exists only within the Claude Code agent runtime.

#### B-F. N/A (disqualified)

Since this tool is architecturally unavailable to the `search()` function, no further evaluation is meaningful.

**Additional note:** Even if it were available, CLAUDE.md documents that the vendored `arm64-win32/rg.exe` has a bug (#27988) where `argv[0]` leaks into the regex engine, causing silent zero results on Windows arm64. This would be a dealbreaker for the developer's primary machine.

---

### 4E. Node.js Built-in (`fs.globSync` + `fs.readFileSync` + regex)

#### A. Cross-platform availability -- YELLOW

`fs.globSync()` became stable in Node.js 22.17. The current Node.js LTS schedule:

| Node.js Version   | LTS Status                                            | `fs.globSync` Available |
| ----------------- | ----------------------------------------------------- | ----------------------- |
| Node.js 20 (Iron) | Maintenance LTS until Apr 2026                        | No                      |
| Node.js 22 (Jod)  | Active LTS until Oct 2025, Maintenance until Apr 2027 | Yes (since 22.17)       |
| Node.js 24        | Current (LTS from Oct 2025)                           | Yes                     |

The YELLOW rating is because: users on Node.js 20 (still in Maintenance LTS) would not have `fs.globSync`. The plugin states "Node.js LTS" as the requirement. If interpreted strictly as "any active LTS," this includes Node.js 20, which lacks the API. If interpreted as "current Active LTS" (Node.js 22+), the API is available.

A runtime check with fallback to `node-glob` or a manual recursive walk would be needed for Node.js 20 compatibility.

#### B. Performance -- RED

This approach requires three passes:

1. **Glob pass:** `fs.globSync('**/*.{ts,js,mjs}', { cwd: workspaceRoot })` -- enumerates all files matching the pattern. For 50K-100K files, this takes 500ms-2s depending on the filesystem.
2. **Read pass:** `fs.readFileSync(file, 'utf8')` for each file -- reading 50K files sequentially is I/O-bound. Even at 0.1ms per file (cached), that is 5-10 seconds.
3. **Match pass:** `line.match(pattern)` for each line of each file -- CPU-bound but fast.

The three-pass approach is fundamentally slower than tools like `git grep` or `rg` that combine traversal and matching in a single pass with optimized I/O patterns. For the REPL's interactive use case, multi-second latency is unacceptable.

**Partial mitigation:** Early termination after 100 matches. But the worst case (pattern matches nothing) still requires traversing all files.

**Additional concern:** Without `.gitignore` awareness, the glob pass would include `node_modules/` files unless exclusions are manually specified.

#### C. API ergonomics -- YELLOW

The result construction is straightforward -- you control the output format directly:

```javascript
function search(pattern, paths) {
  const regex = new RegExp(pattern);
  const results = [];
  const globPattern = paths?.length
    ? paths.map((p) => `${p}/**/*`).join('\0')
    : '**/*.{ts,js,mjs,json}';

  for (const file of fs.globSync(globPattern, { cwd: workspaceRoot })) {
    const content = fs.readFileSync(path.join(workspaceRoot, file), 'utf8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        results.push({
          file: file.replace(/\\/g, '/'),
          line: i + 1,
          match: lines[i].trim(),
        });

        if (results.length >= 100) {
          return results;
        }
      }
    }
  }

  return results;
}
```

However, this approach has ergonomic downsides:

- Must implement `.gitignore` exclusion logic manually (or accept searching ignored files)
- Must handle binary file detection (avoid reading `.png`, `.woff`, etc.)
- Must handle file encoding (assume UTF-8, skip files that fail to decode)
- Path normalization required on Windows (Pitfall 9: backslash paths from `fs.globSync`)

#### D. Git-awareness -- RED

`fs.globSync` has no `.gitignore` awareness. It returns all files matching the glob pattern, including those in `node_modules/`, `dist/`, `.nx/`, and other ignored directories.

Implementing `.gitignore` parsing manually is complex -- `.gitignore` supports negation patterns, directory-only patterns, recursive wildcards, and nested `.gitignore` files in subdirectories. Using `git ls-files` to get the list of tracked files would add git as a dependency anyway, defeating the "zero external deps" advantage.

#### E. Dependency footprint -- GREEN

Zero external dependencies beyond Node.js LTS. No binary to install, no PATH to configure, no platform-specific builds. This is the only candidate that works with a bare Node.js installation.

#### F. Known pitfalls -- YELLOW

**Pitfall 9 (backslash paths on Windows):** `fs.globSync` returns paths with `\` on Windows. Every path in the results must be normalized to forward slashes:

```javascript
results.push({
  file: file.replace(/\\/g, '/'),
  ...
});
```

**Binary file handling:** Without a binary file detection heuristic, `fs.readFileSync` will read image files, font files, etc. as UTF-8, producing garbage. Must check for null bytes or use file extension filtering.

**Memory pressure:** Reading 50K+ files sequentially into strings puts pressure on the garbage collector. Each `readFileSync` allocates a string buffer that must be collected after processing.

**No result streaming:** Unlike `git grep` which streams results line by line, the Node.js approach must read entire files before finding matches. This means memory usage is proportional to the largest file, not the number of matches.

---

## 5. Recommendation

### Primary Tool: `git grep`

`git grep` is the clear winner for the `search()` REPL function, based on:

1. **Available everywhere the plugin works** -- Git is already a hard dependency
2. **Fastest on all platforms** -- especially on Windows arm64 where it is ~2.5x faster than emulated alternatives
3. **Inherently git-aware** -- no configuration needed to exclude `node_modules/`, `dist/`, etc.
4. **Clean API mapping** -- output format maps directly to `SearchResult[]`
5. **Both Windows pitfalls (7, 8) fully avoided** by using `spawnSync` with `shell: false`
6. **Zero additional dependencies** -- ships with Git

**Recommended invocation pattern:**

```javascript
import { spawnSync } from 'node:child_process';

/**
 * Search file contents using git grep.
 * @param {string} pattern - Regex or literal string pattern
 * @param {string[]} [paths] - Restrict to these directories
 * @param {string} workspaceRoot - Absolute path to workspace root
 * @returns {Array<{file: string, line: number, match: string}>}
 */
function search(pattern, paths, workspaceRoot) {
  const args = ['grep', '-n', '--no-color', '-I', '-e', pattern];

  if (paths && paths.length > 0) {
    args.push('--');
    args.push(...paths);
  }

  const result = spawnSync('git', args, {
    cwd: workspaceRoot,
    encoding: 'utf8',
    timeout: 10000, // 10s hard timeout
    env: { ...process.env, MSYS_NO_PATHCONV: '1' },
  });

  // Exit code 1 = no matches (not an error)
  // Exit code 0 = matches found
  // Exit code 2+ or error property = actual error
  if (result.status !== 0 || !result.stdout) {
    return [];
  }

  return parseGitGrepOutput(result.stdout, 100);
}

/**
 * Parse git grep output into SearchResult array.
 * Format per line: file:lineNumber:matchContent
 * @param {string} stdout - Raw git grep output
 * @param {number} maxResults - Cap results at this count
 * @returns {Array<{file: string, line: number, match: string}>}
 */
function parseGitGrepOutput(stdout, maxResults) {
  const results = [];
  const lines = stdout.split('\n');

  for (const line of lines) {
    if (!line) {
      continue;
    }

    // Split on first two colons only (match content may contain colons)
    const firstColon = line.indexOf(':');

    if (firstColon === -1) {
      continue;
    }

    const secondColon = line.indexOf(':', firstColon + 1);

    if (secondColon === -1) {
      continue;
    }

    const file = line.slice(0, firstColon);
    const lineNum = parseInt(line.slice(firstColon + 1, secondColon), 10);
    const match = line.slice(secondColon + 1);

    if (!isNaN(lineNum)) {
      results.push({
        file: file.replace(/\\/g, '/'), // Normalize Windows paths
        line: lineNum,
        match: match.trimEnd(), // Remove trailing \r on Windows
      });
    }

    if (results.length >= maxResults) {
      break;
    }
  }

  return results;
}
```

**Key flags explained:**

| Flag         | Purpose                                                                 |
| ------------ | ----------------------------------------------------------------------- |
| `-n`         | Include line numbers in output                                          |
| `--no-color` | Disable ANSI color codes (ensures clean parsing)                        |
| `-I`         | Skip binary files (equivalent to `--binary-files=without-match`)        |
| `-e pattern` | Explicit pattern flag (avoids ambiguity for patterns starting with `-`) |
| `--`         | Separator between options and path arguments                            |

**Regex behavior:** `git grep` uses POSIX Basic Regular Expressions by default. Use `-E` for Extended Regular Expressions (ERE) or `-P` for Perl-Compatible Regular Expressions (PCRE, requires git compiled with libpcre). For the REPL `search()` function, BRE is sufficient for most patterns. If the LLM needs PCRE features, add `-P` (verify availability with `git grep -P "test" 2>/dev/null`).

### Fallback Tool: Node.js Built-in

If Git is not available (detected by checking `spawnSync('git', ['--version']).status`), fall back to the Node.js built-in approach. This covers the edge case of a non-git workspace or a broken Git installation.

```javascript
function searchFallback(pattern, paths, workspaceRoot) {
  const regex = new RegExp(pattern);
  const results = [];

  // Use fs.globSync if available (Node.js 22.17+), otherwise skip
  if (typeof fs.globSync !== 'function') {
    return []; // Cannot search without glob support
  }

  const globPatterns = paths?.length
    ? paths.map((p) => p + '/**/*')
    : ['**/*.ts', '**/*.js', '**/*.mjs', '**/*.json', '**/*.html', '**/*.css'];

  for (const globPattern of globPatterns) {
    for (const file of fs.globSync(globPattern, {
      cwd: workspaceRoot,
      exclude: (p) => {
        const rel = path.relative(workspaceRoot, p);
        return (
          rel.startsWith('node_modules') ||
          rel.startsWith('dist') ||
          rel.startsWith('.nx')
        );
      },
    })) {
      const absPath = path.join(workspaceRoot, file);

      try {
        const content = fs.readFileSync(absPath, 'utf8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) {
            results.push({
              file: file.replace(/\\/g, '/'),
              line: i + 1,
              match: lines[i].trimEnd(),
            });

            if (results.length >= 100) {
              return results;
            }
          }
        }
      } catch {
        // Skip unreadable files (binary, permissions, etc.)
        continue;
      }
    }
  }

  return results;
}
```

**Fallback limitations:**

- Much slower (3-pass vs single-pass)
- Manual `.gitignore` exclusion (only covers common directories, not full `.gitignore` semantics)
- Requires Node.js 22.17+ for `fs.globSync`
- No support for Node.js 20 without additional glob polyfill

---

## 6. Implementation Notes

### 6.1 Output Parsing Robustness

The `git grep` output parser must handle these edge cases:

1. **Colons in file paths** (rare on Unix, impossible on Windows): The format is `file:line:match`. File paths from Git never contain colons on Windows (drive letters are stripped in Git's relative paths). On Unix, colons in filenames are legal but extremely rare in source code.

2. **Colons in match content** (common): The parser uses `indexOf(':')` to find the first two colons, then takes everything after the second colon as the match. This correctly handles match content containing any number of colons.

3. **Empty match lines**: `git grep` may output lines where the match content is empty (pattern matches at end of line). The parser handles this by allowing an empty `match` string.

4. **Windows line endings**: `git grep` on Windows may output `\r\n` line endings. The parser calls `.trimEnd()` on match content to strip trailing `\r`.

5. **Binary file warnings**: The `-I` flag suppresses binary file matches entirely. Without it, git grep outputs `Binary file <path> matches` lines that would confuse the parser.

### 6.2 Result Capping Strategy

The 100-result cap from FEATURES.md can be implemented at two levels:

1. **Parse-level cap** (implemented above): Parse output until 100 results are collected, then stop. This is simple but still requires `git grep` to produce all output before the Node.js process reads it.

2. **Git-level cap** (optimization): There is no single `-m` flag that limits total results across all files. The `-m N` flag limits to N matches _per file_. For a global cap, the parse-level approach is the correct strategy. If performance profiling shows the full output is a bottleneck, consider piping through `head -100` (on Unix) or truncating the stdout buffer.

### 6.3 Error Handling Contract

The `search()` function follows the REPL global contract: **never throw, return empty array on error**.

| Scenario              | `git grep` behavior                   | `search()` returns   |
| --------------------- | ------------------------------------- | -------------------- |
| No matches            | Exit code 1, empty stdout             | `[]`                 |
| Invalid regex pattern | Exit code 2, stderr message           | `[]`                 |
| Git not installed     | `spawnSync` returns `error: ENOENT`   | `[]` (then fallback) |
| Timeout (10s)         | `spawnSync` returns `signal: SIGTERM` | `[]`                 |
| Path does not exist   | Exit code 128, stderr message         | `[]`                 |
| Empty workspace       | Exit code 1, empty stdout             | `[]`                 |

### 6.4 Path Normalization on Windows

Git always uses forward slashes in its output, even on Windows. However, the `paths` argument to `search()` might contain backslashes if constructed from Windows APIs. Normalize before passing to `git grep`:

```javascript
const normalizedPaths = paths?.map((p) => p.replace(/\\/g, '/'));
```

### 6.5 Literal vs. Regex Pattern Detection

The FEATURES.md contract says the pattern can be "regex or literal string." To support both:

```javascript
// If the pattern contains regex metacharacters, use as regex (-E for ERE)
// If it is a plain string, use -F for fixed-string matching (faster)
const hasRegexChars = /[.*+?^${}()|[\]\\]/.test(pattern);

if (hasRegexChars) {
  args.push('-E'); // Extended regex
} else {
  args.push('-F'); // Fixed string (faster)
}
```

This optimization matters for common search patterns like `UserService` (literal) vs. `user.*service` (regex).

### 6.6 Git Availability Detection

At sandbox initialization (not per-search), check whether Git is available:

```javascript
function isGitAvailable(workspaceRoot) {
  try {
    const result = spawnSync('git', ['rev-parse', '--git-dir'], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      timeout: 5000,
    });

    return result.status === 0;
  } catch {
    return false;
  }
}
```

Cache this result for the session. If Git is not available, use the Node.js built-in fallback. If the fallback also cannot work (no `fs.globSync`), return a descriptive error string (per the REPL global error convention): `"[ERROR] search() requires Git or Node.js 22.17+. Neither is available."`.

### 6.7 Large Workspace Optimization

For workspaces with 50K+ tracked files, `git grep` is already fast (<500ms for most patterns). However, two optimizations can help for the REPL use case:

1. **Path scoping:** When the LLM provides `paths` (e.g., `search("UserService", ["libs/shared/users/"])`), `git grep` only searches files under those paths. This narrows the scope dramatically.

2. **Thread count:** Git grep supports `--threads N` for parallel searching. On the developer's 12-core Snapdragon X Elite, this can provide significant speedup for broad searches. However, the default thread count is usually optimal, so only tune this if profiling shows a bottleneck.

---

## 7. Decision Summary

| Choice           | Tool                                                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Primary**      | `git grep` via `spawnSync('git', ['grep', ...args])` with `shell: false`                                                   |
| **Fallback**     | Node.js `fs.globSync` + `readFileSync` + regex (zero-dep, slower)                                                          |
| **Disqualified** | `grep` (slow/unreliable on Windows), `rg` (extra dependency, slow on arm64), Claude Grep tool (not available from Node.js) |

**Rationale:** `git grep` is the only candidate that scores GREEN on 5 of 6 dimensions. It is the fastest tool on all target platforms (especially Windows arm64), has zero additional dependencies, inherently respects `.gitignore`, produces easily parseable output, and both Windows-specific pitfalls (PITFALLS.md Pitfall 7 and Pitfall 8) are fully mitigated by the `spawnSync` + `shell: false` invocation pattern.

---

_Analysis for: `search()` REPL global function in lz-nx.rlm Claude Code plugin_
_Authored: 2026-03-04_
_References: FEATURES.md (search() contract), PITFALLS.md (Pitfalls 7-9), AGENTS.md (platform compatibility), CLAUDE.md (git grep performance data), PROJECT.md (Node.js LTS constraint)_
