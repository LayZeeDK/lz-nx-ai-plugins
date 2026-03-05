# Transformers.js Applicability Analysis for Nx RLM Plugin

Analysis of which `@huggingface/transformers` (transformers.js) tasks could enhance or unblock Nx RLM sub-components, given that local ONNX inference adds zero Anthropic subscription cost.

> **Context:** The Nx RLM plugin deferred `llm_query()` and `haiku-searcher` because agent teams are unsuitable (sync/async mismatch, 3-10x token cost) and direct Anthropic API calls are out of scope. This analysis evaluates whether `@huggingface/transformers` running ONNX models locally in Node.js provides a viable alternative.
>
> **Analysis date:** 2026-03-04

---

## TL;DR

- **`onnxruntime-node` IS a native N-API addon** -- this directly conflicts with the PROJECT.md constraint "Node.js LTS only, no native modules." Adopting transformers.js requires relaxing this constraint.
- **`onnxruntime-node` does ship `win32-arm64` binaries** (confirmed in the install-metadata.js platform matrix), so ARM64 Windows is supported natively without x64 emulation. However, the `onnxruntime-web` WASM backend cannot run inside the REPL VM sandbox due to `wasm: false` in the security policy.
- **Text generation models (distilgpt2, TinyLlama, phi-2) are not viable replacements for `llm_query()`** -- quality gap is too large vs. Claude Haiku for code-related queries, context windows are 512-2048 tokens (vs. Haiku's 200K), and model files are 200MB-2GB.
- **Sentence embeddings (`feature-extraction`) are the highest-viability task** -- small models like `Xenova/all-MiniLM-L6-v2` (22MB, 384-dim) could enable a `semantic_search()` REPL global that complements the deterministic `search()` (git grep). This is a NEW capability, not a replacement for a deferred one.
- **No transformers.js task should be included in v0.0.1.** The zero-dependency goal, native module constraint, and scope creep risk outweigh the benefits for the current milestone.
- **Embeddings-based semantic search is a strong candidate for v0.0.2+** under specific conditions: the "no native modules" constraint is revisited, and the core RLM thesis is validated first.
- The dependency footprint is substantial: `@huggingface/transformers` is ~46MB unpacked, `onnxruntime-node` is ~208MB unpacked, plus model files (22MB-2GB depending on task).

---

## Table of Contents

- [1. TL;DR](#tldr)
- [2. Context](#context)
- [3. Runtime Viability Assessment](#runtime-viability-assessment)
  - [3a. ONNX Runtime on ARM64 Windows](#3a-onnx-runtime-on-arm64-windows)
  - [3b. Node.js VM Sandbox Integration](#3b-nodejs-vm-sandbox-integration)
  - [3c. Cross-Platform Compatibility](#3c-cross-platform-compatibility)
  - [3d. Dependency Footprint](#3d-dependency-footprint)
- [4. Task-to-Sub-Component Mapping](#task-to-sub-component-mapping)
  - [4a. Text Generation](#4a-text-generation)
  - [4b. Feature Extraction / Sentence Similarity](#4b-feature-extraction--sentence-similarity)
  - [4c. Text Classification / Zero-Shot Classification](#4c-text-classification--zero-shot-classification)
  - [4d. Question Answering](#4d-question-answering)
  - [4e. Summarization](#4e-summarization)
  - [4f. Fill-Mask](#4f-fill-mask)
  - [4g. Token Classification / NER](#4g-token-classification--ner)
- [5. Impact on Deferred Decisions](#impact-on-deferred-decisions)
- [6. Recommendation](#recommendation)
- [7. Source Materials](#source-materials)

---

## Context

The Nx RLM plugin deferred two sub-components in v0.0.1:

1. **`llm_query()`** -- a REPL global that routes sub-LLM calls to a mechanical search agent. Quick-2 analysis [ANALYSIS_AGENT_TEAMS_NESTING] concluded that agent teams are unsuitable due to synchronous-to-asynchronous mismatch and 3-10x token cost multiplication. Recommendation: ship v0.0.1 without `llm_query()`.

2. **`haiku-searcher`** -- a Haiku-powered subagent for bounded search tasks, blocked by the subagent nesting constraint (repl-executor cannot spawn haiku-searcher because subagents cannot spawn other subagents).

Both deferrals stem from architectural constraints in Claude Code's agent system, not from a lack of desire for the capability. The "No Anthropic API dependency" constraint in [PROJECT.md] further blocks direct API calls as a workaround.

`@huggingface/transformers` (transformers.js) offers a potential third path: run ONNX models directly in the Node.js process. No API calls, no subscription cost, no agent nesting. The question is whether any transformers.js tasks provide practical value for the RLM plugin's specific use cases.

---

## Runtime Viability Assessment

Before mapping tasks to sub-components, we must establish whether transformers.js can run at all in the target environment.

### 3a. ONNX Runtime on ARM64 Windows

**`onnxruntime-node` native binary availability:**

The `onnxruntime-node` npm package (v1.21.0, pinned by `@huggingface/transformers` v3.8.1) uses a postinstall script that downloads platform-specific prebuilt binaries. The platform matrix from `install-metadata.js` in the [microsoft/onnxruntime] GitHub repository confirms:

| Platform | Arch    | Supported | Notes                                                  |
| -------- | ------- | :-------: | ------------------------------------------------------ |
| `win32`  | `x64`   |    Yes    | Base binary bundled in npm package                     |
| `win32`  | `arm64` |    Yes    | Base binary bundled in npm package                     |
| `linux`  | `x64`   |    Yes    | Base binary bundled; CUDA 12 EP available via download |
| `linux`  | `arm64` |    Yes    | Base binary bundled in npm package                     |
| `darwin` | `x64`   |    Yes    | Base binary bundled in npm package                     |
| `darwin` | `arm64` |    Yes    | Base binary bundled in npm package                     |

Key finding: **`win32/arm64` is explicitly listed** in the install-metadata requirements with an empty manifest array, meaning the base binary is already bundled in the npm tarball -- no additional downloads needed. The ONNX Runtime C++ library also ships `onnxruntime-win-arm64` release assets (71.5 MB in v1.24.2), confirming active ARM64 Windows support.

**No x64 emulation required.** The Snapdragon X Elite target machine runs `onnxruntime-node` natively on ARM64 without QEMU overhead.

**NPU access:** ONNX Runtime supports DirectML and QNN (Qualcomm Neural Network) execution providers for hardware acceleration. However, these are available in the C/C++ and Python APIs, not in the Node.js binding. The `onnxruntime-node` package uses the default CPU execution provider. NPU acceleration would require the Python API or a custom native binding -- both out of scope for this plugin.

### 3b. Node.js VM Sandbox Integration

The REPL sandbox uses `vm.createContext()` with strict security settings:

```javascript
codeGeneration: { strings: false, wasm: false }
```

This creates several integration constraints:

**WASM blocked inside sandbox:** The `wasm: false` setting prevents WebAssembly compilation inside the VM context. This means:

- `onnxruntime-web` (which uses WASM) **cannot run inside the sandbox**
- `onnxruntime-node` (native N-API addon) also **cannot be loaded inside the sandbox** -- `vm.createContext()` does not have access to native addons unless explicitly injected

**Resolution pattern:** Transformers.js pipelines must run in the **host process** (outside the sandbox), with results exposed to the sandbox as controlled globals. Example:

```javascript
// Host process (outside sandbox)
const { pipeline } = require('@huggingface/transformers');
const embedder = await pipeline(
  'feature-extraction',
  'Xenova/all-MiniLM-L6-v2',
);

// Expose to sandbox as a controlled global
context.semantic_search = async (query, scope) => {
  const embedding = await embedder(query, { pooling: 'mean', normalize: true });
  return findNearestNeighbors(embedding, indexedEmbeddings, scope);
};
```

**Asynchronous pipeline:** `pipeline()` returns a Promise, and model inference is asynchronous. The REPL expects synchronous globals. This is the same sync/async mismatch identified in the quick-2 analysis [ANALYSIS_AGENT_TEAMS_NESTING, section 2b], but with a key difference: the async work happens in the host process (not in another agent), so it can be awaited before returning to the synchronous REPL context. The host could pre-compute results or the REPL could support `await` expressions (the VM sandbox already runs in an async context).

**Model loading time:** First load downloads and caches the model from Hugging Face Hub (or a local cache). For a 22MB embedding model, this takes 2-10 seconds on a fast connection; for a 200MB text generation model, 10-60 seconds. Subsequent loads read from a local disk cache (~100-500ms). This startup cost argues for pre-loading models during workspace indexing, not on-demand during REPL execution.

**Memory footprint:** Even small models consume significant RAM:

| Model                       | Task            | Size on Disk | RAM Usage (approx.) |
| --------------------------- | --------------- | :----------: | :-----------------: |
| `Xenova/all-MiniLM-L6-v2`   | Embeddings      |    22 MB     |     ~100-200 MB     |
| `Xenova/distilgpt2`         | Text generation |    200 MB    |     ~400-600 MB     |
| `Xenova/phi-2`              | Text generation |    1.5 GB    |       ~2-3 GB       |
| `Xenova/distilbart-cnn-6-6` | Summarization   |    600 MB    |      ~1-1.5 GB      |

The target machine has 32 GB RAM, but Node.js default heap is 4 GB. Embedding models fit comfortably; text generation models may require `--max-old-space-size` adjustments.

### 3c. Cross-Platform Compatibility

| Platform                    | `onnxruntime-node` | `onnxruntime-web` (WASM) | Notes                                      |
| --------------------------- | :----------------: | :----------------------: | ------------------------------------------ |
| macOS x64                   |        Yes         |           Yes            | Both work                                  |
| macOS arm64 (Apple Silicon) |        Yes         |           Yes            | Both work                                  |
| Linux x64                   |        Yes         |           Yes            | Both work; CUDA EP available               |
| Linux arm64                 |        Yes         |           Yes            | Both work                                  |
| Windows x64                 |        Yes         |           Yes            | Both work                                  |
| Windows arm64               |        Yes         |           Yes            | Native ARM64 binary for `onnxruntime-node` |

**The native module constraint conflict:** [PROJECT.md] states "Node.js LTS only, no native modules." `onnxruntime-node` IS a native module -- it distributes prebuilt N-API (napi-v6) binaries for each platform. This is a **direct conflict** with the constraint.

The `onnxruntime-web` alternative avoids native modules (pure WASM), but:

1. Cannot run inside the VM sandbox (`wasm: false`)
2. Even outside the sandbox, WASM inference is 2-5x slower than native ONNX Runtime
3. Still works cross-platform in the host process

**Verdict:** If the "no native modules" constraint is strict, only `onnxruntime-web` (outside the sandbox) is viable, at a significant performance cost. If the constraint is relaxed for optional dependencies, `onnxruntime-node` provides native performance on all target platforms including ARM64 Windows.

### 3d. Dependency Footprint

The plugin currently has **zero npm dependencies** [PROJECT.md, Constraints]. Adding transformers.js would be a major change:

| Package                     | Unpacked Size | Role                                                               |
| --------------------------- | :-----------: | ------------------------------------------------------------------ |
| `@huggingface/transformers` |     46 MB     | Pipeline API, model loading, tokenization                          |
| `onnxruntime-node`          |    208 MB     | Native ONNX Runtime binary (platform-specific)                     |
| `onnxruntime-web`           |    131 MB     | WASM ONNX Runtime (alternative to native)                          |
| `@huggingface/jinja`        |    < 1 MB     | Template rendering for chat models                                 |
| `sharp`                     |    ~50 MB     | Image processing (only needed for vision tasks -- irrelevant here) |

**Total for NLP tasks with native runtime:** ~255 MB of npm dependencies before any model files.
**Total for NLP tasks with WASM runtime:** ~178 MB of npm dependencies before any model files.

Model files add 22 MB to 2 GB depending on the task (see section 3b).

This transforms the plugin from a zero-dependency JavaScript tool into one that ships hundreds of megabytes of native binaries and WASM files. The install time alone (downloading platform binaries in postinstall) would change the user experience significantly.

---

## Task-to-Sub-Component Mapping

For each potentially applicable NLP task, this section evaluates practical viability against specific RLM sub-components. Vision, Audio, and Multimodal tasks are excluded as irrelevant to code navigation.

### 4a. Text Generation

**Tasks:** `text-generation`, `text2text-generation`

**Sub-component:** `llm_query()` -- the deferred REPL global for sub-LLM calls.

**Use case:** The REPL executor asks `llm_query("What does function X do?")` during the fill/solve loop. Can a local ONNX model answer this from a code snippet?

**Assessment:**

| Factor                |           Local ONNX Model           |       Claude Haiku        |
| --------------------- | :----------------------------------: | :-----------------------: |
| Context window        |           512-2048 tokens            |      200,000 tokens       |
| Code understanding    | Poor (trained on prose/general text) | Strong (trained on code)  |
| Instruction following |                Basic                 |          Strong           |
| Model size            |            200 MB - 2 GB             |        N/A (cloud)        |
| Inference time        |        2-30 sec per response         |    ~1 sec per response    |
| Cost per query        |           Zero (local CPU)           | ~$0.001 (via Claude Code) |

Available ONNX text generation models for transformers.js:

- **`Xenova/distilgpt2`** (200 MB): 82M parameters, GPT-2 architecture. Generates plausible-looking text but cannot follow instructions or reason about code. Context: 1024 tokens.
- **`Xenova/TinyLlama-1.1B-Chat-v1.0`** (~600 MB): 1.1B parameters. Basic instruction following, but quality gap vs. Haiku is enormous for code understanding.
- **`Xenova/phi-2`** (~1.5 GB): 2.7B parameters. Better reasoning, but still far below Haiku for structured code navigation queries.

The fundamental problem: `llm_query()` in the RLM design handles queries like "find all ComponentStore files in libs/connect/cms/" -- these require understanding code patterns, project structure, and naming conventions. A 200MB-1.5GB local model cannot match Haiku's code comprehension for these tasks. The quality gap is not incremental; it is categorical.

Additionally, the 512-2048 token context windows mean the model cannot even receive a full code file as input. The RLM plugin operates on workspaces with files that routinely exceed 2048 tokens.

**Viability: LOW**

Local text generation models cannot meaningfully replace `llm_query()` for the RLM plugin's code navigation use cases. The quality and context window gaps are too large.

### 4b. Feature Extraction / Sentence Similarity

**Tasks:** `feature-extraction`, `sentence-similarity`

**Sub-component:** `search()` enhancement -- semantic search complementing the deterministic git grep.

**Use case:** User asks the explore skill "What handles authentication?" Semantic search over function names, file paths, and code comments could find relevant results that exact/regex matching misses.

**Assessment:**

The embedding model `Xenova/all-MiniLM-L6-v2` is compelling for this use case:

- **22 MB model file** -- small enough to bundle or cache without major impact
- **384-dimensional embeddings** -- good quality-to-size ratio
- **~10-50ms per embedding** on CPU -- fast enough for real-time query embedding
- **Proven in production** for semantic search, document retrieval, and similarity matching

**Integration pattern:**

1. During workspace indexing (or as a separate pre-computation step), embed workspace index entries: project names, source root paths, file names, and optionally first-line comments or function signatures.
2. Store embeddings alongside the workspace index (a float32 array of 384 values per entry).
3. At query time, embed the user's query and compute cosine similarity against the pre-computed embeddings.
4. Return the top-k most similar entries as candidates for further investigation.

This would enable a new REPL global: `semantic_search(query, scope?)` that returns entries semantically related to the query string, complementing the exact-match `search()` global.

**Example:**

```javascript
// Current: exact match only
let results = search('authentication', ['libs/']);
// Misses: "login-guard.ts", "jwt-validator.ts", "access-control.service.ts"

// With semantic search: finds related concepts
let results = semantic_search('authentication');
// Finds: "auth.guard.ts", "login.service.ts", "jwt-validator.ts", "access-control.service.ts"
```

**Limitations:**

- Embedding quality depends on training data -- `all-MiniLM-L6-v2` is trained on English prose, not code. Code-specific embedding models (e.g., `microsoft/unixcoder-base`) would be better but are larger (~500 MB).
- Pre-computing embeddings for a 537-project workspace with file-level granularity (thousands of files) would take 1-5 minutes and produce a 10-50 MB embedding index.
- The embeddings need to be recomputed when the workspace changes (new files, renamed projects).

**Viability: MEDIUM-HIGH**

Embeddings are the strongest candidate. The model is small, inference is fast, and semantic search adds genuine capability that git grep cannot provide. The limitation is that this is a NEW feature (not a replacement for a deferred one) and requires the native module constraint to be relaxed.

### 4c. Text Classification / Zero-Shot Classification

**Tasks:** `text-classification`, `zero-shot-classification`

**Sub-component:** Query intent routing -- classifying user queries to select the right REPL strategy.

**Use case:** Determine whether a user query is asking about dependencies ("What depends on shared-utils?"), file contents ("What does this function do?"), or project structure ("How many apps are there?"). Route to `deps()`, `read()`, or workspace index traversal accordingly.

**Assessment:**

Zero-shot classification with `Xenova/distilbart-mnli-12-1` (~300 MB) can classify text into arbitrary categories without task-specific training:

```javascript
const classifier = await pipeline(
  'zero-shot-classification',
  'Xenova/distilbart-mnli-12-1',
);
const result = await classifier('What projects depend on shared-utils?', {
  candidate_labels: [
    'dependency query',
    'file content query',
    'project structure query',
  ],
});
// { labels: ["dependency query", ...], scores: [0.87, ...] }
```

However, this routing function is exactly what the `repl-executor` (Sonnet) already does as part of its code generation. When Sonnet generates REPL code, it inherently classifies the query and routes to the appropriate globals. Adding a separate classification model for routing is redundant -- it would classify the query, then Sonnet would still generate the code anyway.

The only scenario where pre-classification adds value is if it reduces REPL iterations by giving the executor a hint about which globals to use. But this optimization is premature -- the baseline (Sonnet generating code directly) has not been measured yet.

**Viability: LOW**

Redundant with the repl-executor's inherent classification capability. Sonnet's code generation already routes queries to appropriate globals. Adding a separate classification model adds complexity without clear benefit.

### 4d. Question Answering

**Task:** `question-answering`

**Sub-component:** Post-read comprehension -- answering questions about code that has been loaded via `read()`.

**Use case:** After `read(file)` loads a code file into the REPL, `qa(code, "What does this function return?")` extracts the answer from the code text.

**Assessment:**

Extractive QA models (e.g., `Xenova/distilbert-base-cased-distilled-squad`, ~250 MB) work by finding a span in the input text that answers the question. For prose documents, this works well:

```
Input: "The function calculates the total price including tax at 8.5%."
Question: "What tax rate is used?"
Answer: "8.5%" (extracted span)
```

For code, this approach is problematic:

- Code answers often require synthesis, not extraction. "What does this function return?" might need "It returns a filtered array of active users" -- but the code says `return users.filter(u => u.active)`. The model would extract `users.filter(u => u.active)` as a span, which is not a useful natural-language answer.
- Context window limitations (512 tokens for most QA models) restrict input to small code snippets.
- QA models are trained on SQuAD (English prose), not code comprehension tasks.

The `repl-executor` (Sonnet) can already reason about `read()` output far more effectively than an extractive QA model.

**Viability: LOW**

Extractive QA over code produces unhelpful span extractions rather than synthesized answers. The repl-executor's own reasoning is categorically better for code comprehension.

### 4e. Summarization

**Task:** `summarization`

**Sub-component:** Result compression -- summarizing large search results or file contents before including in REPL output.

**Use case:** The handle store contains a large result from `search()`. Summarize it before including in the next REPL iteration to stay within context limits.

**Assessment:**

Summarization models (`Xenova/distilbart-cnn-6-6`, ~600 MB) are trained on news articles (CNN/DailyMail dataset). They produce abstractive summaries of prose text.

For code-related results, this fails:

- Search results are lists of file paths and line matches -- not prose paragraphs. Summarizing "libs/auth/src/guard.ts:15: export class AuthGuard" into a prose summary is nonsensical.
- Code files have structural meaning (imports, exports, function signatures) that prose summarization models cannot preserve.
- The handle-based result storage already solves the "large result" problem: the handle store keeps full results in memory, passing only lightweight stubs (e.g., `[Handle #3: 47 items]`) to the LLM context.

**Viability: LOW**

Prose summarization models are not designed for code or structured search results. The handle store already solves the large-result problem more effectively.

### 4f. Fill-Mask

**Task:** `fill-mask`

**Sub-component:** None directly applicable.

**Use case:** Predicting missing code tokens. Example: `let result = users.[MASK](u => u.active)` -> predicts `filter`.

**Assessment:**

Fill-mask models (e.g., `Xenova/bert-base-uncased`, ~400 MB) predict masked tokens in a sentence. For code, this is essentially code completion -- predicting the next token or a masked token in a code sequence.

This is not an RLM use case. The RLM plugin navigates and queries code; it does not write or complete code. Code completion is handled by Claude itself (or GitHub Copilot) during the main conversation, not inside the REPL sandbox.

**Viability: LOW**

Not relevant to the RLM plugin's navigation and exploration purpose.

### 4g. Token Classification / NER

**Task:** `token-classification`

**Sub-component:** Code entity extraction -- identifying function names, class names, imports from code text.

**Use case:** After `read(file)` loads code, extract named entities (function names, class names, variable names) for indexing or cross-referencing.

**Assessment:**

NER models (e.g., `Xenova/bert-base-NER`, ~400 MB) are trained on CoNLL-2003 (English news text) to recognize Person, Organization, Location, and Miscellaneous entities. They have no concept of code entities (function declarations, class names, import statements, TypeScript types).

Code-aware NER would require:

- A code-specific NER model trained on annotated source code
- Such models exist in research (e.g., CodeBERT) but few are available as ONNX models for transformers.js
- Even with a code NER model, the workspace indexer already extracts project names, file paths, and (via tsconfig) path aliases. Function-level extraction would require AST parsing, which is more reliable than statistical NER.

For code entity extraction, AST-based tools (TypeScript compiler API, tree-sitter) are categorically more accurate and reliable than NER models. They produce exact results; NER models produce probabilistic guesses.

**Viability: LOW**

NER models trained on prose cannot identify code entities. AST-based extraction is more accurate, more reliable, and does not require ML models.

---

## Viability Summary

| Task                            | Sub-Component             |  Viability  | Key Rationale                                                                       |
| ------------------------------- | ------------------------- | :---------: | ----------------------------------------------------------------------------------- |
| Text Generation                 | `llm_query()` replacement |     LOW     | Quality gap vs. Haiku is categorical; 512-2048 token context window is insufficient |
| Feature Extraction / Embeddings | `semantic_search()` (NEW) | MEDIUM-HIGH | Small model (22 MB), fast inference, adds capability git grep lacks                 |
| Text Classification             | Query intent routing      |     LOW     | Redundant with repl-executor's inherent classification                              |
| Question Answering              | Post-read comprehension   |     LOW     | Extractive QA over code produces unhelpful span extractions                         |
| Summarization                   | Result compression        |     LOW     | Prose models fail on code; handle store already solves the problem                  |
| Fill-Mask                       | N/A                       |     LOW     | Not an RLM navigation use case                                                      |
| Token Classification / NER      | Code entity extraction    |     LOW     | Prose NER cannot identify code entities; AST tools are superior                     |

---

## Impact on Deferred Decisions

### 5a. `llm_query()` Deferral

Quick-2 analysis concluded: "Ship v0.0.1 without `llm_query()`" [ANALYSIS_AGENT_TEAMS_NESTING, section 5].

**Does local text generation change this?** No. The quality gap between local models (distilgpt2, TinyLlama, phi-2) and Claude Haiku for code-related queries is categorical, not incremental. Local models:

- Cannot follow complex instructions ("find all ComponentStore files in the cms domain")
- Have 512-2048 token context windows (vs. Haiku's 200K)
- Cannot reason about code structure or naming conventions
- Would produce unreliable, often nonsensical responses for the mechanical search tasks that `llm_query()` targets

**Could embeddings partially fill the gap?** Partially, but differently. Semantic search via embeddings does not replace `llm_query()` -- it adds a different capability. Where `llm_query()` was designed to delegate bounded reasoning tasks to Haiku, embeddings provide fuzzy matching over pre-indexed terms. Embeddings can find "files related to authentication" but cannot answer "what state management pattern does this store use?"

The deferral of `llm_query()` remains the correct decision for v0.0.1, and transformers.js does not change the calculus.

### 5b. `haiku-searcher` Deferral

`haiku-searcher` was deferred because it requires a sub-LLM call from within a subagent (repl-executor -> haiku-searcher), which is blocked by the subagent nesting constraint.

**Local models sidestep the nesting constraint.** A local ONNX model runs in the host process, not as a Claude subagent. No nesting, no async messaging, no agent teams. This is the strongest architectural argument for local models.

**However, the quality question remains.** `haiku-searcher` was designed for mechanical search tasks: "find all files matching pattern X in scope Y, return file paths." These tasks are already handled by the deterministic `search()` global (git grep). The only `haiku-searcher` use case that deterministic search cannot handle is semantic understanding -- which brings us back to the quality gap.

A 22MB embedding model can find "files related to authentication" via semantic similarity. But it cannot perform the bounded reasoning tasks that Haiku would handle (e.g., "classify these 15 search results by relevance to the user's query"). For bounded reasoning, there is no local model substitute at acceptable quality.

**Verdict:** Local models do not unblock `haiku-searcher`. The nesting constraint is sidestepped, but the quality gap for reasoning tasks remains. The deterministic `search()` global handles the mechanical portion; the reasoning portion still requires a capable LLM (Haiku or better).

### 5c. New Capabilities Not in Current Design

**`semantic_search(query, scope?)` as a new REPL global:**

This was not in the original design. Semantic search via embeddings is a genuinely new capability that complements the existing `search()` global (exact/regex matching via git grep).

| Capability               |    `search()` (git grep)    |    `semantic_search()` (embeddings)     |
| ------------------------ | :-------------------------: | :-------------------------------------: |
| Exact string match       |             Yes             |                   No                    |
| Regex patterns           |             Yes             |                   No                    |
| Semantic similarity      |             No              |                   Yes                   |
| "Find code related to X" | Only if X appears literally |      Yes, via embedding similarity      |
| Speed                    |      ~50ms (git grep)       |      ~10-50ms query + index lookup      |
| Dependency footprint     |     Zero (git, Node.js)     |  ~255 MB (`onnxruntime-node` + model)   |
| Reliability              |        Deterministic        | Probabilistic (may miss or hallucinate) |

**Assessment:** Semantic search adds genuine value for exploratory queries where the user does not know the exact terms to search for. It does not replace `search()` but complements it. The question is whether this value justifies the dependency footprint and constraint changes.

For a 537-project workspace, the embedding index would contain project names (~537 entries), file paths (~10,000+ entries), and optionally function signatures (~50,000+ entries). At 384 dimensions x 4 bytes per float32, this is:

- Project-level index: ~800 KB
- File-level index: ~15 MB
- Function-level index: ~75 MB

Pre-computing these embeddings would take 1-10 minutes depending on granularity. The index would need incremental updates when the workspace changes.

---

## Recommendation

### For v0.0.1: Do Not Include Any Transformers.js Tasks

**Rationale:**

1. **Zero-dependency goal.** The plugin currently has zero npm dependencies. Adding ~255 MB of native binaries (onnxruntime-node) or ~178 MB of WASM files (onnxruntime-web) is a fundamental change to the plugin's character. Users installing a Claude Code plugin expect kilobytes of JavaScript, not hundreds of megabytes of ML runtime.

2. **Native module constraint conflict.** `onnxruntime-node` is a native N-API addon, which directly violates the "no native modules" constraint in [PROJECT.md]. While this constraint could be relaxed, doing so in v0.0.1 -- before the core RLM thesis is validated -- is premature.

3. **Scope creep risk.** The highest-viability task (embeddings) is a NEW feature, not a fix for a deferred one. Adding semantic search to v0.0.1 adds complexity to the REPL sandbox, workspace indexer (embedding pre-computation), and handle store (embedding index management) without contributing to the core goal: validating whether the RLM REPL approach reduces tokens vs. standard exploration.

4. **No deferred feature is unblocked.** Neither `llm_query()` nor `haiku-searcher` is practically unblocked by local models. The quality gap for code reasoning tasks is too large. The deterministic globals already cover the mechanical search use cases.

### For v0.0.2+: Embeddings-Based Semantic Search

**Candidate:** `feature-extraction` with `Xenova/all-MiniLM-L6-v2` (or a code-specific embedding model if available as ONNX).

**Conditions for adoption:**

1. **Core RLM thesis validated.** The v0.0.1 explore skill must demonstrate at least 1.5x token reduction vs. standard exploration. If the core approach fails, adding semantic search is irrelevant.

2. **"No native modules" constraint revisited.** The constraint was set to minimize install complexity and maximize cross-platform compatibility. If v0.0.1 validates the approach and users want richer search, relaxing the constraint for an optional `onnxruntime-node` dependency is reasonable. The WASM fallback (`onnxruntime-web`) provides a no-native-module alternative at reduced performance.

3. **Embedding index strategy designed.** Before adopting embeddings, the workspace indexer needs a strategy for: what to embed (project names, file paths, function signatures), when to update embeddings (on workspace change, on demand, on session start), and where to store the index (alongside the workspace index JSON, separate file, in-memory only).

4. **Model packaging strategy defined.** Options: bundle model in plugin (adds 22 MB to install), download on first use (requires network), or require user to pre-download (complicates setup). Each has trade-offs for offline use, install size, and first-run experience.

**Proposed milestone placement:** v0.0.2 or v0.1.0, after the core RLM foundation is proven and users have provided feedback on what exploration capabilities are missing.

### Architecture Considerations (If Adopted Later)

**Where transformers.js fits:**

```
Host process (Node.js)
  |-- Transformers.js pipeline (embeddings)
  |-- Embedding index (pre-computed, updated on workspace change)
  |-- REPL sandbox (vm.createContext)
        |-- semantic_search() -> calls host process via controlled global
        |-- search() -> calls git grep via host process
        |-- read() -> calls fs.readFile via host process
```

Key architectural decisions:

- **Host process, not VM sandbox.** ML models run in the host process. The sandbox receives results via controlled globals.
- **Pre-computed embeddings.** Embedding the entire workspace at session start or during indexing. Query-time embedding is fast (~10ms) but index pre-computation takes minutes.
- **Optional dependency.** `onnxruntime-node` (or `onnxruntime-web`) as an optional peer dependency. The plugin works without it (semantic search unavailable); with it, `semantic_search()` becomes available.
- **Model caching.** Use transformers.js built-in cache (`~/.cache/huggingface/`) or a plugin-specific cache directory. Models are downloaded once, cached indefinitely.

### The Native Module Constraint

Does this analysis warrant revisiting the "no native modules" constraint in [PROJECT.md]?

**Not for v0.0.1.** The constraint serves a valid purpose: minimizing install complexity and maximizing portability. The core RLM plugin does not need native modules -- workspace indexing, REPL sandbox, handle store, and deterministic commands are all pure JavaScript.

**Potentially for v0.0.2+.** If embeddings prove valuable, the constraint could be relaxed in two ways:

1. **Optional native dependency:** `onnxruntime-node` as an optional dependency. If present, use native inference. If absent, either fall back to `onnxruntime-web` (WASM, slower) or disable semantic search entirely.

2. **Separate plugin:** Package semantic search as a separate plugin (`lz-nx.rlm-embeddings`) that depends on the base plugin. Users who want semantic search install the extension; users who want a lightweight tool use the base plugin only.

Option 2 is the more conservative approach and aligns with the plugin architecture (plugins can extend other plugins).

---

## Source Materials

| Reference                      | Path                                                                    | Relevance                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [PROJECT.md]                   | `.planning/PROJECT.md`                                                  | Active requirements, REPL sandbox design, constraints (no native modules, zero dependencies) |
| [ROADMAP.md]                   | `.planning/ROADMAP.md`                                                  | Phase structure, v0.0.1 scope                                                                |
| [ANALYSIS_AGENT_TEAMS_NESTING] | `research/claude-plugin/ANALYSIS_AGENT_TEAMS_NESTING.md`                | Quick-2 findings on llm_query() deferral, sync/async mismatch, token cost                    |
| [BRAINSTORM.md]                | `research/claude-plugin/BRAINSTORM.md`                                  | RLM plugin design, token projections, REPL globals                                           |
| [@huggingface/transformers]    | [npm registry](https://www.npmjs.com/package/@huggingface/transformers) | v3.8.1, 46 MB unpacked, depends on onnxruntime-node v1.21.0 and onnxruntime-web              |
| [onnxruntime-node]             | [npm registry](https://www.npmjs.com/package/onnxruntime-node)          | v1.21.0 (pinned by transformers), 208 MB unpacked, N-API addon with win32-arm64 support      |
| [onnxruntime-web]              | [npm registry](https://www.npmjs.com/package/onnxruntime-web)           | v1.24.2, 131 MB unpacked, WASM backend                                                       |
| [microsoft/onnxruntime]        | [GitHub](https://github.com/microsoft/onnxruntime)                      | Platform binary matrix (install-metadata.js confirms win32/arm64 support)                    |
| [Xenova/all-MiniLM-L6-v2]      | [Hugging Face](https://huggingface.co/Xenova/all-MiniLM-L6-v2)          | 22 MB embedding model, 384 dimensions                                                        |
| [Xenova/distilgpt2]            | [Hugging Face](https://huggingface.co/Xenova/distilgpt2)                | 200 MB text generation model, 82M parameters                                                 |
