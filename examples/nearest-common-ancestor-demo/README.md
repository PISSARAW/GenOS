# Nearest Common Ancestor demo

Given this manual lineage:

```text
S0
└── A
    ├── A1
    │   └── A1x
    └── A2
```

`NCA(A1x, A2)` resolves to `A`, providing the base needed for future merges.

Run the deterministic test:

```powershell
cargo test -p genos-core nearest_common_ancestor_finds_a_for_a1x_and_a2
```
