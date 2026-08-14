# Retroactive exploration demo

After B wins, the previously losing branch C remains available:

```text
genos restore C
continue from C
```

Resuming C changes the active branch but does not delete A, B, or C.

Run the deterministic test:

```powershell
cargo test -p genos-eval a_losing_branch_can_be_resumed_later
```
