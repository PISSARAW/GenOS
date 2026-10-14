# ADR 0505 — Scoper les lectures de problème

- **Statut** : Accepté et implémenté pour la mémoire de requête.
- **Date** : 2026-10-15
- **Domaine** : Isolation workspace et données historiques de cache.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0494, clés de cache par workspace ; ADR 0501, pointeur champion lié au problème.

## Contexte

Les nouveaux dossiers utilisent une clé semantic ID hachée avec le workspace,
mais `getProblem(db, semanticId)` restait exporté sans scope. Cet accès pouvait
encore lire une ancienne ligne globale indexée par semantic ID brut.

## Décision

`getProblem` exige maintenant `scopeId` et calcule la clé scoped avant toute
lecture. L'absence de scope échoue fermé. Les lignes historiques à semantic ID
brut restent en base mais ne sont pas visibles via cette API; les autres
opérations internes utilisent la même clé scoped.

## Conséquences

### Positives

- L'API publique du service n'expose plus les anciennes lignes globales par
  simple connaissance du semantic ID.
- Les tests couvrent un accès autorisé, un scope différent et l'absence de scope.

### Négatives

- Les consommateurs doivent fournir le workspace avant de lire les métadonnées
  du problème.
- La migration historique n'est pas automatique; les anciennes lignes restent
  stockées mais inaccessibles par cette API.

## Alternatives

- Garder la lecture brute et compter sur le fait que les nouveaux IDs sont
  hachés : rejeté, car les entrées historiques restent présentes.
- Supprimer toutes les entrées historiques à la migration : rejeté, car leur
  suppression n'est pas nécessaire pour rendre cette API scoped.
