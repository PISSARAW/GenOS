# Suivi d'exécution du plan des indicateurs

- **Statut** : en cours ; aucune promotion d'indicateur.
- **Début** : 2026-09-26, base `7e7acc8a`.
- **Plan** : [plan-validation-indicateurs.md](plan-validation-indicateurs.md).

## Découpage du lot 01 avant modification

| Point | Objet | Critère de sortie | État |
|---|---|---|---|
| 01a | Restaurer la construction des décisions du directeur Rust | Compilation du crate puis tests existants pertinents ; signaler séparément les autres erreurs | Correctifs syntaxiques faits ; validation du crate bloquée par les erreurs décrites ci-dessous |
| 01b | Restaurer l'environnement et mesurer la baseline versionnée | Résultats backend/Rust/qualité traçables, fichiers locaux exclus du diagnostic versionné | À faire |
| 01c | Registres des 14 propriétés et 15 familles, profils et évaluations | IDs stables, états inconnus explicites, aucune promotion sans reçu valide | À faire |

Les lots suivants conservent l'ordre du plan. Toute décomposition supplémentaire sera inscrite avant son implémentation. Les résultats expérimentaux ne sont pas déduits du nombre de commits.

## Résultats 01a

Directeur : restauration de la préparation de décision, tri mutable et fermeture du bloc ; portée des méthodes du beam search, visibilité des champs de contexte et portée du contexte de préambule corrigées. Le préambule Observe est de nouveau réservé à Biome, conformément au comportement antérieur à la refactorisation.

Contrôle qualité des trois fichiers modifiés : aucune violation. `cargo test -p genos-orchestrator --lib` dépasse les premières erreurs mais révèle deux autres erreurs de syntaxe préexistantes dans `evolution.rs` et `recruitment.rs` ; le crate n'est pas déclaré validé.

Les dépendances backend ont été restaurées sans changement du lockfile ; après installation du binding SQLite, `npm test` : **55 réussites, 0 échec**.

## Découpage complémentaire 01b

| Point | Objet | Critère de sortie | État |
|---|---|---|---|
| 01b-R | Achever les refactorisations Rust connexes (évolution/recrutement) | Compilation et tests du crate, puis workspace | À faire |
| 01b-Q | Mesurer la dette qualité du code versionné | Rapport reproductible distinguant violations existantes et fichiers locaux | À faire |
