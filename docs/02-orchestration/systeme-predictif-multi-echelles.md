# Système prédictif multi-échelles T0–T6

Le service `backend/src/services/predictiveTimescale/` conserve des états métriques
distincts pour sept horizons fonctionnels. Il ne réentraîne aucun modèle de fondation.

| Niveau | Objet | Taux initial | Preuves minimales |
|---|---|---:|---:|
| T0 | Perception | 0,80 | 1 |
| T1 | Attention et routage | 0,65 | 2 |
| T2 | Stratégie | 0,45 | 3 |
| T3 | Monde, soi et épisode | 0,30 | 4 |
| T4 | Procédure et compétence | 0,18 | 6 |
| T5 | Morphologie | 0,08 | 10 |
| T6 | Lignée | 0,03 | 20 |

`record({ db, agentId, input })` met à jour une mesure numérique dans
`adaptive_state`. L'entrée comporte `timescale`, `metric`, `prediction`, `observation`,
`evidenceRefs` et `independentRefs`. Les références indépendantes et le seuil propre au
niveau sont exigés avant qu'une erreur persistante soit routée vers le niveau supérieur.
La dernière échelle n'a pas de niveau supérieur; une erreur T6 ne produit donc pas de
promotion implicite.

Quand un niveau rapide n'a aucun posterior local pour une métrique, il initialise son
prior depuis le posterior disponible le plus proche d'un niveau plus lent. Un changement
propagé peut être converti avec `agowCandidate(route, agentId)` en candidat
`cross_scale_prediction_error`, avec contrainte de revue.

Les taux, exigences et seuils actuels sont une politique initiale explicite, pas une
calibration expérimentale. `runtimePredictiveBridgeService`, appelé par le pipeline
d'événements, alimente T0–T3 dès qu'un événement fournit une paire numérique
prédiction/observation et des références de provenance validées dans le scope mission. Les
erreurs dépourvues de preuves restent locales. T4–T6 et les outcomes sans métriques
explicites ne sont pas ingérés automatiquement. `predictiveHierarchyService` continue en
parallèle à router les événements historiques Mission/Stratégie/Action.

Voir [ADR 0259](../adr/0259-systeme-predictif-multi-echelles.md) et le
[Self-Twin causal](../adr/0257-causal-self-twin.md).
