# Recursive manual fork lineage

The lineage tree is built from explicit fork events:

```text
S0
├── A
│   ├── A1
│   └── A2
└── B
```

No automatic forking is involved. Run the deterministic test:

```powershell
cargo test -p genos-core manual_recursive_forks_render_at_multiple_lineage_levels
```
