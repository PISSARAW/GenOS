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
calibration expérimentale. `predictiveHierarchyService` continue de traiter les anciens
événements Mission/Stratégie/Action; ses événements ne sont pas encore automatiquement
ingérés dans T0–T6.

Voir [ADR 0259](../adr/0259-systeme-predictif-multi-echelles.md) et le
[Self-Twin causal](../adr/0257-causal-self-twin.md).
