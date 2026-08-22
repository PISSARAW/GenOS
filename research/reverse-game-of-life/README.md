# Reverse Game of Life research

This archive groups the Reverse Game of Life experiments that previously lived
at the repository root. No historical result was deleted.

```text
crates/       Rust experiments in this archive's separate Cargo workspace
data/         Input grids and generated datasets
prototypes/   Standalone Rust prototypes
results/      Historical solver outputs and logs
solvers/      JavaScript and Python candidate solvers
tooling/      Dataset setup, encoding, and evaluation utilities
```

Run JavaScript commands from this directory so the documented `data/` and
`results/` paths resolve consistently:

```bash
cd research/reverse-game-of-life
npm ci
node tooling/rgol_evaluator.js results/gen0_algo3.txt
```

The five workspace-based Rust experiments are intentionally excluded from the
main GenOS workspace and its product CI/security guarantees. Build them through
the archive's lockfile:

```bash
cargo check --locked --manifest-path research/reverse-game-of-life/Cargo.toml
```

`crates/epsilon_gen18` retains its original standalone workspace and lockfile.
It can be checked independently with
`cargo check --locked --manifest-path research/reverse-game-of-life/crates/epsilon_gen18/Cargo.toml`.

These programs are research artifacts, not published GenOS benchmarks. Their
outputs must not be presented as product performance data without a versioned
protocol, machine metadata, raw results, and an independent reproduction.
