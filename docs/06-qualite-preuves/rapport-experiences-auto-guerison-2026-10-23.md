# Campagne d’auto-guérison — contrôles et run Pantry Qwen 22 — 2026-10-23

## Contrôles Healing locaux

Révision du checkout GenOS : `1a106417fb3e1c7e76a8b9f5d69275db97d214d9`.

Six commandes du protocole ont été exécutées depuis la racine du dépôt le 23 octobre 2026. Toutes ont terminé avec le code 0 :

| Commande | Résultat observé |
| --- | --- |
| `node backend/tests/test_shev_healing_contract.js` | Phases durables, preuves et protection terminale validées. |
| `node backend/tests/test_shev_healing_integration.js` | Tick, Ontogenesis, effet et preuve longitudinale du banc réussis. |
| `node backend/tests/test_physiological_arc_closed_loop.js` | Les quatre connexions physiologiques simulées réussissent. |
| `node backend/tests/test_sre_healing_policy.js` | 10 réussis, 0 échoué. |
| `node backend/tests/test_sre_healing_store.js` | 3 réussis, 0 échoué. |
| `node backend/tests/test_security_qualification_lab.js` | `PASS test_security_qualification_lab`. |

Ces commandes vérifient les contrats et leurs bancs locaux. Elles ne constituent pas des injections de lésion réelles ni des preuves Hyper-V, réseau ou terrain. Le rapport `rapport-experiences-auto-guerison-2026-10-22.md` décrit leurs limites précédemment observées.

## Pantry T02 — run direct D: 22

- Run déclaré : `autonomy-proof-t02-20261023-direct-d-repair-22`.
- Modèle : `ollama://qwen2.5-coder:7b`; inference Ollama confirmée par les événements `INFERENCE_STARTED` et `INFERENCE_COMPLETED`.
- Workspace jetable : `D:\GenOS\runs\autonomy-proof-t02-20261022\project\workspace-direct-d-20261023`.
- Oracle indépendant : `npm test`, Playwright, autorisé par le contrat de mission.
- Résultat terminal : `success:false`, verdict `failed`, `homeostasisSatisfied:false`, invariant `mission_outcome_success` manquant.
- Qwen a produit huit propositions de réparation. Le candidat terminal a nommé le bouton d’incrément `Increase quantity for Oats`; ce nom correspond également au locator large du champ `getByLabel(/quantity/i)`. Playwright a échoué en strict mode à `tests/acceptance.cjs:15:38`. Le worker a restauré le workspace et GenOS n’a pas annoncé la réussite.
- La fermeture a aussi journalisé un défaut secondaire `ORCHESTRATOR_NOT_FOUND` avec un identifiant `windows-orchestrator-...`; ce défaut n’est pas la cause du verdict Playwright.
- Artefacts : `D:\GenOS\runs\autonomy-proof-t02-20261022\project\direct-d-20261023-retry22.json`, `orchestrator-direct-d-20261023-retry22.log` et `genos-direct-d-20261023-retry22.db`.

Le run 23 était visible comme démarré sur D: lors de la collecte, avec sa propre base isolée. Son résultat n’est pas inclus dans cette preuve et doit être consigné séparément depuis son reçu terminal.

## Portée

Les six tests locaux passent et le run Pantry 22 échoue proprement avec rollback. Aucune conclusion de guérison générale n’en découle. T01–T08, la durabilité de 72 heures et les interventions sur une vraie VM ou un réseau de laboratoire restent à qualifier.

## T01 — arrêt brutal et reprise de processus en laboratoire isolé

Trois expériences avec processus enfants et bases/répertoires temporaires ont terminé avec le code 0 le 23 octobre 2026 :

| Commande | Résultat observé |
| --- | --- |
| `node backend/tests/test_organism_restore_sigkill.js` | Enfants réellement arrêtés par `SIGKILL` aux phases prepared, workspace, rust, sqlite-uncommitted et committed; récupération vérifie l’état SQLite, le workspace et le checkpoint sélectionné. Sortie : `Organism restore SIGKILL recovery passed.` |
| `node --test backend/tests/test_recovered_runtime_supervision_process_e2e.js` | Backend réellement redémarré contre un runtime et une base isolée; seule la supervision future bornée est retransmise, puis révocation vérifiée. 1 test réussi. |
| `node backend/tests/test_mission_succession_backend_instances.cjs` | Deux instances HTTP backend réelles sur SQLite WAL partagé; un seul successeur, autorité obsolète bloquée, réservation et lancement récupérés après redémarrage. Sortie : `PASS`. |

Ces essais prouvent le comportement de récupération de processus et de backend dans des fixtures isolées. Ils ne tuent pas un worker métier en train de traiter une vraie mission et ne démontrent pas encore le critère T01 complet « reprise correcte sans doublon » sur un service de production ou une VM.

## T02 Pantry — run direct D: 23 terminé en échec

Le run `autonomy-proof-t02-20261023-direct-d-repair-23` a utilisé `ollama://qwen2.5-coder:7b` et huit essais Qwen réels. Au dernier essai, Playwright échoue à `tests/acceptance.cjs:19:10`: la ligne Oats attendue est absente (`actual: 0`, `expected: 1`). La mission est terminale `success:false`, verdict `failed`; l’invariant `mission_outcome_success` échoue et la porte homeostasis bloque la clôture. Le worker a restauré les changements de capsule.

Artefacts : `D:\GenOS\runs\autonomy-proof-t02-20261022\project\direct-d-20261023-retry23.json`, `orchestrator-direct-d-20261023-retry23.log` et `genos-direct-d-20261023-retry23.db`. La dernière proposition a consommé 4 369 tokens selon l’événement d’usage Qwen. Le run24 Qwen 32B apparaissait déjà lancé sur D: après la terminaison du run23; aucun doublon d’inférence n’a été ajouté.

## T02 — corruption sémantique de mémoire native et refus de propagation

Commande exécutée le 23 octobre : `node backend/tests/test_native_memory_budget.js` — code de sortie 0. La fixture crée une base et un workspace jetables, produit une mémoire promue et la vérifie depuis deux processus Oracle indépendants dans des répertoires différents. Le scénario de dommage ajoute une fausse affirmation au contenu d’une mémoire existante. GenOS la classe `refuted`, l’exclut des résultats de recherche, refuse de réutiliser l’ancienne attestation sur le contenu modifié et refuse une nouvelle preuve positive. Le test restaure le contenu original dans un bloc `finally`. Il vérifie aussi le refus d’une provenance falsifiée, d’une portée étrangère, d’un budget insuffisant et d’une source rétractée.

La commande a terminé avec les messages de réussite pour la réservation, les négatifs de mémoire et l’approbation. À la fermeture, deux effets différés ont aussi journalisé `SQLITE_MISUSE: Database is closed` (`ROLLBACK` et `TelemetryObserver`). Ces erreurs secondaires n’ont pas changé le code de sortie ni invalidé les assertions de corruption; elles restent une anomalie de nettoyage à corriger avant d’affirmer que le processus de test se termine sans erreur secondaire.

Cette preuve couvre une corruption sémantique contrôlée du contenu dans une base isolée et son refus/restauration. Elle ne simule pas une corruption de pages SQLite ou une perte physique de mémoire et ne démontre pas la réparation autonome par Qwen.

## Correction de la fermeture du banc T02

Le premier passage du test sémantique a réussi ses assertions, mais a terminé avec des effets différés de télémétrie après fermeture de SQLite. Le banc fermait sa base avant d’attendre ces effets. Le `finally` de `backend/tests/test_native_memory_budget.js` appelle maintenant le helper existant `flushTelemetrySideEffects` après l’arrêt du garage et avant `closeDatabase`.

Le rerun exact `node backend/tests/test_native_memory_budget.js` a terminé code 0 avec les mêmes assertions de corruption/refus/restauration. Les erreurs `SQLITE_MISUSE` de fermeture ne sont plus apparues. Une sortie `fatal: not a git repository` est toutefois apparue une fois pendant l’exécution d’un sous-processus; elle n’a pas échoué le test et sa source n’est pas encore isolée. Le run valide la correction de fermeture SQLite, mais le message Git reste à diagnostiquer.

