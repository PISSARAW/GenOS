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
| E1 | Couverture des effecteurs explicitement connue | Réussi : 4 couverts ; 1 conditionnel, 1 partiel, 1 hors frontière Node |
| E2 | Commande motrice liée à l’identité de l’agent propriétaire | Réussi : l’effecteur de B est bloqué avant exécution par A |
| A1 | Conséquence associée uniquement au bon type et identifiant d’action ; pas de réutilisation | Réussi : une action étrangère ne correspond pas ; la bonne correspond ; sa répétition ne correspond plus |
| A2 | Événement d’un autre agent rejeté malgré le même identifiant d’action | Réussi : `event.agentId: agent-B` ne consomme pas la prédiction de A |

Les tests ciblés du backend vérifient aussi le budget inconnu, le bail final, l'autorité motrice, les reçus persistants, deux agents scellés, les changements de fichiers observables et la portée des claims.

## Interprétation

Le corps sépare le propriétaire du capteur et le domaine observé. Le budget inconnu ne devient plus un zéro certain ; le bootstrap lit l'allocation et le bail effectifs. L'adaptateur moteur refuse un propriétaire étranger et la copie d'efférence exige l'identité de l'événement. Les métriques CoreSelf et les claims sont désormais bornés par l'agent.

Le registre `shared/effectorRegistry.json` décrit maintenant des reçus durables pour le lancement de processus et le dispatch de workers sous mission scellée. Le MCP direct n'est attribuable que si l'appel transporte un acteur scellé. Le runtime local produit un diff de fichiers éligibles ; celui-ci ne démontre pas que le processus a causé chaque changement. Le serveur MCP Rust stdio reste hors du registre Node. Le chemin de production des nouveaux claims ne transmet pas encore de run scellé, donc `selfOriginRatio` peut rester absent. Les sondes isolées et la fixture à deux agents ne certifient pas une mission de production complète sur tous ces canaux.

## Reproduction

`node benchmarks/body-model/probe.cjs`

Le résultat brut de la dernière exécution est dans `results.json`. Les sondes ont été écrites à partir de `backend/src/services/orchestratorBodyService.js`, `machineInteroceptionService.js`, `efferenceCopyService.js`, `perception/embodied/motorOutcomeAdapter.js` et `shared/effectorRegistry.json`.
