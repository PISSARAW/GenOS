# Genome mutation demo

Create a child genome with relative, bounded mutations:

```powershell
genos agent mutate researcher.agent --exploration +0.15 --risk -0.10 --out researcher-v2.agent
```

The parent is unchanged. The child receives a fresh genome id, references its
parent, increments its version, and records both changes. Values outside the
`0.0..=1.0` interval are rejected.

Evaluate parent and child using identical tasks, model settings, environment,
seeds, budgets, and repetitions. Record accuracy, cost, tokens, latency, tool
calls, risk, unsupported claims, novelty, and success. Apply hard safety
constraints first, then retain the Pareto frontier; use a weighted winner only
when its weights are part of the experiment record.

Starting from `G0` with `exploration = 0.5`:

```text
G1: exploration = 0.6, parent_genome = G0
G2: exploration = 0.4, parent_genome = G0
```

Each child stores the changed field and its previous/new values.

```powershell
cargo test -p genos-core exploration_mutations_keep_parent_and_metadata
```
