Implémenté dans `src/lib.rs` :

- DP + enveloppe convexe monotone, `O(groups × n)` / `O(n)`.
- Calculs en `u128`, gestion des préfixes répétés dus aux zéros.

Tests exécutés avec succès :

- `cargo test --release`
- `cargo test`