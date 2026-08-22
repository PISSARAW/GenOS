# Real integration configuration

The Studio backend keeps deterministic dry-runs available, but real model and
MCP calls are opt-in and require explicit infrastructure configuration.

## Model provider

Set a model URI and its key before starting the backend:

```sh
GENOS_DEFAULT_MODEL=openai://gpt-4o-mini
OPENAI_API_KEY=...
```

The supported URI families are `openai://`, `openai-compatible://`,
`anthropic://`, `gemini://`, `mistral://`, `ollama://`, `lmstudio://`, and
`vllm://`. OpenAI-compatible endpoints use `GENOS_MODEL_ENDPOINT`; local
providers use their corresponding `GENOS_*_ENDPOINT` variable. `GET /api/model`
returns only redacted configuration status. An authenticated operator can use
`POST /api/model/test` to execute one end-to-end generation.

## MCP transport

Configure exactly one transport:

```sh
# Streamable HTTP
GENOS_MCP_URL=http://127.0.0.1:8799/mcp

# Or newline-delimited STDIO
GENOS_MCP_COMMAND=/absolute/path/to/genos-mcp
GENOS_MCP_ARGS=stdio
```

`POST /api/tools/dry-run` never contacts the server. Authenticated MCP
execution first passes policy and circuit-breaker checks, then performs
`initialize` and `tools/call` over the configured transport.

## Durable snapshots and isolated bisection

Workspace snapshots are stored under `.genos/workspace-snapshots` by default;
`GENOS_SNAPSHOT_ROOT` can point to a persistent volume. The SQLite table is an
index over SHA-256 manifests and copied files. Restore creates a pre-restore
safety snapshot and bisection runs the supplied invariant command in a
temporary materialized workspace with bounded output and timeout.
