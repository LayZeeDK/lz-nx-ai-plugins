# Recursive Language Models

> Source: [https://alexzhang13.github.io/rlm/api/](https://alexzhang13.github.io/rlm/api/)

---

## Using the RLM Client

The main class for recursive language model completions. Enables LMs to programmatically examine, decompose, and recursively call themselves over their input.

## Quick Example

```
from rlm import RLM

rlm = RLM(
    backend="openai",
    backend_kwargs={"model_name": "gpt-5-mini"},
)
result = rlm.completion("Your prompt here")
print(result.response)
```

## Constructor

```
RLM(
    backend: str = "openai",
    backend_kwargs: dict | None = None,
    environment: str = "local",
    environment_kwargs: dict | None = None,
    depth: int = 0,
    max_depth: int = 1,
    max_iterations: int = 30,
    custom_system_prompt: str | None = None,
    other_backends: list[str] | None = None,
    other_backend_kwargs: list[dict] | None = None,
    logger: RLMLogger | None = None,
    verbose: bool = False,
)
```

`backend`strdefault: "openai"

LM provider to use for completions.

| Value          | Provider                 |
| -------------- | ------------------------ |
| `"openai"`     | OpenAI API               |
| `"anthropic"`  | Anthropic API            |
| `"portkey"`    | Portkey AI gateway       |
| `"openrouter"` | OpenRouter               |
| `"litellm"`    | LiteLLM (multi-provider) |
| `"vllm"`       | Local vLLM server        |

`backend_kwargs`dict | Nonedefault: None

Provider-specific configuration (API keys, model names, etc.).

```
# OpenAI / Anthropic
backend_kwargs={
    "api_key": "...",
    "model_name": "gpt-5-mini",
}

# vLLM(local)
backend_kwargs={
    "base_url": "http://localhost:8000/v1",
    "model_name": "meta-llama/Llama-3-70b",
}

# Portkey
backend_kwargs={
    "api_key": "...",
    "model_name": "@openai/gpt-5-mini",
}
```

`environment`strdefault: "local"

Code execution environment for REPL interactions.

| Value      | Description                          |
| ---------- | ------------------------------------ |
| `"local"`  | Same-process with sandboxed builtins |
| `"docker"` | Docker container                     |
| `"modal"`  | Modal cloud sandbox                  |

`environment_kwargs`dict | Nonedefault: None

Environment-specific configuration.

```
# Docker
environment_kwargs={"image": "python:3.11-slim"}

# Modal
environment_kwargs={
    "app_name": "my-app",
    "timeout": 600,
}

# Local
environment_kwargs={"setup_code": "import numpy as np"}
```

`max_iterations`intdefault: 30

Maximum REPL iterations before forcing a final answer.

`max_depth`intdefault: 1

**Note:** This is a TODO. Only `max_depth=1` is currently supported.

Maximum recursion depth. When `depth >= max_depth`, falls back to regular LM completion.

`custom_system_prompt`str | Nonedefault: None

Override the default RLM system prompt.

`other_backends`list\[str\] | Nonedefault: None

Additional backends available for sub-LM calls within the REPL.

```
rlm = RLM(
    backend="openai",
    backend_kwargs={"model_name": "gpt-5-mini"},
    other_backends=["anthropic"],
    other_backend_kwargs=[{"model_name": "claude-sonnet-4-20250514"}],
)
```

`other_backend_kwargs`list\[dict\] | Nonedefault: None

Configurations for `other_backends` (must match order).

`logger`RLMLogger | Nonedefault: None

Logger for saving RLM execution trajectories to JSON-lines files.

```
from rlm.logger import RLMLogger

logger = RLMLogger(log_dir="./logs")
rlm = RLM(..., logger=logger)
```

`verbose`booldefault: False

Enable rich console output showing iterations, code execution, and results.

## Methods

`completion()`

Main method for RLM completions. Executes the recursive loop and returns the final result.

The method returns an `RLMChatCompletion` object containing the final response, execution metadata, and usage statistics. This object provides access to the RLM's output and performance metrics.

```
result = rlm.completion(
    prompt: str | dict,
    root_prompt: str | None = None,
)
```

### Arguments

| Name          | Type | Description |
| ------------- | ---- | ----------- | -------------------------------------------------- |
| `prompt`      | `str | dict`       | Input context (becomes `context` variable in REPL) |
| `root_prompt` | `str | None`       | Optional hint visible only to the root LM call     |

### Returns

`RLMChatCompletion` object with:

| Attribute        | Type           | Description                                |
| ---------------- | -------------- | ------------------------------------------ |
| `response`       | `str`          | Final answer from the RLM                  |
| `execution_time` | `float`        | Total execution time in seconds            |
| `usage_summary`  | `UsageSummary` | Aggregated token usage across all LM calls |
| `root_model`     | `str`          | Model name used for root completion        |
