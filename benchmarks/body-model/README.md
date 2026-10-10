# Tests du modèle corporel GenOS

Exécution du 10 octobre 2026 sur le dépôt GenOS. Sondes Node.js isolées, avec télémétrie et stockage simulés en mémoire : aucune mission GenOS en production ni capteur physique n’a été sollicité.

## Résultat

**8 sondes réussies sur 8** après correction des trois échecs initiaux. Le script rend désormais un code de sortie non nul si une sonde régresse. Ces sondes vérifient des composants Node isolés ; elles ne certifient pas une mission de production complète.

| Sonde | Critère | Résultat |
| --- | --- | --- |
| R1 | Mesures internes séparées par identifiant d’agent | Réussi : énergie 0,8 pour A et 0,2 pour B ; 12 requêtes filtrées par `agent_id` |
| R2 | Budget propre invariant lors d’un changement du workspace, sensible à son propre changement | Réussi : 5 000 reste 5 000 ; le passage à 700 déclenche la conservation du budget |
| C1 | Absence de mesure du budget représentée comme inconnue | Réussi : `tokens: null`, `status: unknown`, `confidence: 0` |
| C2 | Provenance distincte des percepts de budget et de workspace | Réussi : `proprioception` et `filesystem_touch` |
| E1 | Couverture des effecteurs explicitement connue | Réussi : 2 couverts ; 5 autres sont signalés comme non couverts ou hors frontière |
| E2 | Commande motrice liée à l’identité de l’agent propriétaire | Réussi : l’effecteur de B est bloqué avant exécution par A |
| A1 | Conséquence associée uniquement au bon type et identifiant d’action ; pas de réutilisation | Réussi : une action étrangère ne correspond pas ; la bonne correspond ; sa répétition ne correspond plus |
| A2 | Événement d’un autre agent rejeté malgré le même identifiant d’action | Réussi : `event.agentId: agent-B` ne consomme pas la prédiction de A |

Les tests ciblés du backend vérifient aussi le budget inconnu, le bail final, l'autorité motrice, l'attribution entre agents et la portée des claims.

## Interprétation

Le corps sépare le propriétaire du capteur et le domaine observé. Le budget inconnu ne devient plus un zéro certain ; le bootstrap lit l'allocation et le bail effectifs. L'adaptateur moteur refuse un propriétaire étranger et la copie d'efférence exige l'identité de l'événement. Les métriques CoreSelf et les claims sont désormais bornés par l'agent.

Le registre `shared/effectorRegistry.json` signale lui-même des voies non couvertes : lancement de processus, dispatch de workers, appel MCP direct, mutations de fichiers par le runtime local et MCP Rust. Une preuve générale du modèle corporel exige des tests de bout en bout sur ces voies, avec événement signé ou provenance authentifiée, deux agents réels et un enregistrement persistant des observations.

## Reproduction

`node benchmarks/body-model/probe.cjs`

Le résultat brut de la dernière exécution est dans `results.json`. Les sondes ont été écrites à partir de `backend/src/services/orchestratorBodyService.js`, `machineInteroceptionService.js`, `efferenceCopyService.js`, `perception/embodied/motorOutcomeAdapter.js` et `shared/effectorRegistry.json`.
