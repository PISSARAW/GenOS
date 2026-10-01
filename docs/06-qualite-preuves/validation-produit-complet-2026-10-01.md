# Validation complète du produit — 2026-10-01

- **Révision du code testée** : `f17000e8` (`[FIX] Fermer les surfaces publiques par allowlist`)
- **Portée** : workspace Rust, backend Node, profils transverses et contrôles de cohérence du dépôt.
- **Verdict** : les suites fonctionnelles exécutées passent; la porte qualité globale reste en échec.

## Vérifications réussies

- `npm test` : 55 assertions passées, 0 échec.
- `npm --prefix backend run test:validation` : profil `all`, 106 suites passées.
- `npm --prefix backend run test:procedural` : toutes les suites procédurales passées.
- `cargo test --workspace` : tous les tests et tests de documentation passent.
- `npm run check:wiring` : contrat de câblage et cohérence du catalogue MCP valides.
- `python scripts/ci/check_adr_index.py` : 228 ADR, 0 problème après régénération de l'index.
- `npm run docs:inventory:check` : inventaire technique à jour après régénération.

## Blocage qualité

`python scripts/ci/check_code_quality.py` échoue sur 359 violations dans le dépôt,
dont 143 dépassent le baseline courant. Le mode strict signale les 359 violations.
La porte qualité staged du commit `f17000e8` avait 0 nouvelle violation parmi les
fichiers de ce correctif. Le résultat global porte sur l'arbre de travail entier
et ne permet pas d'attribuer les violations à cette révision seule.

La validation fonctionnelle est donc verte, mais le dépôt ne satisfait pas encore
sa porte qualité globale. Cette vérification ne constitue pas une validation de
déploiement ni une garantie sur les chemins non couverts par les suites exécutées.
