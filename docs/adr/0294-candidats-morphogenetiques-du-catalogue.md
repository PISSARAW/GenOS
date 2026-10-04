# ADR 0294 — Candidats morphogénétiques issus du catalogue canonique

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : Morphogenèse, recherche de topologies et de variants
- **Décideurs** : équipe GenOS
- **Lié à** : ADR 0124, ADR 0133, ADR 0292

## Contexte

Le générateur de mutations proposait cinq topologies et quatre noms de variants
Trinity codés en dur. Il pouvait donc proposer un variant incompatible avec la
topologie de l'expression et n'explorait pas les huit familles documentées. Le
catalogue résout également quatre noms historiques de Métapopulation qui ne font
pas partie des 95 variants canoniques.

## Décision

Les mutations `ADD_NODE` et `CHANGE_TOPOLOGY` tirent leur topologie du registre
central et leur variant du catalogue de cette topologie. Pour Métapopulation,
la génération utilise `DOCUMENTED_VARIANTS` ; les quatre noms historiques
restent acceptés par les interfaces explicites existantes. `CHANGE_VARIANT`
requiert une expression de topologie et choisit un autre variant de la même
famille. Lors d'une séquence de mutations, chaque tirage lit l'expression
obtenue après le tirage précédent. Une mutation de variant ou de topologie
est exclue si la racine courante n'est pas une topologie.

Un test déterministe parcourt les 95 variantes canoniques comme possibilités
de création de nœud. Ce test établit la portée du générateur, sans prétendre
que chaque candidature est exécutable ou meilleure que les autres.

## Conséquences

### Positives

- Les nouvelles familles et variantes canoniques participent à la recherche
  sans modifier une liste locale de noms.
- Une mutation de variant ne fabrique plus un couple topologie/variant hors catalogue.
- Les choix historiques de Métapopulation restent compatibles avec les appels explicites.

### Négatives et limites

- La génération charge le registre au moment du tirage ; ses dépendances doivent
  rester disponibles dans le runtime concerné.
- Les autres opérateurs peuvent encore produire des candidats sans effet ou
  incompatibles. Leur validation, leur exécution et leur qualification
  expérimentale restent des portes distinctes.
- La présence d'un candidat parmi les 95 ne constitue pas une preuve de
  supériorité ni une autorisation de promotion.

## Alternatives

- Étendre les listes codées en dur : rejeté, car elles dériveraient à nouveau
  du catalogue.
- Tirer uniformément un variant global : rejeté, car le variant peut être
  incompatible avec la topologie choisie.
