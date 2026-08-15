# Budgeted branch evolution demo

```powershell
cargo run -p genos-cli -- experiment branch-evolution examples/branch-evolution-demo/evolution.yaml
```

`B` and `D` die in the root generation. `A` and `C` split, while terminal branch
`E` remains alive. In the next generation `A2` survives and splits again into
`A2.1` and `A2.2`. The scheduler never exceeds 1,000 compute units and assigns
the final exploitation budget proportionally to the scores of living leaves.
