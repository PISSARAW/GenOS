Implémenté dans `src/lib.rs` : DP avec enveloppe convexe monotone, gestion des préfixes égaux/zéros et calculs en `u128`. Complexité `O(groups × n)`, mémoire `O(n)`.

Tests exécutés :

- `rustfmt --check src/lib.rs`
- `cargo test` — 4/4 réussis.