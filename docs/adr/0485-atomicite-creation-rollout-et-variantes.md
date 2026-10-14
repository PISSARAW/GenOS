# ADR 0485 — Cohérence des métriques et de l'état du rollout

- **Statut** : Accepté et implémenté.
- **Date** : 2026-10-14
- **Domaine** : Rollouts, métriques comparatives et persistance.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0482, atomicité des mesures et décisions de rollout.

## Contexte

Trois incohérences pouvaient fausser une décision. La création écrivait le
rollout avant ses compteurs de variantes, sans transaction. Les erreurs d'une
variante pouvaient dépasser les requêtes reçues, car la validation n'utilisait
pas la valeur validée de `requests`. Enfin, la décision comparait les variantes
même si certaines n'avaient pas atteint le minimum d'échantillon; un contrôle
vide pouvait alors être traité comme gagnant ou perdant.

## Décision

La route relit la release dans son scope tenant et crée le rollout ainsi que
toutes ses lignes de variantes dans une transaction `BEGIN IMMEDIATE`. Une
erreur sur une insertion annule l'ensemble. La validation impose
`0 <= errors <= requests`. La décision n'effectue la comparaison que lorsque
chaque variante configurée a atteint `slo.minRequests`; sinon elle reste en
pause avec `insufficient_comparison_sample`. L'identifiant du rollout n'est
renvoyé qu'après validation de la transaction.

## Conséquences

### Positives

- Tout rollout persisté possède l'ensemble complet de ses lignes de variantes.
- L'autorisation tenant et l'insertion partagent le même instant transactionnel.
- Une erreur partielle ne laisse pas de rollout orphelin.
- Une métrique invalide ne peut pas augmenter les erreurs au-delà des requêtes.
- Un gagnant n'est pas sélectionné à partir d'un échantillon incomplet.

### Négatives

- Les créations de rollouts sont sérialisées avec les autres écritures SQLite.

## Alternatives

- Supprimer le parent après une erreur d'insertion : rejeté, car le nettoyage
  pourrait lui-même échouer et ne couvre pas proprement les variantes déjà écrites.
- Conserver les insertions indépendantes : rejeté, car une panne produit un état
  incomplet consultable.

## Vérification

`node backend/tests/test_release_operations.js` injecte un échec sur l'insertion
d'une variante et vérifie l'annulation complète. Le même scénario vérifie le
rejet `errors > requests` et la pause lorsque l'une des variantes ne possède pas
assez de mesures pour être comparée.
