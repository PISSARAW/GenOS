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
| 01b-R | Achever les refactorisations Rust connexes (évolution/recrutement, reproduction et appels de traces) | Compilation et tests du crate, puis workspace | En cours |
| 01b-Q | Mesurer la dette qualité du code versionné | Rapport reproductible distinguant violations existantes et fichiers locaux | Mesuré ; gate global en échec |

### Résultats 01b-R

Les tests du crate compilent désormais (`cargo test -p genos-orchestrator --tests --no-run`). Les 40 tests unitaires passent ; les six suites ciblées évolution, organisation, planner, recrutement, reproduction et traces passent : **28 tests**. Les modifications portent sur les portées Rust, durées de vie, appels des contrats déjà refactorisés et la sélection manquante du recrutement. Deux fixtures de régulation précisent `health_score: 1.0` pour isoler la pénalité d'erreur, comme les appels de production ; les assertions restent inchangées.

La suite complète s'arrête encore sur `drives::boucle_autonome_sans_but_externe` : elle attend une halte mais la boucle atteint sa borne sans halte décisionnelle. Cette divergence comportementale est à diagnostiquer séparément ; elle n'est pas masquée par les réussites ciblées. Le lot 01 reste ouvert et aucune campagne réservée n'est autorisée par cette baseline.

### Résultats 01b-Q — 2026-09-27

Le script `python scripts/ci/audit_indicator_baseline.py` produit un JSON séparant sources suivies et sources locales non suivies. Il réutilise les règles du gate sans modifier sa baseline ni ses exclusions ; son code de sortie est non nul si le code suivi présente des violations hors baseline ou des fichiers manquants. Le rapport décrit le working tree et mentionne les fichiers suivis modifiés : ce n'est pas une mesure du seul contenu du commit si l'arbre est modifié.

Au commit `e2bb374064121ff30199f5ef577a5b6301c21f88`, avec aucun fichier suivi modifié : **3 732 sources suivies, 368 violations dont 147 hors baseline**, aucun fichier manquant. Les 22 sources locales examinées ont 5 violations. Les nouveaux fichiers de cette livraison n'étaient pas encore indexés lors de cette mesure. Ces nombres décrivent la dette existante ; ils ne sont pas un score d'indicateurs.

`cargo test --workspace` compile désormais puis échoue également sur l'assertion `drives::boucle_autonome_sans_but_externe`. Les tests situés après cet arrêt ne sont pas déclarés exécutés. Une relance ciblée reproduit l'échec. La baseline backend reste **55/55** ; la baseline Rust et le gate global ne sont pas verts.
