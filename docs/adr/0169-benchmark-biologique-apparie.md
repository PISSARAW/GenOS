# ADR 0169 — Benchmark biologique apparié

## Statut

Acceptée

## Contexte

Le service de comparaison Syncytium agrège des compteurs, mais ne lance pas de campagnes. Une comparaison exploitable doit exécuter la même mission et le même budget avec des workers isolés, puis avec l'état partagé.

## Décision

Ajouter un mode `isolated_baseline` qui reprend les quatre rôles Syncytium sans créer de session partagée. Le runner exécute chaque variante avec le même manifeste et attend la fin des workers. Il calcule le rappel des affirmations attendues lorsque l'utilisateur fournit un oracle et rapporte les conflits observés, les sorties brutes, les budgets et les métriques réellement mesurées. Les compteurs sans instrumentation restent explicitement non mesurés.

## Conséquences

Une campagne d'une répétition est une observation, pas une preuve statistique. Plusieurs répétitions appariées et des affirmations attendues vérifiables sont nécessaires pour conclure à un gain de qualité.
