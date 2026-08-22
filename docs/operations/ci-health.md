# CI health

Verified on 2026-08-22 from `codex/genos-launch-reliability`.

## Closed failures

- Windows checkout: removed the tracked artifact whose path contained
  `backend/C:/Users/...`; no tracked path now contains a Windows drive prefix.
- Formatting and lint: formatted the complete Rust workspace and resolved the
  warnings reached by `-D warnings`. The workspace-level `deny` rules remain in
  force. Existing public APIs that intentionally exceed the three-argument
  project limit carry narrow, local Clippy exceptions rather than weakening the
  workspace policy.
- Divergent writes: restored `LocalSnapshotStore` as an append-only full
  snapshot journal. Lookup returns the latest record for a stable snapshot id,
  so branch-local mutations survive a store round trip and replay.
- Rust dependencies: removed unused `sqlx` and its vulnerable `rsa` path;
  removed embedded `pyo3` by expressing the oracle's equivalent deterministic
  population predicate in Rust; upgraded `wgpu` to 26.0.1.
- RustSec exception: `RUSTSEC-2024-0436` is ignored explicitly in CI. It marks
  the compile-time `paste` macro as unmaintained, not vulnerable. `paste` is
  still required by the current Metal backend, including current `metal`
  releases. No other RustSec advisory is ignored.

## Commands and observed duration

| Check | Result | Observed wall time |
| --- | --- | ---: |
| `cargo fmt --all -- --check` | pass | < 3 s |
| `cargo clippy --locked --workspace --all-targets --all-features -- -D warnings` | pass | 13 s incremental |
| `cargo test --locked --workspace --all-targets` | pass | 80 s incremental |
| `cargo audit --deny warnings --ignore RUSTSEC-2024-0436` | pass | 2-8 s |
| `bash examples/divergent-writes-demo/run-demo.sh` | pass; 6 snapshots, 3 events | 106 s cold |
| `npm audit --audit-level=high` in root, `backend`, and `studio` | pass | < 3 s total |

The Studio npm tree still reports lower-severity DOMPurify advisories through
Monaco, below the workflow's `high` threshold. They should be upgraded when a
compatible Monaco release is available.

Costs and token consumption were not measured.
