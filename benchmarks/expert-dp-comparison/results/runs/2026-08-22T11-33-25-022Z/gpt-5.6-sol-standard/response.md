Implémenté dans `src/lib.rs` : DP optimisée par enveloppe convexe monotone, `O(groups × n)`, mémoire `O(n)`, calculs en `u128` et gestion des préfixes répétés/zéros.

Tests exécutés :

- `rustfmt --edition 2021 --check src/lib.rs`
- Compilation `rustc` + `rustc --test tests/expert_dp.rs`
- Résultat : **4/4 tests réussis**

`cargo test` était bloqué par la configuration du workspace parent.