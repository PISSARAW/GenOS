# Scénario de Test : Endpoint API Critique

## Objectif

Implémenter un **middleware de validation de jetons d'authentification et de limitation de débit (Rate Limiting)** en Rust, devant respecter simultanément 3 contraintes contradictoires :

### Contrainte 1 — Sécurité maximale
- Résistance aux **attaques temporelles (timing attacks)** : toute comparaison de secrets doit être en temps constant.
- **Hachage cryptographique sécurisé** des jetons (SHA-256 minimum) ; aucun secret en clair ne doit être stocké plus longtemps que nécessaire.
- **Validation stricte des entrées** : bornes de longueur, charset contrôlé, aucune interpolation dans une requête/chemin/shell.

### Contrainte 2 — Haute performance
- Allocation mémoire minimale dans le chemin critique.
- Traitement moyen **< 1 ms par requête** sous charge de **10 000 requêtes**.

### Contrainte 3 — Qualité & Couverture
- **100 % de couverture** de tests unitaires sur la logique métier.
- **Conformité linter stricte** : `cargo clippy --all-targets -- -D warnings` sans aucun avertissement.

## Livrables attendus dans ce répertoire

1. `src/lib.rs` (+ modules libres) : l'implémentation.
2. Des tests unitaires exhaustifs, dont un test nommé `bench_10k` qui exécute 10 000 validations authentifiées et affirme une latence moyenne < 1 ms.
3. `REPORT.md` : votre rapport d'agent (en français) décrivant votre approche, vos choix, vos compromis et vos résultats mesurés.

## Vérification

- `cargo test` doit passer intégralement.
- `cargo clippy --all-targets -- -D warnings` ne doit produire aucun avertissement.
