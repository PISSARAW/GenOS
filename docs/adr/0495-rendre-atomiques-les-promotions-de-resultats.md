# ADR 0495 — Rendre atomiques les promotions de résultats

- **Statut** : Accepté et implémenté pour `bestKnownResultService`.
- **Date** : 2026-10-15
- **Domaine** : Cohérence de la mémoire de requête et promotion de champion.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0492, refus des résultats provisoires ; ADR 0493, snapshot de dépendances ; ADR 0494, scope workspace.

## Contexte

`storeCandidate` écrivait le dossier du problème avant le résultat puis pouvait
définir son champion dans une écriture ultérieure. Une panne entre ces requêtes
pouvait laisser un pointeur sans résultat. `promoteChampion` changeait ensuite
le statut de l'ancien champion avant le pointeur; une panne du second `UPDATE`
pouvait laisser le problème sans champion valide.

## Décision

Encadrer les écritures de `storeCandidate` par une transaction SQLite. Le dossier
est d'abord créé sans champion; candidat, statut de l'ancien champion et pointeur
sont validés ensemble. `promoteChampion` ouvre aussi une transaction lorsqu'il
est appelé indépendamment; l'appel depuis `storeCandidate` rejoint la transaction
active.

## Conséquences

### Positives

- Une erreur pendant l'insertion du résultat annule aussi la création du dossier.
- Une erreur pendant le déplacement du pointeur conserve le statut et le pointeur
  du champion précédent.
- Les tests injectent des erreurs avec des triggers SQLite et observent l'état
  après rollback.

### Négatives

- Les écritures de mémoire de requête sérialisent brièvement leurs transactions
  SQLite; elles peuvent attendre une autre écriture concurrente.
- Les connexions légères sans `exec()` gardent le comportement de compatibilité
  de `withTransaction` et n'apportent pas de rollback transactionnel.

## Alternatives

- Ajouter seulement des compensations applicatives après erreur : rejeté, car la
  compensation elle-même peut échouer.
- Conserver les écritures séparées : rejeté, car un crash laisse un état partiel.
