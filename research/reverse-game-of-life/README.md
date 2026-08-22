# Reverse Game of Life research

This archive groups the Reverse Game of Life experiments that previously lived
at the repository root. No historical result was deleted.

```text
crates/       Rust experiments that participate in the workspace
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

Rust workspace packages remain runnable from the repository root:

```bash
cargo check -p genos_v5_rust
cargo check -p sigma_runner
cargo check -p sate-lattice
```

These programs are research artifacts, not published GenOS benchmarks. Their
outputs must not be presented as product performance data without a versioned
protocol, machine metadata, raw results, and an independent reproduction.
