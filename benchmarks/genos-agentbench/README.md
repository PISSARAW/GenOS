# GenOS AgentBench v1

GenOS AgentBench compares the same Codex model and user prompt under two
conditions: a standard Codex agent and the same agent with only the GenOS MCP
server added. Unlike the earlier smoke test, agents must repair stateful code
and are graded after they exit by eight task-specific checks that are not
present in their workspace.

## Tasks

| Task | Difficulty | Main failure modes |
| --- | ---: | --- |
| `lease-ledger` | 7/10 | atomic batches, event idempotency, ordering, rollback |
| `retry-scheduler` | 8/10 | leases, expiry, stale workers, retries, dead letters |
| `config-rollout` | 7/10 | deterministic rollout, cache invalidation, rollback, aliasing |

The initial implementations pass at most one of eight hidden checks. Functional
test pass rate is the primary metric. Latency, tokens, perfect-run rate,
protected-file integrity, and GenOS MCP calls are secondary metrics and never
compensate for incorrect code.

## Commands

Fast end-to-end pilot:

```bash
node benchmarks/genos-agentbench/run.mjs \
  --models gpt-5.4-mini --tasks lease-ledger --repetitions 1
```

Publication run (all models visible to the installed Codex client):

```bash
node benchmarks/genos-agentbench/run.mjs --repetitions 3
```

The full protocol currently represents 126 agent runs: 7 models × 3 tasks × 2
conditions × 3 repetitions. Condition order alternates by repetition. Each run
uses a fresh task copy, medium reasoning effort, the same response schema and
the same user prompt. The report includes a paired bootstrap 95% confidence
interval over GenOS-minus-standard functional score.

## Publication policy

Do not publish a superiority claim unless `publication_gate.publishable` is
true. Commit the timestamped `report.json`, `samples.jsonl`, raw agent events,
responses, grader TAP, exact revision and environment. A confidence interval
crossing zero means the benchmark has not demonstrated an advantage.

The committed pilot is an integration proof only: both GPT-5.4 Mini runs passed
8/8 checks; the GenOS condition made four MCP calls. One pair cannot estimate a
general effect.

OpenAI's current model guidance recommends comparing identical representative
tasks and measuring task success, answer completeness, tokens, latency and tool
calls. This harness follows that structure and keeps functional correctness as
the non-negotiable primary outcome.
