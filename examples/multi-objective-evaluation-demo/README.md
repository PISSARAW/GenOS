# Multi-objective evaluation demo

The runtime retains independent objectives instead of picking a winner:

```text
A: correctness .9, speed .6,  cost .8
B: correctness .8, speed .95, cost .5
```

This preserves the trade-offs required for a future Pareto-front selector.

```powershell
cargo test -p genos-eval multi_objective_evaluation_retains_tradeoffs_without_selecting_a_winner
```
