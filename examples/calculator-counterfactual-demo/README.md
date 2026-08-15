# Calculator counterfactual code experiment

A real `calculator/` Rust project starts with a division-by-zero crash. GenOS
forks one workspace snapshot into three isolated strategies:

```text
A  exception         score 0.6
B  Result type       score 0.9
C  input validation  score 0.8
```

Each branch edits its own `src/lib.rs` and tests, runs `cargo test`, and reports
its workspace diff and score. No LLM or external provider is used.

Run the public demo/test:

```powershell
cargo run -p genos-cli -- experiment workspace examples/calculator-counterfactual-demo/experiment.yaml
```

The report and lineage are persisted under `.genos/experiments/calculator-counterfactual/reports/`.

The report's `primitive_trace` records the canonical lifecycle actually used:
`agent init → agent snapshot → agent fork → agent run → agent diff → agent merge → agent lineage`.
