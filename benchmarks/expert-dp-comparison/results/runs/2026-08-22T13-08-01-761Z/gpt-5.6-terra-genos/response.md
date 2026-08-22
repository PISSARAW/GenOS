Implémenté : DP de partition avec arbre de Li Chao discret, en `O(groups · n · log n)`, calculs `u128`, robuste aux zéros/préfixes répétés.

Tests exécutés :

- `cargo test`
- `cargo test --release --test expert_dp` — 4/4 réussis