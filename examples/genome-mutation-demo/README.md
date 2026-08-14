# Genome mutation demo

Starting from `G0` with `exploration = 0.5`:

```text
G1: exploration = 0.6, parent_genome = G0
G2: exploration = 0.4, parent_genome = G0
```

Each child stores the changed field and its previous/new values.

```powershell
cargo test -p genos-core exploration_mutations_keep_parent_and_metadata
```
