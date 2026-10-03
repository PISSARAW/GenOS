# ADR 0285 — Transmettre les profils Pareto jusqu'au comparateur

## Statut

Acceptée.

## Contexte

Les mondes recevaient un axe Pareto dans leur prompt, mais la barrière de comparaison ne transmettaient pas le design sélectionné au service Pareto. Les sorties de comparaison ne pouvaient donc pas prouver quels profils avaient été pris en compte.

## Décision

La sélection du variant est transmise au comparateur. Pour `pareto_orthogonal`, les profils qualité, efficacité et risque sont reconstruits à partir du design effectif, puis envoyés au service Pareto. Le front reste calculé sur les dimensions mesurées en commun; les profils pondérés sont conservés dans le résultat d'audit.

## Conséquences

Un prompt contenant des axes sans vecteurs et receipts vérifiés ne produit toujours pas de front. Les reçus de comparaison exposent les trois profils utilisés.
