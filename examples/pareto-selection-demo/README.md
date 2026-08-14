# Pareto selection demo

With `speed` maximized and `cost` minimized:

```text
A: fast + expensive
B: slow + cheap
C: medium + medium
```

All three are marked `non_dominated`: each represents a valid trade-off, so no
single winner is forced.

```powershell
cargo test -p genos-eval pareto_selection_marks_tradeoff_branches_as_non_dominated
```
