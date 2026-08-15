# Cognitive Merge demo

Run the three-branch Redis/PostgreSQL scenario:

```powershell
cargo run -p genos-cli -- experiment cognitive-merge examples/cognitive-merge-demo/merge.yaml
```

The engine accepts the evidenced PostgreSQL root-cause claim, keeps the two
architectural Redis conclusions disputed, and records that the root cause
explains or qualifies them. Add `parent_snapshot` to the manifest to apply the
reviewed report to a fresh parent checkpoint. Branch memories are never copied.
