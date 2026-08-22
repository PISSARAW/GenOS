# GenOS

GenOS is a Rust workspace for reproducible, forkable agent state and
counterfactual experiments. The repository also contains GenOS Studio, a
local Node.js backend and React frontend for observing agent workflows.

## Repository map

- `crates/` — Rust runtime, state, storage, world, evaluation, and CLI crates.
- `backend/` — Express + SQLite API used by GenOS Studio.
- `studio/` — React + TypeScript + Vite frontend.
- `docs/` — architecture, onboarding, interface, workflow, and operations
  documentation.
- `examples/` — runnable Rust demonstrations and research scenarios.
- `spec/` — JSON schemas for agent, snapshot, lineage, event, and experiment
  documents.
- `integrations/` and `python/` — integration and SDK work in progress.

## Requirements

- Rust 1.85 or newer (the workspace declares `rust-version = "1.85"`).
- Git, for the Git-worktree world provider and repository workflows.
- Node.js and npm, only when running the backend or Studio.

## Quick start: Rust CLI

Build the CLI and inspect the commands available in this checkout:

```bash
cargo build -p genos-cli
cargo run -p genos-cli -- --help
```

The end-to-end CLI walkthrough is in
[`docs/1-onboarding-and-setup/quickstart-tutorial.md`](docs/1-onboarding-and-setup/quickstart-tutorial.md).
It covers agent files, snapshots, capsules, isolated branches, diffs, merges,
lineage, and replay. The examples use local files and `.genos/`; they do not
require model-provider credentials.

Run the repository demo when you want a smaller, pre-packaged example:

```bash
./run-demo.sh
```

## Quick start: GenOS Studio

Start the backend in one terminal:

```bash
cd backend
npm install
npm start
```

Start the frontend in another terminal:

```bash
cd studio
npm install
npm run dev
```

The backend listens on `http://localhost:4000` by default. Vite prints the
frontend URL when it starts. Set `PORT` to change the backend port; if the
frontend is pointed at a different backend, use the Studio configuration
documented in [`studio/README.md`](studio/README.md).

## Verification

Useful checks for changes in the Rust workspace are:

```bash
cargo test --workspace
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
```

The backend and Studio have separate `package.json` files and therefore use
their own install and build commands. See their READMEs before treating a
feature described in the larger architecture documentation as a production
guarantee.

## Documentation and project status

- [Documentation portal](docs/README.md)
- [Local environment setup](docs/1-onboarding-and-setup/local-environment.md)
- [Architecture overview](docs/2-architecture/overview.md)
- [CLI reference](docs/4-interfaces/cli-reference.md)
- [Contributing guide](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Project overview](PROJECT.md)
- [Apache-2.0 license](LICENSE)

GenOS is an active research and pre-alpha project. Some documents describe
design direction or experimental interfaces; the CLI help, crate tests, and
the Studio/backend READMEs are the closest references for currently available
local workflows.
