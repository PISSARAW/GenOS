# ADR 0248 — Trajectoires causales dans la mémoire autobiographique

- **Statut** : Accepté
- **Date** : 2026-10-01
- **Domaine** : AGOW, mémoire autobiographique, provenance causale
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0007, ADR 0239, ADR 0244, ADR 0245

## Contexte

Le store de trajectoires AGOW conserve des références utiles à la procéduralisation,
mais il n'alimente pas les épisodes autobiographiques existants. Copier tous les
payloads augmenterait le coût et risquerait de confondre événements simulés et réels.

## Décision

Ajouter un adaptateur qui projette une trajectoire réelle en épisode
`agow_causal_trajectory` via `autobiographicalMemory/episodeStore`. Il conserve des
identifiants de frames, candidats gagnants/perdants, queries, actions, outcomes, preuves,
attributions soi/monde, reçus contrefactuels/de marché, et événements de procéduralisation
ou décompilation sous les sections JSON déjà prévues de l'épisode.

Les valeurs sont des références compactes, pas des copies de documents ou d'artefacts.
La trajectoire source doit être réelle; les références de simulations restent explicitement
dans `counterfactualRefs`. La réponse de capture fournit l'identifiant d'épisode.

## Conséquences

### Positives

- La mémoire autobiographique peut relier décisions, outcomes et mécanismes AGOW.
- Les épisodes réutilisent le schéma et la rétention existants.
- Les références contrefactuelles restent distinguées des événements vécus.

### Négatives

- L'adaptateur dépend de la complétude des références fournies par l'intégrateur.
- Le schéma d'épisode est flexible JSON; les lecteurs doivent connaître ces clés.

## Alternatives

- Dupliquer les payloads complets d'AGOW dans les épisodes : rejeté pour réduire la
  rétention de contenu et maintenir une source canonique par artefact.
