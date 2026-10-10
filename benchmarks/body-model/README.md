# Tests du modèle corporel GenOS

Exécution du 10 octobre 2026 sur le dépôt GenOS. Sondes Node.js isolées, avec télémétrie et stockage simulés en mémoire : aucune mission GenOS en production ni capteur physique n’a été sollicité.

## Résultat

**5 sondes réussies sur 8 ; 3 échecs.** Les résultats ne permettent pas de confirmer qu’un agent GenOS distingue de façon fiable ses ressources, capteurs et effecteurs du monde extérieur.

| Sonde | Critère | Résultat |
| --- | --- | --- |
| R1 | Mesures internes séparées par identifiant d’agent | Réussi : énergie 0,8 pour A et 0,2 pour B ; 12 requêtes filtrées par `agent_id` |
| R2 | Budget propre invariant lors d’un changement du workspace, sensible à son propre changement | Réussi : 5 000 reste 5 000 ; le passage à 700 déclenche la conservation du budget |
| C1 | Absence de mesure du budget représentée comme inconnue | **Échec** : un budget absent devient `tokens: 0` avec `confidence: 1` |
| C2 | Provenance distincte des percepts de budget et de workspace | Réussi : `proprioception` et `filesystem_touch` |
| E1 | Couverture des effecteurs explicitement connue | Réussi : 2 couverts ; 5 autres sont signalés comme non couverts ou hors frontière |
| E2 | Commande motrice liée à l’identité de l’agent propriétaire | **Échec** : l’adaptateur exécute une action sur `env://agent-B` sans identité d’agent en entrée |
| A1 | Conséquence associée uniquement au bon type et identifiant d’action ; pas de réutilisation | Réussi : une action étrangère ne correspond pas ; la bonne correspond ; sa répétition ne correspond plus |
| A2 | Événement d’un autre agent rejeté malgré le même identifiant d’action | **Échec** : `agentId: agent-B` dans le payload est ignoré ; la conséquence est attribuée à A |

Les trois tests existants `test_orchestrator_body.js`, `test_embodied_perception_adapters.js` et `test_effector_inventory.js` se terminent avec un code 0 dans le checkout de départ. Le premier émet des avertissements SQLite : ses assertions passent, mais sa télémétrie n’a pas été persistée dans ce contexte en lecture seule.

## Interprétation

La séparation administrative des mesures et les étiquettes de provenance existent. La corrélation causale ordinaire d’une action fonctionne. En revanche, le cas C1 confond « non mesuré » et « budget nul certain ». L’adaptateur moteur testé ne vérifie pas le propriétaire de l’effecteur ; cette vérification pourrait exister dans un appelant, mais elle n’est pas établie ici. Dans A2, la copie d’efférence se base sur le type et `sourceActionId`, sans vérifier l’identité portée par l’événement. Le test prouve cette propriété de l’adaptateur, pas qu’un agent tiers peut injecter un tel événement dans une mission réelle.

Le registre `shared/effectorRegistry.json` signale lui-même des voies non couvertes : lancement de processus, dispatch de workers, appel MCP direct, mutations de fichiers par le runtime local et MCP Rust. Une preuve générale du modèle corporel exige des tests de bout en bout sur ces voies, avec événement signé ou provenance authentifiée, deux agents réels et un enregistrement persistant des observations.

## Reproduction

`node benchmarks/body-model/probe.cjs`

Le résultat brut de la première exécution est dans `results.json`. Les sondes ont été écrites à partir de `backend/src/services/orchestratorBodyService.js`, `machineInteroceptionService.js`, `efferenceCopyService.js`, `perception/embodied/motorOutcomeAdapter.js` et `shared/effectorRegistry.json`.
