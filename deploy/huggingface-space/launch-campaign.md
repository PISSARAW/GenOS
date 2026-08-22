# GenOS launch campaign

Cadence: publish one story every 2–3 days. Each post has one claim, one proof,
and one call to action. Do not publish the five posts at once.

## Post 1 — Git branching for AI-agent state

**Title:** What if AI-agent state had Git-like branches?

Most agent workflows move through one mutable timeline. When a tool call,
belief update, or code change goes wrong, reconstructing the previous state—and
comparing alternative strategies—is expensive.

GenOS treats an agent workflow as versioned computation:

`snapshot → fork competing futures → isolate → evaluate → replay → promote`

The first public alpha includes a Rust CLI, a local Studio control plane, an
MCP server, runnable proofs, and committed benchmark evidence. The core demo
does not require a model key.

Try the interactive proof on Hugging Face:
https://huggingface.co/spaces/RayxieGinks/GenOS

Source and alpha binaries:
https://github.com/PISSARAW/GenOS

#aiagents #opensource #rust #reproducibility

## Post 2 — 500 deterministic replays

**Title:** GenOS replayed the same 100-event history 500 times

A “replay” claim is only useful when it is measured.

The committed GenOS replay benchmark ran 500 measured iterations over a
100-event history after 20 warmups. Every run matched the expected replay
fingerprint, event hashes, and final-state hash.

The report also includes raw latency samples, the exact repository revision,
platform information, command line, and a causal mutation probe that detects
the first divergent event.

This is a local reducer benchmark—not a claim about model, network, scheduler,
or external-tool determinism. Those limitations are part of the report.

Inspect the evidence:
https://github.com/PISSARAW/GenOS/blob/main/benchmarks/results/replay-fidelity-report.json

Interactive overview:
https://huggingface.co/spaces/RayxieGinks/GenOS#platform

#benchmarks #reproducibleai #agents #eventsourcing

## Post 3 — GenOS through MCP

**Title:** 65 MCP primitives for versioned agent workflows

GenOS exposes its counterfactual runtime through a Rust Model Context Protocol
server: snapshot, fork, isolated execution, diff, lineage, replay, evidence,
resilience, hallucination mitigation, and more.

The current reference documents 65 structured primitives across 10 functional
families. Calls return standardized JSON-RPC envelopes with exit codes,
structured output, stdout/stderr, and taint state.

Safety is exercised separately: the committed MCP report verifies 11/11
deterministic safety predicates and 5/5 required command suites. It also states
what is not yet established, including end-to-end caller identity and per-call
human approval in one production deployment.

MCP server:
https://github.com/PISSARAW/GenOS/tree/main/integrations/mcp/genos-mcp

Reference:
https://github.com/PISSARAW/GenOS/blob/main/docs/4-interfaces/mcp-tools-reference.md

#mcp #aiagents #rust #toolsafety

## Post 4 — Local-first agent routing

**Title:** Run GenOS with Ollama, LM Studio, or vLLM

Not every agent workflow should depend on a hosted model API.

GenOS Studio can discover local Ollama, LM Studio, and vLLM endpoints, route an
agent to a preferred local model, fail over on error, or request parallel model
reviews. Local providers do not require an API key.

The provider layer also supports OpenAI-compatible endpoints and hosted model
families behind the same URI-based routing contract.

This keeps model choice separate from snapshots, worlds, lineage, evaluation,
and replay—and makes deterministic no-model fixtures possible for core runtime
testing.

Configuration guide:
https://github.com/PISSARAW/GenOS/blob/main/docs/6-operations-and-deployment/real-integrations.md

Project overview:
https://huggingface.co/spaces/RayxieGinks/GenOS#platform

#localai #ollama #vllm #lmstudio #aiagents

## Post 5 — Hallucination mitigation through evidence

**Title:** Don’t hide agent uncertainty—version the evidence

GenOS does not claim to eliminate hallucinations. It makes agent claims easier
to inspect and falsify.

The experimental mitigation surface combines typed beliefs, execution
receipts, contradiction tracking, provenance, isolated hypothesis branches,
missing-receipt scans, and circuit breakers for repeated unverified
hallucinations.

Instead of trusting one fluent trajectory, a workflow can fork competing
hypotheses, attach test evidence, reject contradicted branches, and preserve the
lineage behind the promoted result.

There is no published general model-level reduction rate yet. The current
proofs validate mechanisms and invariants, not universal factual accuracy.

Belief provenance demo:
https://github.com/PISSARAW/GenOS/tree/main/examples/belief-provenance-demo

Interactive overview:
https://huggingface.co/spaces/RayxieGinks/GenOS#platform

#hallucinations #aisafety #provenance #reproducibility
