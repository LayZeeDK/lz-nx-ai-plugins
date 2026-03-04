---
phase: quick
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/quick/1-research-and-analyze-git-grep-and-altern/ANALYSIS.md
autonomous: true
requirements: []
must_haves:
  truths:
    - "Each candidate tool is evaluated on the same 6 dimensions"
    - "Cross-platform behavior is verified against real platform constraints, not assumed"
    - "A clear winner is recommended with rationale tied to the search() REPL function's specific constraints"
  artifacts:
    - path: ".planning/quick/1-research-and-analyze-git-grep-and-altern/ANALYSIS.md"
      provides: "Comparative analysis and recommendation for search() implementation tool"
      min_lines: 100
  key_links: []
---

<objective>
Research and compare candidate tools for implementing the `search()` REPL global function in the lz-nx.rlm plugin. Produce a markdown analysis document with a clear recommendation.

Purpose: The `search(pattern, paths?)` function is a core REPL global that searches file contents inside the VM sandbox. It calls `child_process` under the hood (via a controlled wrapper). The tool choice affects cross-platform reliability, performance, and dependency footprint. An informed decision now prevents rework in Phase 1-2 implementation.

Output: `.planning/quick/1-research-and-analyze-git-grep-and-altern/ANALYSIS.md`
</objective>

<execution_context>
@C:/Users/LarsGyrupBrinkNielse/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/LarsGyrupBrinkNielse/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/research/FEATURES.md
@.planning/research/ARCHITECTURE.md
@.planning/research/PITFALLS.md
@AGENTS.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Research and write cross-platform search tool comparison</name>
  <files>.planning/quick/1-research-and-analyze-git-grep-and-altern/ANALYSIS.md</files>
  <action>
Write a structured markdown analysis document comparing these 5 candidates for the `search()` REPL function:

1. **`git grep`** (via `child_process.spawnSync`)
2. **`rg` (ripgrep)** (via `child_process.spawnSync`)
3. **`grep`** (via `child_process.spawnSync`)
4. **Claude Code Grep tool** (the vendored `rg.exe`)
5. **Node.js built-in `fs.globSync()` + `fs.readFileSync()` + string/regex matching**

**Evaluation dimensions** (score each candidate on each):

A. **Cross-platform availability** -- Does it work on macOS, Linux, Windows x64, Windows arm64 without extra installation? Reference the AGENTS.md compatibility table (git grep: works everywhere; rg: works but slow on arm64 QEMU; grep: slow on Windows MSYS2; Grep tool: broken on arm64-win32 due to argv[0] bug #27988). For Node.js built-in, note that `fs.globSync` requires Node.js 22.17+ (check if this is within LTS).

B. **Performance characteristics** -- Speed for typical REPL searches (pattern match across 500+ project source trees, ~50K-100K tracked files). Consider: git grep searches the index directly (fast); rg uses parallel directory walking + mmap (fast but QEMU penalty on arm64); grep is single-threaded; Node.js built-in requires globbing THEN reading THEN matching (3-pass). Reference CLAUDE.md observation that git grep is ~2.5x faster than QEMU-emulated rg on arm64.

C. **API ergonomics for the search() function** -- How naturally does the tool map to `search(pattern: string, paths?: string[]): SearchResult[]` returning `Array<{ file: string, line: number, match: string }>`? Consider: output parsing complexity, argument construction, handling of regex vs literal patterns, error handling (no matches = empty array, not error).

D. **Git-awareness** -- Does the tool inherently respect `.gitignore` and only search tracked files? This matters because the REPL should NOT search `node_modules/`, `dist/`, `.nx/`, or other ignored paths. git grep: inherently git-aware. rg: respects .gitignore by default. grep: no .gitignore awareness. Node.js built-in: must implement exclusion manually.

E. **Dependency footprint** -- Does it add external dependencies beyond Node.js LTS + git? The plugin constraint (PROJECT.md) is "Node.js LTS only, no native modules." git grep: requires git (already assumed available per AGENTS.md). rg: requires ripgrep binary (not guaranteed). Grep tool: only available inside Claude Code agent context, not from Node.js scripts. Node.js built-in: zero external deps.

F. **Known pitfalls for this specific use case** -- Reference PITFALLS.md:
   - Pitfall 7: MSYS2 path munging corrupts regex patterns containing `/` when passed via shell
   - Pitfall 8: `cmd.exe` default shell breaks Unix syntax in `execSync`
   - Pitfall 9: `fs.glob` returns backslash paths on Windows
   - For git grep specifically: using `spawnSync('git', ['grep', ...args])` with `shell: false` avoids both Pitfall 7 and Pitfall 8
   - For Node.js built-in: must normalize paths (Pitfall 9) and implement .gitignore exclusion

**Structure the document as:**

1. **Context** -- What is `search()`, where it runs (VM sandbox via controlled wrapper), its contract from FEATURES.md
2. **Candidates** -- Brief description of each
3. **Comparison Matrix** -- Table with candidates as rows, dimensions A-F as columns, rated GREEN/YELLOW/RED
4. **Detailed Analysis** -- One section per candidate with specifics on each dimension
5. **Recommendation** -- Clear winner with rationale. If git grep wins (likely given the constraints), note the specific invocation pattern:
   ```javascript
   spawnSync('git', ['grep', '-n', '--no-color', '-e', pattern, '--', ...paths], {
     cwd: workspaceRoot,
     encoding: 'utf8',
     env: { ...process.env, MSYS_NO_PATHCONV: '1' },
   });
   ```
   Also note the fallback strategy: if git is not available, fall back to Node.js built-in (zero-dep, slower but works everywhere).
6. **Implementation Notes** -- Key patterns for the recommended tool: output parsing, error handling, result capping (100 results per FEATURES.md), path normalization on Windows.

Do NOT just restate what is in the research files. Add new analysis specific to the search() function's constraints: synchronous execution, called from within a VM sandbox's controlled wrapper, result cap at 100, must return structured `{ file, line, match }` objects.

Important: The Claude Code Grep tool is NOT available from Node.js scripts -- it is a tool that Claude agents use during conversation, not a programmatic API. Disqualify it early but explain why.
  </action>
  <verify>
    <automated>test -f ".planning/quick/1-research-and-analyze-git-grep-and-altern/ANALYSIS.md" && wc -l ".planning/quick/1-research-and-analyze-git-grep-and-altern/ANALYSIS.md" | awk '{if ($1 >= 100) print "[OK] Analysis document exists with " $1 " lines"; else print "[ERROR] Document too short: " $1 " lines"}'</automated>
  </verify>
  <done>ANALYSIS.md exists with 100+ lines, contains comparison matrix, detailed analysis of all 5 candidates, and a clear recommendation with implementation notes for the search() REPL function</done>
</task>

</tasks>

<verification>
- ANALYSIS.md covers all 5 candidates
- Each candidate evaluated on all 6 dimensions (A-F)
- Comparison matrix present as a table
- Recommendation section names a clear winner with rationale
- Implementation notes include the specific spawnSync invocation pattern
- Document references specific pitfalls from PITFALLS.md by number
</verification>

<success_criteria>
- A developer reading ANALYSIS.md can implement search() without further research
- The recommendation accounts for all 4 target platforms (macOS, Linux, Win x64, Win arm64)
- Known pitfalls are addressed with specific prevention patterns
- The fallback strategy is documented
</success_criteria>

<output>
After completion, create `.planning/quick/1-research-and-analyze-git-grep-and-altern/1-SUMMARY.md`
</output>
