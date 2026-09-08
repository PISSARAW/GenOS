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
5. **Winner Promotion & Replay Evidence:** Reverts to the baseline snapshot, applies only the verified winning mutation, and records the branch evidence. The demo validates GenOS state and isolation mechanics; it does not establish deterministic re-execution of arbitrary commands.

## Zero-Token Evidence

Evidence and execution telemetry are persisted locally:
- [`artifacts/latest.json`](artifacts/latest.json): Complete machine-readable proof bundle and verification metrics.
- [`artifacts/events.jsonl`](artifacts/events.jsonl): Append-only event trace showing the sequential Merkle state transitions.
- `studio/public/demo/`: Exported evidence available to the Studio UI surface.

> [!NOTE]
> The demo executes entirely against local code and the native Rust CLI without making any external LLM calls. Token consumption and model costs are **exactly zero for this demo**. It validates local state mechanics and isolation boundaries; its replay output is validation/evidence, not proof of general causal replay fidelity.

