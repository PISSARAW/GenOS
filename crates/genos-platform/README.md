# genos-platform

Public, provider-neutral primitives for the GenOS platform layer:

- deterministic document ingestion and chunking with overlap;
- portable local index with lexical + hashed semantic retrieval and rank fusion;
- claim-level citations with source excerpts;
- versioned prompt registry with labels, digests and template rendering;
- versioned JSON evaluation datasets and baseline exact-match, grounding and abstention scores.

The index format is JSON and is intentionally replaceable by a production vector
store or an embedding provider. The deterministic default is useful for local
development, reproducible tests and offline CI.

## CLI

```bash
genos platform ingest docs/guide.md --index .genos/platform-index.json
genos platform search "durable workflow replay" --index .genos/platform-index.json
genos platform status
```
