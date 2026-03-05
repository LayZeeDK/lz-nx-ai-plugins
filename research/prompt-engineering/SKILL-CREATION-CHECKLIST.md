# Skill Creation Checklist

**Purpose**: Prevent large file handling issues in new Claude Code skills
**Audience**: Skill authors, code reviewers
**When to Use**: Before writing Step 2 (context loading) of any skill that reads large documents

---

## Background

**Problem**: Skills often fail on large files (>1,250 lines / ~25K tokens) because chunking is added as an afterthought, not designed from the start.

**Solution**: This checklist embeds large file handling into the design phase.

**Cost of Not Using This Checklist**:

- Engineering time: 60 min per skill to debug + fix after failure
- User impact: Workflow blocked on large documents
- Technical debt: Skills designed without chunking from start

---

## Phase 1: Before Writing Skill

### File Size Assumptions

- [ ] **Identify input files**: What files will this skill read?
  - Requirements/Spec documents: Often >1,250 lines (~25K tokens) ← **Assume large**
  - Design/Architecture documents: Typically <500 lines (~10K tokens) ← Usually safe
  - Task lists: Typically <800 lines (~16K tokens) ← Usually safe
  - Configuration/Guidelines: Typically <300 lines (~6K tokens) ← Safe
  - Data models: Typically <200 lines (~4K tokens) ← Safe

- [ ] **Design for large files**: Assume primary documents will exceed Read tool's 25K token limit
  - Feature documentation: Often exceeds 1,400 lines
  - Mature features: Regularly exceed 2,000 lines
  - Complex systems: Can reach 5,000+ lines

- [ ] **Question "full read" assumptions**: If you think "I need the whole file", ask:
  - Why do I need the whole file?
  - What operation requires cross-section reasoning?
  - Can I decompose this into section-scoped operations?

**Anti-pattern to avoid**: "I'll add chunking later if someone reports an issue"
**Correct approach**: "I'll design section-scoped operations from the start"

---

## Phase 2: Designing Step 2 (Context Loading)

### Chunking Strategy Design

- [ ] **Document chunking strategy**: How will you handle files >1,250 lines?
  - **REQUIRED**: Every skill must document this, even if strategy is "read full file (safe because we only need X small section)"

- [ ] **Use semantic section reading**: Prefer section-based chunking over fixed-size chunks
  - ✅ Semantic boundaries: Section headers (##, ###)
  - ❌ Arbitrary splits: Every 700 lines, every 20K tokens

- [ ] **Identify relevant sections**: Which document sections does your skill actually need?

  **Common section needs by skill type**:

  | Skill Type               | Sections Needed                                             | Sections to Skip                      |
  | ------------------------ | ----------------------------------------------------------- | ------------------------------------- |
  | **Clarification**        | Requirements, User Stories, Edge Cases, Acceptance Criteria | Background, Overview, Goals/Non-Goals |
  | **Analysis**             | Requirements, User Stories, Edge Cases, Acceptance Criteria | Background, Overview, Goals/Non-Goals |
  | **Task Generation**      | User Stories, Success Criteria                              | Requirements, Background, Edge Cases  |
  | **Checklist Generation** | Depends on focus (e.g., UX → UI/Interaction sections)       | All sections not matching focus       |

- [ ] **Skip irrelevant sections**: Document which sections you DON'T need
  - Background, Overview, Goals/Non-Goals: Almost never needed (save tokens)
  - Examples, Code Samples: Skip unless generating documentation

**Example documentation** (from reference implementation):

```markdown
### Step 2: Load Artifacts (Semantic Section Strategy)

**For requirements.md** (if >1,250 lines):

\`\`\`

# Step 1: Discover section boundaries

Grep(pattern: "^#{1,3}\\s+", path: requirements.md, -n: true)

# Step 2: Read relevant sections only

sections_needed = ["Functional Requirements", "User Stories", "Edge Cases"]

FOR EACH section IN sections_needed:
Read(requirements.md, offset=section.start, limit=section.lines)

# Step 3: Skip irrelevant sections

# Skip: Background, Overview, Goals/Non-Goals

\`\`\`

**Benefits**:

- Works on any file size
- Cost-efficient (skip 60-70% of irrelevant content)
- Same quality (operation is section-scoped)
```

### Cross-Section Dependency Analysis

- [ ] **Document dependencies**: What data crosses section boundaries?

  **Example analysis**:

  ```markdown
  Clarification skill dependency analysis:

  - Category "Functional Scope" → Reads "Requirements" section
  - Category "Edge Cases" → Reads "Edge Cases" section
  - Categories are independent → No cross-section dependencies

  Conclusion: Can read sections independently, accumulate results
  ```

- [ ] **Justify "full read" if needed**: If you truly need the whole file, document WHY
  - What operation requires all sections simultaneously?
  - What data structure depends on cross-section relationships?
  - Can you refactor to eliminate this dependency?

**Warning**: If you write "full read required", expect code review pushback. Prove it's necessary.

---

## Phase 3: Implementing Step 2b (Content Validation)

### Validation Checkpoint

- [ ] **Add Step 2b**: MANDATORY validation checkpoint after context loading

- [ ] **Test "Can you quote content?"**: Verify CONTENT loaded, not just STRUCTURE

**Template** (adapt for your skill):

```markdown
### Step 2b: Content Loading Validation (MANDATORY)

<critical>
**BEFORE proceeding to Step 3, verify you loaded CONTENT not just STRUCTURE.**
</critical>

<validation_checklist>
**For requirements.md**:

- [ ] Did you extract {content type} DESCRIPTIONS (not just identifiers)?
- [ ] Can you quote a specific {content item} from the loaded content?
- [ ] Example: {Show what success looks like}

**If you answered "NO" to any question above**:

1. STOP immediately
2. Re-read the affected file using Read(file, offset, limit)
3. Validate again before proceeding to Step 3

**Common Failure Pattern to Avoid**:
\`\`\`
❌ WRONG: Using Grep(pattern: "^#{1,3}\\s+") to read headers only
✅ CORRECT: Using Read(file, offset, limit) to read content in sections
\`\`\`
</validation_checklist>
```

### Validation Examples by Skill Type

| Skill Type          | Content Validation Test                                            |
| ------------------- | ------------------------------------------------------------------ |
| **Clarification**   | "Can you quote a specific requirement's imperative phrase?"        |
| **Analysis**        | "Can you list requirement descriptions (not just REQ-XXX IDs)?"    |
| **Task Generation** | "Can you list user story descriptions (not just US-XXX IDs)?"      |
| **Checklist**       | "Can you quote specific items for checklist (not section titles)?" |

---

## Phase 4: Optimization Notes

### Documentation Requirements

- [ ] **Reference chunking strategies doc**: Link to `LARGE-FILE-CHUNKING.md`

- [ ] **Explain why chunking works**: Prove operations are section-scoped

  **Template**:

  ```markdown
  **Why semantic chunking works for {skill name}**:

  - Operation X is local to section Y (no cross-section dependencies)
  - Detection/generation/analysis happens per-section
  - Results accumulate across sections without interaction
  ```

- [ ] **Document cost impact**: Same, cheaper, or more expensive?
  - Same: Loading all sections (just distributed differently)
  - Cheaper: Skipping irrelevant sections (Background, Goals)
  - More expensive: Overlap required (rare, justify if true)

**Key Insights from Production Skills**:

1. **Extended Thinking Budget** (Analysis skills):
   - 4K extended thinking budget is for **semantic reasoning**, NOT file parsing
   - Semantic chunking preserves thinking budget for actual analysis
   - Without chunking: Budget wasted on loading large files

2. **Focus-Driven Optimization** (Checklist skills):
   - Narrow focus (e.g., "UX only") = 70% token reduction
   - Load only sections matching user's intent (UI, Interaction, Visual Design)
   - Significant cost savings + enables specific traceability

3. **Multi-File Context** (Analysis skills loading 2+ files):
   - Skills loading 2+ files benefit most from semantic chunking
   - Skip irrelevant sections → More headroom for additional files
   - Better token distribution across requirements + design + optional docs

---

## Phase 5: Testing

### Test File Selection

- [ ] **Test on small file**: Baseline quality (<1,000 lines)
  - Create a minimal test document with all needed sections
  - Verify skill produces expected output
  - This is your quality baseline

- [ ] **Test on large file**: Chunking verification (>1,250 lines)
  - Find or create a large document (1,400+ lines)
  - Verify semantic section reading triggers
  - Verify no Read tool errors
  - Verify Step 2b validation passes

- [ ] **Compare outputs**: Chunked vs full-read should match
  - Same findings count (for analysis skills)
  - Same questions count (for clarification skills)
  - Same task count (for task generation skills)

### Validation Checklist (Testing Phase)

After testing on large file:

- [ ] **No Read tool errors**: File size exceeded limit → chunking worked
- [ ] **Content validation passed**: Step 2b checklist completed successfully
- [ ] **Output quality matches**: Compare against small file baseline
- [ ] **Cost is acceptable**: Same or lower token usage
- [ ] **Can quote specific content**: Proves CONTENT loaded, not just STRUCTURE

---

## Phase 6: Code Review

### Reviewer Checklist

When reviewing a new skill, check:

- [ ] **Step 2 documents chunking**: How does it handle files >1,250 lines?
- [ ] **Step 2b validates content**: Checkpoint exists and tests "can you quote content?"
- [ ] **No "full read required"**: If present, challenge the assumption
- [ ] **Optimization notes reference docs**: Links to chunking strategies documentation
- [ ] **Tested on large file**: PR description shows test on large document or similar

**Red flags during review**:

- ❌ "Strategy: Full read required" (question this immediately)
- ❌ No chunking strategy documented
- ❌ Only tested on small example files
- ❌ Grep used for content loading (not boundaries)
- ❌ No Step 2b validation checkpoint

---

## Common Mistakes to Avoid

### ❌ Don't Do This

| Mistake                   | Why It's Wrong                     | Better Approach                           |
| ------------------------- | ---------------------------------- | ----------------------------------------- |
| "Full read required"      | Often a false assumption           | Question why; test semantic chunking      |
| Grep for content          | Loads STRUCTURE not CONTENT        | Use Grep for boundaries, Read for content |
| No validation checkpoint  | Might proceed with incomplete data | Add Step 2b: Content Loading Validation   |
| Test only on small files  | Won't catch chunking failures      | Test on large document (1,400+ lines)     |
| Arbitrary fixed chunks    | Risk splitting mid-content         | Use semantic boundaries (section headers) |
| "I'll add chunking later" | Becomes technical debt             | Design section-scoped from start          |

### ✅ Do This Instead

| Best Practice             | Why It Works                              | Example                               |
| ------------------------- | ----------------------------------------- | ------------------------------------- |
| Semantic section reading  | Natural boundaries, no mid-content splits | Use section headers as split points   |
| Content validation        | Catches header-only reads                 | "Can you quote specific requirement?" |
| Skip irrelevant sections  | Cost savings, same quality                | Skip Background, Goals for analysis   |
| Test on large files       | Catches Read tool failures                | Use 1,400+ line document              |
| Reference research docs   | Shows you did your homework               | Link to chunking strategies doc       |
| Section-scoped operations | Enables chunking by design                | "Operation X needs Section Y only"    |

---

## Quick Start Template

Copy this template into your new skill's Step 2:

```markdown
### Step 2: Load Artifacts (Semantic Section Strategy)

<context_loading>
**Semantic Section Reading Strategy** (use when file exceeds 25K token limit):

Based on research-backed best practices from [LARGE-FILE-CHUNKING.md](./LARGE-FILE-CHUNKING.md).

**For requirements.md** (if >1,250 lines):

\`\`\`

# Step 1: Discover section boundaries

Grep(
pattern: "^#{1,3}\\s+",
path: requirements.md,
output_mode: "content",
-n: true # Include line numbers
)

# Step 2: Read relevant sections only

sections_needed = [
"TODO: List sections your skill needs",
"Example: Functional Requirements",
"Example: User Stories"
]

FOR EACH section IN sections_needed:
Read(requirements.md, offset=section.start, limit=section.lines)
EXTRACT {content type} from content

# Step 3: Skip irrelevant sections

# Always skip: Background, Overview, Goals/Non-Goals (unless needed)

\`\`\`

**Why this works for {your skill name}**:

- TODO: Explain why operations are section-scoped
- TODO: List cross-section dependencies (if any)
- TODO: Document cost impact

See: LARGE-FILE-CHUNKING.md
</context_loading>

### Step 2b: Content Loading Validation (MANDATORY)

<critical>
**BEFORE proceeding to Step 3, verify you loaded CONTENT not just STRUCTURE.**
</critical>

<validation_checklist>
**For requirements.md**:

- [ ] Did you extract {content type} DESCRIPTIONS (not just identifiers)?
- [ ] Can you quote a specific {content item} from the loaded content?

**If you answered "NO"**:

1. STOP immediately
2. Re-read using Read(file, offset, limit) with semantic sections
3. Validate again before Step 3
   </validation_checklist>
```

---

## Success Criteria

After using this checklist:

**Immediate** (During development):

- ✅ Chunking strategy documented in Step 2
- ✅ Content validation checkpoint added (Step 2b)
- ✅ Tested on large file (1,400+ lines or similar)

**Short-term** (Code review):

- ✅ Reviewer approved chunking approach
- ✅ No "full read required" statements remain
- ✅ Optimization notes reference research docs

**Long-term** (Production):

- ✅ Zero failures on large files (>1,250 lines)
- ✅ No user reports of Read tool errors
- ✅ Cost profile matches expectations

---

## Resources

### Documentation

- **Chunking Strategies**: [LARGE-FILE-CHUNKING.md](./LARGE-FILE-CHUNKING.md)
- **Model Optimization**: [MODEL-OPTIMIZATION-HAIKU.md](./MODEL-OPTIMIZATION-HAIKU.md)

### External Research

- **Anthropic Guidance**: [Introducing Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval)
- **Philosophy**: "Semantic chunking" over "full file reads"

---

## Feedback & Improvements

This checklist will evolve based on lessons learned from new skills.

**Suggest improvements**:

- Found a common mistake not covered? → Add to "Common Mistakes" section
- Discovered a new anti-pattern? → Document in chunking strategies doc
- Have a better template? → Update "Quick Start Template" section

---

**Remember**: The goal isn't perfection - it's **preventing the pattern where skills fail on large files because chunking was an afterthought, not part of the design.**

---

**Version**: 1.0.0
**Last Updated**: 2026-01-20
