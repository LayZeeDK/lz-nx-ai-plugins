# Recursive Language Models

> Source: [https://alexzhang13.github.io/rlm/environments/](https://alexzhang13.github.io/rlm/environments/)

---

## REPL Environments

REPL environments are sandboxed Python execution contexts where the LM can write and execute code to analyze the input context. These environments provide the LM with programmatic access to computation, data processing, and the ability to make sub-LM calls.

When you call `rlm.completion(prompt)`, your prompt becomes the `context` variable in a Python REPL. The LM can then write Python code to examine this context, decompose complex tasks, and recursively call itself via `llm_query()`to handle sub-problems.

## Isolation Levels

RLM supports two types of environments based on their isolation level:

### Non-Isolated Environments

Run code on the same machine as the RLM process (or in a container on the same host).

- **Faster execution** — No network overhead
- **Shared resources** — Access to host filesystem, network, and memory
- **Lower security** — Code runs with host process privileges
- **Use cases:** Development, testing, trusted code

### Isolated Environments

Run code on completely separate machines (cloud VMs), guaranteeing full isolation.

- **Full isolation** — No access to host resources
- **Higher security** — Code cannot affect host system
- **Network overhead** — Communication via HTTP tunnels
- **Use cases:** Production, untrusted code, sensitive data

**Why this matters:** The isolation level determines the security and trust model of your RLM application. Non-isolated environments are faster and simpler, but code execution shares the host's resources and privileges. Isolated environments provide complete separation, making them essential for production deployments or when executing untrusted LM-generated code.

## Available Environments

| Environment                                                        | Isolation    | Best For               |
| ------------------------------------------------------------------ | ------------ | ---------------------- |
| [`local`](https://alexzhang13.github.io/rlm/environments/local/)   | Non-isolated | Development            |
| [`docker`](https://alexzhang13.github.io/rlm/environments/docker/) | Non-isolated | CI/CD, reproducibility |
| [`modal`](https://alexzhang13.github.io/rlm/environments/modal/)   | Isolated     | Production             |

## REPL Globals

These variables and functions are available inside code executed in the REPL environment:

| Name                                     | Description                                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `context`                                | Your input prompt, available as a variable in the REPL                                                  |
| `llm_query(prompt, model=None)`          | Single LM completion call. Returns the completion string. Does not have tool access.                    |
| `llm_query_batched(prompts, model=None)` | Concurrent single LM completion calls. Returns a list of completion strings. Does not have tool access. |
| `FINAL_VAR(var_name)`                    | Mark a variable as the final answer to return from the RLM                                              |
| `custom_tools`                           | Any custom functions or data you provide via the custom_tools parameter                                 |

```
# Example usage in REPL
context = "Your input here"

# Query a sub-LM
result = llm_query("Summarize the context", model="gpt-5-mini")

# Use a custom tool(if provided)
data = fetch_data(context["url"])  # Custom function

# Process the result
summary = process(result)

# Return final answer
FINAL_VAR(summary)
```

## Custom Tools

You can provide custom functions and data that the RLM can use in its REPL environment via the `custom_tools` parameter:

```
from rlm import RLM

def fetch_weather(city: str) -> str:
    """Fetch weather data for a city."""
    return f"Weather in {city}: Sunny, 72°F"

rlm = RLM(
    backend="openai",
    backend_kwargs={"model_name": "gpt-4o"},
    custom_tools={
        # Plain format(no description)
        "fetch_weather": fetch_weather,

        # Dict format with description(recommended)
        "calculate_tip": {"tool": lambda x: x * 0.2, "description": "Calculate 20% tip for a bill amount"},
        "API_KEY": {"tool": "your-key", "description": "API key for external services"},
    },
)

# The model can now call fetch_weather() in its REPL code
```

**Tool descriptions:** Use the dict format`{"tool": value, "description": "..."}` to provide descriptions that help the model understand what each tool does. Descriptions are automatically included in the system prompt.

**Note:** `llm_query()` calls are single LM completions and do not have access to custom tools. Only the main RLM execution context has tool access.

## Architecture

### Non-Isolated (local, docker)

Direct TCP socket communication:

┌────────────┐ Socket ┌────────────┐
│ Environment│◄──────────►│ LM Handler │
│ llm_query()│ │ │
└────────────┘ └────────────┘

### Isolated (modal)

HTTP broker pattern for cloud sandboxes:

┌─────────────────────────────────────┐
│ Host │
│ ┌──────────┐ ┌────────────┐ │
│ │ ModalREPL│◄─────►│ LM Handler │ │
│ │ (polls) │Socket └────────────┘ │
│ └────┬─────┘ │
│ │ HTTP │
└───────┼────────────────────────────┘
▼
┌───────────────────────────────────────┐
│ Modal Sandbox │
│ ┌────────────┐ ┌──────────────┐ │
│ │ Broker │◄───►│ Code Exec │ │
│ │ (Flask) │ │ llm_query() │ │
│ └────────────┘ └──────────────┘ │
└───────────────────────────────────────┘

The broker queues `llm_query()` requests, host polls for pending requests, forwards them to the LM Handler, and posts responses back.
