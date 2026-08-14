# Reversible genome mutation demo

The genetic lineage can advance independently from execution time:

```text
G0 → G1 → G2
G0 → G0-restarted
```

`G0` stays immutable. Restarting from it creates a new sibling lineage; it
does not rewrite or rewind execution history.

```powershell
cargo test -p genos-core mutation_is_reversible_by_restarting_from_the_original_genome
```
