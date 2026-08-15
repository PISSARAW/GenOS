# Temporal causal simulator

Replay the product agent at its March decision point, fork history, and replay
the same known observations through five architecture universes:

```text
reality          Postgres + Redis
counterfactual A Postgres only
counterfactual B CockroachDB
counterfactual C Event sourcing
counterfactual D Different data model
```

All universes receive the identical April–August event IDs. GenOS records each
effect as `(architecture decision, triggering historical event, metric delta,
explanation)`, allowing questions such as “why did reality's p95 latency rise?”

This is a deterministic causal model, not a claim that the counterfactual
metrics are observed facts. Its rules are explicit and replaceable by richer
domain simulators later.

Run the public scenario:

```powershell
cargo run -p genos-cli -- experiment temporal examples/temporal-causal-simulator/experiment.yaml
```

The report is persisted under `.genos/experiments/temporal-causal-simulator/reports/`.

The temporal report now audits `agent snapshot → agent restore → agent fork →
agent replay → agent diff → agent lineage` in `primitive_trace`.
