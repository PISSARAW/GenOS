# Snapshot deduplication demo

Similar snapshots keep their own identity while reusing content-addressed
components:

```text
S1 ≈ S2
shared: genome, working memory, memories, beliefs, tool state, runtime metadata
```

This avoids multiplying identical component blobs for large branch fan-outs.

```powershell
cargo test -p genos-store similar_snapshots_share_identical_components
```
