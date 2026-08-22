Implémenté dans `src/lib.rs` :

- DP optimisée par enveloppe convexe monotone, `O(groups × n)` et mémoire `O(n)`.
- Arithmétique `u128`, gestion des zéros et préfixes identiques.

Tests exécutés avec succès :

- `cargo test`
- `rustfmt --check src/lib.rs`