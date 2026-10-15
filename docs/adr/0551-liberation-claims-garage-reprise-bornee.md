# ADR 0551 — Libération des claims garage des workers terminés et reprise bornée

- **Statut** : Implémenté
- **Portée** : `backend/src/services/workerGarageService.js`, `agentRecovery/dispatchWorkerRecovery.js`, `agentRecovery/queueWorkerRecovery.js`, `agentRuntimeAdapter/missionExecution.js`
- **Dernière revue** : 2026-10-15

## Contexte

En qualification réelle, trois symptômes ont été prouvés :

1. Des membres A-Team/Syncytium sont tués au boot par `Garage claim is no longer executable` (bail expiré ou claim révoqué entre la réservation et l'exécution).
2. Après le kill réel d'un runtime worker, la reprise échoue 3 fois par `WORKER_RECOVERY_DISPATCH_FAILED: Worker identity belongs to a durable garage request`, puis la demande est abandonnée en silence.
3. 22 874 événements `WORKER_RECOVERY_DECISION` sont émis sans aucune action jusqu'au timeout.

La cause racine de (2) est double : `garageReservationGuard.assertReservation` refuse tout re-dispatch d'un `workerId` tant qu'une ligne `garage_queue` ouverte (`queued`, `claimed`, `running`) existe, et `enterIdleState` refuse de réarmer un worker tant que son claim est ouvert. Quand le worker meurt (`error`, `terminated`), personne ne solde son claim : le même-`workerId` est bloqué à jamais et la reprise même-identité (première tentative `mutate_worker`) échoue en boucle jusqu'à épuisement du budget `MAX_RECOVERY_DISPATCH_ATTEMPTS`, sans verdict terminal.

## Décision

1. **Libération des claims périmés** (`workerGarageService.releaseStaleWorkerClaims`) : avant chaque `reserveSlot` et chaque `enterIdleState`, les lignes ouvertes du worker sont soldées si le worker est terminal (`error`, `terminated`, `failed`, `apoptosis`), orphelin (ligne `agents` absente), ou si le bail/la deadline a expiré alors que le worker ne tourne plus. Une ligne soldée passe à `failed` (bail encore valide) ou `expired` (bail expiré), avec `error_text = 'worker_terminal_claim_released'` ; elle ne passe **jamais** à `completed`, donc aucune promotion n'est rejouée. Les lignes en phase de cycle capsule (`freezing`, `frozen`, `thawing`, `cancelling`) restent la propriété des services capsules et ne sont pas touchées.
2. **Reprise effective** (`dispatchWorkerRecovery`) : libération explicite du claim source avant persistance, garde anti double-promotion (une source déjà `completed` donne `WORKER_RECOVERY_REDUNDANT`, sans re-dispatch), et verdict terminal `WORKER_RECOVERY_EXHAUSTED` quand le budget `MAX_RECOVERY_DISPATCH_ATTEMPTS` est épuisé. La mission de reprise transporte le checkpoint tel quel (`resumeCheckpointId`, `resumedFrom`, `snapshots`) et le scope budgétaire tel quel (`modelBudgetScope`, produit du chantier A, jamais reformaté) ; un scope absent reste signalé par les validateurs `*SCOPE*` existants, jamais masqué en erreur `GARAGE`.
3. **File de reprise** (`queueWorkerRecovery`) : un échec plus récent (tentative supérieure, décision rejouable) rafraîchit la demande en attente au lieu d'être ignoré comme doublon, pour que la reprise reparte du checkpoint le plus frais.
4. **Boucle d'observation bornée** (`missionExecution`) : après extinction d'un runtime sans travail en attente, les contrôles sont comptés par agent, espacés par backoff exponentiel (1 s, 2 s, 4 s… plafonné à 30 s) puis clos définitivement après 5 contrôles oisifs avec un unique verdict `WORKER_RECOVERY_OBSERVATION_CLOSED`. `WORKER_RECOVERY_DECISION` n'est émis que lorsqu'un dispatch est réellement tenté.

## Conséquences

- Un re-dispatch du même `workerId` ou un remplaçant redevient possible après kill ; le travail validé (lignes `completed`, preuves) n'est ni supprimé ni re-promu.
- L'épuisement du budget de reprise et la clôture d'observation sont des verdicts explicites au lieu d'un abandon silencieux ou d'un spam télémétrique.
- Preuves : `backend/tests/test_garage_claim_release.js`, `backend/tests/test_worker_recovery_redispatch.js` (déterministes, sans LLM).

## Alternatives

- Renouvellement systématique des baux expirés au lieu de solder : rejeté, car un bail expiré d'un worker mort ne doit pas ressusciter une mission orpheline ; le magasin réenfile déjà les claims expirés des workers vivants via `expirePersistent`.
- Toucher `garageReservationGuard`/`garageRuntimeService` : hors périmètre du chantier ; la libération en amont (réserve et réarmement) suffit à débloquer les deux chemins.
