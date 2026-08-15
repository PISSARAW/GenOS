# Personal causal replay

Fork the agent at its March checkpoint, replace decision X with decision Y, and
replay every available event through August:

```powershell
cargo run -p genos-cli -- experiment causal-replay examples/personal-causal-replay/replay.yaml
```

Reality and the counterfactual both receive April traffic, June growth, and the
August workload. The May cache incident becomes incompatible after Redis is no
longer selected, while the August event remains available but applies a different
conditional effect. The report separates the direct architecture change from
downstream latency and consistency effects.
