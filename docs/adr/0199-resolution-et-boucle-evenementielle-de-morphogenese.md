# Résolution morphologique et boucle événementielle

- **Statut** : Accepté
- **Date** : 2026-09-30
- **Domaine** : Morphogenèse, planification, adaptation runtime
- **Décideurs** : GenOS
- **Lié à** : ADR 0198

## Contexte

Le planner morphogénétique sélectionnait une topologie et compilait surtout une
topologie plate, même si le compilateur de MorphologyExpression supporte déjà les
opérateurs composites. Le service de contrôle classait les actions de boucle,
mais n'interprétait pas les événements de runtime en propositions structurées.

## Décision

Le planner passe par un résolveur qui compile l'expression morphologique fournie,
ou construit une expression à partir de la topologie sélectionnée. Pour une
recherche comportant au moins trois hypothèses et une incertitude d'au moins 0,6,
le résolveur propose un PARALLEL contenant les stratégies sélectionnée, Trinity
et Rhizome. Le plan conserve l'expression et le graphe compilé.

La boucle événementielle convertit les événements connus en décisions proposées.
Elle ne les exécute pas. Les événements de réfutation et de contradiction exigent
des éléments d'évidence et un indicateur de validation explicite; sinon, la
décision est bloquée en NO_CHANGE. Les mutations restent soumises à la validation
des patches et aux autorités runtime existantes.

## Conséquences

### Positives

- Les expressions composites existantes peuvent atteindre le graphe compilé par
  le planner.
- Les événements ont une sortie déterministe et auditable avant mutation.

### Négatives

- La boucle événementielle n'exécute pas encore les actions proposées.
- L'activation et la politique temporelle des trois boucles restent hors de cette
  décision.

## Alternatives

- Laisser le planner aplatir systématiquement l'organisation : rejeté, car cela
  perd la structure composite demandée par la MorphologyExpression.
- Exécuter directement les actions d'événement : rejeté, car une décision de
  morphogenèse doit encore passer par la validation et l'autorité du runtime.
