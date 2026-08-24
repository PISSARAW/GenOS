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

### Règles Strictes de Codage (Strict Coding Rules)

Le projet GenOS impose **3 règles absolues** pour garantir la maintenabilité et la lisibilité du code :

1. **Longueur des fichiers** : Ne jamais dépasser **400 lignes** par fichier.
2. **Paramètres de fonction** : Ne jamais dépasser **3 paramètres** par fonction (utilisez des `struct` si besoin).
3. **Complexité** : La complexité cyclomatique doit rester très faible (seuil strict configuré à 15).

> [!WARNING]
> Ces règles sont validées par :
> - Un **hook git pre-commit** (`.githooks/pre-commit`) empêchant de commiter des fichiers trop longs.
> - La configuration `clippy.toml` (`too-many-arguments-threshold = 3`, `cognitive-complexity-threshold = 15`) vérifiée par CI.

Le hook n'est pas actif par défaut ; activez-le après le clone :

```bash
git config core.hooksPath .githooks
```


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

Architecture decisions belong in `docs/2-architecture/adrs/`. Use an ADR when a change introduces a durable constraint, changes the meaning of a core object, or selects one system-wide approach over another. Accepted design is not the same as implemented behavior; update `docs/2-architecture/adrs/IMPLEMENTATION_STATUS.md` only when executable coverage exists.

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

## Human authorship policy

Every commit must identify an accountable natural person as its author and
committer. Generative AI tools may assist that person, but an AI system must
never appear in Git metadata or trailers as an author, committer, co-author,
signer, or contributor. The human named on the commit reviews the complete
change and accepts responsibility for its correctness, licensing, security,
and provenance.

CI rejects known AI identities and AI attribution trailers. Purpose-built,
non-generative service accounts such as Dependabot may author their narrowly
scoped mechanical updates. Attempts to disguise an AI identity or bypass this
policy may result in the contribution being closed.

## Licensing

By submitting a contribution, you agree that it is licensed under the [Apache License 2.0](LICENSE) and that you have the right to submit it.
