Implémenté dans `src/lib.rs` : DP optimisée par enveloppe convexe monotone, gestion des préfixes répétés et calculs `u128`. Complexité `O(groups × n)`, mémoire `O(n)`.

Tests exécutés :

- `rustfmt --check src/lib.rs`
- `cargo test` — 4/4 réussis.