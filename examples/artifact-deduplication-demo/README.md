# Artifact deduplication demo

When two branches produce identical bytes, both receive references to one
content-addressed blob:

```text
branch A → sha256:X
branch B → sha256:X
physical blobs: 1
```

Run the deterministic test:

```powershell
cargo test -p genos-store identical_branch_artifacts_share_one_physical_blob
```
