# ADR 0525 — Relier la preuve causale à la mémoire consolidée

- **Statut** : Accepté
- **Date** : 2026-10-15
- **Domaine** : Apprentissage causal, mémoire, preuve, provenance
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0019 — Socle épistémique du savoir ; ADR 0524 — Préserver la provenance lors de la consolidation mémoire

## Contexte

La boucle causale valide le reçu de qualité d'une action avant d'autoriser
l'apprentissage. Elle créait toutefois l'épisode à consolider à partir du seul
résultat numérique et omettait l'identité de l'action et la référence du reçu.
La politique de consolidation préservait les références qui lui étaient
fournies, mais cette voie ne lui en transmettait aucune. Le résultat promu ne
pouvait donc pas être retracé jusqu'à l'action et à sa vérification.

## Décision

La boucle causale relie l'épisode au `actionId` (ou à l'identifiant du reçu
d'action), transporte le type, l'entrée, l'observation, l'applicabilité et les
contre-exemples disponibles, puis ajoute le `receiptId` de qualité uniquement
après validation du reçu indépendant. La consolidation reste refusée si la
qualité n'est pas vérifiée. Le lien de provenance n'accorde pas de validation
supplémentaire : le reçu doit toujours passer ses gates avant usage.

## Conséquences

### Positives

- Les mémoires issues de la boucle causale conservent l'identité de leur action et la référence de la preuve qui a autorisé l'apprentissage.
- Le rappel peut présenter une mémoire en retraçant cette chaîne sans confondre provenance et certification.
- Le test de boucle vérifie à la fois le refus d'une qualité auto-déclarée et la transmission d'un reçu signé vers l'entrée consolidée.

### Négatives

- Les consommateurs peuvent recevoir davantage de métadonnées sur l'action source.
- Une référence reste dépendante de la disponibilité du reçu auquel elle renvoie.

## Alternatives

- Copier les références de l'action sans vérifier leur origine : rejeté, car une déclaration de l'action ne doit pas autoriser son propre apprentissage.
- Garder uniquement le score vérifié : rejeté, car le score perdrait son lien avec le reçu et l'action qui l'ont produit.
