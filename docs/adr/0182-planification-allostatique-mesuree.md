# ADR 0182 — Planifier depuis les variables allostatiques mesurées

- **Statut** : Accepté
- **Date** : 2026-09-30
- **Domaine** : Runtime Node, planification de mission
- **Décideurs** : GenOS maintainers
- **Lié à** : `docs/01-concepts/indicateurs-fonctionnels.md`, `shared/indicatorRegistry.json`

## Contexte

La préparation de mission appliquait déjà une posture de valence à partir de
drives, mais le snapshot ne conservait pas toutes les mesures interoceptives et
le service `allostaticObjectiveService` ne participait pas à la décision. Il
fallait relier explicitement les états machine mesurés au plan exécuté, et
séparer cet effet logiciel d'une affirmation de bénéfice sur les missions.

## Décision

Le snapshot de valence transporte les variables de
`machineInteroceptionService`. Dans `applyExecutionPolicy`, le runtime transmet
ce snapshot au planificateur allostatique : celui-ci calcule les objectifs,
borne le fanout sous pression de ressources et empêche les mutations sans
preuve lorsque l'intégrité ou la dérive l'exigent. Le rapport joint au plan
signale explicitement `outcomePrediction: unavailable` tant qu'aucune prédiction
post-action validée n'existe.

## Conséquences

### Positives

- Les valeurs machine mesurées participent à une posture concrète avant
  l'exécution de la mission.
- Le test actif/ablaté conserve une entrée identique et vérifie l'effet sur la
  politique de fanout et de mutation.
- La sortie garde les limites d'incertitude et n'est pas utilisée comme preuve
  de conscience.

### Négatives

- Les seuils de posture sont des choix d'ingénierie, pas des paramètres appris
  ni une théorie de l'allostase biologique.
- L'expérience locale ne mesure pas encore une meilleure viabilité réelle ni
  un effet généralisé ; un protocole de missions appariées reste nécessaire.

## Alternatives

- Laisser les mesures en audit sans les transmettre au plan : rejeté, car cela
  ne ferme pas le circuit mesure → action.
- Présenter le changement de fanout comme une amélioration prouvée : rejeté,
  car les résultats post-action ne sont pas encore mesurés.
