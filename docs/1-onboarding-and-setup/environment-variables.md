# Environment Variable Reference

Every runtime knob of GenOS is driven by environment variables. This page is
the single source of truth for backend, Studio and benchmark variables.
Variables of the Rust CLI (`GENOS_LOG`, `GENOS_ROOT_DIR`, `GENOS_STORE_PATH`,
`GENOS_SANDBOX_DIR`, `GENOS_BIND_ADDR`, `GENOS_METRICS_ENABLED`,
`GENOS_MODEL_PROVIDER`) are documented in
[local-environment.md](local-environment.md).

## Server

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | HTTP port of the backend. |
| `GENOS_DB_PATH` | `<backend>/genos.db` | SQLite database file location. |
| `GENOS_SECRET_KEY` | — | **Required** by the secret vault; the server refuses to start without it. |
| `GENOS_ALLOWED_ORIGINS` | — | Comma-separated CORS allow-list. |

## Bootstrap authentication

| Variable | Default | Description |
|---|---|---|
| `GENOS_ADMIN_TOKEN` | random (printed once) | Predefined bootstrap administrator access key. |
| `GENOS_ADMIN_USERNAME` | `admin` | Username of the seeded local login account. |
| `GENOS_ADMIN_PASSWORD` | `genos-admin` | Password of the seeded local login account. |
| `GENOS_TEST_OPERATOR_TOKEN`, `GENOS_TEST_VIEWER_TOKEN` | — | Extra role fixtures, only honored with `NODE_ENV=test`. |

## Model providers

| Variable | Default | Description |
|---|---|---|
| `GENOS_DEFAULT_MODEL` | — | Model URI used when an agent does not request one. |
| `GENOS_MODEL_ENDPOINT` | — | Endpoint override for OpenAI-compatible providers. |
| `GENOS_LMSTUDIO_ENDPOINT` | `http://localhost:1234/v1/chat/completions` | LM Studio chat endpoint. |
| `GENOS_OLLAMA_ENDPOINT` | `http://localhost:11434/v1/chat/completions` | Ollama chat endpoint. |
| `GENOS_VLLM_ENDPOINT` | `http://localhost:8000/v1/chat/completions` | vLLM chat endpoint. |
| `GENOS_MODEL_API_KEY` | — | Fallback API key for remote providers. |
| `GENOS_MODEL_FALLBACKS` | — | Ordered fallback model URIs when a route fails. |
| `GENOS_MODEL_ROUTING_MODE` | — | Routing strategy selector for multi-model fleets. |
| `GENOS_MODEL_PARALLEL_REVIEW` | off | Run reviewer models in parallel. |
| `GENOS_PREFER_LOCAL_MODELS` | off | Prefer local providers over hosted ones. |
| `GENOS_DISABLE_LOCAL_MODELS` | off | Hide local provider discovery entirely. |
| `GENOS_MIN_LOCAL_MODEL_PARAMETERS` | — | Minimum parameter count accepted for local workers. |
| `GENOS_ALLOW_LOCAL_CODE_WORKERS` | off | Allow local models to run code-mutating tools. |

## Retrieval and vector store

| Variable | Default | Description |
|---|---|---|
| `GENOS_VECTOR_STORE` | `sqlite` | Vector store driver (`sqlite` or `qdrant`). |
| `GENOS_QDRANT_URL`, `GENOS_QDRANT_API_KEY`, `GENOS_QDRANT_COLLECTION` | — | Qdrant connection settings. |
| `GENOS_EMBEDDING_ENDPOINT`, `GENOS_EMBEDDING_MODEL` | — | Embedding service for RAG ingestion. |
| `GENOS_RERANK_ENDPOINT`, `GENOS_RERANK_API_KEY` | — | Optional reranker service. |

## MCP and tool execution

| Variable | Default | Description |
|---|---|---|
| `GENOS_MCP_URL` | — | HTTP MCP endpoint executed by the sandbox. |
| `GENOS_MCP_COMMAND`, `GENOS_MCP_ARGS` | — | Spawn a local MCP server process instead of HTTP. |
| `GENOS_MCP_TOKEN` | — | Bearer token forwarded to the MCP endpoint. |
| `GENOS_MCP_EXPOSE_ALL` | off | Expose non-canonical tools beyond the ten safe defaults. |
| `GENOS_ALLOWED_COMMANDS_JSON` | — | JSON allow-list for terminal commands. |
| `GENOS_ALLOW_FILE_EDITS` | off | Allow pre-tool policy to pass file edit calls. |

## Agent runtime and workspaces

| Variable | Default | Description |
|---|---|---|
| `GENOS_AGENT_EXECUTOR` | bundled adapter | Absolute path of the executable fed protobuf missions on stdin. |
| `GENOS_CODEX_UNSAFE_BYPASS` | off | Opt-in bypass of Codex approvals; disposable workspaces only. |
| `GENOS_CODEX_MODEL`, `GENOS_CODEX_REASONING_EFFORT` | — | Codex bridge tuning. |
| `GENOS_WORKSPACES_ROOT` | `<backend>/workspaces` | Root directory holding workspace checkouts. |
| `GENOS_SNAPSHOT_ROOT` | — | Where durable workspace snapshots are written. |
| `GENOS_CAPSULE_ROOT` | — | Root of agent capsule bootstrap directories. |
| `GENOS_IDE_CONTRACT_PATH` | — | Override of the IDE integration contract file. |
| `GENOS_WORKER_BARRIER_TIMEOUT_MS` | — | Barrier timeout for parallel worker dispatch. |
| `GENOS_WORKTREE_GC_DELAY_MS` | — | Delay before git-worktree worlds are collected. |

## Integrations

| Variable | Default | Description |
|---|---|---|
| `GENOS_WEBHOOK_SECRET` | — | HMAC secret verifying inbound webhook signatures. |
| `GENOS_SILENT_UPDATES` | off | Suppress milestone notifications during runs. |

Benchmarks additionally accept `GENOS_STUDIO_URL`, `GENOS_STUDIO_TOKEN`,
`GENOS_SWE_BENCH_*` and `GENOS_TERMINAL_BENCH_*`; see
[benchmarks/README.md](../../benchmarks/README.md).
