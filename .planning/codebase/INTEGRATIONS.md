# External Integrations

**Analysis Date:** 2026-03-03

## Claude Code Platform Integration

**Claude Code Plugin System:**
- Plugin host: Claude Code desktop/web application
- Plugin management: Install via `/plugin install <plugin-name>`
- Plugin format: JSON manifest + TypeScript/JavaScript
- Execution context: Isolated Claude Code environment

**Claude Models:**
- Claude Opus 4.6 - Primary model (most capable)
- Claude Sonnet 4.5 - Recommended for RLM agents and cost-effective subagents
- Claude Haiku 4.5 - Lightweight mechanical tasks, batch operations, cost optimization

**Agent Teams:**
- Multi-agent orchestration - Peer-to-peer messaging between independent Claude instances
- Subagents API - Single-session task delegation (lower token cost)
- Agent teams API - Independent sessions with own context windows
- Git worktree integration - Isolated filesystem state per agent

## Workspace Intelligence Integration

**Nx Monorepo CLI:**
- `nx show projects --json` - Fetch all project metadata
- `nx show project <name>` - Fetch project-specific configuration and targets
- `nx graph --print` - Output dependency graph in JSON/text format
- `nx affected --files <files>` - Determine affected projects by changed files
- Usage: Workspace indexing, dependency tracing, impact analysis

**TypeScript Compiler:**
- `tsc --listFilesOnly` - List all files in compilation
- `tsconfig.base.json` parsing - Extract path aliases (`@app/*`, `@lib/*`, etc.)
- Type checking integration - Optional for type-aware code analysis

**Git Integration:**
- `git grep` - Fast file search across tracked files (used for code location)
- `git diff` - Changed files detection (incremental index rebuild trigger)
- `git ls-files` - List tracked files for workspace composition

## RLM Ecosystem

**Official RLM Client:**
- Package: `alexzhang13/rlm` (Python/Node.js)
- Usage: RLM inference engine, REPL lifecycle management
- Backends: LocalREPL, DockerREPL, ModalREPL

**REPL Environments:**
- LocalREPL - Node.js VM or Python subprocess on local machine
- DockerREPL - Container-based REPL (Docker daemon required)
- ModalREPL - Serverless REPL via Modal.com cloud backend

**Community RLM Implementations:**
- avbiswas/fast-rlm - Deno + Pyodide variant
- ysz/recursive-llm - Python unbounded context
- hampton-io/RLM - Node.js/TypeScript with MCP server
- code-rabi/rllm - TypeScript with V8 isolate sandbox
- yogthos/Matryoshka - MCP server with Nucleus symbolic language

## MCP (Model Context Protocol) Servers

**Integration Points:**
- Playwriter MCP - Browser automation for blocked web content
- url-to-markdown - Document conversion and URL fetching
- MarkItDown MCP - PDF/DOCX/XLSX conversion
- Custom MCP servers - For workspace-specific tools

**Usage in Plugin:**
- `mcp__playwriter__execute` - Full browser rendering
- `mcp__markitdown__convert_to_markdown` - Document extraction

## External Services & APIs

**Git Services:**
- GitHub API - Project metadata, PR comments via `gh` CLI
- git.io or GitHub raw content - Source file fetching (alternative to local read)

**AI/LLM Services:**
- Anthropic Claude API - Backup integration if needed (typically via Claude Code direct)
- Model routing hints - Suggest Opus/Sonnet/Haiku based on task complexity

**Optional Cloud Backends:**
- Modal.com - For serverless REPL execution (ModalREPL)
- Docker Hub - For container image hosting (DockerREPL)

## Target Workspace Integration Points

**Angular/TypeScript Workspace:**
- Angular build system - `ng build`, `ng test`, `ng serve`
- Jest or Vitest test runner - Test execution and coverage
- Testing Library - Component testing patterns
- ComponentStore (@ngrx) - State management pattern

**Monorepo Structure:**
- 537 Nx projects organized by scope/type
- Feature/data-access/domain/shared library structure
- ~1,700 Angular components following naming patterns
- Path aliases in tsconfig.base.json (e.g., `@connect/*`, `@shared/*`)

**Conventions & Patterns:**
- SIFERS pattern - Component structure convention
- ComponentStore usage - State management across workspace
- Testing patterns - Jasmine/Jest with Testing Library
- Linting rules - ESLint, Angular-specific rules

## Data & Indexing

**Workspace Index Storage:**
- Location: `.claude/workspace-index.json`
- Format: Structured JSON (~50-100KB)
- Refresh trigger: SessionStart hook or file modification
- Incremental rebuild: File mtime comparison

**Index Contents:**
- Project registry: names, source roots, types, tags
- Dependency edges: adjacency list for impact analysis
- Path aliases: tsconfig path mapping
- Component registry: selector → file path mapping (~80KB)
- Service registry: providedIn → file path mapping (~20KB)
- Store registry: class name → file path mapping (~15KB)
- Route map: route path → lazy-loaded module (~10KB)

**Cache Management:**
- File-mtime TTL: Invalidate on Nx config or workspace changes
- Handle-based result storage: ~97% token savings via symbolic references
- PostToolUse hook caching: Cache search and Nx command results

## Authentication & Credentials

**Plugin Secrets:**
- Environment variables: Stored in Claude Code environment
- Access method: `process.env.API_KEY`, `process.env.CLAUDE_API_KEY`
- Scope: Plugin-specific secrets not shared across plugins

**Git Credentials:**
- Git Bash integration - Uses system git config and SSH keys
- `gh` CLI auth - GitHub token from local system config
- No secrets stored in repository (`.env` ignored)

## Hooks & Automation

**SessionStart Hook:**
- Event: Every Claude Code session begins
- Action: Run workspace-indexer.mjs to build/refresh index
- Output: `.claude/workspace-index.json` updated
- Duration: ~5-10 seconds (incremental) to ~30 seconds (full rebuild)

**PreToolUse Hook:**
- Event: Before any tool execution (Bash, Read, etc.)
- Action: Route complex searches to lower-token strategies
- Purpose: Intercept Explore tasks, suggest git grep or index lookup

**PostToolUse Hook:**
- Event: After tool execution (Bash, Read, etc.)
- Action: Cache results with file-mtime TTL
- Purpose: Avoid re-executing identical searches in same session

**PreCompact Hook:**
- Event: Before context window compaction
- Action: Save key findings to persistent REPL or file
- Purpose: Preserve critical knowledge before context reset

## Workflow Integration

**Nx-aware Workspace Navigation:**
- Dependency tracing: Use `nx graph --print` output, not manual import analysis
- Affected detection: Use `nx affected --files` for change impact
- Project lookup: Query workspace index instead of git grep across all projects

**Component Discovery Workflow:**
- Look up selector in component registry (index)
- Retrieve file path and project name (0 tokens)
- Read component file directly (4-8K tokens)
- No multi-file search needed

**Impact Analysis Workflow:**
- Get changed files via git diff
- Run `nx affected --files <changed>`
- Trace through dependency graph in index
- Analyze affected services/stores via registries

## Code Generation & Testing

**Pattern-Compliant Generation:**
- Reference existing patterns from workspace index
- Load exemplar files directly (specific paths)
- Generate code following ComponentStore conventions
- Use Testing Library patterns from workspace examples

**Test Generation:**
- Scan test examples in workspace
- Extract testing patterns (mocking, assertions)
- Generate tests following workspace conventions
- Leverage /rlm:test-gen skill for pattern-aware generation

---

*Integration audit: 2026-03-03*
