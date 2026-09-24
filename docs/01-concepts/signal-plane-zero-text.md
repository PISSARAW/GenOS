# Signal Plane — Transport Zero-Text Inter-Agents

> GenOS V3 implémente un transport zero-texte où les agents communiquent par
> signaux biomimétiques (ligands, potentiels, phéromones, plasmides, tenseurs)
> sans passer par le LLM. Le runtime réagit déterministiquement ; le LLM est une
> interruption, pas le substrat.

## Principe

```
Signal (ligand/voltage/pheromone/plasmid/tensor)
  ↓
Coalesce (anti-spam : période réfractaire + fenêtre 500ms)
  ↓
Match Receptor (évaluation déterministe, pas de LLM)
  ↓
  ├─ Receptor match → Action déterministe (0 LLM)
  │     ├─ emit_signal
  │     ├─ wake_worker (startMission)
  │     ├─ update_agent (updateAgent)
  │     └─ change_organization (changeOrganization)
  │
  └─ Aucun match → llmRequired=true → escalade cognitive
```

**Propriété clé** : un signal banal ne coûte aucun appel LLM. Seuls les signaux
ambigus ou sans récepteur déclenchent une interruption cognitive.

## Services

### SignalingTransportService

Point d'entrée principal : `publishSignal(params)`.

Pipeline d'exécution (ordre critique) :

1. **Validation** — type, payload size, rate limit
2. **Persistance** — `signal_blobs` (SQLite WAL)
3. **Coalesce** — anti-spam (période réfractaire 2s + fenêtre 500ms)
4. **Route** — destinataires via `collectiveSignalOrganizationRouter`
5. **EventBus** — notification push (après coalescing)
6. **Plasticité** — renforcement/dépression des canaux

```js
// Publication typique
await signalingTransportService.publishSignal({
  signalType: 'ligand',
  signalData: { concentration: 0.9, semanticType: 'DEPLOY_READY' },
  topic: 'deploy/auth',
  senderAgentId: 'orchestrator-1',
});
```

### SignalReceptorService

Registre de récepteurs avec actions déterministes.

```js
signalReceptorService.registerReceptor({
  id: 'deploy-receptor',
  targetLigand: 'DEPLOY_READY',
  threshold: 0.8,
  action: 'wake_worker',
  actionData: { workerId: 'worker-1', role: 'implementation' },
});
```

**Actions disponibles** :

| Action | Description | Dépendance ctx |
|--------|-------------|----------------|
| `emit_signal` | Cascade de signal | `ctx.publishSignal` |
| `wake_worker` | Réveille un agent | `ctx.startMission` |
| `update_agent` | Met à jour statut/tâche | `ctx.updateAgent` |
| `change_organization` | Change la topologie | `ctx.changeOrganization` |

Si une dépendance est absente, l'action renvoie `{ executed: false, reason: 'NO_*_FN' }`.

**Appel** : `matchAndDispatch(signal, ctx)` — renvoie `{ triggered, dispatched, llmRequired }`.

### SignalEventBus

EventEmitter singleton. Deux modes de souscription :

```js
// Source-based : signaux émis par l'agent A
signalEventBus.onAgent('agent-a', handler);

// Destination-based : signaux destinés à l'agent B (wake-up)
signalEventBus.onRecipient('agent-b', handler);

// Génériques
signalEventBus.onSignal(handler);
signalEventBus.onSignalType('ligand', handler);
signalEventBus.onTopic('deploy/auth', handler);
```

### SignalCoalescerService

Anti-spam biologique :

- **Période réfractaire** : 2s par (sender, topic)
- **Coalescing** : 500ms fenêtre — les signaux rapides sont bufferisés puis agrégés

```js
const result = signalCoalescer.coalesce({
  signalId: 'sig-1',
  signalType: 'ligand',
  topic: 'deploy',
  senderAgentId: 'orch-1',
});
// null si supprimé, { coalesced, coalescedCount, signals } sinon
```

### SynapticPlasticityService

Apprentissage Hebbien des canaux A→B :

| Outcome | Effet |
|---------|-------|
| `receptor_triggered` / `useful` | +0.10 (renforcement) |
| `no_effect` / `ignored` | -0.05 (dépression) |
| `suppressed` / `error` / `noise` | -0.15 (forte dépression) |

Les poids influencent le routage : les destinataires sont triés par poids décroissant
dans `collectiveSignalOrganizationRouter`.

### CollectiveSignalOrganizationRouter

Détermine les destinataires d'un signal :

- **Scope strict** : même organisation ET même projet que l'orchestrateur émetteur
- **Filtre** : `execution_mode = 'orchestrator'` (pas `status`)
- **Tri** : par poids de plasticité décroissant (canaux renforcés en premier)

### SignalPlaneSubscriber

**Nouveau (v3)** — consumer production de l'EventBus.

Sans ce service, l'EventBus est un émetteur orphelin. Le subscriber :

```js
const { registerWakeHandler } = require('./signalPlaneSubscriber');

// Un agent s'enregistre pour être réveillé
registerWakeHandler('worker-1', async (signal) => {
  // Logique de réveil : restart, reload config, etc.
});

// Démarrage au boot (appelé dans server.js)
startSignalPlaneSubscriber();
```

Le subscriber écoute `recipient:${agentId}` et dispatch aux handlers enregistrés.

## Schema DB

Migration v45 (`schema-next.js`) :

```sql
-- Signaux persistés
CREATE TABLE signal_blobs (
  signal_id TEXT NOT NULL,
  signal_type TEXT NOT NULL CHECK (...),
  signal_blob BLOB,
  content TEXT,
  topic TEXT,
  sender_agent_id TEXT,
  expires_at DATETIME,
  UNIQUE(signal_id)
);

-- Abonnements aux topics
CREATE TABLE signal_subscriptions (
  subscriber_agent_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  filter TEXT,
  PRIMARY KEY (subscriber_agent_id, topic)
);

-- Livraisons + ACK
CREATE TABLE signal_deliveries (
  signal_id TEXT NOT NULL,
  subscriber_agent_id TEXT NOT NULL,
  status TEXT CHECK (...),
  delivered_at DATETIME,
  seen_at DATETIME,
  acked_at DATETIME,
  PRIMARY KEY (signal_id, subscriber_agent_id)
);
```

**Pourquoi deux tables séparées ?** `signal_subscriptions` = abonnement (agent
s'intéresse au topic X). `signal_deliveries` = livraison (signal Y délivré à
l'agent Z). Anciennement fusionnées dans `signal_subs` — empêchait proprement
1 signal → 12 abonnés (PRIMARY KEY sur signal_id).

## Fichiers clés

| Fichier | Rôle |
|---------|------|
| `signalingTransportService.js` | Pipeline complet, persistance, coalescing, EventBus |
| `signalReceptorService.js` | Registre récepteurs, dispatch actions, matchAndDispatch |
| `signalEventBus.js` | EventEmitter push (onSignal, onAgent, onRecipient) |
| `signalCoalescerService.js` | Anti-spam réfractaire + fenêtre coalescing |
| `synapticPlasticityService.js` | Poids canaux, reinforce/depress/strongDepress |
| `collectiveSignalOrganizationRouter.js` | Routage destinataires, scope strict, tri plasticité |
| `signalPlaneSubscriber.js` | Consumer EventBus, registerWakeHandler, LLM escalation |
| `agentRoundService.js` | Continuation différentielle (buildContinuationContext) |

## Limites connues

- **EventBus local** : les workers d'autres processus Node ne reçoivent pas
  les notifications push (EventEmitter en mémoire). Pour le multi-process,
  un transport distribué (Redis, SQLite triggers + polling) serait nécessaire.
- **Coalescing en mémoire** : les buffers sont perdus au redémarrage.
- **LLM escalation** : le signal est loggé mais pas encore routé vers un
  service cognitif spécifique (TODO).

## Tests

| Test | Vérifie |
|------|---------|
| `test_signal_receptor_service.js` | Registre, matchAndDispatch, llmRequired |
| `test_signal_event_bus.js` | onSignal, onSignalType, onTopic, onAgent |
| `test_signal_pipeline_integration.js` | Pipeline complet persist→coalesce→dispatch→plasticity |
| `test_signal_actionneurs.js` | startMission/updateAgent/changeOrganization via ctx |
| `test_plasticity_tensor.js` | Poids, renforcement, compatibilité tenseurs |
| `test_semantic_loop_detector.js` | Détection boucles sémantiques |

Inclus dans `npm run test:validation` (profile `signalPlane`).
