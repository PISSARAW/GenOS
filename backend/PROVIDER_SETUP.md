# Backend LLM provider configuration for GenOS

This file documents the environment variables the backend accepts for LLM
routing. It is not committed to the repo (secrets, local paths).

## Local development (this machine)

The backend does not read Hermes profile config. It has its own provider model.
For local development on this machine, use Ollama.

Required env vars (export before starting backend):

```bash
export GENOS_DEFAULT_MODEL=ollama://qwen3.8
export GENOS_OLLAMA_ENDPOINT=http://localhost:11434/v1/chat/completions
export GENOS_PREFER_LOCAL_MODELS=1
```

Optional:

```bash
export GENOS_MODEL_FALLBACKS=
export GENOS_MODEL_ROUTING_MODE=fallback
export GENOS_INFERENCE_MAX_CONCURRENT=4
```

## Starting the backend (manual, for MCP oracle testing)

```bash
cd C:/Users/Shadow/Documents/GitHub/GenOS
export GENOS_DEFAULT_MODEL=ollama://qwen3.8
export GENOS_OLLAMA_ENDPOINT=http://localhost:11434/v1/chat/completions
export GENOS_PREFER_LOCAL_MODELS=1
cd backend && node server.js
```

Health check after start:

```bash
curl -s http://localhost:4000/healthz
curl -s http://localhost:4000/readyz
```

## Why not Nous OAuth

The Hermes profile OAuth token lives in the Hermes credential store and is not
exposed to the GenOS backend process. The backend has its own provider adapters
(openai, ollama, anthropic, gemini, etc.) but no `nous` adapter.

If a `nous` provider is needed in the backend in the future, it must be
implemented as a backend service that calls the Nous inference API with its own
auth, independently of the Hermes profile OAuth. That is future work, not the
current fix.

## Current state (2026-09-20)

- Ollama is running on localhost:11434 (verified by healthz probe in MCP session).
- Backend has no .env and no GENOS_DEFAULT_MODEL set.
- MCP genos_orchestrate times out because the worker waits for inference that
  never routes.
- Fix: set GENOS_DEFAULT_MODEL=ollama://qwen3.8 and GENOS_OLLAMA_ENDPOINT
  before starting the backend.
