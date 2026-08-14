# Winner-takes-branch V0

Selection without merge:

```text
A score 0.4
B score 0.9  ← active branch
C score 0.7
```

B becomes the active branch. A and C remain inspectable and are not merged or
deleted.

Run the deterministic test:

```powershell
cargo test -p genos-eval selecting_b_changes_active_branch_without_merging_or_deleting_siblings
```
