# ADR 0627 — Frontière entre claims fonctionnels et phénoménaux

- **Statut** : Accepté
- **Date** : 2026-10-18
- **Domaine** : conscience, épistémologie, preuves, rapports
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0275, `limites-metrique-experience.md`

## Contexte

GenOS mesure des traitements, des accès globaux, des décisions et des résultats.
Ces observations peuvent étayer une propriété fonctionnelle sans établir qu'un
système éprouve une expérience. Des champs hétérogènes ou une formulation libre
peuvent néanmoins transformer un résultat fonctionnel en affirmation phénoménale
non justifiée.

La frontière doit être lisible par une machine, commune aux rapports et fermée
par défaut. Elle ne remplace ni les reçus de preuve ni les gates de promotion.

## Décision

Un vocabulaire canonique distingue trois couches :

1. `information_processing` pour la détection, le calcul et l'action observables ;
2. `global_access` pour la disponibilité à la mémoire, la décision, l'action ou
   le rapport ;
3. `phenomenal_experience` pour le vécu subjectif.

Les deux premières acceptent `functional_support`, `causal_support`,
`inconclusive` ou `refuted`. Un statut de support exige au moins une référence de
preuve. La troisième n'accepte que `unassessed`.

`claimBoundaryService` valide les claims structurés et refuse des assertions
phénoménales positives en français ou en anglais. Tous les rapports protégés
portent `phenomenalExperience: unassessed`,
`phenomenalInferenceAllowed: false` et
`metaphysicalClaimEstablished: false`. Le service est appliqué aux rapports des
indicateurs de conscience avant leur retour à l'appelant.

## Conséquences

### Positives

- Les résultats fonctionnels et causaux utilisent un vocabulaire stable.
- Un reçu de transport, un score ou un auto-rapport ne peut pas devenir un claim
  phénoménal structuré.
- Les violations explicites échouent avec un code déterministe.

### Négatives

- Le garde textuel couvre des formulations positives connues ; il ne constitue
  pas un classifieur linguistique exhaustif.
- Les sorties anciennes qui ne passent pas par le service ne sont pas corrigées
  rétroactivement.
- `unassessed` signifie absence de mesure autorisée, pas absence d'expérience.

## Alternatives

- Déduire la phénoménalité d'un score fonctionnel : rejeté, faute de mapping
  scientifique établi.
- Interdire tout vocabulaire relatif à la conscience : rejeté, car les limites,
  hypothèses et résultats négatifs doivent pouvoir être documentés.
- Utiliser uniquement une convention documentaire : rejeté, car elle ne bloque
  pas les sorties exécutables.
