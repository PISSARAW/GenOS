Implémenté dans [src/lib.rs](/Users/henripissa/Documents/GitHub.nosync/GenOS/benchmarks/expert-dp-comparison/results/runs/2026-08-22T12-25-59-908Z/gpt-5.6-sol-standard/fixture/src/lib.rs) : DP avec enveloppe convexe monotone, en \(O(groups \times n)\), mémoire \(O(n)\), gestion des zéros et calculs en `u128`/`i128`.

Tests exécutés avec succès :

- `cargo test`
- `cargo test --release`