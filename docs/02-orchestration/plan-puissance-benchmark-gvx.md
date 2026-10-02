# Plan de puissance pour les benchmarks GVX

`gvxBenchmarkProtocol` exige un `analysisPlan` (`primaryMetric`, `direction`) et un
`powerPlan` (`minimumEffectOfInterest`, `assumedStdDev`, `confidenceLevel`, `power`). Le
manifeste dérive `requiredReplicates` avec une approximation normale pour deux groupes
indépendants. Ce nombre borne les seeds requises par variante, cohorte et split train ou
holdout.

Les hypothèses de variance et d'effet doivent venir d'un pilote ou de données publiées dans
le manifeste de campagne. Le protocole conserve `comparisonAuthority: none` : le calcul du
nombre de runs et le résumé descriptif n'autorisent aucune revendication de supériorité.

Au 2026-10-02, les baselines MBH-like/Lipson-like ne sont pas implémentées dans les
protocoles GVX et aucune campagne GVX holdout n'a été exécutée. Le dépôt contient une
campagne AGOW locale sur données synthétiques, sans holdout métier indépendant; elle ne
fournit pas un pilote représentatif pour paramétrer la puissance GVX. Avant exécution,
chaque campagne doit fournir les jeux train/holdout séparés, l'origine et le hash des
données, les modèles/outils et versions, le seed, les commandes, les budgets, ainsi que les
hypothèses d'effet et de variance. Les résultats doivent publier les intervalles,
exclusions et écarts au protocole; à défaut, l'état reste `not_run`.

Voir [ADR 0266](../adr/0266-plan-puissance-benchmarks-gvx.md).
