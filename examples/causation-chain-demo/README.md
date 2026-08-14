# Causation chain demo

The causal debugger can explain a belief by walking event links backward:

```text
belief.created
↑ model.responded
↑ tool.completed
↑ agent.step
```

Run the deterministic test:

```powershell
cargo test -p genos-core causation_chain_explains_why_a_belief_exists
```
