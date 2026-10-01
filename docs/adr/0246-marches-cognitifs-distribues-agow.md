# ADR 0246 — Marchés cognitifs régionaux AGOW

- **Statut** : Accepté
- **Date** : 2026-10-01
- **Domaine** : AGOW, compétition, scalabilité
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0006, ADR 0240, ADR 0241

## Contexte

Le pool AGOW persistant reste central. La compétition plate devient coûteuse lorsque
le volume de candidats augmente. Morphogenesis sait déjà décrire plusieurs topologies,
mais AGOW doit garder l'autorité sur le contenu gagnant.

## Décision

Ajouter des marchés régionaux configurés à partir d'une morphologie fournie par
l'appelant : `a_team`, `trinity`, `biome`, `rhizome`, `syncytium` ou partition par
domaine. Chaque région exécute l'arbitrage AGOW existant avec une capacité locale; ses
gagnants entrent ensuite dans l'arbitrage global existant et dans l'ignition globale.
Un gagnant local seul ne s'embrase donc pas.

En mode `shadow`, les marchés émettent des reçus sans affecter la compétition plate.
Les modes `advisory`, `bounded` et `live` alimentent l'arbitrage global avec les seuls
gagnants régionaux. Chaque candidat retenu porte un chemin de marché et la référence
du reçu régional. Les reçus persistés gardent topology/version/proposant, compétiteurs,
gagnants et activation locale.

## Conséquences

### Positives

- La compétition locale compose plusieurs gagnants avant la compétition/ignition globale.
- La topologie reste un choix structurel; l'arbitrage décide des contenus.
- Les modes de déploiement permettent d'observer et comparer les marchés avant contrôle.

### Négatives

- Sans structure morphologique explicite, la partition par domaine est heuristique.
- Les gagnants locaux peuvent éliminer un candidat utile au marché global; la qualité
  de rappel doit être évaluée avant activation.
- La complexité est supérieure à la compétition plate; aucune amélioration de latence
  n'est présumée sans benchmark.

## Alternatives

- Découper par tranches de taille fixe : rejeté, car cela ignore les frontières de
  capacités et de topologies.
- Laisser Morphogenesis sélectionner les candidats : rejeté, car la structure du marché
  et la décision de contenu sont deux autorités distinctes.
