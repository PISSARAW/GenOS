---
title: Pareto Selection for Versioned Cultural Propagules
date: 2026-09-26
status: accepted
authors: Bruney
decision-id: 0136
---

# ADR 0136 : sélection Pareto des propagules culturelles versionnées

## Contexte

La politique culturelle de migration réduisait nouveauté et fitness source à un
score `max(novelty, sourceFitness)`. Elle pouvait donc privilégier une seule
dimension, sélectionner des propagules non versionnées et perdre des candidats
qui représentaient un compromis non dominé.

## Décision

La politique `cultural` :

1. exige une culture versionnée (identifiant, version, lignée parente et
   provenance) ;
2. forme des fronts de Pareto sur nouveauté et fitness source, deux objectifs à
   maximiser ;
3. parcourt les fronts dans l'ordre de dominance, avec un départage stable par
   identifiant de propagule ;
4. retourne le numéro du front et les deux objectifs dans la décision de
   sélection.

Les autres politiques de migration gardent leurs règles propres. La sélection
ne prouve pas qu'une culture améliore le phénotype cible : ce résultat doit être
validé par l'évaluation locale du deme receveur avant promotion.

## Conséquences

- Les artefacts culturels incomplets ne sont pas transférés par la politique
  culturelle.
- Les compromis non dominés entre nouveauté et fitness restent éligibles.
- L'E2E POET → phénotype → mesure → rétention reste partiel ; aucun gain de
  fitness n'est inféré de la seule transmission.

## Alternatives

- Continuer avec un score scalaire : rejeté, il masque le compromis entre les
  objectifs.
- Traiter les cultures non versionnées comme des propagules : rejeté, faute de
  lignée et provenance vérifiables.
