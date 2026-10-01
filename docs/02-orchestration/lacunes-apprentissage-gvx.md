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

Voir [ADR 0261](../adr/0261-detection-lacunes-apprentissage-gvx.md).
