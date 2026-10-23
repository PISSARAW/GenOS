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


## T03 — réparation Rhizome après échec de route vérifié

Commande exécutée dans une base SQLite temporaire isolée : `node backend/tests/test_rhizome_runtime_recovery.js` — code 0, sortie `Rhizome runtime recovery: PASS`. Le runtime exécute d’abord une route de coût inférieur; le vérificateur injecte un reçu d’échec signé. Le runtime exclut exactement ses deux arêtes (`fast-a`, `fast-b`), choisit l’alternative (`safe-a`, `safe-b`) puis reçoit un reçu de succès. L’assertion terminale est `ROUTE_RECOVERED`, avec deux exécutions. Le même test vérifie qu’une échéance dépassée reste `ROUTE_RETRY_UNVERIFIED` et n’annonce pas de guérison.

Le runtime Rhizome, le routage, les reçus et la persistance sont réellement exécutés localement; seule l’exécution externe de la capacité est fournie par une fonction fixture et le vérificateur de test contrôle les reçus. Cela qualifie la récupération de route dans le banc isolé, pas la livraison sur un réseau externe ni le respect d’une politique de permission à travers un adaptateur réseau réel.

Le complément live du même contrôle a été exécuté avec `GENOS_RHIZOME_CLI=target/debug/genos.exe`: `node backend/tests/rhizome_cli_live_check.cjs` — code 0. Le binaire Rust fraîchement disponible a exporté un graphe persistant depuis SQLite; un serveur enfant local a servi `/api/graph` et un snapshot WebSocket, puis le test a vérifié que l’export d’une session fermée est refusé. Le mode simulation requiert une option explicite et est distingué par `source=simulation`. Le test utilise exclusivement `127.0.0.1` et une base jetable; il ne réalise pas de routage sur un réseau de production.

## T04 — remplacement d’un worker et vérification indépendante

Le premier essai de `node backend/tests/test_mission_replacement_continuity.js` a échoué à son préflight (`blocked` au lieu de l’erreur de dispatch attendue) : la fixture ne fournissait ni budget positif, ni checks configurés, ni workspace. Après correction de la fixture, une seconde lésion réutilisait l’identifiant déjà consommé; le registre a correctement bloqué le doublon. La lésion de réussite utilise maintenant un identifiant distinct et une preuve fonctionnelle liée au contrôle configuré.

Cette expérience a révélé le défaut produit qui empêchait toute réussite réelle : `sandboxCommandPolicy` autorisait `node checks/verify.js`, mais `sandboxExecutor.commandInvocation` ne gérait pas la commande `node`. L’exécution indépendante échouait donc `CHECK_EXECUTION_FAILED`, même si le script de vérification était présent. Le service invoque maintenant le script autorisé via `process.execPath`, sans shell. `test_aeis_sandbox.js` couvre l’exécution Node réelle et conserve le refus de commandes hors whitelist.

Après correction : `node backend/tests/test_aeis_sandbox.js` — code 0, tous les scénarios AEIS passent; `node backend/tests/test_mission_replacement_continuity.js` — code 0, dispatch négatif classé `error`, remplacement avec reçu fonctionnel, replay réel du contrôle Node en sandbox, puis état/membership conservés après réouverture de SQLite; `node backend/tests/test_mission_continuity.js` — 21 réussis, 0 échec.

La fixture remplace le dispatcher réseau de worker par un adaptateur déterministe; le contrôle d’équivalence, lui, est lancé comme processus isolé réel. Cela qualifie les portes de régénération et l’oracle, mais pas le remplacement en production d’un worker Qwen réellement tué.

## T02 Pantry — run24 arrêté par le bail d’identité

Le reçu D: du run `autonomy-proof-t02-20261023-direct-d-repair-24` montre quatre inférences journalisées et deux reprises Playwright exploitables. Le candidat initial échoue sur `Category`; le premier retry échoue sur le label `Search`. Les générations observées durent 349 026 à 411 462 ms. Le processus termine avec code 1 dans `workerIdentity.fail` et `IDENTITY_SESSION_STALE`; aucune preuve terminale de succès de l’application n’existe pour le candidat suivant. La porte homeostasis avait un seul invariant échoué, `mission_outcome_success`. Ce run ne démontre donc pas T02 réussi et ne doit pas être résumé comme un échec fonctionnel du dernier candidat.

Le code révèle la cause : les sessions de worker avaient un TTL plafonné à 900 000 ms et n’étaient jamais prolongées pendant `modelRouter.generate`, même si le budget d’exécution de mission pouvait atteindre 1 200 000 ms. Un renouvellement fencing-safe existe maintenant dans `identity/incarnations.js` et `identity/worker.js`; `workerEvidenceBarrierLocal` envoie un heartbeat chaque minute pendant génération, validation et clôture. Tout échec de renouvellement reste fermé via l’assertion de session avant de publier le résultat.

Vérifications après correction : `node backend/tests/test_identity_v2.js` passe avec renouvellement au-delà de l’ancien TTL, refus d’une clé falsifiée et refus d’une session libérée; `node backend/tests/test_identity_lease_heartbeat.js` passe pour les renewals répétés et l’échec fermé; `node backend/tests/test_mission_continuity.js` — 21 réussis, 0 échec. Aucun rerun Qwen Pantry après ce changement n’est encore revendiqué.
