# Contributing to GenOS

Thank you for helping make agent execution more reproducible, inspectable, and safe to explore.

GenOS is pre-alpha. Focused contributions with a clear invariant, test, or user outcome are easier to review than broad rewrites. If a change affects architecture, schemas, persistence formats, or public CLI behavior, open an issue before investing in a large implementation.

## Before you start

- Read the [Code of Conduct](CODE_OF_CONDUCT.md).
- Search existing issues and pull requests to avoid duplicate work.
- Never include secrets, private model transcripts, credentials, or sensitive runtime artifacts.
- For a security vulnerability, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Development setup

GenOS uses the stable Rust toolchain with `rustfmt` and `clippy`.

```bash
git clone https://github.com/PISSARAW/GenOS.git
cd GenOS
cargo build --workspace --all-targets
cargo test --workspace --all-targets
```

Runtime output is written below `.genos/` and should not be committed.

## Making a change

1. Create a branch from `main`.
2. Keep the change scoped to one problem.
3. Add or update tests for observable behavior and invariants.
4. Update schemas, examples, and documentation when a public contract changes.
5. Add a concise entry under `Unreleased` in [CHANGELOG.md](CHANGELOG.md) for user-visible changes.

Architecture decisions belong in `docs/adr/`. Use an ADR when a change introduces a durable constraint, changes the meaning of a core object, or selects one system-wide approach over another. Accepted design is not the same as implemented behavior; update `docs/adr/IMPLEMENTATION_STATUS.md` only when executable coverage exists.

## Required checks

Run these commands before opening a pull request:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-targets
```

If your change affects one of the shell demos, run both the relevant Bash and PowerShell script when possible. CI exercises the core isolation demos on Linux and Windows.

## Testing principles

Tests should verify outcomes rather than implementation details. For forks and replay, cover identity, logical state, event cursors, lineage, world contents, and failure isolation independently. A branch failure must remain observable and must not erase sibling outcomes.

Avoid tests that require a live model provider. Deterministic providers exist so core behavior remains reproducible and CI does not depend on network access, sampling, provider availability, or model-version changes.

## Pull requests

A pull request should explain the problem, chosen approach, verification, trade-offs, and any compatibility, migration, security, or documentation impact.

Maintainers may ask for a change to be split when independent concerns are combined. Reviews prioritize correctness of invariants, reproducibility, isolation, and clarity of public contracts.

## Commit style

Use short, imperative commit subjects such as `Add branch budget validation`. Conventional Commits are welcome but not required. Keep formatting-only changes separate from behavioral changes when practical.

## Licensing

By submitting a contribution, you agree that it is licensed under the [Apache License 2.0](LICENSE) and that you have the right to submit it.
