# Controlled permissions demo

Two sibling branches share the same base snapshot but run in different
experimental environments:

```text
A: network allowed → tool.completed
B: network denied  → tool.failed(permission_denied)
```

Run the deterministic test:

```powershell
cargo test -p genos-core sibling_branches_can_use_different_environment_permissions
```
