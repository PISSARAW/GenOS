# Counterfactual evaluation demo

Three branches answer the same task without an LLM:

```text
A → 4
B → 8
C → 6
```

The evaluator uses `score = answer`, ranks the branches, and selects B.

Run it with:

```powershell
cargo test -p genos-eval selects_branch_b_for_the_trivial_counterfactual_experiment
```
