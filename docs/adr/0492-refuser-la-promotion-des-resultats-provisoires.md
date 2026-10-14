# ADR 0492 — Refuser la promotion des résultats provisoires

- **Statut** : Accepté et implémenté pour la transition de champion.
- **Date** : 2026-10-15
- **Domaine** : Mémoire de requête, champion courant et promotion des résultats.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0480, preuve de rejeu liée au run ; ADR 0490, autorité de mutation bornée.

## Contexte

`bestKnownResultService.storeCandidate` promouvait par défaut toute nouvelle
ligne, quel que soit son statut. Un résultat `PROVISIONAL` pouvait devenir le
champion et marquer le résultat `VERIFIED` précédent `SUPERSEDED`. L'entrée
initiale de `request_problems` pouvait aussi pointer sur un résultat provisoire.

## Décision

Un candidat ne devient champion automatiquement que si son statut est
`VERIFIED` et que `promote` n'est pas désactivé. `promoteChampion` recharge la
ligne et confirme son statut et son `semantic_id` avant de modifier le pointeur.
Un candidat provisoire ne remplace pas et ne supersede pas le champion existant;
une requête sans champion vérifié garde un pointeur nul.

## Conséquences

### Positives

- Le stockage d'un résultat provisoire ne détruit plus le meilleur résultat
  vérifié existant.
- Les appels directs à `promoteChampion` refusent les statuts non vérifiés et
  les résultats liés à un autre problème.

### Négatives

- Ce service fait encore confiance au statut `VERIFIED` transmis par son
  producteur; il ne valide pas lui-même des reçus indépendants ou des résultats
  de rejeu. Son intégration à un vérificateur reste requise avant de présenter
  cette voie comme une preuve complète avant promotion.

## Alternatives

- Promouvoir tout candidat par défaut : rejeté, car un résultat provisoire
  pouvait invalider un champion vérifié.
- Refuser tous les champions : rejeté pour cette correction locale, car les
  résultats marqués `VERIFIED` restent pris en charge; la vérification
  indépendante de leur statut reste un travail séparé.
