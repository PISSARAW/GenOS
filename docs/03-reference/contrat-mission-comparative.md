# Contrat de mission comparative

## Objet

Ce contrat décrit une mission comparant plusieurs populations sur un problème
et des entrées communs. Il versionne le problème, les critères de fitness locaux,
les preuves requises, les règles de migration et les limites reproductibles. Il
ne définit aucun problème métier implicite.

## Répartition des responsabilités

| Couche | Responsabilité |
| --- | --- |
| GenOS | Dispatch, isolation, budget, transport, événements, stockage des preuves et état d'exécution. |
| Métapopulation | Populations indépendantes, méthode locale, migrations candidates, validation par le receveur, diversité et lignées. |
| Banc d'essai | Énoncé, données, contraintes métier, métriques et évaluateur déterministe. |

Les autres topologies peuvent adopter le contrat d'évaluation. Elles ne reçoivent
pas implicitement les politiques de migration ni les garanties de diversité de
Métapopulation.

## Schéma de mission

Le validateur `backend/src/services/comparativeMissionContract.js` impose les
champs suivants :

```json
{
  "schemaVersion": "1",
  "missionId": "schedule-v1",
  "problem": {
    "domain": "scheduling",
    "statement": "Minimize makespan.",
    "inputs": { "jobs": { "A": 2, "B": 3 }, "machines": 2 },
    "constraints": ["Assign every job once."],
    "objective": { "metric": "makespan", "direction": "minimize", "unit": "time" }
  },
  "populations": [
    {"id":"greedy","method":"greedy","localObjectives":["valid schedule"],"fitness":{"metric":"makespan","direction":"minimize"},"evidenceRequirements":["assignments"]},
    {"id":"dynamic","method":"dynamic programming","localObjectives":["exact optimum"],"fitness":{"metric":"makespan","direction":"minimize"},"evidenceRequirements":["assignments"]}
  ],
  "migration": {"enabled":true,"requireLocalValidation":true,"prohibitWholeSolutionCopy":true},
  "reproducibility": {"seed":"case-1","maxRuntimeMs":10000,"maxTokens":4000}
}
```

Les identifiants des populations sont uniques. Une migration activée exige une
validation locale. Les données restent explicites dans `problem.inputs`; le
runtime ne les fabrique pas.

## Résultat comparatif

Chaque résultat porte `missionId`, `populationId`, `method`, `evidence`, une
fitness numérique, les décisions de migration et les risques non résolus. Une
migration acceptée doit contenir `localValidation: true`; la fin du worker ne
constitue pas à elle seule une validation métier.

L'évaluateur du banc d'essai recalcule validité et fitness depuis les entrées
versionnées. Une preuve absente, une méthode non conforme ou un résultat rejeté
demeure non vérifié ou partiel.

## État d'implémentation

Le validateur de forme des missions et des résultats, les fixtures versionnées
des six niveaux et le lanceur `node backend/bin/run-comparative-mission.cjs
<level-1..level-6>` sont implémentés. Les tests confirment que chaque fixture
est valide et compose le nombre prévu de populations. Ce lanceur démarre une
mission réelle; il ne garantit pas que chaque worker produira un résultat
accepté par l'évaluateur.

Le contrôle de migrations ne transmet que les idées techniques explicites, pas
les réponses des pairs. Une adoption est acceptée seulement si l'idée a été
présentée au receveur, que celui-ci fournit des références de preuve et que
l'évaluateur local de planification confirme une amélioration. Les autres
domaines restent fermés à l'adoption tant qu'ils n'ont pas d'évaluateur métier
reproductible. De même, les fixtures sans évaluateur enregistré retournent un
résultat non vérifié au lieu d'être déclarées complètes.
