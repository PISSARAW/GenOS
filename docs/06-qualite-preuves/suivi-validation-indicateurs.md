# Suivi d'exécution du plan des indicateurs

- **Statut** : en cours ; aucune promotion d'indicateur.
- **Début** : 2026-09-26, base `7e7acc8a`.
- **Plan** : [plan-validation-indicateurs.md](plan-validation-indicateurs.md).

## Découpage du lot 01 avant modification

| Point | Objet | Critère de sortie | État |
|---|---|---|---|
| 01a | Restaurer la construction des décisions du directeur Rust | Compilation du crate puis tests existants pertinents ; signaler séparément les autres erreurs | Correctifs syntaxiques faits ; validation du crate bloquée par les erreurs décrites ci-dessous |
| 01b | Restaurer l'environnement et mesurer la baseline versionnée | Résultats backend/Rust/qualité traçables, fichiers locaux exclus du diagnostic versionné | À faire |
| 01c | Registres des 14 propriétés et 15 familles, profils et évaluations | IDs stables, états inconnus explicites, aucune promotion sans reçu valide | Livré : catalogue et états initiaux ; évaluations probantes à partir du lot 02 |

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

## Résultats 01c — registre et reprise

- Catalogue versionné : [`shared/indicatorRegistry.json`](../../shared/indicatorRegistry.json), 14 propriétés Butlin et 15 familles GenOS, sans addition des deux dénominateurs.
- Profils : `node-runtime`, `rust-runtime`, `composed-api`, `composed-perceptual`. Le dernier est planifié, pas déployé. L'opacité des modèles API reste explicite.
- Service : `indicatorRegistryService`, validation des IDs et mappings, copie du catalogue pour éviter les mutations par les consommateurs.
- Commande : `node backend/bin/genos-indicators.cjs node-runtime`. Elle produit uniquement un état initial, avec les cinq étapes à `not_run` et aucune preuve. Elle ne lit pas encore de reçus et n'est pas un moteur de validation.
- Tests : `node backend/tests/test_indicator_registry.js` passe ; dénominateurs, références de fichiers, IDs dupliqués, mappings invalides, profils inconnus, isolation du catalogue et CLI sont contrôlés.

### Transmission demandée par l'utilisateur

Arrêt après livraison de 01c ; les lots 02–25 ne sont pas implémentés. Le lot 01 n'est pas déclaré entièrement validé : il reste l'échec Rust et la dette qualité globale. Aucun indicateur n'a été promu.

Reprise :

1. Diagnostiquer `cargo test -p genos-orchestrator --test drives boucle_autonome_sans_but_externe -- --nocapture`. Distinguer une halte décisionnelle d'une borne de ticks atteinte avant de modifier le contrat ou le scénario.
2. Examiner `python scripts/ci/audit_indicator_baseline.py` et résorber la dette suivie sans élargir la baseline du gate. Les fichiers locaux de diagnostic ne font pas partie des commits de cette livraison.
3. Après remise en état, relancer `npm test`, `cargo test --workspace` et `python scripts/ci/check_code_quality.py` ; ne pas déduire le succès des suites non exécutées.
4. Poursuivre le **lot 02 : contrats versionnés et reçus**, puis raccorder leur stockage au lot 03. Le registre ne doit accepter aucun futur `passed` à partir de la seule présence d'un nom de service.

Sur cette machine, Python est disponible à `C:\Users\Shadow\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe` mais n'était pas dans le PATH initial. Le hook de commit exige Python et un bloc `Receipt:` listant exactement les fichiers indexés pour `[FEAT]`/`[FIX]`.

## Lot 02 — contrats versionnés et reçus

Le service [`versionedContractService.js`](../../backend/src/services/versionedContractService.js) fournit une enveloppe commune `genos.<Type>.receipt/v1` pour `MorphogeneticCandidate`, `WorldTransition`, `VerifiedRendering` et `CausalInterventionReceipt`. Il impose les champs requis, refuse les champs inconnus, vérifie les références, les listes, les statuts, les timestamps ISO et l'égalité `replicates = seeds.length`. L'identifiant par défaut est déterministe sur le type et le payload ; `runId`, `sourceRefs` et `issuedAt` sont portés par l'enveloppe.

`readReceipt()` revalide l'enveloppe et son payload. Un reçu invalide ou dont le schéma ne correspond pas au type est rejeté ; aucune fonction de ce lot ne promeut ou ne persiste une décision. La compatibilité future devra ajouter une migration explicite par version, sans accepter silencieusement un schéma inconnu.

Test : `node backend/tests/test_versioned_contract_service.js` passe avec quatre contrats valides, champs inconnus, schémas incohérents, profil inconnu et réplication invalide. Le contrôle qualité ciblé sur les deux fichiers JavaScript ne signale aucune violation. Le lot 02 est livré au niveau contrat pur ; le branchement des reçus dans SQLite et les projections d'événements reste le lot 03.

## Lot 03 — stockage transactionnel et événements

La migration `081-versioned-contract-receipts` ajoute une table de reçus avec hash, provenance et contrainte d'unicité. `versionedContractPersistenceService` écrit le reçu et son événement `projection_events` dans une transaction unique ; une répétition est idempotente, un conflit d'identifiant est rejeté et la restauration repasse par le validateur du lot 02.

Test : `node backend/tests/test_versioned_contract_persistence.js` vérifie l'insertion, l'idempotence, la restauration, la projection d'événement et le rejet d'un conflit de contenu.

## Lot 04 — runner expérimental isolé

`experimentalRunnerService` réutilise `arenaService.runTournament` pour deux bras contrôle/intervention, répétés sur plusieurs seeds. Il vérifie les sorties non vides, borne les runs et rounds, conserve les résultats par bras, calcule l'accord des signatures pour documenter le nondéterminisme et produit un `CausalInterventionReceipt`. Test réel : `node backend/tests/test_experimental_runner.js`.

## Lot 05 — protocoles et corpus train/dev/réservé

`validationProtocolService` fige une hypothèse, une révision, les critères, les seeds et un manifeste de corpus. Les IDs sont stables et disjoints entre `train`, `dev` et `reserved`; le manifeste reçoit un hash déterministe et devient immuable avant exécution. Le manifeste de référence est [`indicatorValidationProtocol.v1.json`](../../shared/indicatorValidationProtocol.v1.json). Test : `node backend/tests/test_validation_protocol.js`.
