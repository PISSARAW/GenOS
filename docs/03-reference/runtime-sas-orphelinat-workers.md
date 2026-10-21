# Référence technique — Sas d'orphelinat pour workers

- **Statut** : Implémenté
- **ADR** : [0035-worker-orphanage-grace-latch](../adr/0035-worker-orphanage-grace-latch.md)
- **Concept** : [sas-orphelinat-workers-grace-latch](../01-concepts/sas-orphelinat-workers-grace-latch.md)
- **Implémentation** : `backend/src/services/daemon/reconciliation/orphanageService.js`, `backend/src/db/migrations/migrateWorkerOrphanageGrace.js`, `backend/src/services/agentRuntimeAdapter/missionReconcile.js`, `backend/src/services/daemon/reconciliation/reconcilerService.js`

---

## Contrat

Le sas d'orphelinat est un mécanisme de réconciliation interne, pas un outil MCP exposé. Seul le ResidentDaemon (gardien unique) peut piloter l'admission, la réclamation et le réapér via la table `worker_orphanage_grace` et le cycle de vie du worker.

### États et transitions

```
ACTIVE (worker en mission, parent valide)
   │ détection d'orphelinage (missionReconcile.js)
   ▼
ORPHAN_SUSPECT (admis au sas, budget gelé, TTL 5 min par défaut)
   │
   ├─ reclaimWorker (nouveau parent, preuve, avant TTL) ──► ACTIVE (réassigné)
   │
   └─ reapExpiredOrphans (sweep du reconciler, TTL expiré) ──► TERMINÉ
```

### Table `worker_orphanage_grace` (migration 109)

| Colonne | Type | Contrainte | Description |
|---------|------|------------|-------------|
| `worker_id` | TEXT | PRIMARY KEY | Identifiant du worker |
| `territory_id` | TEXT | NOT NULL | Territoire du worker |
| `former_parent_id` | TEXT | NOT NULL | Parent ayant causé l'orphelinage |
| `orphaned_at` | TEXT | DEFAULT `datetime('now')` | Horodatage d'entrée au sas |
| `grace_expires_at` | TEXT | NOT NULL | Échéance du TTL |
| `budget_frozen_at` | INTEGER | NOT NULL | Snapshot du budget à l'entrée |
| `reclaim_proof` | TEXT | | Preuve de réclamation (JSON) |
| `reclaimed_by` | TEXT | | Identifiant du nouveau parent |
| `status` | TEXT | CHECK `SUSPECT/RECLAIMED/EXPIRED` | État du sas |

Index :
- `idx_worker_orphanage_status` sur `(status, grace_expires_at)`
- `idx_worker_orphanage_territory` sur `(territory_id, status)`

### Signaux émis

| Signal | Émetteur | Contexte |
|--------|----------|----------|
| `WORKER_ORPHANED` | `admitWorker` | Worker entré au sas, budget gelé, TTL défini |
| `WORKER_RECLAIMED` | `reclaimWorker` | Worker réassigné à un nouveau parent |
| `WORKER_ORPHANAGE_EXPIRED` | `reapExpiredOrphans` | Worker terminé après expiration du TTL |

### Constantes

| Constante | Valeur | Rôle |
|-----------|--------|------|
| `DEFAULT_ORPHAN_TTL_MS` | 5 minutes | TTL par défaut avant expiration |
| Plafond TTL hard | 30 minutes | Pas de renouvellement au-delà |

---

## Services et fonctions

### `orphanageService.js`

| Fonction | Paramètres | Retour | Effet |
|----------|------------|--------|-------|
| `admitWorker(db, admission)` | `{ workerId, territoryId, formerParentId, ttlMs?, nowIso? }` | `{ admitted, workerId, graceExpiresAt, budgetFrozenAt }` | Insère/réinitialise une ligne `SUSPECT`, gèle le budget, émet `WORKER_ORPHANED` |
| `reclaimWorker(db, claim)` | `{ workerId, claimantId, proof }` | `{ reclaimed, claimantId }` ou `{ reclaimed: false, reason }` | Passe en `RECLAIMED`, met à jour `parent_agent_id`, émet `WORKER_RECLAIMED` |
| `reapExpiredOrphans(db, nowIso)` | `nowIso` | `{ reaped }` | Termine les workers dont `grace_expires_at` est dépassé |
| `isInOrphanage(db, workerId)` | `workerId` | `{ inOrphanage }` | Détecte si un worker est au sas en `SUSPECT` |

### `missionReconcile.js`

| Fonction | Comportement avant | Comportement après |
|----------|-------------------|-------------------|
| `reconcileDeadOrchestratorChildren` | `UPDATE ... SET status = 'terminated'` | `admitWorker(...)` au sas |
| `reconcileUntrackedWorkers` | `UPDATE ... SET status = 'terminated'` | `admitWorker(...)` au sas |

### `reconcilerService.js`

Le sweep périodique appelle `orphanageService.reapExpiredOrphans(db, scope.nowIso)` et expose le résultat sous `expiredOrphanedWorkers` dans le reçu de sweep.

---

## Schéma de données

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
CREATE INDEX IF NOT EXISTS idx_worker_orphanage_status
  ON worker_orphanage_grace(status, grace_expires_at);
CREATE INDEX IF NOT EXISTS idx_worker_orphanage_territory
  ON worker_orphanage_grace(territory_id, status);
```

---

## Intégration avec l'existant

| Composant existant | Relation avec le sas |
|-------------------|---------------------|
| `daemon_reconcile_suspects` (migration 056) | Historique/provenance secondaire ; le kind `orphan-worker` peut y être fiché |
| `garage_queue` / `garage_events` | Zone de staging avant exécution ; distincte du sas post-mortem |
| `trinity_worlds` | Marqué `terminated` pour l'orphelin (inchangé) |
| `ResidentDaemon` | Gardien unique du sas (capacité : « Réconcilier les ressources orphelines avec grace period et provenance ») |

---

## Limites de l'API

- Pas d'outil MCP exposé par défaut. Le ResidentDaemon opère en interne via base de données et signaux.
- Un outil `genos_worker_reclaim` sous lease peut être ajouté ultérieurement si une réclamation externe est nécessaire.
- La réclamation nécessite un `claimantId` et une `proof` ; pas de réassignation automatique sans preuve.
