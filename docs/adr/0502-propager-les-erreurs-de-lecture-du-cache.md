# ADR 0502 — Propager les erreurs de lecture du cache

- **Statut** : Accepté et implémenté pour la mémoire de requête.
- **Date** : 2026-10-15
- **Domaine** : Cohérence SQL, versionnement et résultats de cache.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0495, atomicité des écritures ; ADR 0500, preuve de réutilisation ; ADR 0501, pointeur champion scoped.

## Contexte

`getProblem`, `getChampion` et `nextVersion` avalaient certaines exceptions SQL
et les transformaient en `null` ou en version 1. Une panne de lecture pendant
`storeCandidate` pouvait ainsi masquer un problème d'état, et `nextVersion`
pouvait tenter une version incorrecte au lieu d'annuler.

## Décision

Les opérations distinguent une requête réussie sans ligne d'une erreur SQL.
Les erreurs sont propagées au caller; les absences normales sont normalisées en
`null`. L'insertion reste dans la transaction de `storeCandidate`, donc une
erreur de lecture de version annule toute tentative d'écriture.

## Conséquences

### Positives

- Une panne de SELECT du champion ne devient plus un miss silencieux.
- Une panne de `MAX(result_version)` ne crée pas un candidat avec une version
  de repli.
- Les tests injectent des erreurs de lecture du champion et de version et
  vérifient leur propagation ainsi que l'absence de problème orphelin.

### Négatives

- Les consommateurs voient maintenant les erreurs DB et doivent les traiter
  comme des échecs de lecture, plutôt que poursuivre avec un faux miss.

## Alternatives

- Traiter toute erreur comme une absence : rejeté, car l'absence et l'indisponibilité
  de la base ont des conséquences différentes.
- Utiliser la version 1 après une erreur de calcul : rejeté, car cela peut
  provoquer une collision ou contredire l'historique persisté.
