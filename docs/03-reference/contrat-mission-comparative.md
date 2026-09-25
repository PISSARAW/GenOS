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

Le validateur de forme des missions et des résultats est implémenté dans le
backend avec un test dédié. Son branchement sur tous les chemins d'orchestration,
les évaluateurs métier et les fixtures des six missions restent à réaliser.
