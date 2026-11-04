# Deceptive-Patch-Bench : chaîne native

Cette variante compare une boucle ReAct, le même agent avec CodeProof, puis une mission GenOS native. Elle succède à la campagne par composants sans modifier ses données ni ses conclusions.

Le protocole v2 conserve la trace d'une série native v1 interrompue après 28 essais terminés et une tentative interrompue, avant tout jugement caché. Un test global avait révélé une régression de négation française. La nouvelle série corrige cette polarité et qualifie la transmission de l'objectif canonique et du rôle d'implémentation aux reprises ; les données interrompues ne sont pas présentées comme des résultats complets.

Les trois tâches et les dix seeds produisent 90 essais, dans un ordre équilibré par rotation des bras. Le modèle et son digest sont contrôlés avant chaque génération. Un proxy commun impose les plafonds d'appels, de tokens, de contexte, de sortie et de durée ; il conserve les réponses brutes dans un journal chaîné. Les générations des critiques, réparations et reprises consomment le même budget partagé. Les appels auxiliaires d'embedding sont journalisés séparément. Les paramètres natifs de génération demandés par GenOS sont conservés dans les requêtes brutes ; cette expérience compare les traitements complets.

| Bras | Exécution et sélection |
| --- | --- |
| A | Actions JSON réelles sur un workspace mutable ; déclaration de fin libre. |
| B | Même interface ; clôture conditionnée au CodeProof de la révision courante et aux deux tests publics. |
| C | MCP local de production, worker typé, espaces GQWF, intégration finale, GQEL, oracle public natif, rejeu, décision persistée et homéostasie. |

Les tests sont fournis et protégés dans tous les bras. Le wrapper `regression.test.cjs` exécute les deux suites publiques. Les huit contrôles cachés servent uniquement au jugement externe après les sélections ; ils ne conditionnent ni la critique ni la promotion native.

Les copies, bases privées, secrets éphémères, réponses et artefacts d'exécution restent sur D: et ne sont pas commités. Le runtime doit être figé et accompagné de `runtime-seal.json` et de contrôles Qwen réels dans `benchmark-qualification.json` avant la préparation.

```powershell
node benchmarks/deceptive-patch-native/controls.cjs
node benchmarks/deceptive-patch-native/test.mjs
node benchmarks/deceptive-patch-native/test-accounting.cjs
# Dans une copie Git propre sur D:, après compilation des deux exécutables :
node benchmarks/deceptive-patch-native/freeze.cjs
node benchmarks/deceptive-patch-native/qualify-live.mjs D:/GenOSExperiments/dpb-live-controls D:/GenOSExperiments/positive-fixture
node benchmarks/deceptive-patch-native/freeze.cjs qualify D:/GenOSExperiments/dpb-live-controls
node benchmarks/deceptive-patch-native/prepare.cjs D:/GenOSExperiments/dpb-native-primary
node benchmarks/deceptive-patch-native/run.cjs D:/GenOSExperiments/dpb-native-primary
node benchmarks/deceptive-patch-native/grade.cjs D:/GenOSExperiments/dpb-native-primary
```

Une interruption n'est pas rejouée. À la reprise du pilote, un essai commencé sans issue terminale est conservé comme interrompu. Un coût inconnu reste inconnu. Les succès annoncés sont les clôtures effectivement acceptées ; les tentatives de soumission sont conservées séparément. Un candidat natif correct mais refusé n'est pas assimilé à un correctif livré.

Le rapport distingue taux de correctifs réels, fausses clôtures acceptées, corruption du workspace, tokens mesurés et coût par correctif. Les trois tâches constituent les unités indépendantes du pilote ; les dix seeds par tâche restent corrélées. Aucun avantage GenOS n'est présupposé.

Voir [l'ADR](../../docs/adr/2026-11-04-dpb-chaine-native-code.md) pour la portée des preuves et les mécanismes qui ne peuvent pas être déclarés exécutés.
