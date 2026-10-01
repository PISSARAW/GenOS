# Lacunes d'apprentissage GVX

`backend/src/services/gvxLearningGapDetector.js` classe les lacunes à partir d'erreurs de
prédiction, d'échecs et de tâches futures, puis ajuste le score avec la progression
d'apprentissage connue. Une cible doit apparaître dans au moins deux signaux, et dépasser
le score minimal. Les candidats portent leurs sources et restent au statut `proposed`.

Pour produire des buts en arrière-plan, `proposeBackgroundGoals` exige `background: true`,
un contrôle `authority.isAllowed`, un coût maximal et un pas unique. Les buts autorisés
restent `requires_external_dispatch`; ils ne démarrent pas eux-mêmes une mission. Ils
peuvent ensuite être fournis au curriculum GVX, qui revérifie les prérequis et le budget.

Les pondérations sont des paramètres initiaux non calibrés. Les intégrations doivent
fournir des signaux issus d'outcomes et d'évaluations fiables.

## De la lacune à une lignée candidate

`backend/src/services/gvxMutationProposer.js` exige un prédicteur Self-Twin et produit un
événement de transformation GVX validé, avec `causalContext.selfTwinPredictionId` et les
effets anticipés. Il ne construit ni n'applique de patch.

`backend/src/services/gvxLineageSearch.js` délègue ensuite la création d'une branche
candidate isolée et l'évaluation à l'hôte. Il borne la recherche à huit candidats et au
budget déclaré, puis journalise les résultats; toute promotion requiert un gate externe.

Voir [ADR 0262](../adr/0262-proposition-mutation-recherche-lignees-gvx.md).

Voir [ADR 0261](../adr/0261-detection-lacunes-apprentissage-gvx.md).
