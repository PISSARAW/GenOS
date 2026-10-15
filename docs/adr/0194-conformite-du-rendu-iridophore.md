# Conformité du rendu iridophore au runtime

- **Statut** : Accepté, amendé et implémenté
- **Date** : 2026-09-30 (amendé le 2026-10-15)
- **Domaine** : Runtime, rendu, cellules spécialisées, preuve
- **Décideurs** : GenOS
- **Lié à** : ADR 0193

## Contexte

Le rendu polymorphique local ne vérifiait pas que la sortie respectait le protocole
demandé par la perspective de l'observateur.

## Décision

Le rendu traite le payload selon le protocole observateur : JSON conserve le contenu
comme une chaîne sérialisée; TUI et camouflage encodent les caractères de contrôle;
Markdown échappe la ponctuation ASCII et encode les séparateurs de ligne. Le
camouflage reste un décalage César déterministe, sans propriété cryptographique.
`GenosEcosystem::render_polymorphic` vérifie la structure JSON ou les marqueurs de
format, puis émet un reçu versionné contenant la perspective, la conformité et la
taille de sortie.

## Conséquences

### Positives

- Les sorties runtime sont mesurées et leur forme est contrôlée par protocole.
- Les tests de rendu vérifient JSON, ANSI, Markdown et camouflage avec un payload
  contenant des séquences terminales, des contrôles et une structure Markdown hostile.

### Négatives

- Cette vérification est syntaxique; elle ne prouve ni la qualité perceptuelle du rendu
  ni une propriété cryptographique du camouflage.
- L'échappement contraint l'injection de syntaxe dans ces formats; il ne valide pas
  le rendu visuel chez un terminal ou un moteur Markdown particulier.

## Alternatives

- Renvoyer directement la chaîne sans vérification : rejeté, car les appelants ne
  disposent alors d'aucun indicateur de conformité.
