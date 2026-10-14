# ADR 0503 — Mémoriser la migration mémoire par connexion

- **Statut** : Accepté et implémenté pour la mémoire de requête.
- **Date** : 2026-10-15
- **Domaine** : Latence SQLite et initialisation concurrente.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0495, transactions de mémoire ; ADR 0502, propagation des erreurs SQL.

## Contexte

Chaque accès à `bestKnownResultService` exécutait de nouveau la migration
idempotente `migrateRequestMemory`, qui soumet plusieurs DDL de création de
tables et d'index. Ces DDL répétés occupaient le chemin de lecture et pouvaient
entrer en concurrence avec les opérations SQLite.

## Décision

Mémoriser la promesse de migration dans un `WeakMap` indexé par la connexion DB.
Les appels simultanés réutilisent la même promesse. Si la migration échoue, son
entrée est retirée afin qu'un appel ultérieur puisse réessayer; une connexion
différente reçoit une initialisation propre.

## Conséquences

### Positives

- Un handle DB réussi n'exécute les DDL qu'une fois au lieu de les répéter à
  chaque lecture ou écriture de résultat.
- Les requêtes concurrentes au premier accès ne lancent qu'une migration.
- Le test vérifie le partage concurrent et la possibilité de réessayer après
  une migration échouée.

### Négatives

- Un changement de schéma à chaud sur un handle déjà initialisé requiert une
  migration centrale distincte ou un redémarrage du handle.
- La promesse ne remplace pas les migrations de version du schéma; elle ne
  couvre que la création idempotente de la mémoire de requête.

## Alternatives

- Relancer les DDL pour chaque accès : rejeté, car le schéma n'évolue pas par
  lecture et les commandes ajoutent du travail sur le chemin chaud.
- Garder un cache global fort : rejeté, car il conserverait les connexions
  fermées en mémoire.
