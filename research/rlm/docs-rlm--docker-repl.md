# Recursive Language Models

> Source: [https://alexzhang13.github.io/rlm/environments/docker/](https://alexzhang13.github.io/rlm/environments/docker/)

---

## DockerREPL![Docker](https://github.com/docker.png)

**DockerREPL** executes Python code in a **Docker container**running on the same host machine as the RLM process. Each code execution runs in an isolated container environment with its own filesystem, network namespace, and process tree, providing better security and reproducibility than LocalREPL. The container requests LM calls from the host's LM Handler when code executes `llm_query()`. This environment is ideal for CI/CD pipelines, reproducible execution environments, and scenarios requiring stronger isolation than LocalREPL while maintaining the convenience of local execution. For more information on Docker, see the [Docker documentation](https://docs.docker.com/).

**Prerequisite:** Docker must be installed and running.

```
rlm = RLM(
    backend="openai",
    backend_kwargs={"model_name": "gpt-5-mini"},
    environment="docker",
    environment_kwargs={
        "image": "python:3.11-slim",
    },
)
```

---

## Arguments

| Argument             | Type    | Default              | Description                   |
| -------------------- | ------- | -------------------- | ----------------------------- | ---- | ---------------------------- |
| `image`              | `str`   | `"python:3.11-slim"` | Docker image to use           |
| `setup_code`         | `str`   | `None`               | Code to run at initialization |
| `context_payload`    | `str    | dict                 | list`                         | Auto | Initial context (set by RLM) |
| `lm_handler_address` | `tuple` | Auto                 | Socket address (set by RLM)   |

---

## How It Works

1.  Starts Docker container with volume mount to temp directory
2.  Installs `dill` and `requests` in container
3.  Host runs HTTP proxy server on random port
4.  Container calls proxy via `host.docker.internal`
5.  Proxy forwards `llm_query()` to LM Handler via socket
6.  State persisted via `dill` to `/workspace/state.dill`

┌────────────────────────────────────────┐
│ Host │
│ ┌────────────┐ Socket ┌────────────┐ │
│ │ HTTP Proxy │◄──────►│ LM Handler │ │
│ └─────┬──────┘ └────────────┘ │
└────────┼───────────────────────────────┘
│ HTTP
┌────────┼───────────────────────────────┐
│ Docker │ Container │
│ ┌─────▼──────┐ │
│ │ Python │ llm_query() → proxy │
│ │ exec() │ │
│ └────────────┘ │
└────────────────────────────────────────┘

---

## Custom Image

You can use your own custom Docker images or update the given image. Pre-install dependencies:

```
FROM python:3.11-slim
RUN pip install numpy pandas dill requests
```

```
environment_kwargs={"image": "my-rlm-image"}
```
