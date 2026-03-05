# Claude Haiku 4.5 Optimization Guide

> **Audience**: Developers optimizing prompts for speed, cost, and agentic capabilities
> **Purpose**: Leverage Haiku 4.5's strengths for fast, cost-effective AI workflows
> **Related**: See [MODEL-OPTIMIZATION-SONNET.md](./MODEL-OPTIMIZATION-SONNET.md) for Sonnet patterns

---

## Table of Contents

1. [Overview](#overview)
2. [Core Principles](#core-principles)
3. [Prompt Engineering Techniques](#prompt-engineering-techniques)
4. [Speed Optimization](#speed-optimization)
5. [Cost Reduction](#cost-reduction)
6. [Agentic Workflows](#agentic-workflows)
7. [Extended Thinking Configuration](#extended-thinking-configuration)
8. [Structured Outputs with JSON Schema](#structured-outputs-with-json-schema)
9. [RAG & Batch Processing Optimization](#rag--batch-processing-optimization)
10. [Limitations & Tradeoffs](#limitations--tradeoffs)
11. [References](#references)

---

## Overview

Claude Haiku 4.5 is Anthropic's fastest and most cost-efficient model in the Claude 4.5 family. It's optimized for:

- **Speed**: 2-3× faster than Sonnet 4.5 (time-to-first-token under 0.5s)
- **Cost**: $1 per million input tokens, $5 per million output tokens (66% cheaper than Sonnet)
- **Agentic workflows**: Parallel sub-agent orchestration and tool calling
- **Real-time applications**: Customer support, code completions, rapid analysis

**Key Stats**:

- Context window: **200,000 tokens** (API/Claude Code standard)
- Maximum output: 64,000 tokens
- Latency: Sub-200ms for smaller prompts, ~3.6s average full responses
- Coding accuracy: 73.3% on SWE-bench Verified (vs Sonnet's 77.2%)
- Performance: 90% of Sonnet 4.5's agentic performance at 1/3 the cost
- Speed: 2-5x faster than Sonnet 4.5

**Context Window Availability**:

- **Claude Code Team**: 200K tokens (standard)
- **API**: 200K tokens (standard for all API users)
- **Claude.ai Enterprise**: 500K tokens (web interface only, not available via API)
- **1M context**: Only available for Sonnet 4 and 4.5 (beta, NOT Haiku)

---

## Core Principles

### 1. Haiku Excels at Focused, Bounded Tasks

Haiku 4.5 is designed for **speed and efficiency**, not extended reasoning. Structure prompts to:

- Have clear, single objectives
- Use step-bounded reasoning (3-5 steps max)
- Avoid open-ended exploration tasks
- Prefer structured outputs over prose

### 2. Conciseness is Critical

Every unnecessary token increases cost and latency:

- Use explicit, minimal instructions
- Avoid verbose explanations or flowery language
- Specify exact output format upfront
- Request only the information you need

### 3. Leverage Structural Patterns

Claude 4.x models excel with structured prompts:

- XML tags (`<task>`, `<context>`, `<output>`)
- JSON for complex data
- Checklists and labeled sections
- Clear role definitions in system prompts

> **Note**: Anthropic's official documentation confirms Claude is "trained for more precise instruction following" and recommends XML as an effective technique.

---

## Prompt Engineering Techniques

### 1. Explicit, Structured Instructions

**❌ Vague**: "Summarize this report"

**✅ Specific**:

```
Summarize for a product manager audience.
Format: 5 bullet points, max 120 words total
Include: risks, dependencies, next steps
Exclude: technical implementation details
```

**Why**: Haiku responds best to unambiguous constraints. Clear boundaries prevent drift and reduce output verbosity.

**Reference**: [Sider AI - Prompt Strategies for Haiku 4.5](https://sider.ai/blog/ai-tools/prompt-strategies-that-work-best-with-claude-haiku-4_5)

---

### 2. Step-Bounded Reasoning

**Pattern**:

```
Analyze the code issue using exactly 3 steps:
1. Identify the root cause
2. Evaluate the impact
3. Recommend a fix

Keep each step to 1-2 sentences.
```

**Why**: Prevents runaway verbosity while maintaining focused analytical quality. Especially critical for coding and lightweight analysis tasks.

**Reference**: [12Factor.me - Claude 4.5 Best Practices](https://12factor.me/prompt-engineering/best-practice)

---

### 3. Checklists Over Open-Ended Prompts

**❌ Open-ended**: "Review this code"

**✅ Checklist**:

```
Code review checklist:
- [ ] Correctness: Logic errors? (Pass/Fail + reason)
- [ ] Security: Vulnerabilities? (Pass/Fail + reason)
- [ ] Readability: Clear naming? (Pass/Fail + reason)
- [ ] Performance: Obvious bottlenecks? (Pass/Fail + reason)

Format: JSON with pass/fail and 1-sentence justification per item.
```

**Why**: Structured outputs are verifiable, repeatable, and easier to parse programmatically.

**Reference**: [DreamHost - Claude Prompt Techniques That Work](https://www.dreamhost.com/blog/claude-prompt-engineering/)

---

### 4. Role and Objective Specification

**System Prompt Pattern**:

```
You are a concise technical assistant specializing in code analysis.

Objectives:
- Provide actionable feedback in <100 words
- Focus on critical issues only (security, correctness)
- Use bullet points, not paragraphs
- Never include explanatory preambles

Constraints:
- No greetings or sign-offs
- No speculation on unknown factors
- Assume audience is senior developer
```

**Why**: Setting role and constraints upfront guides consistent behavior across multi-turn workflows and prevents drift.

**Reference**: [Galaxy.ai - Haiku 4.5 System Prompt Guide](https://blog.galaxy.ai/claude-haiku-4-5-system-prompt)

---

### 5. Context and Motivation

**Pattern**:

```
Because the output will be read aloud by a screen reader:
- Avoid ellipses and special characters
- Spell out abbreviations on first use
- Use "to" instead of "2", "for" instead of "4"
```

**Why**: Explaining _why_ a constraint exists helps Haiku adhere strictly to standards and handle edge cases reliably.

**Reference**: [Claude Docs - Prompting Best Practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices)

---

### 6. High-Quality Examples

**Pattern**:

```
Example input: "User reported login fails after password reset"
Example output: {"severity": "high", "component": "auth", "action": "check_token_expiry"}

Example input: "Dashboard loads slowly on mobile"
Example output: {"severity": "medium", "component": "frontend", "action": "profile_render_time"}

Now process: "Search returns no results for special characters"
```

**Why**: Haiku is highly sensitive to examples and will reproduce behaviors shown. Ensure examples align perfectly with desired output.

**Reference**: [12Factor.me - Claude 4.5 Best Practices](https://12factor.me/prompt-engineering/best-practice)

---

### 7. Meta-Prompting for Iterative Improvement

**Workflow**:

1. Deploy initial prompt
2. Collect outputs and evaluate (LLM-as-judge or human review)
3. Analyze failures: "Why incorrect? What's missing?"
4. Regenerate system prompt with improvements
5. Repeat cycle

**Example Meta-Prompt**:

```
Analyze these 10 outputs from Haiku 4.5:
[outputs here]

For each incorrect output:
1. Explain why it failed
2. Identify missing instruction or constraint
3. Suggest specific prompt improvement

Output: List of prompt revisions to test next.
```

**Why**: Continuous optimization through feedback loops significantly improves reliability over time.

**Reference**: [Arize - Prompt Learning with Claude](https://arize.com/blog/claude-md-best-practices-learned-from-optimizing-claude-code-with-prompt-learning/)

---

### 8. Structured Tagging

**Pattern**:

```xml
<task>
  Generate unit tests for the validateEmail function
</task>

<context>
  Language: TypeScript
  Test framework: Vitest
  Coverage target: edge cases only
</context>

<constraints>
  - Max 5 test cases
  - Use describe/it blocks
  - No setup/teardown code
</constraints>

<output_format>
  Raw TypeScript code block, no explanation
</output_format>
```

**Why**: XML/JSON structure provides clear information hierarchy, making it easier for Haiku to parse requirements and manage context.

**Reference**: [DataStudios - Claude Prompting Techniques](https://www.datastudios.org/post/claude-ai-prompting-techniques-structured-instructions-reasoning-control-and-workflow-design-for)

---

### 9. Clear Evaluation Criteria

**Pattern**:

```
Success criteria:
- Output is valid JSON (fails if malformed)
- All required fields present (id, type, message)
- Message is <50 characters
- Type is one of: error, warning, info

Anti-goals:
- Do NOT include explanatory text outside JSON
- Do NOT add extra fields
- Do NOT use markdown code blocks
```

**Why**: Explicit success bar and anti-goals align outputs with stakeholder expectations and reduce ambiguity.

**Reference**: [12Factor.me - Claude 4.5 Best Practices](https://12factor.me/prompt-engineering/best-practice)

---

## Speed Optimization

### 1. Agentic Multi-Agent Orchestration

**Pattern**: Split large tasks into parallel subtasks handled by multiple Haiku agents.

```
Central Planner (Sonnet 4.5):
├── Haiku Agent 1: Analyze file A
├── Haiku Agent 2: Analyze file B
├── Haiku Agent 3: Analyze file C
└── Haiku Agent 4: Generate summary

Results aggregated by planner
```

**Why**: Haiku's low latency (0.5s time-to-first-token) enables massive parallelization, dramatically increasing throughput.

**Use Cases**: CI/CD pipelines, bulk code reviews, customer support routing

**Reference**: [Caylent - Haiku 4.5 Multi-Agent Deep Dive](https://caylent.com/blog/claude-haiku-4-5-deep-dive-cost-capabilities-and-the-multi-agent-opportunity)

---

### 2. Low Latency API Integration

**Best Practices**:

- Use streaming responses for real-time feedback
- Minimize round-trip delays with single-call patterns
- Leverage Haiku's TPU-optimized backend

**Example**: Real-time code completions in IDEs, live chat support

**Reference**: [Geeky Gadgets - Haiku 4.5 Efficiency](https://www.geeky-gadgets.com/claude-haiku-4-5-ai-model/)

---

### 3. Optimized Input Length

**Strategy**:

- Send only the delta or relevant code section, not entire files
- Use targeted prompts focusing on specific functions/modules
- Avoid unnecessary context

**❌ Inefficient**: Submit 1000-line file for review
**✅ Efficient**: Submit 50-line function + 2-line context

**Why**: Shorter inputs = faster processing + lower cost

**Reference**: [Josh Berkowitz - Haiku 4.5 Analysis](https://joshuaberkowitz.us/blog/news-1/unlocking-speed-smarts-and-savings-claude-haiku-4-5-raises-the-bar-for-small-ai-models-1474)

---

### 4. Streamlined Output

**Strategy**:

- Request minimal viable output
- Use structured formats (JSON, bullet points) over prose
- Avoid "explain your reasoning" unless necessary

**Example**:

```
Return only the fixed code block.
Do NOT include:
- Explanations
- Before/after comparisons
- Commentary
```

**Why**: Haiku is optimized for predictable, structured output. Verbose explanations add latency and cost.

---

### 5. Hybrid Model Approach

**Pattern**: Use Haiku for bulk tasks, escalate to Sonnet for complex cases.

```
Request Router:
├── Simple/Frequent → Haiku 4.5 (fast, cheap)
└── Complex/Premium → Sonnet 4.5 (accurate, thorough)
```

**Decision Criteria**:

- Haiku: Short responses, structured data, routine tasks
- Sonnet: Multi-step reasoning, long-form content, critical accuracy

**Why**: "Barbell strategy" maximizes cost savings without degrading quality on important tasks.

**Reference**: [Sider AI - Haiku vs Sonnet Strategy](https://sider.ai/blog/ai-tools/claude-haiku-4_5-explained-pricing-performance-and-strategic-power)

---

## Cost Reduction

### 1. Pricing Model

| Model      | Input (per 1M tokens) | Output (per 1M tokens) | Cost vs Sonnet |
| ---------- | --------------------- | ---------------------- | -------------- |
| Haiku 4.5  | $1                    | $5                     | 66% cheaper    |
| Sonnet 4.5 | $3                    | $15                    | Baseline       |

**Strategy**: Default to Haiku, upgrade to Sonnet only when necessary.

---

### 2. Context Window Management

**Strategy**:

- Use only as much context as required per operation
- Don't auto-include entire conversation history
- Trim irrelevant historical turns

**Example**:

```
❌ 50,000 tokens (full conversation history)
✅ 2,000 tokens (current task context only)

Savings: 96% reduction in input tokens
```

**Why**: Haiku supports 200k context, but keeping it lean lowers per-request cost.

**Reference**: [Caylent - Haiku 4.5 Deep Dive](https://caylent.com/blog/claude-haiku-4-5-deep-dive-cost-capabilities-and-the-multi-agent-opportunity)

---

### 3. Batch Requests & Parallel Inference

**Strategy**: Submit multiple independent requests simultaneously.

**Example**:

```javascript
const results = await Promise.all([
  analyzeFile('component-a.ts'),
  analyzeFile('component-b.ts'),
  analyzeFile('component-c.ts'),
]);
```

**Why**: Maximizes throughput and minimizes idle time. Haiku's parallelization strengths shine here.

**Reference**: [ZenCoder - Haiku 4.5 Speed Analysis](https://zencoder.ai/blog/claude-haiku-4-5)

---

### 4. Automated Token Usage Monitoring

**Tools**:

- Claude API token usage headers
- Vertex AI/Bedrock budget alerts
- Custom dashboards tracking input/output ratios

**Best Practice**: Set up alerts for anomalous usage spikes.

**Reference**: [AI Tool Curator - Haiku 4.5 Guide](https://www.aitoolcurator.com/blog/claude-haiku-4-5/)

---

### 5. Drop-in Replacement for Legacy Workflows

**Migration Path**:

1. Identify Sonnet 4 or Haiku 3.5 calls in codebase
2. Replace endpoint with Haiku 4.5
3. Optimize prompts for token economy (see techniques above)
4. Test output quality on representative sample
5. Roll out gradually with quality monitoring

**Expected Savings**: Up to 66% operational cost reduction

**Reference**: [SmartScope - Haiku 4.5 Practical Guide](https://smartscope.blog/en/blog/claude-haiku-4-5-complete-guide/)

---

## Agentic Workflows

### 1. Purpose-Built for Sub-Agent Orchestration

**Architecture**:

```
Planner Agent (Sonnet/Opus):
  - Task decomposition
  - Strategy selection
  - Result synthesis

Worker Agents (Haiku 4.5):
  - Execute atomic subtasks
  - Call external tools/APIs
  - Return structured results
```

**Why**: Haiku's speed and reliability make it ideal for parallel execution layers.

**Reference**: [Comet API - Agentic Coding with Haiku 4.5](https://www.cometapi.com/en/agentic-coding-with-claude-haiku-4-5/)

---

### 2. Tool Calling Optimization

**Best Practices**:

#### Define Tools Clearly

```json
{
  "name": "run_test",
  "description": "Execute test suite for given file path",
  "parameters": {
    "file_path": { "type": "string", "required": true },
    "test_pattern": { "type": "string", "required": false }
  }
}
```

#### Manage Context Budget

```
After each tool call:
1. Check remaining context tokens
2. Summarize results if nearing limit
3. Discard irrelevant historical tool outputs
```

#### Enable Extended Thinking (Optional)

```
For complex multi-step tool workflows:
- Allow "thinking output" between tool calls
- Helps with debugging and iterative refinement
- Trade speed for reliability
```

**Reference**: [Analytics Vidhya - Haiku 4.5 Extended Thinking](https://www.analyticsvidhya.com/blog/2025/10/claude-haiku-4-5/)

---

### 3. Reliability & Error Recovery

**Strategies**:

#### Automatic Retry Logic

```javascript
async function callHaikuAgent(prompt, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await claude.complete(prompt);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(1000 * Math.pow(2, i)); // Exponential backoff
    }
  }
}
```

#### Output Validation

```
After each agent response:
1. Validate JSON schema (if structured output)
2. Check required fields present
3. Retry with error feedback if validation fails
```

**Reference**: [Spartner - Why Haiku 4.5 Matters](https://spartner.software/nieuws/claude-4-5-haiku-why-this-model-matters)

---

### 4. Hybrid Architectures

**Optimal Pattern**:

| Role              | Model                | Rationale                   |
| ----------------- | -------------------- | --------------------------- |
| Global planning   | Sonnet 4.5/Opus      | Complex reasoning, strategy |
| Task execution    | Haiku 4.5 (parallel) | Speed, cost, throughput     |
| Quality assurance | Sonnet 4.5           | Final validation, synthesis |

**Example Use Cases**:

- CI/CD: Haiku runs linters/tests in parallel, Sonnet synthesizes final report
- Code review: Haiku checks style/security per file, Sonnet evaluates architecture
- Customer service: Haiku handles routing/FAQs, Sonnet handles escalations

**Reference**: [Comet API - Agentic Coding Guide](https://www.cometapi.com/en/agentic-coding-with-claude-haiku-4-5/)

---

### 5. Safety & Governance

**Best Practices**:

#### Human-in-the-Loop for High-Impact Actions

- Require approval before: deployments, data deletion, external API calls with side effects
- Use Haiku for analysis/recommendation, human for final decision

#### Automated Test Sets

- Maintain regression test suite for agent behaviors
- Run tests after prompt changes or model updates
- Monitor output quality metrics (accuracy, latency, cost)

#### ASL-2 Classification

- Haiku 4.5 is rated ASL-2 (AI Safety Level 2)
- Suitable for enterprise deployment with standard safeguards
- Lower risk than more powerful models

**Reference**: [Spartner - Haiku 4.5 Safety](https://spartner.software/nieuws/claude-4-5-haiku-why-this-model-matters)

---

## Extended Thinking Configuration

**Haiku 4.5 is the first Haiku model to support extended thinking**, bringing advanced reasoning capabilities with configurable thinking budgets.

### Budget Configuration

**API Parameters**:

```python
response = anthropic.messages.create(
    model="claude-haiku-4.5-20251001",
    max_tokens=4096,
    thinking={
        "type": "enabled",
        "budget_tokens": 2048  # Start at minimum (1024), adjust up
    },
    messages=[...]
)
```

**Budget Guidelines**:

- **Minimum**: 1,024 tokens (always start here)
- **Medium reasoning**: 2,048-4,096 tokens (gap validation, edge cases)
- **Complex reasoning**: 8,192+ tokens (multi-step logic, deep analysis)
- **Cost**: Thinking tokens billed as output ($5/M)

**Key Points**:

- Budget is a target, not a strict limit (actual usage may vary)
- Increase incrementally (1K-2K at a time) to find optimal range
- For Haiku, thinking budget of 4K adds ~$0.02 per request

**Reference**: [Extended thinking - Amazon Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/claude-messages-extended-thinking.html)

---

### Interleaved Thinking

**Availability by environment:**

| Environment     | Status                         | Configuration                                     |
| --------------- | ------------------------------ | ------------------------------------------------- |
| Claude Code CLI | ✅ **GA** (enabled by default) | No configuration needed                           |
| Messages API    | ⚠️ Beta                        | Requires `interleaved-thinking-2025-05-14` header |

**Enable thinking between tool calls** for sophisticated multi-step workflows.

**In Claude Code CLI** (no configuration needed):

```
∴ Thinking…                    ← Initial reasoning
● Tool calls execute
∴ Thinking…                    ← Interleaved thinking (automatic)
● Final response
```

**In Messages API** (requires beta header):

```python
response = anthropic.messages.create(
    model="claude-haiku-4.5-20251001",
    max_tokens=4096,
    thinking={
        "type": "enabled",
        "budget_tokens": 4096
    },
    headers={
        "anthropic-beta": "interleaved-thinking-2025-05-14"  # Required for API
    },
    messages=[...]
)
```

**Benefits**:

- Model thinks after receiving tool results
- Makes more sophisticated decisions between tool calls
- Budget_tokens can exceed max_tokens (total across all thinking blocks)
- Improves multi-step agentic workflows

**To disable in CLI** (if needed): Add `DISABLE_INTERLEAVED_THINKING` to system prompt.

**Reference**: [Extended thinking - Claude Docs](https://platform.claude.com/docs/en/build-with-claude/extended-thinking)

---

### When to Use Extended Thinking

| Task Type        | Extended Thinking? | Budget | Rationale                  |
| ---------------- | ------------------ | ------ | -------------------------- |
| Template filling | ❌ No              | N/A    | Pure substitution          |
| Keyword search   | ❌ No              | N/A    | Pattern matching only      |
| Task generation  | ⚠️ Optional        | 1K-2K  | Simple transformations     |
| Gap detection    | ✅ Yes             | 2K-4K  | Edge case handling         |
| Gap validation   | ✅ Yes             | 4K-8K  | Reasoning about duplicates |
| Code review      | ✅ Yes             | 4K-8K  | Multi-file context         |
| Complex logic    | ⚠️ Use Sonnet      | —      | Haiku may struggle         |

---

## Structured Outputs with JSON Schema

⚠️ **BETA FEATURE - DO NOT USE IN PRODUCTION**

**Public beta feature enabled for Haiku 4.5 on December 4, 2025**. This feature is currently in beta and should not be used in production workflows until generally available.

Structured outputs eliminate schema-related parsing errors and ensure responses conform to exact schemas.

### API Configuration

```python
import anthropic

# Define JSON schema
analysis_schema = {
    "type": "object",
    "properties": {
        "findings": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string", "pattern": "^FIND-[0-9]+$"},
                    "title": {"type": "string", "maxLength": 50},
                    "requirement_id": {"type": "string", "pattern": "^REQ-[0-9]+$"},
                    "validation_score": {"type": "integer", "minimum": 6, "maximum": 10},
                    "priority": {"type": "string", "enum": ["P0", "P1", "P2"]}
                },
                "required": ["id", "title", "requirement_id", "validation_score"]
            }
        }
    },
    "required": ["findings"]
}

# API call with structured output
client = anthropic.Anthropic()
response = client.messages.create(
    model="claude-haiku-4.5-20251001",
    max_tokens=4096,
    headers={
        "anthropic-beta": "structured-outputs-2025-11-13"  # Enable beta feature
    },
    messages=[{"role": "user", "content": "Analyze code for issues"}],
    response_format={
        "type": "json_schema",
        "json_schema": {
            "name": "analysis_results",
            "strict": True,
            "schema": analysis_schema
        }
    }
)

# Response guaranteed to match schema
findings = response.content[0].json_object
```

### Benefits

- ✅ **Zero parsing errors** - Output always valid JSON
- ✅ **Type safety** - Validated at API level
- ✅ **No post-processing** - Direct deserialization
- ✅ **Tool call reliability** - Eliminates malformed parameters
- ✅ **Clear contracts** - Schema defines expectations

### Use Cases

1. **Data extraction** - Extract REQ-XXX requirements with guaranteed format
2. **Tool calling** - Ensure tool parameters match expected schema
3. **Batch processing** - Consistent output format across thousands of requests
4. **Multi-agent orchestration** - Reliable message passing between agents

**References**:

- [Structured outputs - Claude Docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [Structured outputs announcement - Claude Blog](https://claude.com/blog/structured-outputs-on-the-claude-developer-platform)

---

## RAG & Batch Processing Optimization

### Prompt Caching Strategy

**Cost breakdown** (per million tokens):

- Cache write: $1.25 (one-time)
- Cache read: $0.10 (90% savings vs full input)
- Haiku base: $1 input / $5 output

**Example**: 100 queries against 50K knowledge base

**Without caching**:

```
Input: 100 × 50K = 5M × $1 = $5.00
Output: 100 × 500 = 50K × $5 = $0.25
Total: $5.25
```

**With caching**:

```
Cache write (once): 50K × $1.25 = $0.06
Cache reads: 100 × 50K × $0.10 = $0.50
Output: 100 × 500 × $5 = $0.25
Total: $0.81 (85% savings!)
```

### Implementation Pattern

```python
import anthropic

client = anthropic.Anthropic()
knowledge_base = load_documents("docs/")  # 50K tokens

# Cache structure
system_prompt = [
    {
        "type": "text",
        "text": "You are a documentation assistant."
    },
    {
        "type": "text",
        "text": knowledge_base,
        "cache_control": {"type": "ephemeral"}  # Cache this section
    }
]

# Multiple queries reuse cache
for query in queries:
    response = client.messages.create(
        model="claude-haiku-4.5-20251001",
        max_tokens=1024,
        system=system_prompt,  # Reuses cached KB
        messages=[{"role": "user", "content": query}]
    )
```

**Key strategies**:

- Cache knowledge base documents independently
- Place cached content at prompt's beginning
- Cache breakpoints separate different cacheable sections
- Cache stays warm for ~15 minutes (Anthropic's cache TTL)

**References**:

- [Introducing Contextual Retrieval - Anthropic](https://www.anthropic.com/news/contextual-retrieval)
- [Prompt caching - Claude Docs](https://docs.claude.com/en/docs/build-with-claude/prompt-caching)

---

### Batch API for Async Workloads

**Cost savings**: 50% discount on output tokens ($5/M → $2.50/M)

```python
# Create batch job
batch = client.batches.create(
    requests=[
        {
            "custom_id": f"req-{i}",
            "params": {
                "model": "claude-haiku-4.5-20251001",
                "max_tokens": 1024,
                "messages": [{"role": "user", "content": queries[i]}]
            }
        }
        for i in range(1000)  # 1000 queries
    ]
)

# Poll for completion (async)
while batch.status != "ended":
    await asyncio.sleep(60)
    batch = client.batches.retrieve(batch.id)

# Process results
results = client.batches.results(batch.id)
```

**Cost comparison** (1000 queries, 500 token output each):

| Method            | Input | Output          | Total |
| ----------------- | ----- | --------------- | ----- |
| **Sync**          | $1.00 | $2.50           | $3.50 |
| **Batch**         | $1.00 | $1.25 (50% off) | $2.25 |
| **Batch + Cache** | $0.10 | $1.25           | $1.35 |

**Savings**: 61% with batch + caching combined

---

### Hybrid Retrieval for RAG

**Pattern**: BM25 (keyword matching) + embeddings (semantic search) + reranking

```markdown
Query: "How do I configure the component?"

Step 1: Hybrid Retrieval
├── BM25: Find docs with "configure", "component"
├── Embeddings: Find semantically similar docs
└── Merge: Top 20 chunks

Step 2: Reranking
└── Filter 20 → 5 best chunks (less context = faster)

Step 3: Generate with Haiku
└── Use cached context + 5 chunks
└── Sub-second latency
```

**Why hybrid**:

- BM25 catches exact term matches ("component", "configure")
- Embeddings catch conceptual matches ("set up tabs element")
- Reranking reduces context (5 chunks vs 20) = faster + cheaper

**Reference**: [Claude Haiku 4.5 Deep Dive - Caylent](https://caylent.com/blog/claude-haiku-4-5-deep-dive-cost-capabilities-and-the-multi-agent-opportunity)

---

### Contextual Retrieval

**Add context to each chunk** during preprocessing (one-time cost with Sonnet):

```python
def add_context_to_chunk(chunk, document):
    response = client.messages.create(
        model="claude-sonnet-4.5-20250929",  # Use Sonnet for preprocessing
        messages=[{
            "role": "user",
            "content": f"""
Document: {document}

Chunk: {chunk}

Task: Write 1-2 sentences explaining this chunk's role in the document.
"""
        }]
    )
    return f"{response.content[0].text}\n\n{chunk}"

# Now retrieval is more accurate
```

**Why**: Chunks with context improve retrieval accuracy by 15-20% (Anthropic research).

**Reference**: [Introducing Contextual Retrieval - Anthropic](https://www.anthropic.com/news/contextual-retrieval)

---

## Limitations & Tradeoffs

### Haiku 4.5 vs Sonnet 4.5 Comparison

| Feature                 | Haiku 4.5                               | Sonnet 4.5                       |
| ----------------------- | --------------------------------------- | -------------------------------- |
| **Speed**               | 2-5× faster (sub-200ms TTFT)            | Slower, more thorough            |
| **Cost**                | $1/$5 per 1M tokens                     | $3/$15 per 1M tokens             |
| **Coding accuracy**     | 73.3% (SWE-bench Verified)              | 77.2% (SWE-bench Verified)       |
| **Agentic performance** | 90% of Sonnet                           | 100% baseline                    |
| **Context window**      | 200K tokens (500K Claude.ai Enterprise) | 200K-1M tokens (1M in beta)      |
| **Max output**          | 64K tokens                              | 64K tokens                       |
| **Extended thinking**   | ✅ Supported (min 1K budget)            | ✅ Supported                     |
| **Structured outputs**  | ✅ Supported (Dec 2025)                 | ✅ Supported                     |
| **Error recovery**      | Strong for simple/parallel tasks        | Superior for complex multi-step  |
| **Best for**            | Fast, cheap, frequent tasks             | Deep analysis, critical accuracy |

---

### When to Choose Haiku 4.5

✅ **Use Haiku when**:

- Cost and speed are primary concerns
- Tasks are well-defined and bounded
- High volume, repetitive workflows
- Latency-sensitive applications (real-time chat, IDE completions)
- Parallel sub-agent execution
- Output is structured and verifiable

❌ **Avoid Haiku when**:

- Deep, multi-step reasoning required on every task
- Errors are costly (rework negates cost savings)
- Complex synthesis across many documents
- Premium user-facing content where quality trumps speed
- Tasks require 1M+ token context windows

---

### When to Choose Sonnet 4.5

✅ **Use Sonnet when**:

- Accuracy and depth are critical
- Complex architectural analysis
- Multi-file code changes with dependencies
- Long-form technical writing
- Stateful, long-running agent workflows
- High-stakes decisions (production deployments, security reviews)

**Key Insight**: There's no absolute "best"—match model strengths to operational needs and cost structure.

**Reference**: [Mash Blog - Haiku vs Sonnet Production Tradeoffs](https://mashblog.com/posts/haiku-sonnet)

---

### Performance Benchmarks

**Coding (SWE-bench Verified)**:

- Haiku 4.5: 73%
- Sonnet 4.5: 77%
- Delta: ~4-5% accuracy difference

**Speed**:

- Haiku 4.5: 0.5s time-to-first-token, ~3.6s average completion
- Sonnet 4.5: ~1.5s TTFT, ~10s average completion
- Delta: 2-3× speed improvement with Haiku

**Cost**:

- Haiku 4.5: 66% cheaper than Sonnet
- Break-even: Haiku needs <1.5× more retries to remain cost-effective

**Reference**: [AIRank - Haiku vs Sonnet Benchmarks](https://airank.dev/models/compare/claude-haiku-4.5-vs-claude-sonnet-4.5)

---

## Summary: Quick Reference

### ✅ Do This

1. **Structure prompts explicitly**: Use XML, JSON, checklists
2. **Bound reasoning**: 3-5 steps maximum
3. **Specify output format**: Exact schema, length, structure (use JSON schema for guaranteed validity)
4. **Provide context/motivation**: Explain _why_ constraints exist
5. **Use high-quality examples**: Aligned with desired behavior
6. **Optimize for speed**: Concise inputs, parallel execution, minimal outputs
7. **Monitor costs**: Track token usage, set budget alerts
8. **Hybrid architecture**: Haiku for bulk, Sonnet for complexity
9. **Validate outputs**: Schema checks, retry with feedback
10. **Test systematically**: Regression suite, quality metrics
11. **Use extended thinking** for complex tasks: Start with 2K-4K budget, adjust up
12. **Enable prompt caching** for repeated context: 90% cost savings on cache hits
13. **Use batch API** for async workloads: 50% discount on output tokens

### ❌ Avoid This

1. **Vague instructions**: "Analyze this" → too broad
2. **Open-ended exploration**: "Tell me everything about X"
3. **Verbose inputs**: Full files when a function suffices
4. **Unnecessary prose**: Asking for explanations when actions suffice
5. **Complex reasoning chains**: Multi-step synthesis better suited for Sonnet
6. **Ignoring limitations**: Forcing Haiku into Sonnet-level tasks
7. **No validation**: Assuming outputs are always correct
8. **Static prompts**: Never iterating based on failure analysis
9. **Ignoring prompt caching**: Sending repeated context without caching (wastes 90% cost savings)
10. **Not using batch API**: Processing async workloads synchronously (misses 50% discount)
11. **Skipping extended thinking**: Using default mode for complex reasoning tasks
12. **Using beta features in production**: Structured outputs (use with fallback); interleaved thinking is GA in CLI

---

## References

### Official Documentation

- [Anthropic - Introducing Claude Haiku 4.5](https://www.anthropic.com/news/claude-haiku-4-5)
- [Claude Docs - Prompting Best Practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices)
- [Extended thinking - Amazon Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/claude-messages-extended-thinking.html)
- [Building with extended thinking - Claude Docs](https://platform.claude.com/docs/en/build-with-claude/extended-thinking)
- [Structured outputs - Claude Docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [Structured outputs announcement - Claude Blog](https://claude.com/blog/structured-outputs-on-the-claude-developer-platform)
- [Prompt caching - Claude Docs](https://docs.claude.com/en/docs/build-with-claude/prompt-caching)
- [Introducing Contextual Retrieval - Anthropic](https://www.anthropic.com/news/contextual-retrieval)

### Prompt Engineering

- [Sider AI - Prompt Strategies for Haiku 4.5](https://sider.ai/blog/ai-tools/prompt-strategies-that-work-best-with-claude-haiku-4_5)
- [12Factor.me - Claude 4.5 Best Practices](https://12factor.me/prompt-engineering/best-practice)
- [DreamHost - Claude Prompt Techniques That Work](https://www.dreamhost.com/blog/claude-prompt-engineering/)
- [DataStudios - Claude Prompting Techniques](https://www.datastudios.org/post/claude-ai-prompting-techniques-structured-instructions-reasoning-control-and-workflow-design-for)
- [Galaxy.ai - Haiku 4.5 System Prompt Guide](https://blog.galaxy.ai/claude-haiku-4-5-system-prompt)
- [Arize - Prompt Learning with Claude](https://arize.com/blog/claude-md-best-practices-learned-from-optimizing-claude-code-with-prompt-learning/)

### Performance & Optimization

- [Sider AI - Haiku vs Sonnet Strategy](https://sider.ai/blog/ai-tools/claude-haiku-4_5-explained-pricing-performance-and-strategic-power)
- [AI Tool Curator - Haiku 4.5 Performance Guide](https://www.aitoolcurator.com/blog/claude-haiku-4-5/)
- [SmartScope - Haiku 4.5 Practical Guide](https://smartscope.blog/en/blog/claude-haiku-4-5-complete-guide/)
- [Apatero - Haiku 4.5 Complete Guide](https://apatero.com/blog/claude-haiku-4-5-complete-guide-2025)
- [Josh Berkowitz - Speed & Savings Analysis](https://joshuaberkowitz.us/blog/news-1/unlocking-speed-smarts-and-savings-claude-haiku-4-5-raises-the-bar-for-small-ai-models-1474)

### Agentic Workflows

- [Comet API - Agentic Coding with Haiku 4.5](https://www.cometapi.com/en/agentic-coding-with-claude-haiku-4-5/)
- [Caylent - Multi-Agent Deep Dive](https://caylent.com/blog/claude-haiku-4-5-deep-dive-cost-capabilities-and-the-multi-agent-opportunity)
- [Spartner - Why Haiku 4.5 Matters](https://spartner.software/nieuws/claude-4-5-haiku-why-this-model-matters)
- [ZenCoder - Haiku 4.5 Speed Analysis](https://zencoder.ai/blog/claude-haiku-4-5)
- [Analytics Vidhya - Haiku 4.5 Extended Thinking](https://www.analyticsvidhya.com/blog/2025/10/claude-haiku-4-5/)
- [DataCamp - Haiku 4.5 Features & Testing](https://www.datacamp.com/blog/anthropic-claude-haiku-4-5)
- [Apidog - Haiku 4.5 API Guide](https://apidog.com/blog/claude-haiku-4-5-api/)
- [DTP Tips - Haiku 4.5 Introduction](https://dtptips.com/introducing-claude-haiku-4-5-speed-efficiency-intelligence-combined/)

### Comparisons & Benchmarks

- [Mash Blog - Haiku vs Sonnet Production Tradeoffs](https://mashblog.com/posts/haiku-sonnet)
- [Creole Studios - Haiku vs Sonnet Detailed Comparison](https://www.creolestudios.com/claude-haiku-4-5-vs-sonnet-4-5-comparison/)
- [Galaxy.ai - Haiku vs Sonnet Comparative Analysis](https://blog.galaxy.ai/compare/claude-haiku-4-5-vs-claude-sonnet-4-5)
- [AIRank - Complete Benchmarks & Speed Tests](https://airank.dev/models/compare/claude-haiku-4.5-vs-claude-sonnet-4.5)
- [Sider AI - Cheap, Quick, and Good Comparison](https://sider.ai/blog/ai-tools/claude-haiku-4_5-vs-sonnet-4-the-cheap-the-quick-and-the-good)
- [MixHub AI - Which Model Thinks Smarter](https://mixhubai.com/blog/claude-claude-sonnet-4-5-vs-claude-haiku-4-5-which-anthropic-model-thinks-smarter)
- [Banono.ai - Detailed Analysis for 2025](https://banono.ai/posts/claude-haiku-4-5-vs-claude-sonnet-4-5)

### Technical Guides

- [Geeky Gadgets - AI Efficiency Redefining Business](https://www.geeky-gadgets.com/claude-haiku-4-5-ai-model/)

---

**Related Documents:**

- [MODEL-OPTIMIZATION-SONNET.md](./MODEL-OPTIMIZATION-SONNET.md) - Sonnet 4.5 implementation patterns
- [MODEL-OPTIMIZATION-OPUS.md](./MODEL-OPTIMIZATION-OPUS.md) - Opus 4.5 patterns
- [TASK-SPAWNING-GUIDE.md](./TASK-SPAWNING-GUIDE.md) - Multi-agent orchestration

---

**Version**: 1.0.0
**Last Updated**: 2026-01-20
