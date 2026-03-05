---
phase: quick
plan: 3
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/quick/3-analyze-huggingface-transformers-support/ANALYSIS.md
autonomous: true
requirements: []
must_haves:
  truths:
    - 'Each potentially applicable transformers.js task is mapped to specific RLM sub-components with concrete use cases'
    - 'Model size, startup time, and ONNX Runtime compatibility are assessed for the target platform (Node.js LTS, ARM64 Windows, cross-platform)'
    - 'The analysis clearly states whether transformers.js can unblock llm_query() or haiku-searcher, with rationale'
    - 'Node.js VM sandbox integration constraints are evaluated (synchronous execution, no native modules, cross-platform)'
    - 'A concrete recommendation is provided: which tasks (if any) should be adopted and in which milestone'
  artifacts:
    - path: '.planning/quick/3-analyze-huggingface-transformers-support/ANALYSIS.md'
      provides: 'Applicability analysis of @huggingface/transformers tasks for Nx RLM sub-components'
      min_lines: 150
  key_links: []
---

<objective>
Analyze which tasks from the `@huggingface/transformers` npm package (transformers.js) could enhance or unblock Nx RLM sub-components, given that local inference adds zero Anthropic subscription cost.

Purpose: The Nx RLM plugin deferred `llm_query()` and `haiku-searcher` because agent teams are unsuitable (sync/async mismatch, 3-10x token cost) and direct Anthropic API calls are out of scope. `@huggingface/transformers` runs ONNX models directly in Node.js -- no API calls, no subscription cost. This analysis determines whether any transformers.js tasks provide practical value for RLM sub-components (especially the deferred ones) and what the integration trade-offs are.

Output: `.planning/quick/3-analyze-huggingface-transformers-support/ANALYSIS.md`
</objective>

<execution_context>
@C:/Users/LarsGyrupBrinkNielse/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/LarsGyrupBrinkNielse/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@research/claude-plugin/BRAINSTORM.md
@research/claude-plugin/ANALYSIS_AGENT_TEAMS_NESTING.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Research transformers.js runtime constraints and ONNX compatibility</name>
  <files>.planning/quick/3-analyze-huggingface-transformers-support/ANALYSIS.md</files>
  <action>
Write a structured markdown analysis document evaluating `@huggingface/transformers` (transformers.js) tasks for applicability to Nx RLM sub-components. The document must go beyond listing supported tasks -- it must analyze practical viability against the plugin's specific constraints.

**Structure the document as:**

1. **TL;DR** -- 5-7 bullet point summary of findings and recommendation.

2. **Context** -- What this analysis is for:
   - The Nx RLM plugin deferred `llm_query()` and `haiku-searcher` (quick-2 analysis concluded agent teams are unsuitable)
   - The "No Anthropic API dependency" constraint (PROJECT.md) blocks direct API calls
   - `@huggingface/transformers` runs ONNX Runtime models in Node.js without API calls
   - This analysis evaluates whether local inference fills the gap

3. **Runtime Viability Assessment** -- Before mapping tasks to sub-components, establish whether transformers.js can run at all in the target environment. Research and document:

   **3a. ONNX Runtime on ARM64 Windows:**
   - `onnxruntime-node` native binary availability for Windows ARM64 (check npm registry for `onnxruntime-node` platform binaries -- does `win32-arm64` exist or does it require x64 emulation?)
   - If x64 emulation required: performance penalty on Snapdragon X Elite (QEMU overhead)
   - The `onnxruntime-web` alternative uses WebAssembly -- check if this is viable in Node.js (WASM runs cross-platform)
   - NPU access: Qualcomm Hexagon NPU via ONNX Runtime DirectML or QNN execution provider -- is this available in the Node.js binding?

   **3b. Node.js VM Sandbox Integration:**
   - The REPL sandbox uses `vm.createContext()` with `codeGeneration: { strings: false, wasm: false }`
   - `wasm: false` blocks WebAssembly compilation inside the sandbox -- this means `onnxruntime-web` cannot run INSIDE the VM
   - Transformers.js model loading is asynchronous (`pipeline()` returns a Promise) -- the REPL expects synchronous REPL globals
   - Model loading time: first load downloads and caches the model (hundreds of MB for text generation models); subsequent loads read from disk cache
   - Memory footprint: even small models (e.g., `Xenova/distilgpt2`) use 200-500MB RAM; the target machine has 32GB but Node.js default heap is 4GB

   **3c. Cross-Platform Compatibility:**
   - macOS: `onnxruntime-node` has `darwin-arm64` and `darwin-x64` binaries
   - Linux: `onnxruntime-node` has `linux-x64` and `linux-arm64` binaries
   - Windows: `onnxruntime-node` has `win32-x64` -- check if `win32-arm64` exists
   - The "Node.js LTS only, no native modules" constraint in PROJECT.md -- `onnxruntime-node` IS a native module (N-API addon). This is a direct conflict with the constraint.
   - Alternative: `onnxruntime-web` is pure WASM, no native modules, but has the `wasm: false` sandbox issue

   **3d. Dependency Footprint:**
   - `@huggingface/transformers` npm package size
   - `onnxruntime-node` or `onnxruntime-web` as peer dependency
   - Model file sizes for relevant tasks (text generation: 200MB-2GB; embeddings: 50-200MB; text classification: 50-100MB)
   - The plugin currently has ZERO npm dependencies -- adding transformers.js would be a major dependency footprint change

4. **Task-to-Sub-Component Mapping** -- For each potentially applicable transformers.js task, evaluate against specific RLM sub-components. Focus ONLY on NLP tasks (Vision, Audio, and Multimodal are irrelevant for code navigation). Evaluate these tasks:

   **4a. Text Generation (`text-generation`, `text2text-generation`):**
   - Could this replace `llm_query()`? Analyze: model quality for code-related queries (distilgpt2, phi-2, TinyLlama vs. Haiku for mechanical search tasks), context window limitations (most small models: 512-2048 tokens vs. Haiku's 200K), generation quality for structured code navigation queries
   - Specific use case: repl-executor asks "What does function X do?" -- can a 200MB local model answer this from a code snippet?
   - Verdict: Rate viability as HIGH / MEDIUM / LOW with rationale

   **4b. Feature Extraction / Sentence Similarity (`feature-extraction`, `sentence-similarity`):**
   - Could embeddings enhance `search()` with semantic search? Currently search() is git grep (exact/regex matching). Embeddings enable "find functions similar to X" or "find code related to authentication"
   - Specific use case: user asks explore skill "What handles authentication?" -- semantic search over function names / file paths / code comments could complement git grep
   - Model considerations: `Xenova/all-MiniLM-L6-v2` (22MB, 384-dim embeddings) is small and fast
   - Integration pattern: pre-compute embeddings for workspace index entries (project names, file paths, maybe function signatures); at query time, embed the query and find nearest neighbors
   - Verdict: Rate viability

   **4c. Text Classification / Zero-Shot Classification (`text-classification`, `zero-shot-classification`):**
   - Could this classify code files, projects, or query intents? e.g., "Is this a library or application project?", "Is this query asking about dependencies or file contents?"
   - Specific use case: route user queries to the right REPL strategy (dependency navigation vs. file search vs. code reading)
   - Verdict: Rate viability

   **4d. Question Answering (`question-answering`):**
   - Extractive QA: given a passage of code or documentation, extract the answer to a question
   - Specific use case: after `read(file)` loads code, `qa(code, "What does this function return?")` extracts the answer
   - Limitation: extractive QA only returns spans from the input text -- it cannot synthesize or reason
   - Verdict: Rate viability

   **4e. Summarization (`summarization`):**
   - Could this summarize large code files or search results before passing to the LLM?
   - Specific use case: handle store has a large result -- summarize it before including in the REPL output
   - Limitation: summarization models are trained on prose, not code
   - Verdict: Rate viability

   **4f. Fill-Mask (`fill-mask`):**
   - Could this predict missing code tokens?
   - Specific use case: limited -- mostly relevant for code completion, which is not an RLM use case
   - Verdict: Rate viability (likely LOW)

   **4g. Token Classification / NER (`token-classification`):**
   - Could this extract named entities from code (function names, class names, imports)?
   - Limitation: NER models are trained on prose entities (persons, organizations), not code entities
   - Verdict: Rate viability

5. **Impact on Deferred Decisions** -- Analyze whether transformers.js changes the calculus for:

   **5a. `llm_query()` deferral:**
   - Quick-2 analysis concluded: "Ship v0.0.1 without llm_query()"
   - Does local text generation change this? Consider: model quality gap (distilgpt2 vs. Haiku), the native module constraint conflict, the async pipeline() vs. synchronous REPL issue
   - If text generation is not viable for llm_query(), could embeddings or classification provide a different kind of "intelligence" that partially fills the gap?

   **5b. `haiku-searcher` deferral:**
   - haiku-searcher was deferred because it requires a sub-LLM call from within a subagent
   - Local models sidestep the nesting constraint entirely (no Claude API, no subagent spawning)
   - But: does a 200MB local model match Haiku's quality for mechanical search tasks?

   **5c. New capabilities not in current design:**
   - Semantic search via embeddings could be a NEW REPL global: `semantic_search(query, scope?)`
   - This was not in the original design -- assess whether it adds genuine value vs. complexity

6. **Recommendation** -- Clear, actionable recommendation structured as:
   - **For v0.0.1:** Should any transformers.js task be included? (Consider: zero-dependency goal, native module constraint, scope creep risk)
   - **For v0.0.2+:** Which tasks are candidates for future milestones? Under what conditions?
   - **Architecture considerations:** If adopted later, where does transformers.js fit? (host process, not VM sandbox; exposed as controlled globals; model caching strategy)
   - **The native module constraint:** Does this analysis warrant revisiting the "no native modules" constraint in PROJECT.md? Or does `onnxruntime-web` (WASM) provide a viable workaround?

7. **Source Materials** -- Links to referenced research documents and npm packages.

**Research approach:**

- Check `@huggingface/transformers` npm page for supported backends and model list
- Check `onnxruntime-node` npm page for platform binary matrix
- Check `onnxruntime-web` npm page for WASM backend details
- Reference PROJECT.md constraints, quick-2 ANALYSIS_AGENT_TEAMS_NESTING.md findings
- For model sizes and quality, reference Hugging Face model hub for specific ONNX models (e.g., Xenova/distilgpt2, Xenova/all-MiniLM-L6-v2)

**Formatting requirements:**

- Use tables for comparisons (task mapping, viability ratings)
- Include a viability summary table: Task | Sub-Component | Viability | Rationale
- Reference source documents with `[document-name]` citations
- No emojis (per AGENTS.md convention)
- Clearly distinguish between "technically possible" and "practically viable for this project"
  </action>
  <verify>
  <automated>test -f ".planning/quick/3-analyze-huggingface-transformers-support/ANALYSIS.md" && wc -l ".planning/quick/3-analyze-huggingface-transformers-support/ANALYSIS.md" | awk '{if ($1 >= 150) print "[OK] Analysis document exists with " $1 " lines"; else print "[ERROR] Document too short: " $1 " lines"}'</automated>
  </verify>
  <done>ANALYSIS.md exists with 150+ lines, contains all 7 sections (TL;DR, Context, Runtime Viability, Task Mapping with viability ratings for 7 NLP tasks, Impact on Deferred Decisions, Recommendation for v0.0.1 and v0.0.2+, Source Materials), includes a viability summary table, and provides a clear actionable recommendation that accounts for the native module constraint and zero-dependency goal</done>
  </task>

</tasks>

<verification>
- ANALYSIS.md covers all 7 required sections
- Runtime viability assessment addresses ONNX on ARM64 Windows, VM sandbox constraints, and cross-platform compatibility
- All 7 NLP tasks are evaluated with specific sub-component mappings and viability ratings
- The native module constraint conflict with onnxruntime-node is explicitly analyzed
- Impact on llm_query() and haiku-searcher deferral references quick-2 findings
- Recommendation distinguishes between v0.0.1 (current milestone) and future milestones
- Viability summary table is present
- No emojis in document
</verification>

<success_criteria>

- A developer reading ANALYSIS.md can decide whether to adopt any transformers.js tasks without further research
- The recommendation respects existing PROJECT.md constraints (especially "no native modules" and zero-dependency goal)
- The analysis is honest about the quality gap between local models and Claude Haiku
- The document serves as a permanent reference for future milestone planning when llm_query() is revisited
  </success_criteria>

<output>
After completion, create `.planning/quick/3-analyze-huggingface-transformers-support/3-SUMMARY.md`
</output>
