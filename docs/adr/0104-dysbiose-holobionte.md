# ADR 0104 — Détection de dysbiose Holobionte

- **Statut** : Accepté
- **Date** : 2026-09-25
- **Domaine** : Holobionte, santé, résilience
- **Décideurs** : GenOS
- **Lié à** : ADR 0056, ADR 0060, ADR 0097

## Contexte

La concentration des ressources et dépendances, l'activité nuisible, les conflits
et la pression immunitaire peuvent s'accumuler tandis que la redondance baisse.
Les rapports de contribution actuels classent une relation individuelle, mais ne
résument pas ces signaux de santé à l'échelle de l'organisme.

## Décision

Le détecteur calcule un risque heuristique borné à partir de six signaux normalisés :
les cinq pressions positives moins la redondance fonctionnelle, divisées par cinq.
Il produit les états `STABLE`, `WATCH` ou `ALERT` et cite les signaux extrêmes.
Le résultat informe la boucle de santé mais ne déclenche aucune action automatique.

## Conséquences

### Positives

- Les principales formes de déséquilibre sont réunies dans un rapport explicable.
- Le score tient compte de la redondance et ne dépasse jamais l'intervalle `[0, 1]`.

### Négatives

- Les seuils sont heuristiques et doivent être validés par des benchmarks longitudinaux.
- Les consommateurs doivent fournir les signaux mesurés; les signaux absents ne sont pas devinés.

## Alternatives

- Exécuter une sanction directement au dépassement du seuil : rejeté, car le score n'est pas une preuve suffisante d'une violation contractuelle.
