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
