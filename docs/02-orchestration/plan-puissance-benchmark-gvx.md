# Plan de puissance pour les benchmarks GVX

`gvxBenchmarkProtocol` exige un `analysisPlan` (`primaryMetric`, `direction`) et un
`powerPlan` (`minimumEffectOfInterest`, `assumedStdDev`, `confidenceLevel`, `power`). Le
manifeste dérive `requiredReplicates` avec une approximation normale pour deux groupes
indépendants. Ce nombre borne les seeds requises par variante, cohorte et split train ou
holdout.

Les hypothèses de variance et d'effet doivent venir d'un pilote ou de données publiées dans
le manifeste de campagne. Le protocole conserve `comparisonAuthority: none` : le calcul du
nombre de runs et le résumé descriptif n'autorisent aucune revendication de supériorité.
Les baselines MBH-like/Lipson-like et les campagnes holdout empiriques restent à exécuter.

Voir [ADR 0266](../adr/0266-plan-puissance-benchmarks-gvx.md).
