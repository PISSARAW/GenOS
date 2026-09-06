# Safe Parallel Debugging in One Command

This is the shortest executable demonstration of the GenOS counterfactual runtime mechanics:

### On Linux / macOS (Bash)
```bash
./examples/safe-debugging-demo/run-demo.sh
```

### On Windows / Cross-Platform (Node.js)
```bash
# Ensure the native CLI is built
cargo build -p genos-cli

# Run the reproducible debugging suite
node examples/safe-debugging-demo/run-demo.mjs target/debug/genos
```

---

## What the Demo Does

1. **Bug Reproduction:** Materializes a isolated world with a reproducible off-by-one boundary defect.
2. **Deterministic Snapshot:** Creates an immutable Merkle snapshot of the corrupted baseline state.
3. **Counterfactual Forking:** Spawns three isolated worlds from the snapshot to evaluate competing hypotheses concurrently.
4. **Sandboxed Verification:** Executes 5 test suites within each isolated world.
5. **Winner Promotion & Causal Replay:** Reverts to the baseline snapshot, applies only the verified winning mutation, and validates that the deterministic replay exactly matches the winning branch.

## Zero-Token Evidence

Evidence and execution telemetry are persisted locally:
- [`artifacts/latest.json`](artifacts/latest.json): Complete machine-readable proof bundle and verification metrics.
- [`artifacts/events.jsonl`](artifacts/events.jsonl): Append-only event trace showing the sequential Merkle state transitions.
- `studio/public/demo/`: Exported evidence available to the Studio UI surface.

> [!NOTE]
> The demo executes entirely against local code and the native Rust CLI without making any external LLM calls. Token consumption and model costs are **exactly zero**. It validates GenOS operating system mechanics, isolation boundaries, and causal replay.

