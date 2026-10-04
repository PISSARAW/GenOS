# Signal Plane — Transport Zero-Text Inter-Agents

> GenOS V3 implémente un transport zero-texte où les agents communiquent par
> signaux biomimétiques (ligands, potentiels, phéromones, plasmides, tenseurs)
> en privilégiant les actions déterministes. Une tâche cognitive durable peut
> appeler un LLM lorsque le gate d'escalade l'autorise.

## Principe

```
Signal (ligand/voltage/pheromone/plasmid/tensor)
  ↓
Coalesce (anti-spam : période réfractaire + fenêtre 500ms)
  ↓
Match Receptor (évaluation déterministe, pas de LLM)
  ↓
  ├─ Receptor match → Action directe
  │     ├─ emit_signal
  │     ├─ wake_worker (startMission)
  │     ├─ update_agent (updateAgent)
  │     └─ change_organization (changeOrganization)
  │
  └─ Aucun match ou aucune action réussie → llmRequired=true → gate VoI → tâche cognitive
```

**Propriété clé** : un signal traité par un récepteur n'entraîne pas d'escalade
cognitive. Sans action exécutée, le gate VoI décide si une tâche LLM est créée.
L'action `wake_worker` peut néanmoins lancer une mission utilisant un modèle.

## Services

### SignalingTransportService

Point d'entrée principal : `publishSignal(params)`.

Pipeline d'exécution (ordre critique) :

1. **Validation** — type, payload size, rate limit
2. **Route de contrôle** — refus du scope demandé hors projet/organisation
3. **Coalesce** — anti-spam (période réfractaire 2s + fenêtre 500ms)
4. **Persistance** — `signal_blobs`, puis livraisons ou tâche cognitive (SQLite WAL)
5. **Dispatch** — récepteurs puis livraisons persistées aux destinataires
6. **EventBus** — notification push locale
7. **Plasticité** — poids persistés, rechargés au routage et vidés à l'arrêt

La publication échoue maintenant avec `SIGNAL_PERSISTENCE_FAILED` si la
persistance échoue après les reprises; un signal non persisté n'est jamais rendu
comme publié.

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

Si une dépendance est absente ou si l'état n'a pas changé, l'action renvoie
`executed: false`. Un récepteur durable se configure par la route HTTP
`PUT /api/signals/receptors/:id`; le registre local `registerReceptor` reste en
mémoire du processus.

**Appel** : `matchAndDispatch(signal, ctx)` — renvoie `{ triggered, dispatched, llmRequired }`.

Dans le chemin de publication, chaque action exige un émetteur orchestrateur
avec organisation et projet. `wake_worker` et `update_agent` exigent en plus un
worker enfant dans ce même périmètre et présent parmi les destinataires routés.
Une action refusée n'est pas comptée comme exécutée. Le registre de récepteurs
reste en mémoire du processus ; aucune règle active n'est restaurée au redémarrage.
L'identifiant d'agent fourni à MCP n'authentifie pas l'appelant.

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
- **Coalescing** : fenêtre de 500 ms en mémoire. Le premier signal est émis;
  les suivants peuvent être supprimés. Le buffer peut être agrégé par l'API
  locale, mais il n'existe pas de vidage autonome vers la publication. Il expire
  à la fin de la fenêtre et n'est pas réémis avec le signal suivant.

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

Le subscriber écoute `recipient:${agentId}` et interroge la file SQLite pour
reprendre les livraisons après redémarrage. Il réarme les workers `idle` au boot.
Les tâches cognitives sont également prises avec un bail, réessayées puis
placées en quarantaine après trois échecs. Leur réponse est consultative.

### API de livraison

Les routes exigent `security:manage` et les en-têtes
`X-Organization-Id` et `X-Project-Id`. L'agent cible doit appartenir au projet.
La lecture de la boîte marque les signaux comme vus et exige donc aussi le
droit d'écriture sur un projet actif.

| Route | Effet |
| --- | --- |
| `POST /api/signals/subscriptions` | Abonner `{agentId, topic}` |
| `DELETE /api/signals/subscriptions` | Désabonner par `agentId` et `topic` en query |
| `GET /api/signals/inbox/:agentId` | Lire les signaux livrés ou diffusés et marquer comme vus |
| `POST /api/signals/deliveries/:signalId/ack` | Acquitter `{agentId}` après livraison ou lecture |
| `GET /api/signals/cognitive-jobs` | Consulter les tâches cognitives du projet |

## Schema DB

Migration v45 (`schema-next.js`) :

Les charges non textuelles de `signal_blob` sont encodées en MsgPack. Une valeur
non encodable est refusée avant persistance ; les anciens BLOB JSON restent
lisibles (ADR 0301). Cela mesure des octets de transport, pas des tokens modèle.

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
| `synapticPlasticityService.js` | Poids canaux, reinforce/depress/strongDepress, cache hydraté depuis SQLite, écritures ordonnées dans `signal_channel_weights` et `flushPendingWrites()` |
| `collectiveSignalOrganizationRouter.js` | Routage destinataires, scope strict, tri plasticité |
| `signalPlaneSubscriber.js` | Consumer EventBus + reprise durable SQLite, registerWakeHandler et routage `llmRequired` via `cognitiveSignalService` |
| `signalCognitiveJobsService.js` | Tâches cognitives durables, baux, retries et quarantaine |
| `signalInboxService.js` | Lecture et ACK du registre de livraison dans le périmètre |
| `cognitiveSignalService.js` | Envoie le signal au `modelRouter.generate` avec sa cible cognitive et un prompt borné ; la réponse reste consultative |
| `signal_delivery_claims` | Lease de consommation, tentatives, backoff et quarantaine terminale |
| `agentRoundService.js` | Continuation différentielle (buildContinuationContext) |

## Limites connues

- **Push local, reprise multi-process** : l'EventBus reste un EventEmitter en
  mémoire. Le subscriber interroge aussi les livraisons persistées et prend un
  lease atomique SQLite; le délai nominal de reprise est de 500 ms.
- **Livraison au moins une fois** : un crash après l'effet métier et avant la
  validation de livraison peut réexécuter le handler. Celui-ci doit dédupliquer
  par `signalId`; les erreurs réessaient avec backoff et sont mises en quarantaine
  après huit tentatives. Les enveloppes absentes ou invalides ne réveillent pas.
- **Coalescing en mémoire** : les buffers sont perdus au redémarrage et ne sont
  pas vidés automatiquement vers le transport; les signaux supprimés dans la
  fenêtre ne sont pas publiés. La limite de débit est aussi locale au processus.
- **Récepteurs** : leur registre est en mémoire et aucun enregistrement au
  démarrage du serveur n'est actuellement câblé. Les tests enregistrent leurs
  propres récepteurs ; ce résultat ne démontre pas une couverture déterministe
  générale en production.
- **Polling** : les lectures vérifient l'intégrité de l'enveloppe, le projet,
  l'organisation et les destinataires explicites. Une lease d'outil seule ne
  lie pas l'identité `agent_id` fournie à l'identité du client MCP. Une erreur
  SQLite pendant la lecture ou le marquage « vu » remonte désormais au client.
- **Panne de récepteur** : le signal persisté demande une escalade cognitive
  si le dispatch déterministe échoue ; cette demande reste soumise au gate VoI.
- **Escalade cognitive** : le gate VoI décide si le signal `llmRequired` est
  escaladé. Le résultat du modèle est une réponse consultative ; il ne constitue
  ni une exécution d'action ni une preuve de validité.

## Tests

| Test | Vérifie |
|------|---------|
| `test_signal_receptor_service.js` | Registre, matchAndDispatch, llmRequired |
| `test_signal_event_bus.js` | onSignal, onSignalType, onTopic, onAgent |
| `test_signal_pipeline_integration.js` | Pipeline de routage et anti-spam |
| `test_signal_actionneurs.js` | startMission/updateAgent/changeOrganization via ctx |
| `test_plasticity_tensor.js` | Poids, renforcement, compatibilité tenseurs |
| `test_semantic_loop_detector.js` | Détection boucles sémantiques |
| `test_signal_plane_e2e.js` | Escalade cognitive avec fixture SQLite alignée sur le schéma de production |
| `test_signal_cognitive_jobs.js` | File cognitive, bail, reprise et quarantaine |
| `test_signal_delivery_api_contract.js` | Lecture et ACK scoped des livraisons |
| `test_signal_truthful_outcomes.js` | Débit et effet réel des actions |
| `test_plasticity_tensor.js` | Vidage explicite des écritures de plasticité |

Inclus dans `npm run test:validation` (profile `signalPlane`).
