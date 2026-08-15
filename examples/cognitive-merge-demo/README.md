# Cognitive Merge demo

Run the three-branch Redis/PostgreSQL scenario:

```powershell
cargo run -p genos-cli -- experiment cognitive-merge examples/cognitive-merge-demo/merge.yaml
```

Each branch returns a typed experience packet. The engine builds a graph from
its observations, actions, results, belief changes, failures, discoveries,
uncertainty and evidence. It accepts the evidenced PostgreSQL root-cause claim,
keeps the two contextual Redis conclusions disputed, and emits a synthesis that
retains all three conditions. Add `parent_snapshot` to apply the reviewed report
to a fresh parent checkpoint. Branch memories are never copied.
