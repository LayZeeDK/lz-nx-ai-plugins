# MIT's Recursive Language Models Improve Performance on Long-Context Tasks

> Source: [https://www.infoq.com/news/2026/01/mit-recursive-lm/](https://www.infoq.com/news/2026/01/mit-recursive-lm/)
> Author: Anthony Alford
> Site: InfoQ

---
Researchers at [MIT's CSAIL](https://www.csail.mit.edu/) published a design for [Recursive Language Models](https://arxiv.org/abs/2512.24601) (RLM), a technique for improving LLM performance on long-context tasks. RLMs use a programming environment to recursively decompose and process inputs, and can handle prompts up to 100x longer than base LLMs.

A current challenge with LLMs is that they have a limited input size (aka _context window_) and often struggle with tasks that require a long context. The key idea of RLMs is, instead of passing the prompt directly to the LLM, to give the LLM access to a programming language such as Python. The LLM then generates code to manipulate the prompt and perform preprocessing such as breaking it into chunks or searching for regular expressions. These programming tasks are performed recursively: part of the generated code is to invoke another RLM call. On a wide range of long-context benchmarks, the MIT team found that their RLM outperformed other strategies such as context compaction. According to MIT, 

> While RLMs show strong performance on tasks beyond the context window limitations of existing LMs at reasonable inference costs, the optimal mechanism for implementing RLMs remains under-explored...Our results across multiple settings and models demonstrated that RLMs are an effective task-agnostic paradigm for both long-context problems and general reasoning. We are excited to see future work that explicitly trains models to reason as RLMs, which could result in another axis of scale for the next generation of language model systems.

Although frontier LLMs often have very large context windows, users have noticed that once the context gets large, the models start to show [context rot](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents). That is, they struggle to recall data from the context. This is even more visible for [needle in a haystack](https://github.com/gkamradt/LLMTest_NeedleInAHaystack) tasks: finding random facts from a large context. MIT designed the RLM to solve these problems.

MIT implemented the RLM as a [Python REPL Notebook](https://alexzhang13.github.io/blog/2025/rlm/), where the prompt was loaded into a variable. The "root" language model could then interact with this REPL by writing code to "peek at, partition, grep through, and launch recursive sub-queries." By recursively calling other language models, the root can build up an output from variables in the REPL environment.

This scheme has several benefits that allow it to handle long contexts. First, the root model never gets the full context as an input, so its context window is not "clogged." It can use the REPL environment to iteratively operate on subsets of the context, and for tasks where it is asked to find details in a long input, it can use strategies such as regex matching to narrow down the search. 

MIT team member Alex Zhang [posted on X about the work](https://x.com/a1zhang/status/2007663923013554258), calling it a "[bitter-lesson](https://en.wikipedia.org/wiki/Bitter_lesson)\-pilled approach." He also wrote:

> The intuition is that 1) LMs can often ignore most of their context for certain problems; 2) LMs can more efficiently solve problems when only looking locally at certain parts of their input. The REPL environment provides a programmatic way for the model to peek at & infer long contexts without the model ever actually viewing it. It’s a partially observable problem that you’re giving the LM, where it can make logical decisions based on the structure of the task / context.

The code for [implementing RLMs](https://github.com/alexzhang13/rlm) is available on GitHub.

## About the Author

#### **Anthony Alford**

Show moreShow less
