# Adaptive production incident search

GenOS loads the complete evidence bundle for `production@incident-42`, creates
100 deterministic fault universes, replays the same preceding events, retains
the 11 closest reproductions, and recursively forks each into four refinements.

```text
100 initial universes
  ↓ 11 partial reproductions
44 recursive descendants
  ↓ 3 perfect reproductions
```

Mutation dimensions include timing, latency, packet loss, event ordering,
database isolation, concurrency, and cache eviction. Every result preserves its
mutation vector, replayed event IDs, score, explanation, and lineage edge.

Run it as a first-class GenOS experiment:

```powershell
cargo run -p genos-cli -- experiment incident examples/adaptive-incident-search/experiment.yaml --summary
```

The JSON report is persisted under `.genos/experiments/incident-42/reports/`.

Its `primitive_trace` records `agent snapshot`, the initial and recursive
`agent fork` operations, environment `agent mutate`, deterministic `agent
replay`, evaluation through `agent run`, and `agent lineage`.
