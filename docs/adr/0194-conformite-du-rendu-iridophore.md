# Conformité du rendu iridophore au runtime

- **Statut** : Accepté
- **Date** : 2026-09-30
- **Domaine** : Runtime, rendu, cellules spécialisées, preuve
- **Décideurs** : GenOS
- **Lié à** : ADR 0193

## Contexte

Le rendu polymorphique local ne vérifiait pas que la sortie respectait le protocole
demandé par la perspective de l'observateur.

## Décision

`GenosEcosystem::render_polymorphic` vérifie la structure JSON ou les marqueurs de
format du TUI, du Markdown et du camouflage, puis émet un reçu versionné contenant la
perspective, la conformité et la taille de sortie.

## Conséquences

### Positives

- Les sorties runtime sont mesurées et leur forme est contrôlée par protocole.

### Négatives

- Cette vérification est syntaxique; elle ne prouve ni la qualité perceptuelle du rendu
  ni une propriété cryptographique du camouflage.

## Alternatives

- Renvoyer directement la chaîne sans vérification : rejeté, car les appelants ne
  disposent alors d'aucun indicateur de conformité.
