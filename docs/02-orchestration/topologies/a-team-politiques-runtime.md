# Politiques d'organisation A-Team au dispatch

`dispatchPolicyService.prepareDispatchPolicy` transforme la variante choisie en
paramètres appliqués avant persistance du run.

| Variante | Effet au dispatch |
|---|---|
| `expert_committee` | Chaque membre reçoit le contrat de rapport indépendant et l'autorité de consensus ; le rôle d'intégration reste après les spécialistes. |
| `pipeline` | Les membres sont ordonnés selon le WorkGraph puis chaînés par handoffs typés. |
| `project_dag` | Le graphe existant reste la source des dépendances et des étages. |
| `cross_functional_pod` | Chaque membre déclare les autres domaines comme consultations et reçoit la cadence de synchronisation continue. |
| `boundary_spanner` | Les interfaces sont évaluées ; un membre déclaré `boundary_spanning` reçoit la propriété des seules interfaces qui lui sont assignées. |
| `matrix_team` | Le run conserve les axes d'autorité fonctionnel et produit et demande leur consultation croisée. |
| `tiger_team`, `incident_command` | Un membre reçoit le rôle de coordination temporaire dans le prompt de mission ; les budgets restent répartis selon criticité et chemin critique. |
| `relay_team` | Les membres sont chaînés selon les dépendances et reçoivent une règle de transfert exclusif du contexte. |
| `adaptive` | Les phases explicites sont chacune converties en plan de variante ; le choix reste visible dans `execution.organizationPolicy.phases`. |
| `multiteam` | Les définitions de sous-équipes et contrats sont validées et un graphe programme ainsi qu'un conseil sont produits dans la politique persistée. Sans sous-équipes explicites, le dispatch échoue. |

Le runner de programme `multiteam/programRuntimeService.js` persiste l'état des sous-équipes,
les exécute par couches topologiques via un adaptateur `executeTeam`, et bloque un consumer
tant que chaque contrat entrant bloquant n'est pas marqué vérifié avec une référence de
preuve. L'adaptateur doit déléguer à la barrière de preuves du sous-run et fournir une clé
d'idempotence stable ; le runner la dérive de l'identifiant du programme et de l'équipe.
Un résultat `WAITING` reste réessayable et ne débloque aucun consumer.

Le dispatch A-Team générique ne fournit pas encore cet adaptateur : la variante multiteam
compose et persiste le graphe/conseil, tandis que le runner ci-dessus est disponible pour
une intégration qui dispose d'un exécuteur de sous-run vérifié. Les champs d'autorité
orientent les responsabilités données aux workers et ne modifient pas les ACL du backend.
