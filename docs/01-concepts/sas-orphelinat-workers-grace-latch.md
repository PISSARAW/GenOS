# Sas d'orphelinat pour workers (grace-latch)

- **Statut** : Implémenté
- **Portée** : cycle de vie des workers orphelins (parent orchestrateur disparu, pas de runtime PID, pas de lease garage actif)
- **Dernière revue** : 2026-10-20
- **ADR** : [0035-worker-orphanage-grace-latch](../adr/0035-worker-orphanage-grace-latch.md)
- **Implémentation** : `backend/src/services/daemon/reconciliation/orphanageService.js`, migration `backend/src/db/migrations/migrateWorkerOrphanageGrace.js`, tests `backend/tests/test_worker_orphanage.js`

---

## 1. Définition du domaine

Un *worker orphelin* est un agent GenOS (`execution_mode = 'worker'`, `status = 'running'`) dont le parent orchestrateur n'est plus joignable (apoptose, termination, erreur) ou qui n'est plus suivi (pas de `runtime_pid`, pas de lease garage actif, pas de parent actif). Avant ce concept, un tel worker était terminé immédiatement par `missionReconcile.js`, sans état intermédiaire ni traçabilité.

Le **sas d'orphelinat à durée déterminée** (orphanage grace-latch) est un mécanisme de réconciliation qui :
- admitted le worker dans un état transitoire `ORPHAN_SUSPECT`,
- gèle son budget (plus de consommation pendant le séjour),
- démarre un TTL impitoyable (5 minutes par défaut, pas de renouvellement),
- émet un signal `WORKER_ORPHANED`,
- permet la réclamation par un nouveau parent légitime avant expiration (réassignation),
- termine définitivement le worker à l'expiration du TTL (fail-closed).

Il n'existe **pas** d'état `orphan_worker` permanent dans `agents.status` : le sas est la source de vérité via la table `worker_orphanage_grace`.

---

## 2. Modèle mathématique ou logique

Machine à états à trois états :

```
ACTIVE (en mission, parent valide)
   │ détection d'orphelinage (parent mort/apoptotique,
   │  pas de runtime_pid, pas de lease garage actif)
   ▼
ORPHAN_SUSPECT (budget gelé, TTL démarré, WORKER_ORPHANED émis)
   │
   ├─ réclamation valide par nouveau parent avant TTL ──► ACTIVE (réassigné)
   │
   └─ expiration du TTL sans réclamation ───────────────► TERMINÉ (reçu de provenance)
```

Variables :
- `w` : worker, `p` : parent, `grace_expires_at` : échéance TTL,
- `budget_frozen_at` : snapshot du budget à l'entrée,
- `status ∈ {SUSPECT, RECLAIMED, EXPIRED}` dans `worker_orphanage_grace`,
- `TTL ≤ 30 min` (plafond hard), défaut 5 min.

Invariant : `∃1 ligne dans worker_orphanage_grace par worker_id` (clé primaire). Un worker ne peut être admis qu'une fois à la fois ; une nouvelle admission réinitialise le TTL (idempotence).

---

## 3. Analogies biologiques et limites réelles

L'orphelinat évoque un sas de transition pour un organisme dont le support hôte a disparu : mise en survie minimale, attente d'un nouvel hôte, autolyse si aucun récepteur ne se manifeste dans le délai. C'est une **métaphore d'organisation**, pas une fonctionnalité biologique prouvée. Le gel du budget n'est pas un métabolisme réel ; c'est une contrainte logique persistée en base.

Limite : le TTL est une décision administrative, pas un émergence biologique. Il ne doit pas être présenté comme un mécanisme de survie autonome.

---

## 4. Cas d'usage et objectifs métier

| Cas d'usage | Objectif |
|-------------|----------|
| Parent orchestrateur crash temporaire | Éviter de détruire un worker sain dont seul le parent a disparu ; le réassigner à un nouveau parent avant TTL. |
| Worker sans suivi (pas de PID, pas de lease) | Ficher le worker en suspicion plutôt que de le terminer aveuglément ; tracer qui l'a orpheliné et quand. |
| Budget préservé | Ne pas consommer le budget ATP/hayflick d'un worker inactif pendant le séjour au sas. |
| Fail-closed par défaut | Un orphelin jamais réclamé est terminé à l'expiration : pas de cimetière de ressources. |

Objectif métier : réduire le gaspillage de workers tout en conservant la traçabilité (provenance) et la sûreté (expiration impitoyable).

---

## 5. Exemples concrets

**Exemple 1 — Réassignation réussie.** Un `resident_daemon` meurt (apoptose). Ses workers passent au sas. Un nouvel orchestrateur réclame l'un d'eux avec une preuve de compatibilité (contrat, territoire, signature) avant 5 minutes. Le worker repasse `ACTIVE` sous le nouveau parent, son budget gelé est conservé.

**Exemple 2 — Expiration par TTL.** Un worker orphelin n'est réclamé par personne. À `grace_expires_at`, le sweep du reconciler passe le worker en `TERMINÉ`, inscrit `EXPIRED` dans `worker_orphanage_grace`, émet `WORKER_ORPHANAGE_EXPIRED` et persiste un reçu de provenance.

**Exemple 3 — Rejet après TTL.** Une demande de réclamation arrivant après `grace_expires_at` retourne `reclaimed: false, reason: ttl-expired`.

---

## 6. Schéma ou diagramme

```
Détection (missionReconcile.js)
      │
      ▼
orphanageService.admitWorker()
      │
      ├─ INSERT worker_orphanage_grace (SUSPECT, TTL, budget gelé)
      ├─ signal WORKER_ORPHANED
      │
      ├─ reclamation valide (reclaimWorker) ──► RECLAIMED ──► ACTIVE
      │                                       (parent mis à jour)
      │
      └─ TTL expiré (reapExpiredOrphans dans le sweep) ──► EXPIRED ──► TERMINÉ
                                                      (reçu de provenance)
```

---

## 7. Architecture technique

### Composants

| Composant | Fichier | Rôle |
|-----------|---------|------|
| Migration | `backend/src/db/migrations/migrateWorkerOrphanageGrace.js` (109) | Crée la table `worker_orphanage_grace` |
| Service gardien | `backend/src/services/daemon/reconciliation/orphanageService.js` | `admitWorker`, `reclaimWorker`, `reapExpiredOrphans`, `isInOrphanage` |
| Réconciliation workers | `backend/src/services/agentRuntimeAdapter/missionReconcile.js` | Admet les orphelins au sas au lieu de les terminer |
| Reconciler | `backend/src/services/daemon/reconciliation/reconcilerService.js` | Expiration TTL dans le sweep périodique |
| Tests | `backend/tests/test_worker_orphanage.js` | 6 scénarios |

### Table `worker_orphanage_grace`

```sql
worker_id TEXT PRIMARY KEY,
territory_id TEXT NOT NULL,
former_parent_id TEXT NOT NULL,
orphaned_at TEXT DEFAULT (datetime('now')),
grace_expires_at TEXT NOT NULL,
budget_frozen_at INTEGER NOT NULL,
reclaim_proof TEXT,
reclaimed_by TEXT,
status TEXT CHECK (status IN ('SUSPECT', 'RECLAIMED', 'EXPIRED'))
```

### Règles d'autorité (gardien unique)

Seul le **ResidentDaemon** détient le lease d'admission, de réclamation et de réapér. Aucun autre composant ne peut créer ou prolonger un orphelin. Le statut `agents.status` n'est **pas** modifié en `orphan_suspect` (pas de nouveau statut dans la contrainte CHECK existante) : le sas est la source de vérité.

### Intégration au pipeline existant

- `missionReconcile.js` : `reconcileDeadOrchestratorChildren` et `reconcileUntrackedWorkers` appellent `orphanageService.admitWorker(...)` au lieu de `UPDATE ... SET status = 'terminated'`.
- `reconcilerService.js` : `sweep(...)` appelle `orphanageService.reapExpiredOrphans(db, nowIso)` pour terminer les TTL expirés ; résultat exposé comme `expiredOrphanedWorkers` dans le reçu de sweep.

---

## 8. Processus d'exécution ou de validation

### Validation unitaire (`test_worker_orphanage.js`)

Six scénarios couverts, tous passés :

1. **Admission** : budget gelé, statut `SUSPECT`, signal `WORKER_ORPHANED` émis.
2. **Réclamation avant TTL** : `reclaimed: true`, `parent_agent_id` mis à jour, statut `RECLAIMED`, signal `WORKER_RECLAIMED`.
3. **Rejet après TTL** : `reclaimed: false`, `reason: ttl-expired`.
4. **Expiration automatique** : `reapExpiredOrphans` termine le worker (`TERMINÉ`), statut `EXPIRED`, signal `WORKER_ORPHANAGE_EXPIRED`.
5. **Idempotence** : admission double = une seule ligne, TTL réinitialisé.
6. **Détection** : `isInOrphanage` retourne `true`/`false` correctement.

### Suites de régression (toutes passées)

- `npm --prefix backend run test:daemon` — 43/43 (inclut `test_daemon_reconciler.js` et `test_daemon_reconciler_extended.js`)
- `npm --prefix backend run test:validation` — 57 PASSED, 0 FAILED
- `python scripts/ci/check_code_quality.py --strict` — 0 violation sur les fichiers modifiés (les 4 violations signalées sont pré-existantes sur `genos-orchestrate.cjs` et `missionExecution.js`)

---

## 9. Comparaison avec le marché

La plupart des orchestrateurs de workers (K8s, Celery, Temporal) terminent les tâches orphelines dès la détection de la perte du parent, ou les replacent automatiquement sans état intermédiaire traçable. Le sas GenOS se distingue par :
- un **gel explicite du budget** pendant le séjour,
- un **TTL impitoyable** (pas de renouvellement, pas d'état permanent),
- une **réclamation prouvée** (pas de réassignation implicite),
- une **provenance complète** (qui était le parent, quand, qui a réclamé, reçu à l'expiration).

---

## 10. Limites, garde-fous, non-objectifs

### Limites

- Le TTL est une constante administrative (5 min défaut, 30 min plafond), non adaptative.
- Pas de réclamation concurrente gérée par priorité : l'unicité de `worker_id` comme clé primaire sérialise les écritures ; les races sont résolues par la base (dernier `UPDATE` gagne, mais seule la première réclamation valide passe car le statut sort de `SUSPECT`).
- Le ResidentDaemon n'a pas `filesystem_write` : il agit uniquement via base de données et signaux, il ne peut pas exécuter le worker lui-même.

### Garde-fous

- **Budget gelé** : `budget_frozen_at` snapshoté à l'admission ; le worker ne consomme plus rien pendant le séjour.
- **TTL impitoyable** : pas de prolongation. Expiration = termination définitive.
- **Pas d'état permanent** : pas de statut `orphan_worker` dans `agents.status`.
- **Fail-closed** : par défaut le worker est condamné ; la réclamation est l'exception prouvée.

### Non-objectifs

- Pas d'orphelinat permanent (asile sans TTL) : rejeté (violerait l'autophagie fail-closed de GenOS).
- Pas de réassignation automatique sans preuve : une réclamation nécessite un `claimantId` et une `proof`.
- Pas d'exposition MCP obligatoire : le ResidentDaemon opère en interne ; un outil `genos_worker_reclaim` sous lease peut être ajouté ultérieurement si nécessaire.

---

## Voir aussi

- [ADR 0035 — Sas d'orphelinat pour workers](../adr/0035-worker-orphanage-grace-latch.md)
- [ADR 0034 — Écologie de daemons résidents](../adr/0034-resident-daemon-ecology.md) (capacité "Réconcilier les ressources orphelines avec grace period et provenance")
- [Migration 056 — registre de suspects du Reconciler](../backend/src/db/migrations/migrateDaemonSuspects.js) (table `daemon_reconcile_suspects`, kinds existants : `orphan-workspace`, `stuck-capsule`, `abandoned-branch`)
- [Garage Fabric](../02-orchestration/topologies/garage-fabric.md) (zone de staging des workers avant exécution, distincte du sas d'orphelinat post-mortem)
