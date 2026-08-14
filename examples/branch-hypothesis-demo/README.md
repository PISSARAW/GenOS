# Branch hypothesis demo

Forks carry human-readable experimental metadata:

```text
A: hypothesis = database
B: hypothesis = cache
C: hypothesis = concurrency
```

```powershell
cargo test -p genos-core fork_branches_keep_human_readable_hypotheses
```
