# Résultats

Le compte rendu versionné des qualifications A/B/C/D sur le corpus public
v0.4.0 est dans `../reports/qualification-publique-2026-10-27.md`.
Chaque condition a exécuté 3 400 cas × 3 répétitions (10 200 résultats), avec
100 % de conformité et aucun échec critique. Le fichier local
`D-qualification.json` permet au contrôle readiness de vérifier la qualification
de l'adaptateur D; les sorties JSONL et manifestes restent ignorés par Git.

Ces exécutions ne terminent pas la campagne confirmatoire. Le holdout local de
680 cas est préparé, mais reste à scorer après gel des sorties candidates.
Restent les baselines externes applicables, les configurations de comparaison,
le préenregistrement, les ablations, les essais de charge et l'analyse de
puissance. Les résultats sont descriptifs et ne démontrent pas un gain de
performance.
