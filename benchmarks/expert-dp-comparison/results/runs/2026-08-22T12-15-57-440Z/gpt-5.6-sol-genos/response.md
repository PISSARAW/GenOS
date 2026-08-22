Implémenté dans `src/lib.rs` :

- DP avec enveloppe convexe monotone, robuste aux préfixes égaux/zéros.
- Arithmétique `u128`, complexité `O(groups × n)`, mémoire `O(n)`.

Tests réussis :

- `cargo test --all-targets`
- `cargo test --release --test expert_dp`