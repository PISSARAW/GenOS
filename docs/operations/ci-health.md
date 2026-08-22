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
  so branch-local mutations survive a store round trip and replay. The public
  `save_snapshot(&AgentSnapshot)` borrowing contract is preserved. Existing
  `agent-snapshots-manifests.jsonl` files remain readable as legacy indexes;
  their placeholder hashes do not contain enough state for a lossless
  conversion, so they are retained and new full snapshots are written to
  `agent-snapshots.jsonl`.
- Rust dependencies: removed unused `sqlx` and its vulnerable `rsa` path;
  removed embedded `pyo3` by expressing the oracle's equivalent deterministic
  population predicate in Rust; upgraded `wgpu` to 26.0.1.
- RustSec exception: `RUSTSEC-2024-0436` is ignored explicitly in CI. It marks
  the compile-time `paste` macro as unmaintained, not vulnerable. The exact
  upstream chain is `epsilon_wgpu -> wgpu 26.0.1 -> wgpu-hal 26.0.6 -> metal
  0.32.0 -> paste 1.0.15`; `metal` 0.33.0 still depends on `paste`. The GenOS
  maintainers own this exception and must review/remove it by 2026-09-30 or
  before the next release, whichever comes first, tracking the upstream
  `gfx-rs/metal-rs` dependency. No other RustSec advisory is ignored.

## Merge integration constraint

The final merge must preserve the product npm audit matrix:
`research/reverse-game-of-life`, `backend`, and `studio`. Do not restore the
historical repository-root npm audit entry when resolving workflow conflicts.

## Commands and observed duration

| Check | Result | Observed wall time |
| --- | --- | ---: |
| `cargo fmt --all -- --check` | pass | < 3 s |
| `cargo clippy --locked --workspace --all-targets --all-features -- -D warnings` | pass | 13 s incremental |
| `cargo test --locked --workspace --all-targets` | pass | 80 s incremental |
| `cargo audit --deny warnings --ignore RUSTSEC-2024-0436` | pass | 2-8 s |
| `bash examples/divergent-writes-demo/run-demo.sh` | pass; 6 snapshots, 3 events | 106 s cold |
| `cargo run --locked -p epsilon_wgpu` on macOS/Metal | pass; score 200 after 12,170 iterations | 48 s cold, including the intentional 30 s run |
| Product npm audit matrix | must be re-run after integration; product package is not present on this isolated reliability branch | not measured |

The Studio npm tree still reports lower-severity DOMPurify advisories through
Monaco, below the workflow's `high` threshold. They should be upgraded when a
compatible Monaco release is available.

Costs and token consumption were not measured.
