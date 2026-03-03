# Recursive Language Models

> Source: [https://alexzhang13.github.io/rlm/backends/](https://alexzhang13.github.io/rlm/backends/)

---
## Backends

RLMs natively support a wide range of language model providers, including `OpenAI`, `Anthropic`, `Portkey`, `OpenRouter`, and `LiteLLM`. Additional providers can be supported with minimal effort. The `backend_kwargs` are named arguments passed directly to the backend client.

* * *

## OpenAI

```
rlm = RLM(
    backend="openai",
    backend_kwargs={
        "api_key": os.getenv("OPENAI_API_KEY"),  # or set OPENAI_API_KEY env
        "model_name": "gpt-5-mini",
        "base_url": "https://api.openai.com/v1",  # optional
    },
)
```

* * *

## Anthropic

```
rlm = RLM(
    backend="anthropic",
    backend_kwargs={
        "api_key": os.getenv("ANTHROPIC_API_KEY"),
        "model_name": "claude-sonnet-4-20250514",
    },
)
```

* * *

## Portkey

[Portkey](https://portkey.ai/docs/api-reference/sdk/python) is a client for routing to hundreds of different open and closed frontier models.

```
rlm = RLM(
    backend="portkey",
    backend_kwargs={
        "api_key": os.getenv("PORTKEY_API_KEY"),
        "model_name": "@openai/gpt-5-mini",  # Portkey format: @provider/model
    },
)
```

* * *

## OpenRouter

[OpenRouter](https://openrouter.ai/docs) is a multi-provider gateway for accessing a wide range of models from different providers through one API.

```
rlm = RLM(
    backend="openrouter",
    backend_kwargs={
        "api_key": os.getenv("OPENROUTER_API_KEY"),
        "model_name": "openai/gpt-5-mini",  # Format: provider/model
    },
)
```

* * *

## LiteLLM

[LiteLLM](https://docs.litellm.ai/docs/) is a universal interface for 100+ model providers, with support for local models and custom endpoints.

```
rlm = RLM(
    backend="litellm",
    backend_kwargs={
        "model_name": "gpt-5-mini",
    },
)
# Set provider API keys in environment
```

* * *

## vLLM (Local)

Local model serving.

```
# Start vLLM server
python -m vllm.entrypoints.openai.api_server \
    --model meta-llama/Llama-3-70b \
    --port 8000
```

```
rlm = RLM(
    backend="vllm",
    backend_kwargs={
        "base_url": "http://localhost:8000/v1",  # Required
        "model_name": "meta-llama/Llama-3-70b",
    },
)
```

* * *

## Multiple Backends (Experimental)

**Experimental:** This feature allows you to specify _ordered_ lists of backends and model kwargs, so that RLMs can sub-call different language models from within execution code. The order of `other_backends` and `other_backend_kwargs` must match: e.g., the 0th element of `other_backends` is used with the 0th dict in `other_backend_kwargs`.

This functionality is for advanced use and is currently experimental.It will become more useful as RLMs get the ability to orchestrate and delegate between different LMs within a workflow.

```
rlm = RLM(
    backend="openai",
    backend_kwargs={"model_name": "gpt-5-mini"},
    other_backends=["anthropic", "openai"],  # ORDER MATTERS!
    other_backend_kwargs=[
        {"model_name": "claude-sonnet-4-20250514"},
        {"model_name": "gpt-4o-mini"},
    ],  # ORDER MATCHES other_backends
)
```

Inside REPL (future releases):

```
llm_query("prompt")  # Uses default(gpt-5-mini)
llm_query("prompt", model="claude-sonnet-4-20250514")  # Uses Claude 
llm_query("prompt", model="gpt-4o-mini")  # Uses GPT-4o-mini
```
