# Bringing RLM to TypeScript: Building rllm

> Source: [https://dev.to/nitay_rabinovich_d7cc35f5/bringing-rlm-to-typescript-building-rllm-20p8](https://dev.to/nitay_rabinovich_d7cc35f5/bringing-rlm-to-typescript-building-rllm-20p8)
> Author: Nitay Rabinovich
> Site: DEV Community

---

[![Nitay Rabinovich](https://media2.dev.to/dynamic/image/width=50,height=50,fit=cover,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.amazonaws.com%2Fuploads%2Fuser%2Fprofile_image%2F1862772%2F999c9a2a-662c-4e56-bc26-b6d7ec59b88e.jpg)](https://dev.to/nitay_rabinovich_d7cc35f5)

Large Language Models struggle with very large contexts. Long documents or complex data structures quickly exceed token limits or degrade reasoning when everything is placed into a single prompt.

Recursive Large Language Models (RLMs) address this by letting the model generate and execute code that recursively explores and processes context. Instead of seeing all the data at once, the model learns how to navigate it.

**This idea was originally described in Python-focused work:**

[https://alexzhang13.github.io/blog/2025/rlm/](https://alexzhang13.github.io/blog/2025/rlm/)  
[https://github.com/alexzhang13/rlm](https://github.com/alexzhang13/rlm)

I recently open-sourced rllm, a TypeScript implementation of the RLM approach, designed for the JavaScript ecosystem.

**Repo: [https://github.com/code-rabi/rllm](https://github.com/code-rabi/rllm)**

Letting LLMs run code

Allowing LLMs to write and execute code is already a widespread and powerful idea. We see it in systems like code mode, tool calling, and agent frameworks. RLMs build on this foundation by making code execution the core reasoning mechanism rather than a side feature.

This approach opens the door to much richer interactions with large and structured data. Instead of summarizing raw text, models can iterate over trees, filter datasets, and decompose problems dynamically.

**Why TypeScript?**

`rllm` is built to work naturally in Node, Bun, and Deno environments:

- Runs model-generated code in V8 isolates for sandboxed execution
- Uses Zod schemas to describe structured context to the model
- Avoids Python subprocesses or external services
- Fits cleanly into existing TypeScript codebases

**Minimal example**

```
import { createRLLM } from "rllm";

const rlm = createRLLM({ model: "gpt-4o-mini" });

const result = await rlm.completion(
  "What are the key findings in this document?",
  { context: hugeDocument }
);

console.log(result.answer);
```

Enter fullscreen mode Exit fullscreen mode

The key benefit is that the model can explore `hugeDocument` step by step rather than consuming it all at once.

**Closing thoughts**

Recursive execution models like RLMs feel like a natural next step for LLM systems. As models improve at writing code, giving them safe and structured execution environments enables more scalable reasoning over large data.

If you are working with LLMs in TypeScript and want to experiment with this idea, I would love your feedback.

**Repo: [https://github.com/code-rabi/rllm](https://github.com/code-rabi/rllm)**
