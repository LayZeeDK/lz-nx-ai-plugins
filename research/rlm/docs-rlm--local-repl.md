# Recursive Language Models

> Source: [https://alexzhang13.github.io/rlm/environments/local/](https://alexzhang13.github.io/rlm/environments/local/)

---

## LocalREPL

**LocalREPL** is the default execution environment for RLM. It runs Python code in the **same process** as the RLM host application, using Python's built-in `exec()` function with a sandboxed namespace. The REPL shares the same virtual environment and memory space as the host process, but restricts access to dangerous builtins like `eval`,`exec`, and`compile`. This provides fast execution with minimal overhead, making it ideal for development and trusted code execution, but offers no process-level isolation from the host system.

```
rlm = RLM(
    backend="openai",
    backend_kwargs={"model_name": "gpt-5-mini"},
    environment="local",  # Default
    environment_kwargs={
        "setup_code": "import json",  # Optional
    },
)
```

---

## Arguments

| Argument             | Type    | Default | Description                   |
| -------------------- | ------- | ------- | ----------------------------- | ---- | ---------------------------- |
| `setup_code`         | `str`   | `None`  | Code to run at initialization |
| `context_payload`    | `str    | dict    | list`                         | Auto | Initial context (set by RLM) |
| `lm_handler_address` | `tuple` | Auto    | Socket address (set by RLM)   |

---

## How It Works

1.  Creates sandboxed `globals` with restricted `__builtins__`
2.  Injects `context`, `llm_query()`, `llm_query_batched()`, `FINAL_VAR()`
3.  Executes each code block via `exec()`
4.  `llm_query()` sends TCP requests to LM Handler
5.  Variables persist across code blocks in `locals`

---

## Sandboxed Builtins

**Allowed:** `print`, `len`, `range`, `str`, `int`, `float`, `list`, `dict`, `set`, `tuple`, `open`, `min`, `max`, `sum`, `sorted`, `enumerate`, `zip`, `map`, `filter`, standard exceptions

**Blocked:** `eval`, `exec`, `compile`, `input`, `globals`, `locals`

---

## Limitations

- Shares process memory with host
- No network isolation
- Dependencies must be installed in host virtualenv
