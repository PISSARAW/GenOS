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

Le service `topologyMissionEvaluationService` expose l'évaluateur déterministe
aux modes de topologie enregistrés. Il retourne le résultat commun et signale la
politique de migration par receveur uniquement pour Métapopulation. Ce point
d'entrée partagé n'active pas automatiquement les migrations dans les autres
topologies et ne remplace pas leur dispatch de mission.

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
l'évaluateur local confirme une amélioration et que les valeurs de fitness
annoncées correspondent au calcul indépendant. Les fixtures sans évaluateur
enregistré retournent un résultat non vérifié au lieu d'être déclarées complètes.

Les évaluateurs déterministes recalculent le makespan, vérifient la faisabilité
et la borne du bin packing, recoupent les constats de sécurité avec les passages
du pseudo-système et contrôlent budget, lignées, poursuite des autres populations
et non-clonage lors de la recolonisation. Le niveau 2 valide les champs de
conception et leur couverture déclarée; cela ne prouve pas l'implémentation
logicielle de la fonctionnalité.

Le niveau 3 reste systématiquement non vérifié : GenOS n'exécute pas du code de
parseur fourni par un worker et aucun exécuteur isolé n'est encore configuré.
Un reçu auto-déclaré par le worker ne lève pas ce blocage.

Pour le niveau 6, l'évaluateur vérifie le résultat soumis : effondrement déclaré,
pluralité des lignées fondatrices, viabilité sous la nouvelle contrainte,
différence avec le voisin fourni et poursuite des populations survivantes.
Cette vérification ne déclenche pas elle-même les essais persistants de
recolonisation du runtime.

## Ordre de validation

La suite `node backend/bin/validate-comparative-suite.cjs` exécute les contrôles
dans cet ordre : contrat et composition, évaluateur du niveau 1 et gate de
collecte, puis revue des migrations, puis évaluateurs des niveaux 2, 3, 4, 5 et
6. Le niveau 3 doit rester en état bloqué tant que l'exécuteur isolé n'est pas
disponible; les autres tests confirment les évaluateurs et ne lancent pas de
workers réels.
