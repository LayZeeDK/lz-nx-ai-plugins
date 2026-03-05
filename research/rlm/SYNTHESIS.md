# RLM Research Synthesis

Synthesis of the Recursive Language Models (RLM) research corpus: paper, official docs, 9 blog posts, 7 YouTube interviews, 9 GitHub repositories, and 8 Claude Code plugin implementations.

## Table of Contents

- [1. What RLM Is](#1-what-rlm-is)
- [2. The Three Design Principles](#2-the-three-design-principles)
- [3. Architecture](#3-architecture)
- [4. The Filling and Solving Phases](#4-the-filling-and-solving-phases)
- [5. Emergent Strategies](#5-emergent-strategies)
- [6. Context Management](#6-context-management)
- [7. Recursion and Depth](#7-recursion-and-depth)
- [8. REPL Environments](#8-repl-environments)
- [9. Backends and Multi-Model Routing](#9-backends-and-multi-model-routing)
- [10. Configuration Surface](#10-configuration-surface)
- [11. Performance and Benchmarks](#11-performance-and-benchmarks)
- [12. RLM vs. Other Paradigms](#12-rlm-vs-other-paradigms)
- [13. Community Perspectives](#13-community-perspectives)
- [14. Existing Claude Code Plugin Landscape](#14-existing-claude-code-plugin-landscape)
- [15. Node.js/TypeScript Implementation Patterns](#15-nodejstypescript-implementation-patterns)
- [16. Limitations and Open Problems](#16-limitations-and-open-problems)
- [17. Future Directions](#17-future-directions)
- [18. Key Takeaways for Plugin Design](#18-key-takeaways-for-plugin-design)

---

## 1. What RLM Is

Recursive Language Models (RLM) is a framework from MIT CSAIL (Alex L. Zhang, Tim Kraska, Omar Khattab) [[paper]] that replaces the standard LLM completion interface:

```
# Standard
output = llm.completion(prompt)

# RLM
output = rlm.completion(prompt)
```

The core insight: instead of feeding arbitrarily long prompts directly into the LLM's context window, RLMs **externalize the prompt as a variable in a REPL environment**. The LLM retains a symbolic handle to the full context and programmatically examines, decomposes, and recursively calls itself over snippets — without ever requiring the entire input to fit in the model's token window.

This solves two fundamental problems:

1. **Context rot** — performance degradation as context length increases, even within the advertised window. The RULER benchmark shows effective context is often only ~50% of the advertised window [[blog-tds], [blog-neuron]].
2. **Context window limits** — inability to process inputs larger than the model's token capacity.

The paradigm shift is from "how do we make models remember more?" to "how do we make models navigate better?" [[blog-neuron]] — analogous to dispatching research assistants to specific sections of an encyclopedia rather than reading it cover-to-cover.

## 2. The Three Design Principles

These principles are articulated in the paper [[paper]] and elaborated by the author [[blog-zhang]].

### Principle 1: Symbolic Handle to Prompt

The LM gets a programmable variable (`context`) it can manipulate without copying into its window:

```python
chunk = context[start:end]
result = llm_query(f"Analyze: {chunk}")
```

### Principle 2: Variables as Output

The LM can return unbounded output by constructing variables in the REPL and returning them via `FINAL_VAR(var_name)`, not by autoregressively generating text into the token window. This enables outputs beyond the LLM's generation capacity.

### Principle 3: Symbolic Recursion

Code in the REPL can invoke the LLM programmatically, inside loops or conditionals — enabling `Omega(|P|)` or even `Omega(|P|^2)` processes on the input. Unlike agents that verbalize a few sub-calls, RLMs can spawn hundreds or thousands of LM calls from code.

## 3. Architecture

Three cooperating pieces [[docs-main], [docs-client], [repo-rlm]]:

```
                    +---------------------------------------------------+
                    | REPL Environment                                  |
                    |                                                   |
                    |   context = "huge prompt string" (persisted)      |
                    |   llm_query(prompt) -> calls LLM recursively      |
                    |   FINAL(answer) or FINAL_VAR(variable)            |
                    |                                                   |
                    +------------------------+--------------------------+
                                             |  Iterative loop
                                             v
                    +---------------------------------------------------+
                    | LMHandler (TCP socket server)                     |
                    |   Routes llm_query() calls to LM backends         |
                    |   Depth-based model routing                       |
                    +------------------------+--------------------------+
                                             |
                                             v
                    +---------------------------------------------------+
                    | LLM Backend                                       |
                    |   Receives only: query + metadata about context   |
                    |   Never sees the full context                     |
                    +---------------------------------------------------+
```

**Execution flow:**

1. Initialize REPL with `context` variable containing the user's prompt
2. Add `llm_query()` function for recursive LM calls
3. Call the root LM with only the query + metadata (length, short prefix)
4. LM outputs code (in ` ```repl` blocks) to peek into / decompose the context
5. Execute code in REPL, capture truncated output
6. Append code + output metadata back to LM's history
7. Loop until LM outputs `FINAL(answer)` or `FINAL_VAR(variable_name)`

**REPL globals available to model code:**

| Global                                   | Purpose                                  |
| ---------------------------------------- | ---------------------------------------- |
| `context`                                | The input prompt as a string variable    |
| `llm_query(prompt, model=None)`          | Single LM completion, returns string     |
| `llm_query_batched(prompts, model=None)` | Parallel LM completions                  |
| `rlm_query(prompt, model=None)`          | Recursive sub-call (child gets own REPL) |
| `rlm_query_batched(prompts, model=None)` | Concurrent recursive sub-calls           |
| `FINAL(answer)`                          | Mark final answer (direct string)        |
| `FINAL_VAR(var_name)`                    | Mark final answer (from REPL variable)   |
| `SHOW_VARS()`                            | List user-created variables              |
| `custom_tools`                           | User-provided functions/data             |

**Wire protocol (LMHandler):** 4-byte big-endian length prefix + UTF-8 JSON payload over TCP socket. Each `completion()` call spawns a fresh handler on an OS-assigned port [[repo-rlm]].

## 4. The Filling and Solving Phases

RLMs naturally exhibit two phases (not explicitly programmed) [[paper], [blog-zhang]]:

**Filling phase:** The root LM iteratively probes the context — peeks at structure, writes code to inspect, gradually understands the data. It fills the REPL with code and logic to approach the task.

**Solving phase:** The root LM decides on a decomposition strategy, launches recursive sub-calls on partitions, aggregates results, and constructs or returns the final answer.

The transition is learned implicitly by the model based on the task.

## 5. Emergent Strategies

Without explicit training, RLMs naturally develop these patterns [[paper], [blog-zhang], [blog-tds]]:

**Peeking:** Look at the first N characters to understand structure.

```python
peek = context[:2000]
print(peek)
```

**Grepping:** Use regex to filter context without loading all of it.

```python
import re
matches = re.findall(r"keyword.*", context)
```

**Partition + Map:** Chunk context and sub-call for semantic work on each chunk.

```python
chunks = [context[i:i+10000] for i in range(0, len(context), 10000)]
results = [llm_query(f"Classify: {chunk}") for chunk in chunks]
```

**Summarization:** Compress subsets for final aggregation.

```python
summaries = [llm_query(f"Summarize: {doc}") for doc in documents]
final = llm_query(f"Combine: {summaries}")
```

**Long output construction:** Build unbounded output in a REPL variable.

```python
output_buffer = ""
for chunk in context_chunks:
    part = llm_query(f"Generate section for: {chunk}")
    output_buffer += part
FINAL_VAR(output_buffer)
```

## 6. Context Management

### How RLMs avoid context rot

1. **Root LM never sees the full context** — only metadata and sampled outputs
2. **Information flows through code execution** — the LM decides what to extract
3. **Recursion depth prevents accumulation** — sub-LMs see only their assigned chunk
4. **Variables accumulate knowledge** — results from sub-calls stored in REPL variables, selectively returned

### Compression

- Truncated stdout prevents history bloat
- Only metadata (prefix + length) appended each turn
- If root context trimmed to `c` tokens, max `K/c` root iterations allowed
- Each iteration can launch arbitrarily many sub-calls

### Compaction mode [[docs-client], [repo-recursive-llm]]

When enabled, the system monitors message token count. When it exceeds `compaction_threshold_pct` (default 85%) of the context limit, accumulated history is summarized via an LM call and replaced with a compact summary. Children inherit the compressed history.

## 7. Recursion and Depth

Recursion semantics from [[docs-client], [repo-rlm], [repo-minimal]]:

```
max_depth=3

RLM (depth=0)
 +-- rlm_query() -> Child RLM (depth=1) [own REPL + LMHandler]
      +-- rlm_query() -> Child RLM (depth=2) [own REPL + LMHandler]
           +-- rlm_query() -> plain llm_query() (depth=3 >= max_depth)
```

- `depth=0`: root RLM called by user
- Each child increments depth by 1
- At `depth >= max_depth`: `rlm_query()` falls back to `llm_query()` (leaf case)
- `llm_query()` is always a plain call regardless of depth
- Each child gets: new LMHandler (different port), new REPL (isolated namespace), remaining budget/timeout/tokens

**Key distinction:** `llm_query()` = single direct LM completion (fast, no REPL). `rlm_query()` = recursive sub-call that gets its own REPL and iteration loop (powerful but heavier).

The current paper explores only `max_depth=1`. Deeper recursion is architecturally supported but not yet benchmarked.

## 8. REPL Environments

Detailed in [[docs-repl], [docs-local], [docs-docker], [docs-modal]].

| Environment    | Isolation                                          | Speed   | Use Case                   |
| -------------- | -------------------------------------------------- | ------- | -------------------------- |
| **LocalREPL**  | Soft sandbox (shared process, restricted builtins) | Fastest | Development, trusted code  |
| **DockerREPL** | Process-level (container on host)                  | Medium  | CI/CD, reproducibility     |
| **ModalREPL**  | Full isolation (cloud VM)                          | Slowest | Production, untrusted code |

### LocalREPL

- Executes code in-process via Python `exec()`
- Persistent namespace: variables accumulate across iterations
- Restricted builtins: `eval`, `exec`, `compile`, `input` blocked
- Scaffold restoration after each `exec()` prevents corruption of reserved names

### DockerREPL

- Host runs HTTP proxy server
- Container calls proxy via `host.docker.internal`
- State persistence via `dill` serialization to `/workspace/state.dill`
- Custom images supported for pre-installed dependencies

### ModalREPL

- HTTP broker pattern with polling
- Sandbox runs Flask broker on port 8080
- Host polls `/pending` every 100ms
- Environment variables passed via Modal Image

## 9. Backends and Multi-Model Routing

Supported providers [[docs-backends]]: OpenAI, Anthropic, Portkey, OpenRouter, LiteLLM, vLLM.

Multiple backends enable depth-based routing:

```python
rlm = RLM(
    backend="openai",
    backend_kwargs={"model_name": "gpt-5"},
    other_backends=["anthropic"],
    other_backend_kwargs=[{"model_name": "claude-haiku-4"}],
)
```

Model code can then specify:

```python
result1 = llm_query(prompt)                        # Uses default (gpt-5)
result2 = llm_query(prompt, model="claude-haiku-4") # Uses cheaper model
```

The LMHandler routes based on depth + explicit model override, enabling expensive root reasoning with cheap sub-calls.

## 10. Configuration Surface

Key parameters from the official `RLM` constructor [[docs-client], [repo-rlm]]:

| Parameter                  | Default    | Purpose                                   |
| -------------------------- | ---------- | ----------------------------------------- |
| `backend`                  | `"openai"` | LM provider                               |
| `environment`              | `"local"`  | Execution environment                     |
| `max_depth`                | `1`        | Max recursion depth                       |
| `max_iterations`           | `30`       | Max REPL iterations per completion        |
| `max_budget`               | `None`     | Max USD cost                              |
| `max_timeout`              | `None`     | Max wall-clock seconds                    |
| `max_tokens`               | `None`     | Max total tokens (input + output)         |
| `max_errors`               | `None`     | Max consecutive REPL errors               |
| `persistent`               | `False`    | Reuse environment across completions      |
| `compaction`               | `False`    | Auto-summarize when context fills         |
| `compaction_threshold_pct` | `0.85`     | Fraction that triggers compaction         |
| `custom_tools`             | `None`     | Functions/data injected into REPL         |
| `on_subcall_start`         | `None`     | Callback: (depth, model, prompt_preview)  |
| `on_subcall_complete`      | `None`     | Callback: (depth, model, duration, error) |
| `verbose`                  | `False`    | Enable console output                     |
| `logger`                   | `None`     | Trajectory capture (RLMLogger)            |

## 11. Performance and Benchmarks

### Benchmark results from the paper [[paper]]

**S-NIAH (Simple Needle-in-Haystack):** Find a phrase in 8k-1M tokens of unrelated text. Constant complexity. Frontier models handle well.

**OOLONG (linear complexity):** Aggregate semantic labels over 131k tokens. RLM(GPT-5-mini) outperforms GPT-5 by 33-49% on 131k-263k contexts.

**OOLONG-Pairs (quadratic complexity):** Find pairs meeting semantic criteria. Frontier models nearly fail (0.1% F1). RLM(GPT-5) achieves 58% F1.

**BrowseComp-Plus (1k documents, 6-11M tokens):** Multi-hop QA. RLM(GPT-5) maintains 100% accuracy at 1000 documents. Base GPT-5 drops to ~0%. RLM cost: $0.99 avg.

**LongBench-v2 CodeQA (23k-4.2M tokens):** Code repository understanding. RLM outperforms base models and retrieval agents.

### Summary metrics

- RLMs process contexts up to **100x beyond model window** with strong performance
- On dense reasoning tasks: **2x performance** vs frontier models at comparable cost
- Cost is **comparable or cheaper** than base models on median runs (high variance on outliers)
- Performance degrades slower with context length than base models

### Community-reported results

- GPT-5-mini with RLM: best performer overall; 30%+ improvements on Oolong (real data) [[blog-pi], [blog-ddds]]
- RLM requires coding-grade models (GPT-5, Claude 3.5 Sonnet, Qwen-Coder); smaller models need distillation [[blog-tt], [blog-infoq]]
- Speed tradeoff: multiple turns and increased token generation, but saves context tokens on large documents [[blog-yogthos], [blog-tds]]
- Towards Data Science: 13 REPL steps to analyze 40 articles (386K tokens), ~3 min runtime [[blog-tds]]
- Yogthos: 4 iterations to correctly sum scattered financial figures that standard LLMs hallucinate [[blog-yogthos]]

## 12. RLM vs. Other Paradigms

| Approach                          | Context Handling                                 | Decomposition              | Expressiveness              |
| --------------------------------- | ------------------------------------------------ | -------------------------- | --------------------------- | --- | ----------- | --- | ------------- |
| **Standard LLM**                  | Full prompt in window                            | None                       | Single pass                 |
| **RAG**                           | Pre-retrieval, passive                           | Embedding similarity       | Limited to retrieved chunks |
| **ReAct/CodeAct agents**          | Full context + action verbalization              | Hand-engineered tool calls | ~10-100 explicit actions    |
| **MemGPT**                        | Deferred context management within single window | LM-driven but single-level | Same window constraints     |
| **Context folding/summarization** | Upfront compression                              | Lossy                      | Information loss            |
| **RLM**                           | External variable, never in window               | Code-driven, recursive     | Omega(                      | P   | ) or Omega( | P   | ^2) processes |

Key differentiator: RLMs enable **symbolic recursion inside code** — the model can write loops that spawn hundreds or thousands of sub-calls, while agents can only verbally specify a few actions per turn.

### Alignment with existing agentic patterns

Claude Code and similar tools already: peek at file structures, grep through codebases, selectively pull snippets. RLM formalizes and generalizes this pattern [[blog-ddds], [blog-tt]]. The community notes that developers already think in RLM terms — RLM provides the theoretical framework and optimal execution strategy.

## 13. Community Perspectives

### Why it matters

The community consensus frames RLM as a genuine innovation addressing a real, fundamental problem [[blog-neuron], [blog-tt], [blog-infoq]]. The shift from "storage to navigation" is seen as a conceptual breakthrough. RLM works orthogonally to attention improvements: better attention delays context rot; context folding through RL teaches models to actively manage contexts within those limits [[blog-pi]]. Prime Intellect frames RLM as "the defining paradigm of 2026," arguing it aligns with Sutton's "Bitter Lesson" — letting models learn optimal context management via RL rather than hand-engineering solutions [[blog-pi]].

### Grounding through code execution

Yogthos's Matryoshka project [[blog-yogthos], [repo-matryoshka]] highlights an underappreciated benefit: RLMs provide **grounding through code execution**. Rather than the model guessing whether sales figures sum correctly, code execution returns hard facts. Example: a document with 5 scattered sales figures in 4,700 chars of noise — standard LLM hallucinated $480K; RLM iterated 4 times and returned the correct $13M. This frames RLM not just as a context management technique, but as a **hallucination mitigation strategy** for precision tasks.

### Practical use cases

- **Legal:** Entire case histories, contract archives, regulatory documents
- **Software engineering:** Analyzing full codebases (millions of lines)
- **Research:** Synthesizing connections across hundreds of papers
- **Enterprise data:** Querying years of internal documents without pre-filtering
- **Financial analysis:** Summing figures accurately from full reports (code-verified arithmetic)

### Where RLM helps vs. hurts (Prime Intellect ablations) [[blog-pi]]

Prime Intellect ran comprehensive ablations across GPT-5-mini, GLM 4.6, GLM 4.5 Air, and INTELLECT-3:

| Task Type                                | RLM Effect           | Notes                                                  |
| ---------------------------------------- | -------------------- | ------------------------------------------------------ |
| **DeepDive (web research)**              | Strong improvement   | Sub-LLMs handle verbose content, root stays clean      |
| **Oolong (long-context classification)** | Strong improvement   | Real D&D data up to ~1.5M chars; maintains performance |
| **Verbatim copy**                        | Moderate improvement | Iterative refinement helps; higher token cost          |
| **Math-python**                          | **Regression**       | Models not trained to use sub-LLMs for verification    |

Key finding: **environment tips (strategy hints in system prompt) significantly improve RLM performance**. Without tips, RLM sometimes underperforms base LLM. With tips, models properly decompose and delegate.

### Consensus critique

RLM is broadly promising but **current frontier models haven't been trained on this paradigm** — they underutilize the scaffolding [[blog-pi], [paper]]. The paper's own experiments show untrained models sometimes perform worse with RLM scaffolding on certain tasks (math, verbatim copy) [[paper]]. True potential emerges after explicit RL training on the RLM strategy. Training the first natively recursive model (RLM-Qwen3-8B) via distillation from 1,072 quality trajectories improved base Qwen3-8B by 28.3% [[paper]].

### Latency vs. accuracy tradeoff

All sources acknowledge RLM is 10-50x slower than direct LLM calls due to multi-turn iteration and sub-LM calls [[blog-pi], [blog-yogthos]]. Towards Data Science reports ~3 minutes to analyze 40 articles (386K tokens) [[blog-tds]]. The tradeoff is acceptable for long-context tasks where direct LLM calls fail entirely, but makes RLM unsuitable for latency-sensitive applications.

### Framework adoption

DSPy added RLM support in v3.1.2+ [[blog-tds]]. Integration into mainstream agentic frameworks is underway. Local deployment is viable — Yogthos demonstrates RLM working with Ollama + Qwen-Coder [[blog-yogthos]], suggesting open-source models are becoming competitive for RLM sub-calls.

## 14. Existing Claude Code Plugin Landscape

Eight existing implementations were analyzed. They fall into four architectural categories:

### Category 1: Full plugin with hooks + budget tracking

**rand/rlm-claude-code** [[repo-rand], [spec-rand]] — The most comprehensive implementation.

- Rust + Python hybrid; Go binaries for hooks (5ms startup vs 500ms Python)
- Three-tier: intelligent orchestrator (complexity classifier), RLM execution engine, persistence layer
- REPL with 20+ helper functions (peek, search, summarize, llm, map_reduce, find_relevant)
- SQLite memory with Hyperedges (N-ary relationships), tiered (task/session/longterm/archive)
- `EnhancedBudgetTracker`: cost per task, per LLM call, per recursion level, configurable limits
- 3,200+ tests including Hypothesis property-based testing
- Event system for cross-plugin coordination

### Category 2: Skill + subagent scaffolds

**brainqub3/claude_code_RLM** [[repo-brainqub3]] — Minimal scaffold (~200 lines).

- Root LLM = main Claude conversation (Opus), sub-LLM = subagent (Haiku)
- Persistent Python REPL with peek/search/chunk/find/summarize
- State in `.claude/rlm_state/` directory
- No budget tracking, no cross-session memory

**BowTiedSwan/rlm-skill** [[repo-bowtied]] — Single file, filesystem-focused.

- Two modes: native (grep/find/ripgrep) and strict (programmatic slicing)
- Pipeline: Index -> Filter -> Map -> Reduce
- Parallel background agents (one per file)
- No memory, no budget

**JaredStewart/coderlm** [[repo-coderlm]] — Rust HTTP server + tree-sitter indexing.

- HTTP API: `/structure`, `/search`, `/impl`, `/callers`, `/grep`
- Tree-sitter parses 7 languages for precise symbol queries
- Multi-platform generator (Claude Code, Cursor, Windsurf, Copilot)
- No persistent memory or budget tracking

### Category 3: MCP servers

**EncrEor/rlm-claude** [[repo-encreor]] — 14 MCP tools + MAGMA 4-graph.

- Knowledge graph: semantic/temporal/causal/entity edges with Hebbian learning
- Tiered search: keyword -> BM25 -> fuzzy -> semantic -> hybrid RRF
- 3-zone lifecycle: Active -> Archive (gzip) -> Purge
- Auto-save PreCompact hooks; reminders at 10/20/30 turns
- 458 tests + 77 benchmarks

**richardwhiteii/rlm** [[repo-richardwhite]] — 12 MCP tools, single-file server.

- Context as named variables on disk
- `rlm_exec` for deterministic operations; `rlm_sub_query` for semantic
- Provider flexibility: Claude SDK or Ollama
- Recursive depth control (0-5)

**maydali28/memcp** [[repo-memcp]] — 24 MCP tools, most feature-complete.

- MAGMA 4-graph with Hebbian learning + exponential decay
- 6 chunking strategies; 5-tiered search with RRF
- Sub-agents: Analyzer, Mapper (parallel), Synthesizer
- Secret detection (8 regex patterns)
- 458 tests + 77 benchmarks

**delonsp/rlm-mcp-server** [[repo-delonsp]] — Remote execution for massive files.

- Docker Compose, SSH tunnel or public HTTPS
- Persistent Python REPL on VPS
- S3/Minio integration for enterprise repos
- PDF with OCR support (Mistral API)

### Comparative summary

| Feature           | rand       | brainqub3   | BowTiedSwan | coderlm     | EncrEor       | richardwhiteii | memcp         | delonsp   |
| ----------------- | ---------- | ----------- | ----------- | ----------- | ------------- | -------------- | ------------- | --------- |
| Type              | Plugin     | Skill+Agent | Skill       | Rust Server | MCP           | MCP            | MCP           | Remote    |
| Persistent Memory | SQLite     | No          | No          | No          | SQLite+Graph  | Filesystem     | SQLite+Graph  | No        |
| Cross-Session     | Yes        | No          | No          | No          | Yes           | No             | Yes           | No        |
| Budget Tracking   | Detailed   | No          | No          | No          | Implicit      | Implicit       | Implicit      | Implicit  |
| Recursion Depth   | 0-3        | Unbounded   | 1           | 0-5         | None          | 0-5            | None          | Unbounded |
| Sub-Agents        | No         | Yes         | Yes         | No          | No            | No             | Yes           | No        |
| Knowledge Graph   | Hyperedges | No          | No          | No          | MAGMA 4-graph | No             | MAGMA 4-graph | No        |
| Search            | Pattern    | Substring   | Keyword     | Tree-sitter | Hybrid 5-tier | No             | Hybrid 5-tier | Python    |
| Tests             | 3200+      | ~0          | ~0          | Moderate    | 458           | Moderate       | 458           | Moderate  |

### Design patterns worth noting

- **MCP protocol is dominant** — 4 of 8 implementations choose MCP for tool integration
- **Knowledge graphs appear in sophisticated implementations** — rand (Hyperedges), EncrEor and memcp (MAGMA)
- **Sub-agent parallelization** reduces latency in Map-Reduce (brainqub3, BowTiedSwan, memcp)
- **Budget control is rare** — only rand/rlm-claude-code has explicit depth + cost limits
- **PreCompact hooks** for auto-save appear in EncrEor and memcp

## 15. Node.js/TypeScript Implementation Patterns

Five Node.js/TypeScript implementations were analyzed for reusable patterns [[repo-hampton], [repo-rllm], [repo-opencode], [repo-matryoshka], [repo-scratchpad], [blog-devto]].

### Sandbox approaches

**Node.js VM module** [[repo-hampton], [repo-rllm]]:

- Uses built-in `vm.createContext()` for isolation
- No subprocess overhead, fast startup (<5ms)
- True async/await support via Promise-based callbacks
- Memory isolated via V8 contexts; CPU shared
- Disable code generation attacks: `{ codeGeneration: { strings: false, wasm: false } }`
- State persistence: transform `const x = 5` -> `globalThis.x = 5`

**V8 isolates** [[repo-rllm]]:

- Stricter isolation than VM module (prevents prototype pollution)
- Better for untrusted code
- More complex bindings

**Child process + REPL** [[repo-opencode]]:

- Spawns Bun subprocess with persistent REPL session
- IPC communication via JSON messages
- True subprocess isolation (can't crash host)
- Higher latency (IPC round-trip)
- Full recovery on crash (respawn subprocess)

### Standard sandbox bindings

```typescript
// Context/data
context: string | object

// Recursive calls
llm_query(prompt, subContext?)
llm_query_parallel(queries)

// Output capture
print(...args)

// Final answer signaling
FINAL(answer)
FINAL_VAR("variableName")

// Text processing tools (Hampton-io provides 14 built-in)
chunk(text, size), grep(text, pattern), len(text),
parseJSON(text), extractBetween(text, start, end),
sort/filter/group/flatten(array)
```

### Execution loop pattern

```typescript
for (let i = 0; i < maxIterations; i++) {
  const response = await llm.complete(messages);
  const code = parseCodeBlocks(response);
  const result = await sandbox.execute(code);
  const final = sandbox.getFinalAnswer();
  if (final) return final;
  messages.push({ role: 'user', content: formatResult(result) });
}
```

### Handle-based result storage [[repo-matryoshka]]

Large result arrays stored in SQLite, only handle stubs passed to the LLM:

```
// Instead of: Array[1000 objects] = 15,000 tokens
// Return:     "$res1: Array(1000) [preview...]" = 50 tokens
```

Operations chain on server; only materialize what's needed. Claims 97% token savings.

### Symbolic execution [[repo-matryoshka], [blog-yogthos]]

Alternative to arbitrary code: constrained S-expression language:

```scheme
(grep "SALES_DATA")
(filter RESULTS (lambda x (match x "NORTH" 0)))
(sum RESULTS)
<<<FINAL>>>13000000<<<END>>>
```

Reduced entropy (smaller valid output space), type-safe at parse time, works with 7B models.

### Cost tracking pattern

```typescript
class CostTracker {
  recordUsage(usage: TokenUsage, depth: number) {
    // Apply depth penalty: deeper calls cost more
    const depthMultiplier = Math.pow(1.5, depth);
    const cost = (usage.totalTokens / 1e6) * pricePerMToken * depthMultiplier;
    this.spent += cost;
    if (this.spent > this.maxCost) throw new BudgetExceededError();
  }
}
```

### Streaming events pattern

```typescript
type RLMEvent =
  | { type: 'iteration_start'; iteration: number }
  | { type: 'llm_query_start'; prompt: string }
  | { type: 'code_execution_start'; code: string }
  | { type: 'code_execution_end'; output: string; error?: string }
  | { type: 'final_answer'; answer: string };
```

## 16. Limitations and Open Problems

### Architectural limitations [[paper], [repo-rlm]]

1. **Sequential execution** — All sub-LM calls are blocking in the reference implementation. Async would improve throughput 10-100x.
2. **No formal cost/runtime guarantees** — Trajectory length varies wildly. Some tasks take seconds, others minutes.
3. **Fixed recursion depth** — Only `max_depth=1` explored in the paper. Deeper nesting supported but not benchmarked.
4. **Model-dependent behavior** — Different models use vastly different numbers of sub-calls for the same task (GPT-5: ~10, Qwen3-Coder: ~1000).
5. **Brittleness in answer termination** — Distinguishing "next iteration" from "final answer" via `FINAL()` / `FINAL_VAR()` tags is fragile.

### Model limitations [[paper], [blog-pi]]

6. **Thinking models struggle** — Models with heavy internal reasoning exhaust output tokens before completing tasks.
7. **Small models need training** — Base Qwen3-8B fails RLM tasks; fine-tuning on 1,000 trajectories improves by 28.3%.
8. **Prompt sensitivity** — System prompts need model-specific tuning (Qwen3-Coder needs sub-call limiting, smaller models need conservative batching).

### Training gap (critical) [[paper], [blog-pi]]

The most significant finding across the community: **current frontier models haven't been trained to exploit RLM scaffolding**. They underutilize sub-calls, make poor decomposition choices, and sometimes perform worse than without RLM. Prime Intellect's experiments confirm this — true gains emerge only after explicit RL training.

## 17. Future Directions

### Near-term [[paper], [blog-pi]]

1. **Training natively recursive models** — RL on RLM trajectories (highest priority)
2. **Variable recursion depth** — depth 0 (normal LLM + REPL) through arbitrary nesting
3. **Async sub-calls** — Non-blocking `llm_query()` for parallelism
4. **Custom functions** — Exposing user-defined functions in the REPL
5. **Multi-turn compaction** — Extending RLM naturally across conversations

### Medium-term [[blog-pi], [blog-tt], [blog-infoq]]

6. **Framework integration** — DSPy (already added v3.1.2+), LangGraph, CrewAI
7. **Multimodal support** — Images, video, custom data types
8. **Smaller specialized sub-models** — Trained specifically for RLM sub-call patterns
9. **Combination with MoE** — Efficient architectures for sub-calls

### Scaling law [[paper]]

If a frontier model improves to handle 10M tokens, an RLM wrapper enables handling 100M+ tokens at comparable cost — without architectural changes or retraining. RLM is an inference-time compute scaling axis alongside CoT and ReAct.

## 18. Key Takeaways for Plugin Design

These are observations distilled from the research, not design decisions.

### What the best implementations share

1. **Context externalization is non-negotiable** — The prompt must live outside the LLM's window as a manipulable variable
2. **Code execution enables expressiveness** — Without a REPL, you're limited to verbalized tool calls
3. **Budget/depth controls prevent runaway costs** — Only one implementation (rand) does this well
4. **Persistent memory across sessions adds significant value** — 3 of 8 plugins implement this; all 3 are the most sophisticated
5. **MCP is the dominant integration pattern** — 4 of 8 implementations choose it

### What's missing from the landscape

1. **No implementation combines all the best patterns** — budget tracking (rand) + knowledge graph (EncrEor/memcp) + sub-agents (brainqub3/memcp) + tree-sitter indexing (coderlm)
2. **JavaScript/TypeScript REPL is underexplored** — Most plugins use Python; only Hampton-io and rllm use Node.js VM
3. **No Claude Code plugin leverages Claude's native features well** — Extended thinking, prompt caching, tool_use blocks as alternatives to REPL code
4. **Trajectory visualization is absent from all plugins** — The paper's visualizer is Python/shadcn, not integrated into any Claude Code workflow
5. **No plugin adapts strategy based on task type** — The research shows RLM helps on some tasks and hurts on others; no plugin detects this

### Node.js VM is the pragmatic REPL choice for Claude Code [[repo-hampton], [repo-rllm]]

- No subprocess overhead (<5ms startup)
- True async/await support
- Memory isolation via V8 contexts
- State persistence via `globalThis` transformation
- Code generation attacks blocked via `vm.createContext` options
- Already proven in Hampton-io/RLM and code-rabi/rllm

### The training gap is the elephant in the room [[paper], [blog-pi]]

Current models aren't trained to use RLM optimally. A plugin can mitigate this through:

- Careful system prompt engineering (model-specific)
- Strategy hints in the REPL environment
- Guardrails (max iterations, budget limits, error thresholds)
- But these are workarounds, not solutions

---

## Source Material Index

### Paper

| Ref     | File                                                                                   | Source                                                       |
| ------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [paper] | [paper-arxiv--recursive-language-models.md](paper-arxiv--recursive-language-models.md) | [arxiv.org/abs/2512.24601](https://arxiv.org/abs/2512.24601) |

### Official Documentation

| Ref             | File                                                                                   | Page                     |
| --------------- | -------------------------------------------------------------------------------------- | ------------------------ |
| [docs-main]     | [docs-rlm--recursive-language-models.md](docs-rlm--recursive-language-models.md)       | Main page                |
| [docs-client]   | [docs-rlm--using-the-rlm-client.md](docs-rlm--using-the-rlm-client.md)                 | Using the RLM Client     |
| [docs-backends] | [docs-rlm--backends.md](docs-rlm--backends.md)                                         | Backends                 |
| [docs-repl]     | [docs-rlm--repl-environments.md](docs-rlm--repl-environments.md)                       | REPL Environments        |
| [docs-local]    | [docs-rlm--local-repl.md](docs-rlm--local-repl.md)                                     | LocalREPL                |
| [docs-docker]   | [docs-rlm--docker-repl.md](docs-rlm--docker-repl.md)                                   | DockerREPL               |
| [docs-modal]    | [docs-rlm--modal-repl.md](docs-rlm--modal-repl.md)                                     | ModalREPL                |
| [docs-viz]      | [docs-rlm--visualizing-rlm-trajectories.md](docs-rlm--visualizing-rlm-trajectories.md) | Visualizing Trajectories |

### Blog Posts & Articles

| Ref            | File                                                                                                                                               | Source                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| [blog-zhang]   | [blog-alex-zhang--recursive-language-models.md](blog-alex-zhang--recursive-language-models.md)                                                     | Alex L. Zhang              |
| [blog-pi]      | [blog-prime-intellect--recursive-language-models-the-paradigm-of-2026.md](blog-prime-intellect--recursive-language-models-the-paradigm-of-2026.md) | Prime Intellect            |
| [blog-tds]     | [blog-towards-data-science--going-beyond-the-context-window.md](blog-towards-data-science--going-beyond-the-context-window.md)                     | Towards Data Science       |
| [blog-neuron]  | [blog-the-neuron--recursive-language-models-the-clever-hack.md](blog-the-neuron--recursive-language-models-the-clever-hack.md)                     | The Neuron                 |
| [blog-ddds]    | [blog-daily-dose-of-ds--recursive-language-models.md](blog-daily-dose-of-ds--recursive-language-models.md)                                         | Daily Dose of Data Science |
| [blog-tt]      | [blog-techtalks--recursive-language-models.md](blog-techtalks--recursive-language-models.md)                                                       | TechTalks                  |
| [blog-infoq]   | [blog-infoq--mits-recursive-language-models.md](blog-infoq--mits-recursive-language-models.md)                                                     | InfoQ                      |
| [blog-devto]   | [blog-dev-to--bringing-rlm-to-typescript-building-rllm.md](blog-dev-to--bringing-rlm-to-typescript-building-rllm.md)                               | DEV Community              |
| [blog-yogthos] | [blog-yogthos--grounding-llms-with-recursive-code-execution.md](blog-yogthos--grounding-llms-with-recursive-code-execution.md)                     | yogthos.net                |

### Plugin Spec

| Ref         | File                                                                     | Source                    |
| ----------- | ------------------------------------------------------------------------ | ------------------------- |
| [spec-rand] | [docs-rand-rlm-claude-code--spec.md](docs-rand-rlm-claude-code--spec.md) | rand/rlm-claude-code spec |

### YouTube Videos

| Ref         | File                                                                                                                                                                                           | Channel                   |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| [yt-ax1]    | [yt-alphaxiv--recursive-language-models-w-alex-zhang-1.md](yt-alphaxiv--recursive-language-models-w-alex-zhang-1.md)                                                                           | alphaXiv                  |
| [yt-ax2]    | [yt-alphaxiv--recursive-language-models-w-alex-zhang-2.md](yt-alphaxiv--recursive-language-models-w-alex-zhang-2.md)                                                                           | alphaXiv                  |
| [yt-yacine] | [yt-deep-learning-with-yacine--exploring-recursive-language-models-with-alex-zhang.md](yt-deep-learning-with-yacine--exploring-recursive-language-models-with-alex-zhang.md)                   | Deep Learning with Yacine |
| [yt-delta]  | [yt-delta-institute--alex-zhang-recursive-language-model-creator.md](yt-delta-institute--alex-zhang-recursive-language-model-creator.md)                                                       | Delta Institute           |
| [yt-avb]    | [yt-neural-breakdown-with-avb--recursive-language-models-lets-build-the-coolest-agents-ever.md](yt-neural-breakdown-with-avb--recursive-language-models-lets-build-the-coolest-agents-ever.md) | Neural Breakdown with AVB |

### GitHub Repositories (Local Clones)

| Ref                  | Repository                  | Local Path                                     |
| -------------------- | --------------------------- | ---------------------------------------------- |
| [repo-rlm]           | alexzhang13/rlm             | D:/projects/github/alexzhang13/rlm             |
| [repo-minimal]       | alexzhang13/rlm-minimal     | D:/projects/github/alexzhang13/rlm-minimal     |
| [repo-fast]          | avbiswas/fast-rlm           | D:/projects/github/avbiswas/fast-rlm           |
| [repo-recursive-llm] | ysz/recursive-llm           | D:/projects/github/ysz/recursive-llm           |
| [repo-hampton]       | hampton-io/RLM              | D:/projects/github/hampton-io/RLM              |
| [repo-rllm]          | code-rabi/rllm              | D:/projects/github/code-rabi/rllm              |
| [repo-opencode]      | itsrainingmani/opencode-rlm | D:/projects/github/itsrainingmani/opencode-rlm |
| [repo-matryoshka]    | yogthos/Matryoshka          | D:/projects/github/yogthos/Matryoshka          |
| [repo-scratchpad]    | knot0-com/repl-scratchpad   | D:/projects/github/knot0-com/repl-scratchpad   |
| [repo-rand]          | rand/rlm-claude-code        | D:/projects/github/rand/rlm-claude-code        |
| [repo-brainqub3]     | brainqub3/claude_code_RLM   | D:/projects/github/brainqub3/claude_code_RLM   |
| [repo-bowtied]       | BowTiedSwan/rlm-skill       | D:/projects/github/BowTiedSwan/rlm-skill       |
| [repo-coderlm]       | JaredStewart/coderlm        | D:/projects/github/JaredStewart/coderlm        |
| [repo-encreor]       | EncrEor/rlm-claude          | D:/projects/github/EncrEor/rlm-claude          |
| [repo-richardwhite]  | richardwhiteii/rlm          | D:/projects/github/richardwhiteii/rlm          |
| [repo-memcp]         | maydali28/memcp             | D:/projects/github/maydali28/memcp             |
| [repo-delonsp]       | delonsp/rlm-mcp-server      | D:/projects/github/delonsp/rlm-mcp-server      |

### Plugin Spec

- [rand/rlm-claude-code spec](https://github.com/rand/rlm-claude-code/blob/main/rlm-claude-code-spec.md)
