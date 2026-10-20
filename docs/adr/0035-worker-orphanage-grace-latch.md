---
title: Worker Orphanage Grace Latch
date: 2026-10-20
status: accepted
authors: Bruney
decision-id: 0035
---

# ADR 0035 : Sas d'orphelinat pour workers

## Contexte

Quand un worker GenOS (`execution_mode = 'worker'`) perd son parent orchestrateur (apoptose, termination, crash) ou se retrouve sans suivi (pas de `runtime_pid`, pas de lease garage, pas de parent actif), `backend/src/services/agentRuntimeAdapter/missionReconcile.js` le passe directement en `status = 'terminated'`.

Ce comportement est trop brutal :

- Un worker peut être sain (budget ATP/hayflick valide, contrat de lease actif, processus vivant) alors que seul son parent a disparu temporairement.
- La destruction immédiate gaspille le worker et son budget sans valeur produite.
- Il n'existe aucun état intermédiaire, aucune traçabilité de l'orphelinage, aucune possibilité de réassignation.

Le registre de suspects existant (`daemon_reconcile_suspects`, migration 056) couvre déjà les ressources étrangères orphelines (`orphan-workspace`, `stuck-capsule`, `abandoned-branch`, etc.) avec grace period, mais il n'y a pas de kind `orphan-worker`, et le pipeline `detect → mark suspect → liveness → grace → receipt` n'est pas appliqué aux workers.

## Décision

Introduire un **sas d'orphelinat à durée déterminée** (orphanage grace latch) pour les workers, géré par le ResidentDaemon (seul gardien), intégré au pipeline d'autophagie existant.

### États du worker

```
ACTIVE (en mission, parent valide)
   │ détection d'orphelinage (parent mort/apoptotique,
   │  pas de runtime_pid, pas de lease garage actif)
   ▼
ORPHAN_SUSPECT (budget gelé, TTL démarré, signal WORKER_ORPHANED émis)
   │
   ├─ réclamation valide par nouveau parent avant TTL ───► ACTIVE (réassigné)
   │
   └─ expiration du TTL sans réclamation ───────────────► TERMINÉ (reçu de provenance)
```

### Règles d'or

1. **Un seul gardien** : seul le ResidentDaemon peut admettre, réclamer ou réapér un worker orphelin. Aucun autre composant ne peut créer ou prolonger un orphelin.
2. **Budget gelé** : dès l'entrée au sas, le `current_budget` du worker est snapshot et gelé. Le worker ne consomme plus rien pendant son séjour.
3. **TTL impitoyable** : pas de renouvellement. Un TTL expiré = termination définitive. Valeur par défaut 5 minutes, plafond hard 30 minutes.
4. **Pas d'état permanent** : il n'existe pas de statut `orphan_worker` durable. Le worker est soit `ACTIVE`, soit `ORPHAN_SUSPECT` (transitoire), soit `TERMINÉ`.
5. **Réclamation prouvée** : un nouveau parent doit présenter une preuve de compatibilité (contrat, territoire, signature) pour réclamer le worker.

### Données

Nouvelle table `worker_orphanage_grace` :

```sql
CREATE TABLE IF NOT EXISTS worker_orphanage_grace (
  worker_id TEXT NOT NULL PRIMARY KEY,
  territory_id TEXT NOT NULL,
  former_parent_id TEXT NOT NULL,
  orphaned_at TEXT NOT NULL DEFAULT (datetime('now')),
  grace_expires_at TEXT NOT NULL,
  budget_frozen_at INTEGER NOT NULL,
  reclaim_proof TEXT,
  reclaimed_by TEXT,
  status TEXT NOT NULL DEFAULT 'SUSPECT'
    CHECK (status IN ('SUSPECT', 'RECLAIMED', 'EXPIRED'))
);
```

Réutilisation de `daemon_reconcile_suspects` pour l'historique/provenance avec un kind `orphan-worker` (fichage côté daemon, pas de mutation du worker lui-même).

### Intégration

- `missionReconcile.js` : `reconcileDeadOrchestratorChildren` et `reconcileUntrackedWorkers` admettent le worker au sas (via `orphanageService.admitWorker`) au lieu de le terminer directement. `reconcileOrphanedRunning` ne concerne que les orchestrateurs, inchangé.
- `reconcilerService.js` : le sweep périodique appelle `orphanageService.reapExpiredOrphans` pour terminer les TTL expirés.
- `orphanageService.js` (nouveau, dans `backend/src/services/daemon/reconciliation/`) : `admitWorker`, `reclaimWorker`, `reapExpiredOrphans`, `isInOrphanage`.

## Alternatives rejetées

### 1. Orphelinat permanent (asile sans TTL)

Rejeté : viole la philosophie d'autophagie fail-closed de GenOS. Deviendrait un cimetière de ressources oubliées, consommerait du budget indéfiniment, et complexifierait le modèle d'état.

### 2. Termination immédiate (comportement actuel)

Rejeté : trop brutal. Gaspille les workers sains dont seul le parent a disparu. Pas de traçabilité, pas de réassignation possible.

### 3. Kind `orphan-worker` dans `daemon_reconcile_suspects` uniquement

Rejeté comme solution autonome : le registre de suspects est passif (détection par `updated_at`, résolution par l'owner). Les workers orphelins nécessitent un pilotage actif (TTL, gel de budget, signal d'émission, réclamation). Une table dédiée `worker_orphanage_grace` est plus adaptée, avec le registre de suspects comme historique secondaire.

## Conséquences

### Positives
- Pas de gaspillage de worker sain : réassignation possible avant TTL.
- Traçabilité complète : qui était le parent, quand l'orphelinage, qui a réclamé, reçu de provenance à l'expiration.
- Budget protégé : gel pendant le séjour au sas.
- Respect du fail-closed : TTL hard, pas d'état permanent, expiration impitoyable.

### Négatives
- Complexité supplémentaire (nouvelle table, nouvel état transitoire, logique de réclamation).
- Risque de race condition si plusieurs parents tentent une réclamation concurrente (atténué par l'unicité de `worker_id` comme clé primaire et les transitions atomiques en base).
- Nécessite un ADR (présent document) et des tests de validation.

## Prochaines étapes

1. ✅ ADR 0035 (ce document)
2. Migration `migrateWorkerOrphanageGrace.js` (table `worker_orphanage_grace`)
3. Service `orphanageService.js` (`admitWorker`, `reclaimWorker`, `reapExpiredOrphans`)
4. Modification de `missionReconcile.js` (admission au sas)
5. Modification de `reconcilerService.js` (expiration TTL dans le sweep)
6. Tests : entrée au sas, réclamation avant TTL, rejet après TTL, expiration automatique, gel de budget
