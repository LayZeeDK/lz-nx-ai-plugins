# Recursive Language Models

> Source: [https://alexzhang13.github.io/rlm/environments/modal/](https://alexzhang13.github.io/rlm/environments/modal/)

---

## ModalREPL![Modal](https://github.com/modal-labs.png)

**ModalREPL** executes Python code in **Modal cloud sandboxes**, which are ephemeral cloud VMs that run completely isolated from the host machine. Each sandbox is a fresh, isolated environment with its own filesystem, network, and compute resources, providing the highest level of security and isolation available in RLM. The sandbox requests LM calls from the host's LM Handler when code executes `llm_query()`. This environment is production-ready and essential for executing untrusted LM-generated code or handling sensitive data. For more information on Modal sandboxes, see the [Modal sandboxes documentation](https://modal.com/docs/guide/sandbox).

**Prerequisites:**

```
uv pip install -e . --extra modal
# Or with regular pip:
# pip install -e ".[modal]"

modal setup  # Authenticate
```

```
rlm = RLM(
    backend="openai",
    backend_kwargs={"model_name": "gpt-5-mini"},
    environment="modal",
    environment_kwargs={
        "app_name": "my-rlm-app",
        "timeout": 600,
    },
)
```

---

## Arguments

| Argument             | Type          | Default         | Description                   |
| -------------------- | ------------- | --------------- | ----------------------------- | ---- | ---------------------------- |
| `app_name`           | `str`         | `"rlm-sandbox"` | Modal app name                |
| `timeout`            | `int`         | `600`           | Sandbox timeout in seconds    |
| `image`              | `modal.Image` | Auto            | Custom Modal image            |
| `setup_code`         | `str`         | `None`          | Code to run at initialization |
| `context_payload`    | `str          | dict            | list`                         | Auto | Initial context (set by RLM) |
| `lm_handler_address` | `tuple`       | Auto            | Socket address (set by RLM)   |

---

## How It Works

Modal sandboxes can't connect directly to the host. Uses HTTP broker pattern:

1.  Sandbox starts Flask broker server on port 8080
2.  Port exposed via Modal's `encrypted_ports` tunnel
3.  `llm_query()` POSTs to local broker, blocks waiting
4.  Host polls `{tunnel}/pending` every 100ms
5.  Host forwards requests to LM Handler, POSTs responses back
6.  Broker unblocks and returns response

Host polls /pending ────────────────┐
│
┌───────────────────────────────────┼──┐
│ Modal Sandbox ▼ │
│ ┌──────────────┐ ┌──────────────┐ │
│ │ Broker Flask │◄─►│ Code Exec │ │
│ │ /enqueue │ │ llm_query() │ │
│ │ /pending │ └──────────────┘ │
│ │ /respond │ │
│ └──────────────┘ │
└──────────────────────────────────────┘

---

## Custom Image

You can use your own custom Modal images or update the given image:

```
import modal

image = modal.Image.debian_slim(python_version="3.11").pip_install(
    "numpy", "pandas", "dill", "requests", "flask"
)

rlm = RLM(
    backend="openai",
    backend_kwargs={"model_name": "gpt-5-mini"},
    environment="modal",
    environment_kwargs={"image": image},
)
```

---

## Default Image

Includes: `numpy`, `pandas`, `scipy`, `sympy`, `requests`, `httpx`, `flask`, `pyyaml`, `tqdm`, `dill`
