# Event correlation demo

One logical `run tests` action groups its event trail with one correlation id:

```text
tool.requested
process.started
process.stdout
process.completed
evaluation.created
```

Run the deterministic test:

```powershell
cargo test -p genos-core run_tests_action_events_share_a_correlation_id
```
