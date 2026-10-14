# ADR 0508 — Refuser une intersection vide de lease

- **Statut** : Accepté et implémenté pour les contraintes de focus.
- **Date** : 2026-10-15
- **Domaine** : Autorité des outils et contraintes d'attention.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0490, autorité explicite sur les opérations sensibles.

## Contexte

`applyFocusProbe` intersectait le lease courant avec `allowedTools`, mais ne
remplaçait le lease que si l'intersection était non vide. Une contrainte sans
outil commun était donc ignorée et conservait tous les outils initiaux. Cela
transformait une contrainte plus stricte en maintien de l'autorité précédente.

## Décision

Toujours remplacer le lease par l'intersection calculée. Une intersection vide
signifie qu'aucun outil n'est autorisé pour cette mission. La contrainte de focus
ne peut jamais ajouter un outil absent du lease initial.

## Conséquences

### Positives

- Une contrainte incompatible échoue de façon restrictive au lieu de restaurer
  l'accès complet.
- Le test vérifie les intersections vide et non vide.

### Négatives

- Une erreur de configuration entre `allowedTools` et le lease du worker prive
  la mission d'outils; l'opérateur doit corriger la contrainte.

## Alternatives

- Ignorer la contrainte quand elle ne partage aucun outil : rejeté, car cela
  conserve une autorité plus large que celle demandée par la contrainte.
- Ajouter les outils demandés au lease initial : rejeté, car un mécanisme de
  restriction ne doit pas élargir l'autorité.
