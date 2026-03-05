# Claude Large File Chunking Strategies

> **Audience**: Skill developers, prompt engineers working with large documents
> **Purpose**: Research-backed strategies for reading large files (>25K tokens) with Claude
> **Last Updated**: 2026-01-20

---

## Table of Contents

1. [Overview](#overview)
2. [Anthropic's Official Guidance](#anthropics-official-guidance)
3. [Chunking Strategies Comparison](#chunking-strategies-comparison)
4. [Strategy 1: Semantic Section Chunking (Recommended)](#strategy-1-semantic-section-chunking-recommended)
5. [Strategy 2: Fixed-Size with Overlap](#strategy-2-fixed-size-with-overlap)
6. [Strategy 3: Adaptive Chunking](#strategy-3-adaptive-chunking)
7. [Strategy 4: Parallel File Loading](#strategy-4-parallel-file-loading)
8. [Tool-Specific Constraints](#tool-specific-constraints)
9. [Cost-Performance Trade-offs](#cost-performance-trade-offs)
10. [Implementation Patterns](#implementation-patterns)
11. [Anti-Patterns](#anti-patterns)
12. [References](#references)

---

## Overview

When processing large documents with Claude (specification files, logs, codebases), chunking strategies significantly impact:

- **Accuracy**: Semantic boundaries prevent context loss
- **Cost**: Fewer/larger chunks vs. more/smaller chunks
- **Latency**: Sequential reads vs. parallel processing
- **Quality**: Preservation of relationships across chunk boundaries

**Key Constraint**: Claude Code's Read tool has a **~25,000 token limit** per call. Files exceeding this limit require chunking strategies.

---

## Anthropic's Official Guidance

### RAG (Retrieval-Augmented Generation) Context

From [Introducing Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval) (Anthropic, 2024):

**Chunk Size Recommendation**:

> "Chunks are usually no more than a few hundred tokens when breaking down knowledge bases."

**Example Configuration** (from Anthropic's analysis):

- **Chunk size**: 800 tokens
- **Document size**: 8K tokens
- **Context instructions**: 50 tokens per chunk
- **Total context per chunk**: ~100 tokens

**Philosophy**:

> "The choice of chunk size, chunk boundary, and chunk overlap can affect retrieval performance. It's worth experimenting on your use case."

**Key Takeaway**: Anthropic recommends **semantic chunking** (by meaning/section) over fixed-size chunking, with experimentation for optimal parameters.

---

### Contextual Retrieval Benefits

**Prompt Caching Integration**:

- Load document into cache once
- Reference cached content for each chunk
- 90% cost savings on cache hits
- Enables low-cost contextual retrieval

**Hybrid Retrieval**:

- Combine BM25 (keyword matching) + embeddings (semantic search)
- Rerank results to reduce context (20 chunks → 5 best)
- Faster processing with smaller context

---

## Chunking Strategies Comparison

| Strategy                         | Chunk Size               | Overlap                   | API Calls    | Accuracy | Use Case                           |
| -------------------------------- | ------------------------ | ------------------------- | ------------ | -------- | ---------------------------------- |
| **Semantic (Section-Based)**     | Variable (200-800 lines) | None (natural boundaries) | 3-5          | High     | Structured docs (specs, markdown)  |
| **Fixed-Size (Large)**           | 700 lines (~5K tokens)   | None                      | 2            | Medium   | Minimize API calls, simple content |
| **Fixed-Size (Small) + Overlap** | 300 lines (~2K tokens)   | 50 lines (~350 tokens)    | 4-5          | High     | Dense content, critical accuracy   |
| **Adaptive**                     | Variable by density      | Optional                  | 3-6          | High     | Mixed content types                |
| **Parallel**                     | N/A (multiple files)     | N/A                       | N (parallel) | High     | Multiple independent files         |

---

## Strategy 1: Semantic Section Chunking (Recommended)

### Overview

**Principle**: Split documents at natural semantic boundaries (sections, headers, logical units) rather than arbitrary line counts.

**Best For**:

- Structured markdown files (requirements, design documents)
- Code files with clear function/class boundaries
- Documents with hierarchical headers (##, ###)

**Alignment**: Matches Anthropic's "semantic chunking" recommendation

---

### Implementation Algorithm

```markdown
### Step 1: Identify Section Boundaries

Use Grep to extract headers with line numbers:

Grep(
pattern: "^#{1,3}\s+",
path: "requirements.md",
output_mode: "content",
-n: true # Include line numbers
)

**Output**:
450:## Functional Requirements
680:## Non-Functional Requirements
820:## User Stories
1100:## Acceptance Criteria

### Step 2: Calculate Section Ranges

Parse Grep output into section ranges:

sections = [
{"name": "Functional Requirements", "start": 450, "end": 679},
{"name": "Non-Functional Requirements", "start": 680, "end": 819},
{"name": "User Stories", "start": 820, "end": 1099},
{"name": "Acceptance Criteria", "start": 1100, "end": EOF}
]

### Step 3: Read Each Section Independently

FOR section IN sections:
IF section is relevant to task: # Filter irrelevant sections
lines_to_read = section.end - section.start
content = Read(
file_path="requirements.md",
offset=section.start,
limit=lines_to_read
)
EXTRACT requirements/entities from content
ACCUMULATE into semantic models
```

---

### Benefits

- **Semantic coherence**: Never split mid-requirement or mid-story
- **No overlap needed**: Natural boundaries prevent context loss
- **Efficient**: Skip irrelevant sections (e.g., only read Requirements, not Goals/Non-Goals)
- **Debuggable**: Clear section names make errors traceable
- **Aligned with Anthropic guidance**: "Semantic boundaries" over arbitrary splits

---

### Example: Requirements File (1,324 lines)

**Naive 700-line chunking**:

- Chunk 1: Lines 1-700 (contains partial FR section)
- Chunk 2: Lines 700-1324 (FR section split across boundary)
- **Risk**: Requirement clarification might span chunks, causing incomplete extraction

**Semantic section chunking**:

- Section 1: User Stories (lines 118-438, 320 lines)
- Section 2: Functional Requirements (lines 439-705, 266 lines)
- Section 3: Accessibility Requirements (lines 706-749, 43 lines)
- Section 4: Component API (lines 758-976, 218 lines)
- **Result**: Each requirement fully contained in one chunk

---

### Cost Analysis

**Fixed 700-line chunks**:

- 2 Read calls × ~5K tokens = 10K input tokens
- Cost: ~$0.010 (at $1/M input tokens)

**Semantic section chunks**:

- 5 Read calls × ~2K tokens average = 10K input tokens
- Cost: ~$0.010 (same cost, better accuracy)

**Conclusion**: No cost penalty for semantic chunking when total tokens are similar.

---

## Strategy 2: Fixed-Size with Overlap

### Overview

**Principle**: Split documents at fixed line counts with overlapping regions to prevent boundary context loss.

**Best For**:

- Unstructured documents (logs, plain text)
- When semantic boundaries are unclear
- Dense content where every token matters

---

### Implementation Algorithm

```python
# Configuration
chunk_size = 300 lines  # ~2K tokens (aligns with Anthropic's "few hundred tokens")
overlap = 50 lines      # ~350 tokens (catches boundary context)
total_lines = get_line_count(file_path)

# Read overlapping chunks
FOR offset IN range(0, total_lines, chunk_size - overlap):
  limit = min(chunk_size, total_lines - offset)
  content = Read(file_path, offset=offset, limit=limit)

  # Process chunk
  EXTRACT entities from content

  # Deduplicate overlap region
  IF offset > 0:
    DISCARD first `overlap` lines (already processed in previous chunk)
```

---

### Trade-offs

**Pros**:

- Catches context spanning chunk boundaries
- Works for unstructured content
- Smaller chunks align with Anthropic guidance

**Cons**:

- More API calls (4-5 vs. 2)
- Redundant processing (overlap regions processed twice)
- Complexity: Deduplication logic required

---

### Example: Requirements File (1,324 lines)

**Configuration**:

- chunk_size = 300 lines
- overlap = 50 lines
- effective_stride = 250 lines

**Chunks**:

1. Lines 0-300
2. Lines 250-550 (50-line overlap with chunk 1)
3. Lines 500-800 (50-line overlap with chunk 2)
4. Lines 750-1050 (50-line overlap with chunk 3)
5. Lines 1000-1324 (50-line overlap with chunk 4)

**Cost**:

- 5 Read calls × ~2K tokens = 10K input tokens
- Overlap: ~1K tokens processed twice
- Total cost: ~$0.011 (10% increase vs. semantic chunking)

---

## Strategy 3: Adaptive Chunking

### Overview

**Principle**: Adjust chunk size dynamically based on content density and type.

**Best For**:

- Mixed-content documents (prose + code + requirements)
- When optimizing for both cost and accuracy

---

### Implementation Algorithm

```python
# Configuration
chunk_configs = {
  "prose": 700 lines,        # ~5K tokens (overview, goals sections)
  "requirements": 300 lines,  # ~2K tokens (requirement items)
  "code": 200 lines,          # ~1.5K tokens (examples, snippets)
}

FOR section IN sections:
  content_type = classify_section(section.name)
  chunk_size = chunk_configs[content_type]

  IF section.length > chunk_size:
    # Split large sections
    FOR offset IN range(section.start, section.end, chunk_size):
      Read(file_path, offset=offset, limit=chunk_size)
  ELSE:
    # Read entire section
    Read(file_path, offset=section.start, limit=section.length)
```

---

### Benefits

- **Optimized**: Small chunks for dense content, large chunks for prose
- **Cost-effective**: Minimize API calls where possible
- **Flexible**: Adapts to document structure

---

## Strategy 4: Parallel File Loading

### Overview

**Principle**: When analyzing multiple files, read them in parallel rather than sequentially.

**Best For**:

- Multi-file analysis (requirements + design + tasks)
- Codebase exploration (multiple source files)
- Maximizing throughput

---

### Implementation Pattern

**Sequential (Slow)**:

```python
spec = Read("requirements.md")
plan = Read("design.md")
tasks = Read("tasks.md")
# Total time: T1 + T2 + T3
```

**Parallel (Fast)**:

```python
# Single message with multiple Read calls
Read("requirements.md")
Read("design.md")
Read("tasks.md")
# Total time: max(T1, T2, T3) ≈ T1 (if T1 is longest)
```

**Speedup**: 3× faster for 3 files (assuming similar file sizes)

---

### Combining Strategies

**Parallel + Semantic Chunking**:

```python
# Read multiple files in parallel, each using semantic chunking
PARALLEL:
  Read("requirements.md", offset=450, limit=230)  # Functional Requirements section
  Read("design.md", offset=0, limit=289)    # Full file
  Read("tasks.md", offset=0, limit=820)   # Full file
```

**Result**: Maximum throughput with semantic coherence

---

## Tool-Specific Constraints

### Claude Code Read Tool

**Hard Limits**:

- **Token limit**: ~25,000 tokens per Read call
- **Line limit**: No explicit limit (token-based)
- **File size**: Unlimited (can read in chunks)

**Parameters**:

```typescript
Read(
  file_path: string,    // Absolute or relative path
  offset?: number,      // Starting line (0-indexed)
  limit?: number        // Number of lines to read
)
```

**Error Handling**:

- **EISDIR**: Attempted to read a directory (use Glob instead)
- **Token limit exceeded**: File content > 25K tokens (use chunking)
- **File not found**: Invalid path

---

### Grep Tool (NOT Recommended for Content Loading)

**Purpose**: Search for patterns, NOT load full content

**Why NOT to use for chunking**:

- `Grep(pattern: "^#")` reads headers only, misses content
- Misses clarifications added under headers
- Cannot extract full requirement descriptions

**Correct Usage**:

- Find section boundaries (header line numbers)
- Search for specific patterns (requirement identifiers)
- Extract metadata (line numbers, file paths)

**Example Failure**:

```python
# WRONG: Only captures headers, misses content
headers = Grep(pattern: "^#{1,3}\s+", output_mode: "content")
# Result: "## Functional Requirements" but not requirement details

# CORRECT: Use Grep for boundaries, Read for content
boundaries = Grep(pattern: "^#{1,3}\s+", output_mode: "content", -n: true)
content = Read(file_path, offset=450, limit=230)  # Read FR section
```

---

## Cost-Performance Trade-offs

### Scenario 1: Structured Requirements File (1,324 lines, ~26K tokens)

| Strategy                     | API Calls | Input Tokens | Cost    | Accuracy | Latency |
| ---------------------------- | --------- | ------------ | ------- | -------- | ------- |
| **Semantic (5 sections)**    | 5         | 10,000       | $0.010  | High     | ~2s     |
| **Fixed 700-line**           | 2         | 10,000       | $0.010  | Medium   | ~1s     |
| **Fixed 300-line + overlap** | 5         | 11,000       | $0.011  | High     | ~2s     |
| **Grep headers only**        | 1         | 500          | $0.0005 | Low      | ~0.5s   |

**Recommendation**: **Semantic chunking** (best accuracy, same cost as fixed, negligible latency increase)

---

### Scenario 2: Unstructured Log File (10,000 lines, ~60K tokens)

| Strategy                     | API Calls | Input Tokens | Cost   | Accuracy | Latency |
| ---------------------------- | --------- | ------------ | ------ | -------- | ------- |
| **Fixed 300-line + overlap** | 34        | 66,000       | $0.066 | High     | ~8s     |
| **Fixed 700-line**           | 15        | 60,000       | $0.060 | Medium   | ~5s     |
| **Adaptive (by log level)**  | 20        | 62,000       | $0.062 | High     | ~6s     |

**Recommendation**: **Adaptive** (balance cost and accuracy for mixed content)

---

### Scenario 3: Multiple Small Files (3 files, each ~5K tokens)

| Strategy       | API Calls | Input Tokens | Cost   | Accuracy | Latency |
| -------------- | --------- | ------------ | ------ | -------- | ------- |
| **Sequential** | 3         | 15,000       | $0.015 | High     | ~3s     |
| **Parallel**   | 3         | 15,000       | $0.015 | High     | ~1s     |

**Recommendation**: **Parallel** (3× faster, same cost/accuracy)

---

## Implementation Patterns

### Pattern 1: Semantic Section Reading (Recommended for Documentation)

```markdown
### Step 2: Load Artifacts (Semantic Section Strategy)

<task>
Read requirements.md by semantic sections to preserve requirement boundaries.
</task>

<critical>
NEVER use Grep for content loading. Use it ONLY for section boundary discovery.
</critical>

**Algorithm**:

1. **Discover section boundaries**:
   Grep(pattern: "^#{1,3}\s+", path: "requirements.md", output_mode: "content", -n: true)

   Output: List of headers with line numbers
   118:### User Story 1 - Basic Component
   439:## Requirements (mandatory)
   706:### Accessibility Requirements

2. **Parse section ranges**:
   sections = [
   {"name": "User Stories", "start": 118, "end": 438},
   {"name": "Requirements", "start": 439, "end": 705},
   {"name": "Accessibility", "start": 706, "end": 749},
   ]

3. **Read relevant sections**:
   FOR section IN sections WHERE section.relevant_to_task:
   lines = section.end - section.start
   Read(file_path="requirements.md", offset=section.start, limit=lines)
   EXTRACT entities from content
   ACCUMULATE into semantic models

4. **Validate content (not structure)**:
   - Can quote requirement descriptions (not just IDs)
   - Can reference clarifications (if present)
   - Can extract acceptance criteria

<validation_criteria>
**Success**: Can quote specific requirement content verbatim
**Failure**: Only have section headers without body content
</validation_criteria>
```

---

### Pattern 2: Fixed-Size with Overlap (for Unstructured Content)

```markdown
### Step 2: Load Large Unstructured File

<task>
Read log file using fixed-size chunks with overlap to prevent context loss.
</task>

**Configuration**:

- Chunk size: 300 lines (~2K tokens, aligns with Anthropic guidance)
- Overlap: 50 lines (~350 tokens)
- Effective stride: 250 lines

**Algorithm**:

1. **Get file size**:
   total_lines=$(wc -l < error.log)

2. **Calculate chunks**:
   chunk_size = 300
   overlap = 50
   stride = chunk_size - overlap
   num_chunks = ceiling(total_lines / stride)

3. **Read overlapping chunks**:
   FOR i IN range(0, num_chunks):
   offset = i \* stride
   limit = min(chunk_size, total_lines - offset)
   content = Read("error.log", offset=offset, limit=limit)

   # Deduplicate overlap region

   IF i > 0:
   SKIP first `overlap` lines (processed in previous chunk)

   PROCESS content
```

---

### Pattern 3: Parallel Multi-File Loading

```markdown
### Step 2: Load Multiple Files in Parallel

<task>
Read requirements.md, design.md, tasks.md simultaneously for maximum throughput.
</task>

**Implementation**:

# Single message with parallel Read calls

Read("docs/feature/requirements.md")
Read("docs/feature/design.md")
Read("docs/feature/tasks.md")
Read("docs/guidelines.md")

# All files load simultaneously

# Total time: max(T_req, T_design, T_tasks, T_guide) ≈ T_req

**Speedup**: 4× faster than sequential (for 4 files)
```

---

## Anti-Patterns

### Anti-Pattern 1: Grep for Content Loading

**Problem**: Using Grep with header patterns to "read" file content

**Example**:

```python
# WRONG: Only captures headers
content = Grep(pattern: "^#{1,3}\s+", output_mode: "content")
# Result: List of section titles, NOT section content
```

**Why It Fails**:

- Misses all content under headers (requirements, clarifications, descriptions)
- Especially bad for clarifications added as paragraphs under headers
- Creates false positives in analysis (flags resolved issues as open)

**Correct Approach**:

```python
# CORRECT: Grep for boundaries, Read for content
boundaries = Grep(pattern: "^#{1,3}\s+", -n: true)  # Get line numbers
content = Read(file_path, offset=450, limit=230)    # Read section body
```

---

### Anti-Pattern 2: Large Fixed Chunks Without Overlap

**Problem**: 700-line chunks (5K tokens) without overlap

**Why It's Suboptimal**:

- Exceeds Anthropic's "few hundred tokens" guidance by 10-25×
- Risk of splitting semantic units (requirements, stories) across boundaries
- No recovery mechanism for boundary context loss

**When Acceptable**:

- Simple, repetitive content (e.g., CSV files)
- Cost-sensitive applications (minimize API calls)
- Low-criticality analysis

**Better Approach**: Use semantic chunking or add overlap

---

### Anti-Pattern 3: Sequential File Reads

**Problem**: Reading multiple independent files sequentially

**Example**:

```python
# SLOW: Sequential reads
spec = Read("requirements.md")     # Wait for completion
plan = Read("design.md")     # Then read plan
tasks = Read("tasks.md")   # Then read tasks
# Total time: T1 + T2 + T3
```

**Better Approach**:

```python
# FAST: Parallel reads (single message)
Read("requirements.md")
Read("design.md")
Read("tasks.md")
# Total time: max(T1, T2, T3)
```

---

### Anti-Pattern 4: No Content Validation

**Problem**: Proceeding to processing without verifying content was loaded (not just structure)

**Example**:

```python
# NO VALIDATION
headers = load_file_somehow(file_path)
process_requirements(headers)  # Assumes requirements are in `headers`
```

**Better Approach**:

```python
# WITH VALIDATION
content = Read(file_path, offset, limit)

# Validation checkpoint
IF cannot_quote_specific_requirement(content):
  ERROR("Content validation failed: loaded structure only")
  RETRY with correct chunking strategy

process_requirements(content)
```

---

### Anti-Pattern 5: "Full Read Required" Design Constraint

**Symptom**: Explicit statements in skill documentation that block progressive disclosure or chunking adoption.

**Common phrases indicating this anti-pattern**:

- "Strategy: Full read required"
- "Cannot use progressive disclosure for {use case}"
- "Must read entire file for {operation}"
- Design comments explaining WHY chunking is impossible

**Example (Before Fix)**:

```markdown
### Step 2: Load Document & Perform Scan

<context_loading>
Load the current document from path.

**Strategy**: Full read required (cannot use progressive disclosure for detection).
</context_loading>
```

**Why This is Problematic**:

1. **False Assumption**: Often based on unverified belief that full context is required for the operation
2. **Design-Level Block**: Prevents chunking adoption at the architecture level (not just implementation oversight)
3. **User-Facing Failures**: Causes hard errors on large files rather than graceful degradation
4. **No Fallback Strategy**: Explicitly blocks alternative approaches without testing them first

**Real-World Impact**:

- Workflow fails on large documents (e.g., 1,439-line requirements file)
- Users cannot process mature features (which typically have large specs >1,250 lines)
- Manual workaround required: Users must split files or skip the operation entirely

**Root Cause Analysis**:

The assumption "operation X requires full file context" is often **demonstrably false**:

| Assumption                         | Reality (Proven by Testing)                                             |
| ---------------------------------- | ----------------------------------------------------------------------- |
| "Need full doc for taxonomy scan"  | Taxonomy categories are section-aligned (no cross-section dependencies) |
| "Detection needs all content"      | Detection is local to each section (patterns within content blocks)     |
| "Generation requires full context" | Output is independent per taxonomy category                             |
| "Cannot split mid-operation"       | Semantic boundaries (section headers) provide natural split points      |

After implementing semantic chunking:

- Same quality on large files (1,439 lines) vs small files (500 lines)
- Same output produced
- Cost: Negligible difference (same total tokens, better distribution)

**How to Identify This Anti-Pattern**:

**Search files** for blocking statements:

```bash
# Find potential instances
grep -r "full read required\|cannot use progressive\|must read entire" .claude/skills/ \
  --include="*.md" -n

# Check for design constraints in Step 2 (context loading)
grep -r "Strategy.*[Ff]ull read\|Strategy.*entire file" .claude/skills/ \
  --include="*.md" -n
```

**Manual inspection checklist**:

- [ ] Does Step 2 (context loading) mention "full read" or "cannot chunk"?
- [ ] Are there comments explaining WHY chunking won't work?
- [ ] Is there an explicit design decision documented blocking progressive disclosure?
- [ ] Does the skill fail on files >1,250 lines with Read tool errors?

**How to Fix This Anti-Pattern**:

**Step 1: Question the Assumption**

Ask these critical questions:

- Is full context **truly** needed, or is this an unverified assumption?
- What operation requires cross-section reasoning? (Often: none)
- Can the operation be decomposed into section-scoped sub-operations?

**Step 2: Identify Cross-Section Dependencies**

Map out what data crosses section boundaries:

```markdown
Example (Clarification workflow):

- Category "Functional Scope" → Reads "Requirements" section only
- Category "Edge Cases" → Reads "Edge Cases" section only
- No category needs data from multiple sections simultaneously

Conclusion: Operation is section-independent → chunking works
```

**Step 3: Test Semantic Chunking**

Prove chunking works with A/B comparison:

1. Test operation on small file (baseline quality, full read)
2. Manually chunk the file by sections
3. Test operation with chunked sections
4. Compare outputs (should match)

**Step 4: Implement Chunking**

Replace "full read required" with semantic section reading:

```diff
- **Strategy**: Full read required (cannot use progressive disclosure for detection).
+ **Strategy**: Semantic section chunking when file exceeds 25K tokens (~1,250 lines).
+
+ **Chunking approach**:
+ 1. Use Grep to discover section boundaries (line numbers)
+ 2. Read only relevant sections (User Stories, Requirements, Edge Cases)
+ 3. Apply operation to each section independently
+ 4. Accumulate results across sections
+
+ **Why this works**:
+ - Operation is section-scoped (no cross-section dependencies)
+ - Semantic boundaries prevent mid-content splits
+ - Same quality as full read (proven by testing)
```

**Step 5: Add Content Validation**

Add Step 2b checkpoint to verify CONTENT loaded (not just STRUCTURE):

```markdown
### Step 2b: Content Loading Validation (MANDATORY)

<validation_checklist>
**For documentation files**:

- [ ] Did you extract content DESCRIPTIONS (not just identifiers)?
- [ ] Can you quote a specific requirement's text?
- [ ] If NO: Re-read using Read(file, offset, limit)
      </validation_checklist>
```

**Step 6: Remove Design Constraint**

Delete or replace "full read required" statements throughout the skill file.

**Prevention Strategies**:

When designing new skills:

| DO                                                      | DON'T                                                  |
| ------------------------------------------------------- | ------------------------------------------------------ |
| Design operations to be section-scoped from the start   | Assume full context is needed without testing          |
| Ask "Which sections does this operation actually need?" | Say "just read the whole file, we'll optimize later"   |
| Document cross-section dependencies explicitly (if any) | Block chunking with "full read required" statements    |
| Test on large files (>1,250 lines) during development   | Only test on small example files (<500 lines)          |
| Use semantic boundaries (section headers) for splits    | Use arbitrary fixed-size chunks that split mid-content |

**Cost of This Anti-Pattern**:

| Impact Area           | Cost                                                |
| --------------------- | --------------------------------------------------- |
| **Engineering Time**  | 30 min investigation + 30 min fix per skill         |
| **User Productivity** | Workflow blocked until fix deployed                 |
| **Opportunity Cost**  | Users avoid large docs → poor documentation quality |
| **Technical Debt**    | Skills designed without chunking from start         |

**Success Metrics After Fixing**:

- Skill works on any file size (tested up to 5,000 lines)
- No Read tool errors on large files
- Output quality matches full-read baseline
- Cost: Same or lower (skipping irrelevant sections)

**Key Lesson**: When you see "full read required", ask "WHY?" instead of accepting it as fact.

---

## Summary

The "Full Read Required" anti-pattern represents a **false assumption that becomes a design constraint**, blocking efficient solutions. The fix is not just adding code - it's **questioning the original assumption** and proving the operation is section-scoped through testing.

---

## References

### Official Anthropic Documentation

- [Introducing Contextual Retrieval - Anthropic](https://www.anthropic.com/news/contextual-retrieval)
- [Files API - Claude Docs](https://platform.claude.com/docs/en/build-with-claude/files)
- [Claude Code: Best practices for agentic coding](https://www.anthropic.com/engineering/claude-code-best-practices)
- [Building Agents with the Claude Agent SDK](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk)

### Community Resources

- [How Claude Processes Long Documents (100K+ Tokens)](https://claude-ai.chat/guides/how-claude-processes-long-documents/)
- [Claude AI File Upload and Reading: formats, limits, and operational structure](https://www.datastudios.org/post/claude-ai-file-upload-and-reading-formats-limits-and-operational-structure)
- [Automatic Chunking for Large Files/Prompts - GitHub Discussion](https://github.com/Kilo-Org/kilocode/discussions/589)
- [Contextual retrieval in Anthropic using Amazon Bedrock Knowledge Bases](https://aws.amazon.com/blogs/machine-learning/contextual-retrieval-in-anthropic-using-amazon-bedrock-knowledge-bases/)

---

**Related Documents:**

- [MODEL-OPTIMIZATION-HAIKU.md](./MODEL-OPTIMIZATION-HAIKU.md) - Haiku-specific optimization patterns
- [MODEL-OPTIMIZATION-SONNET.md](./MODEL-OPTIMIZATION-SONNET.md) - Parallel loading patterns
- [SKILL-CREATION-CHECKLIST.md](./SKILL-CREATION-CHECKLIST.md) - Checklist for skills with large file handling

---

**Document Version**: 1.0.0
**Last Updated**: 2026-01-20
**Status**: Production-Ready
