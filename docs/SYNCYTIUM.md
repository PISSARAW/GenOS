# Syncytium : Orchestration par État Partagé et Synchronisation Continue

## 1. Définition

Syncytium dans GenOS est le mécanisme d'orchestration qui exécute une mission comme un **collectif densément couplé partageant un état de travail continu et synchronisé**. Contrairement aux modèles précédents (Trinity = hypothèses isolées, A-Team = domaines isolés, Biocénose = agents autonomes, Holobionte = hiérarchie), Syncytium impose une **transparence d'état totale et une synchronisation continue**.

Le mot "Syncytium" vient de la biologie : un syncytium est une masse protoplasmique multinucléée (plusieurs noyaux dans une seule cellule), partageant un même état viscéral, plutôt qu'une collection de cellules séparées. GenOS emprunte ce concept : les agents ne résident pas dans des bulles isolées ; ils partagent, éditent et synchronisent en **temps continu** un état partagé.

Les quatre rôles du Syncytium sont :

1. **Shared State Coordinator** : maintient l'état partagé de la mission, rend visibles toutes les décisions de coordination ;
2. **Parallel Executor** : exécute une tranche bornée de la mission en parallèle, publie continuellement les changements d'état ;
3. **Consistency Guardian** : détecte les conflits, l'état obsolète, les violations d'invariants immédiatement ;
4. **Integration Executor** : intègre le résultat collectif sans permettre aux branches divergentes de survivre inaperçues.

Syncytium n'est pas une orchestration par coordination : c'est une orchestration par **fusion continue**. Tous les agents voient le même tableau, éditent le même état, et convergent en temps réel.

Le cœur fonctionnel est réparti entre :

- [backend/src/services/biologicalModeService.js](../backend/src/services/biologicalModeService.js) : composition des quatre rôles synchronisés.
- [backend/src/services/syncytiumService.js](../backend/src/services/syncytiumService.js) : analyse de mission et activation de Syncytium.
- [backend/src/services/agentOrchestrationState.js](../backend/src/services/agentOrchestrationState.js) : état partagé centralisé, synchronisation continue, détection de conflits.
- [backend/src/services/agentRuntimeAdapter.js](../backend/src/services/agentRuntimeAdapter.js) : dispatch des agents avec state sharing.

Le principe est : une équipe travaillant sur le même tableau, en temps réel, avec transparence totale, converge plus vite et avec moins d'erreurs d'intégration qu'une équipe où chacun travaille dans son coin.

---

## 2. Non un pool de workers indépendants, mais une fusion continue

GenOS applique une logique de synchronisation dense :

1. **État partagé unique** : un seul état de mission, visible à tous les agents ;
2. **Publication continue** : chaque agent publie ses changements immédiatement ;
3. **Détection de conflit instantanée** : les violations d'invariants sont détectées en <1s ;
4. **Intégration sans divergence** : aucune branche ne peut survivre sans consensus ;
5. **Transparence totale** : chaque décision de coordination est enregistrée et visible.

Les mécanismes de cohérence sont explicites :

- **état centralisé** : une seule source de vérité, pas de répliques dérivées ;
- **synchronicité** : les agents ne fonctionnent pas asynchrone ; ils se synchronisent au tick d'horloge partagé ;
- **détection de violation** : tout conflit d'invariant est immédiatement signalé ;
- **linearization** : les changements d'état suivent un ordre total causal ;
- **quiescence** : le collectif s'arrête quand aucun changement ne peut progresser ;
- **escalade sans ambiguïté** : fusion refusée seulement si la divergence est irréductible.

---

## 3. Définition mathématique de l'orchestration par état synchronisé

L'orchestration Syncytium est un problème de **partage d'état avec garanties de cohérence causale**.

Soit :

- $M$ : mission ;
- $S_t$ : état partagé au timestamp $t$ ;
- $\Delta_i$ : changement proposé par l'agent $i$ ;
- $C(\Delta_i, S_t)$ : test de cohérence (peut-on appliquer $\Delta_i$ à $S_t$) ;
- $S_{t+1}$ : nouvel état après application de $\Delta_i$ ;
- $I(\Delta_i, S_t)$ : vérification d'invariant.

À chaque tick de synchronisation :

$$
\text{For each agent } i:
$$

$$
\text{if } C(\Delta_i, S_t) = 1 \text{ AND } I(\Delta_i, S_t) = 1:
$$

$$
S_{t+1} = S_t + \Delta_i
$$

$$
\text{broadcast}(S_{t+1} \text{ to all agents})
$$

$$
\text{else}:
$$

$$
\text{CONFLICT\_DETECTED}(\Delta_i, S_t)
$$

Les agents convergent quand :

$$
\text{quiescence}(S_t) = 1 \iff \nexists i : C(\Delta_i, S_t) = 1
$$

(aucun agent ne peut faire de progès valide).

La fusion est possible si :

$$
\text{canMerge} = \text{quiescence}(S_t) = 1 \text{ AND } \forall i : I(S_t) = 1
$$

---

## 4. Les quatre rôles et hypothèses

Syncytium crée toujours exactement 4 agents densément synchronisés, avec des rôles complémentaires :

### 4.1 Shared State Coordinator (Frontier)

```
Role: shared_state_coordinator
ModelTier: frontier
Member Number: 1
Responsibility: State Integrity
```

**Hypothèse :**
> "Maintain the shared mission state and make coordination decisions visible to every agent."

**Mission assignée :**
```
Syncytium shared mission: [shared mission]
Collective principle: A tightly coupled collective sharing one continuously synchronized working state.
Role hypothesis: Maintain the shared mission state and make coordination decisions visible to every agent.

Your task (shared_state_coordinator):
1. Maintain a single authoritative state for the mission
2. Track all state changes with causality and timestamp
3. Make all coordination decisions transparent and logged
4. Detect when state is stale (>1 second old)
5. Coordinate state synchronization ticks
6. Resolve state merge conflicts when inevitable

Return: State transitions log, coordination decisions, conflict resolutions
```

**Rôle dans le syncytium :**
- Garde l'état unique
- Synchronise à chaque tick
- Détecte staleness
- Résout les conflits inévitables
- Enregistre tout pour traçabilité

### 4.2 Parallel Executor (Standard)

```
Role: parallel_executor
ModelTier: standard
Member Number: 2
Responsibility: Bounded Execution
```

**Hypothèse :**
> "Execute a bounded slice in parallel while continuously publishing state changes."

**Mission assignée :**
```
Syncytium shared mission: [shared mission]
Collective principle: A tightly coupled collective sharing one continuously synchronized working state.
Role hypothesis: Execute a bounded slice in parallel while continuously publishing state changes.

Your task (parallel_executor):
1. Execute a specific bounded slice of work on the mission
2. Do NOT modify state outside your bounded domain
3. Publish state changes immediately as they happen
4. Listen for state updates from other agents
5. Adapt your execution based on state changes
6. Stop when you reach the boundary of your domain

Return: Results of your slice execution, state changes published, adaptations made
```

**Rôle dans le syncytium :**
- Exécute sa tranche en parallèle
- Publie continuellement ses changements
- Écoute l'état partagé
- Adapte exécution en temps réel
- Respecte ses limites de domaine

### 4.3 Consistency Guardian (Frontier)

```
Role: consistency_guardian
ModelTier: frontier
Member Number: 3
Responsibility: Invariant Enforcement
```

**Hypothèse :**
> "Detect conflicting assumptions, stale state, and invariant violations immediately."

**Mission assignée :**
```
Syncytium shared mission: [shared mission]
Collective principle: A tightly coupled collective sharing one continuously synchronized working state.
Role hypothesis: Detect conflicting assumptions, stale state, and invariant violations immediately.

Your task (consistency_guardian):
1. Watch all state changes in real-time
2. Verify that all invariants are maintained
3. Detect conflicting assumptions between agents
4. Alert if state becomes stale (>1 second without sync)
5. Flag if agents are diverging in interpretation
6. Stop processing if critical invariant is violated

Return: Invariant checks log, conflicts detected, alerts issued, state health assessment
```

**Rôle dans le syncytium :**
- Vérifie tous les invariants
- Détecte les conflits en temps réel
- Mesure la cohérence
- Signale staleness
- Arrête si invariant critique cassé

### 4.4 Integration Executor (Standard)

```
Role: integration_executor
ModelTier: standard
Member Number: 4
Responsibility: Convergence & Merging
```

**Hypothèse :**
> "Integrate the collective result without allowing divergent local branches to survive unnoticed."

**Mission assignée :**
```
Syncytium shared mission: [shared mission]
Collective principle: A tightly coupled collective sharing one continuously synchronized working state.
Role hypothesis: Integrate the collective result without allowing divergent local branches to survive unnoticed.

Your task (integration_executor):
1. Collect all state slices from parallel executors
2. Integrate them into a unified result
3. Detect any divergent branches (local states that differ)
4. Require consensus before accepting divergence
5. Document integration conflicts and resolutions
6. Deliver final unified result

Return: Integrated result, divergence detection report, consensus points, final state
```

**Rôle dans le syncytium :**
- Collecte les tranches exécutées
- Intègre en résultat unifié
- Détecte divergence
- Demande consensus
- Livre résultat final

---

## 5. Architecture du système

```text
Client / Mission
        |
        v
[syncytiumService.analyzeMission]
        |
        +--> valide que Syncytium est appropriée
        +--> crée état partagé initial
        |
        v
[biologicalModeService.compose]
        |
        +--> crée 4 agents synchronisés
        +--> Shared State Coordinator (frontier)
        +--> Parallel Executor (standard)
        +--> Consistency Guardian (frontier)
        +--> Integration Executor (standard)
        |
        v
[Exécution avec synchronisation continue]
        |
        +--> Shared State Coordinator: initialise & gère l'état
        +--> Parallel Executor: exécute sa tranche
        +--> Consistency Guardian: vérifie invariants
        |
        +--> SYNCHRONIZATION TICK (< 1 sec)
        |      État partagé synchronisé
        |      Conflits détectés
        |      Invariants vérifiés
        |
        +--> (repeat jusqu'à quiescence)
        |
        v
[Integration Executor]
        |
        +--> collecte résultats de Parallel
        +--> détecte divergence
        +--> intègre en résultat final
        |
        v
[Convergence ou Escalade]
        |
        +--> Quiescence atteinte + invariants OK
        |      → canMerge = true
        +--> Sinon
        |      → escalade ou continuation
```

---

## 6. Activation et synchronisation

Syncytium s'active par [backend/src/services/syncytiumService.js](../backend/src/services/syncytiumService.js) et [backend/src/services/biologicalModeService.js](../backend/src/services/biologicalModeService.js).

### Processus d'activation

Syncytium s'active quand :

1. **mission hautement parallélisable** : plusieurs tranches indépendantes ;
2. **nécessité de cohérence en temps réel** : pas de tolérance à la divergence asynchrone ;
3. **besoin de transparence totale** : tous les changements visibles immédiatement ;
4. **domaine fortement couplé** : les tranches dépendent continuellement l'une de l'autre.

Exemple :

```javascript
const mission = "Orchestrate a real-time collaborative document edit with 5 parallel editors.";
const analysis = biologicalModeService.compose('syncytium', mission);

// Résultat:
// [
//   {
//     role: "shared_state_coordinator",
//     modelTier: "frontier",
//     memberNumber: 1,
//     mission: "Syncytium shared mission: ... \nRole hypothesis: Maintain the shared mission state..."
//   },
//   {
//     role: "parallel_executor",
//     modelTier: "standard",
//     memberNumber: 2,
//     mission: "Syncytium shared mission: ... \nRole hypothesis: Execute a bounded slice..."
//   },
//   {
//     role: "consistency_guardian",
//     modelTier: "frontier",
//     memberNumber: 3,
//     mission: "Syncytium shared mission: ... \nRole hypothesis: Detect conflicting assumptions..."
//   },
//   {
//     role: "integration_executor",
//     modelTier: "standard",
//     memberNumber: 4,
//     mission: "Syncytium shared mission: ... \nRole hypothesis: Integrate the collective result..."
//   }
// ]
```

### Conditions d'exclusion

Syncytium est **dégradée** si :

- **budget insuffisant** : moins de 4 workers ne peuvent être financés ;
- **mission sans parallélisme** : tâche strictement séquentielle ;
- **priorité à autre mode** : A-Team, Trinity, Biocénose ou Holobionte activée.

---

## 7. Composition et allocation

La fonction `compose(mode, mission)` crée les quatre agents synchronisés contextualisés.

### Contrat d'entrée

```javascript
biologicalModeService.compose('syncytium', "Orchestrate real-time collaborative editing with shared state.")
```

### Validation stricte

La composition valide :

1. **mission présente** : aucun Syncytium sans mission explicite ;
2. **mode reconnu** : 'syncytium' dans les 4 modes biologiques ;
3. **quatre agents générés** : toujours exactement 4 rôles.

Si validation échoue :

- `BIOLOGICAL_MISSION_REQUIRED` : pas de mission
- `BIOLOGICAL_MODE_UNKNOWN` : mode inconnu

### Sortie

La composition retourne un tableau de 4 agents synchronisés :

```javascript
[
  { role: 'shared_state_coordinator', modelTier: 'frontier', memberNumber: 1, mission: '...' },
  { role: 'parallel_executor', modelTier: 'standard', memberNumber: 2, mission: '...' },
  { role: 'consistency_guardian', modelTier: 'frontier', memberNumber: 3, mission: '...' },
  { role: 'integration_executor', modelTier: 'standard', memberNumber: 4, mission: '...' }
]
```

---

## 8. Allocation de budget et modèles

Le budget est réparti équitablement entre les quatre rôles :

$$
T_{\text{per\_agent}} = \frac{T_{\text{worker}} \times s}{4}
$$

où :
- $T_{\text{worker}}$ est le budget alloué aux workers
- $s$ est le ratio d'allocation (typiquement 0.6–0.8)
- 4 est le nombre de rôles Syncytium

### Modèles utilisés

- **Shared State Coordinator** : modèle `frontier` (orchestration d'état complexe) ;
- **Parallel Executor** : modèle `standard` (exécution rapide) ;
- **Consistency Guardian** : modèle `frontier` (vérification d'invariants complexe) ;
- **Integration Executor** : modèle `standard` (agrégation et merge) ;

Cette alternance frontier/standard équilibre coût avec complexité aux deux postes critiques (état et cohérence).

---

## 9. Synchronisation et mécanismes de coordination

Les quatre rôles s'exécutent avec **synchronisation continue** :

### Phase 1 : Initialisation d'état

Le Shared State Coordinator crée l'état initial :

1. **structure de l'état** : quels champs sont partagés ? ;
2. **invariants** : quelles propriétés doivent rester vraies ? ;
3. **bornes des tranches** : quels domaines pour chaque Executor ? ;
4. **horloge partagée** : synchronisation toutes les N ms (par défaut 100ms).

Exemple d'état initial :

```javascript
{
  missionId: "sync_12345",
  timestamp: 1694862000000,
  sharedDocument: {
    content: "",
    version: 0,
    lastEditor: null,
    editHistory: []
  },
  executorSlices: {
    executor1: { domain: "paragraphs_1-100", status: "idle" },
    executor2: { domain: "paragraphs_101-200", status: "idle" }
  },
  invariants: {
    contentIntegrity: "document must not have conflicting edits",
    versionMonotonic: "version must increase monotonically"
  }
}
```

### Phase 2 : Publication continue

Chaque Parallel Executor publie ses changements immédiatement :

```
Time T=100ms:
  Executor1 publishes: { edit: "insert 'hello'", position: 0, version: 1 }
  State updated to: { content: "hello", version: 1, lastEditor: "executor1" }
  Broadcast to all agents: STATE_UPDATED(T, state)

Time T=101ms:
  Executor2 publishes: { edit: "insert 'world'", position: 5, version: 2 }
  State updated to: { content: "helloworld", version: 2, lastEditor: "executor2" }
  Broadcast to all agents: STATE_UPDATED(T, state)
```

### Phase 3 : Détection de conflit en temps réel

Le Consistency Guardian vérifie chaque changement :

```
Time T=105ms:
  Executor3 proposes: { edit: "delete 'lo'", position: 3, version: 2 }
  
  Consistency check:
    - Version is 2, current state is version 2 ✓
    - Edit position 3 is in document ✓
    - Invariant "contentIntegrity" check:
      Does delete conflict with previous insert at position 5?
      After position 3, content changes... need causality check
    
  Result: CONFLICT_DETECTED(executor1_edit, executor3_edit)
    Executor3's edit depends on executor1's state before executor2's change
    Causality violation: Executor3 is stale
```

### Phase 4 : Quiescence

Convergence quand aucun agent ne peut progresser :

```
Time T=200ms:
  Executor1: no more edits to publish
  Executor2: no more edits to publish
  Executor3: waiting for conflict resolution
  
  Consistency Guardian: invariants all satisfied ✓
  
  Quiescence condition met:
    ∀ executors: no pending edits
    ∀ invariants: satisfied
    
  System enters CONVERGENCE state
```

---

## 10. Détection de conflit et résolution

Syncytium détecte et gère les conflits activement :

### Types de conflits

**Conflit 1 : Staleness**
```
Agent uses state from T=100ms
But current state is from T=200ms
Action: Reject edit, ask agent to re-read current state
```

**Conflit 2 : Causality Violation**
```
Agent1 edits position 5 (creating state A)
Agent2 reads state from before Agent1's edit, edits position 3
Agent2's edit is causally inconsistent
Action: Queue Agent2's edit after Agent1's, retry
```

**Conflit 3 : Invariant Violation**
```
Agent proposes edit that violates: "document size must be < 1MB"
Proposed edit would make document 2MB
Action: REJECT immediately, alert Consistency Guardian
```

**Conflit 4 : Divergence**
```
Two agents have computed different values for same field
Agent1 thinks "version": 3
Agent2 thinks "version": 2 (stale cache)
Action: Consistency Guardian broadcasts correct state
```

### Résolution garantie

```javascript
const handleConflict = (conflict, sharedState) => {
  switch(conflict.type) {
    case 'STALENESS':
      // Reject and ask agent to re-sync
      return {
        action: 'REJECT_AND_RESYNC',
        currentState: sharedState
      };
    
    case 'CAUSALITY_VIOLATION':
      // Queue the edit in causal order
      return {
        action: 'QUEUE_IN_ORDER',
        position: calculateCausalPosition(conflict, sharedState)
      };
    
    case 'INVARIANT_VIOLATION':
      // Reject immediately
      return {
        action: 'REJECT',
        reason: conflict.invariantBroken
      };
    
    case 'DIVERGENCE':
      // Broadcast ground truth
      return {
        action: 'BROADCAST_GROUND_TRUTH',
        correctState: sharedState
      };
    
    default:
      // Escalate
      return {
        action: 'ESCALATE',
        conflict: conflict
      };
  }
};
```

---

## 11. Barrière de convergence et fusion

La fusion d'un Syncytium exige une **convergence complète et une cohérence causale**.

### Processus de fusion

1. **attendre quiescence** : aucun agent ne peut faire de progrès ;
2. **vérifier invariants** : tous les invariants satisfaits ? ;
3. **collecte des résultats** : Integration Executor regroupe les tranches ;
4. **détecte divergence** : y a-t-il des états parallèles qui n'ont pas convergé ? ;
5. **décide fusion** : tous convergés + invariants → merge.

### Critères de fusion

Fusion possible si :

$$
\text{canMerge} = 
\begin{cases}
1 & \text{si } \text{quiescence}(S_t) = 1 \text{ AND } \forall_i I_i(S_t) = 1 \\
0 & \text{sinon}
\end{cases}
$$

où :
- $\text{quiescence}(S_t)$ : aucun agent ne peut faire de progrès
- $I_i(S_t)$ : invariant $i$ est satisfait

### Exemple d'intégration

**Syncytium State After Convergence:**
```
{
  missionId: "sync_12345",
  timestamp: 1694862001000,
  sharedDocument: {
    content: "The quick brown fox",
    version: 7,
    lastEditor: "executor2",
    editHistory: [
      { edit: "insert 'The'", position: 0, version: 1, editor: "executor1" },
      { edit: "insert ' quick'", position: 3, version: 2, editor: "executor2" },
      ...
    ]
  },
  invariants: {
    contentIntegrity: "satisfied ✓",
    versionMonotonic: "satisfied ✓",
    noConflictingEdits: "satisfied ✓"
  },
  quiescence: true,
  canMerge: true
}
```

**Integration Executor Report:**
```
## Syncytium Integration Result

### Convergence
- All executors reached quiescence
- Shared state synchronized with all agents
- No pending edits in queue
- Status: CONVERGED ✓

### Invariants
- contentIntegrity: ✓ (7 edits, no conflicts)
- versionMonotonic: ✓ (versions 0→7, all increasing)
- noConflictingEdits: ✓ (causal order verified)

### Integrated Result
- Final document: "The quick brown fox"
- Edit history: 7 edits, all applied
- Causal order: verified
- Divergence: none detected

### Recommendation
MERGE: Syncytium converged successfully. Result is consistent and ready for use.
```

---

## 12. Continuations et resynchronisation

Si le Consistency Guardian détecte des problèmes persistants, Syncytium peut lancer des **continuation rounds** ciblés.

### Allocation de continuation

Le budget de continuation est alloué à :

- **Parallel Executor** : relancer avec state plus récent ;
- **Consistency Guardian** : vérifier à nouveau après relance ;
- **Integration Executor** : réintégrer après relance.

Le Shared State Coordinator reste actif (ne relance pas).

### Exemple de continuation

**Round 1 Result:**
- Consistency Guardian detects: 3 agents with stale state
- Quiescence NOT reached
- Recommendation: Resynchronize and retry

**Continuation Prompt (Consistency Guardian):**
```
Resynchronization phase initiated.

3 agents detected with stale state:
- Executor1: last sync 200ms ago
- Executor2: last sync 150ms ago
- Executor3: last sync 50ms ago

Current state: { version: 7, ... }

New task:
1. Broadcast current state to all agents
2. Ask agents to resync and replay their pending edits
3. Check if causality issues are resolved after resync
4. Report invariant status

Perform resynchronization and return updated state.
```

**Continuation (Parallel Executor):**
```
You were out of sync.
Current state from coordinator: { version: 7, ... }

Your pending edits (from when state was version: 5):
- Edit1: "insert 'quick'"
- Edit2: "insert 'fox'"

New task:
1. Receive latest state (version 7)
2. Rebase your pending edits on top of version 7
3. Re-propose rebased edits
4. Publish to shared state

Perform resync and continue.
```

### Critères d'arrêt

Une continuation s'arrête si :

- quiescence atteinte + invariants OK ;
- budget épuisé ;
- cycle détecté (même problème relancé 2x) ;
- escalade demandée.

---

## 13. Cas d'usage typiques

### Cas 1 : Édition collaborative en temps réel

**Mission :** "Orchestrate 5 editors collaborating on a shared document in real-time."

**Syncytium activé :** 4 rôles synchronisés

**Exécution :**
- **Shared State Coordinator** : maintient document + version + edit history ;
- **Parallel Executor (×5 editors)** : chacun édite sa section, publie continuellement ;
- **Consistency Guardian** : détecte les conflits causals (édits sur positions divergentes) ;
- **Integration Executor** : collecte l'état final convergeé.

**Synchronisation :**
- Edit T=100ms: Editor1 inserts "hello"
- Edit T=101ms: Editor2 inserts "world"
- Edit T=102ms: Editor1 tries to delete position 3 (but Editor2 modified ∋3), **conflict detected**
- Resync: Editor1 retries with correct state
- T=150ms: Quiescence reached, document converged

**Résultat :** MERGE. Document converged with all edits integrated in causal order.

### Cas 2 : Déploiement coordonné multi-service

**Mission :** "Deploy a feature across 5 microservices with synchronized state."

**Syncytium activé :** 4 rôles

**Exécution :**
- **Shared State Coordinator** : état du déploiement (version, services déployés, health) ;
- **Parallel Executor** : chaque service déploie sa version en parallèle ;
- **Consistency Guardian** : vérifie que dépendances restent cohérentes (version A depends on version B, must update in order) ;
- **Integration Executor** : collecte state final de tous services.

**Synchronisation :**
- T=0: Service1 deploys (triggers dependency on Service2)
- T=50: Service2 must deploy before Service3
- T=100: Consistency Guardian detects: "Service3 trying to deploy before Service2"
- Conflict! Requeue Service3 after Service2
- T=150: Service2 deploys
- T=200: Service3 now safe to deploy
- T=250: All services converged

**Résultat :** MERGE. All services deployed in correct dependency order.

### Cas 3 : Calcul parallèle avec état partagé

**Mission :** "Compute a distributed algorithm (MapReduce-like) with synchronized state."

**Syncytium activé :** 4 rôles

**Exécution :**
- **Shared State Coordinator** : état global (keys computed, intermediate results) ;
- **Parallel Executor** : mappers work on partitions, publish intermediate results continuously ;
- **Consistency Guardian** : verifies no duplicate keys, no data loss ;
- **Integration Executor** : final reduce and merge.

**Result:** MERGE. Distributed computation converged with all intermediate results integrated.

---

## 14. Cas d'erreur et escalade

### Erreur 1 : Budget insuffisant

```
SYNCYTIUM_BUDGET_INSUFFICIENT:
  Syncytium requires 4 agents (160,000 tokens total)
  but the budget permits only 1 agent (20,000 tokens)
  Action: Syncytium is not activated. Falling back to orchestration.
```

### Erreur 2 : Stale state non récupérable

```
SYNCYTIUM_PERSISTENT_STALENESS:
  After 3 resynchronization attempts, agents still have stale state
  Consistency Guardian cannot validate convergence
  Action: Escalate to human. Syncytium failed to converge.
```

### Erreur 3 : Invariant continuellement violé

```
SYNCYTIUM_INVARIANT_VIOLATION_PERSISTENT:
  After 2 continuation rounds, invariant "contentIntegrity" still violated
  No edit sequence can satisfy the invariant
  Action: Escalate. Problem is unsolvable with current approach.
```

### Erreur 4 : Divergence irréductible

```
SYNCYTIUM_DIVERGENCE_UNRESOLVABLE:
  Agent1 insists on state: version=3, content="A"
  Agent2 insists on state: version=3, content="B"
  Both claim causally correct, but cannot both be true
  Consistency Guardian cannot resolve
  Action: Escalate to human arbitration.
```

---

## 15. Télémétrie et observabilité

Le système enregistre pour chaque mission Syncytium :

- **synchronizationTicks** : nombre de ticks avant quiescence ;
- **conflictsDetected** : total de conflits (staleness, causality, invariant, divergence) ;
- **conflictTypes** : breakdown par type de conflit ;
- **resynchronizationRounds** : nombre de continuations ;
- **invariantViolations** : combien fois un invariant cassé ;
- **convergenceTime** : temps du démarrage à quiescence ;
- **divergenceDetectionRate** : combien de divergences trouvées avant merge ;
- **stateSize** : taille de l'état partagé au fil du temps.

Ces métriques aident à :

- **valider l'efficacité** : Syncytium converge-t-il rapidement ou entre-t-il en boucle ? ;
- **détecter la corruption** : combien de violations d'invariants ? ;
- **optimiser les ticks** : faut-il synchroniser plus ou moins souvent ? ;
- **mesurer le parallélisme** : quel est le ratio de vraie parallélisation ?

---

## 16. Configuration et paramètres

### Variables d'environnement

```bash
# Nombre de rôles Syncytium (toujours 4, non configurable)
export GENOS_SYNCYTIUM_ROLES=4

# Période de synchronisation (ms entre chaque tick)
export GENOS_SYNCYTIUM_SYNC_TICK=100

# Nombre maximal de workers autonomes (partagé avec autres modes)
export GENOS_MAX_AUTONOMOUS_WORKERS=6

# Budget alloué aux workers
export GENOS_WORKER_ALLOCATION_RATIO=0.6

# Tokens minimum par agent Syncytium
export GENOS_MIN_TOKENS_PER_WORKER=8000

# Timeout avant escalade si pas de convergence
export GENOS_SYNCYTIUM_CONVERGENCE_TIMEOUT=60000  # ms
```

---

## 17. Édition d'État par CRDTs (Conflict-free Replicated Data Types)

Pour permettre une collaboration multi-agents à haute fréquence ($< 1\text{ s}$ sans blocage ni corruption mémoire), l'état du Syncytium s'appuie sur une structure **CRDT** (Conflict-free Replicated Data Types) en Rust avec horloges de Lamport et journalisation causale.

### 17.1 Architecture Sans Verrou (Non-blocking Convergence)

- **Commutativité et Idempotence** : Le *Parallel Executor* et le *Consistency Guardian* appliquent leurs deltas textuels et mutations de clés-valeurs sans lock bloquant.
- **Lamport Clocks & Causal Vector** : Chaque opération $\Delta_i$ porte un identifiant unique `op_id`, un compteur Lamport monotone et un horodatage milliseconde.
- **Suivi des 4 Curseurs d'Agents** : Les curseurs et sélections des 4 agents sont synchronisés en direct avec code couleur dédié :
  - 🔵 **Shared State Coordinator** (`#3b82f6`)
  - 🟢 **Parallel Executor** (`#10b981`)
  - 🟡 **Consistency Guardian** (`#f59e0b`)
  - 🟣 **Integration Executor** (`#8b5cf6`)

### 17.2 Moteur Time-Travel Milliseconde par Milliseconde

Grâce au journal d'opérations causales immuable, l'état partagé devient intégralement **Time-Travel ready** :

$$
S(t) = \text{replay}\left(\{ \Delta_i \in \text{OpLog} \mid \text{timestamp}(\Delta_i) \le t \}\right)
$$

Il est possible de rembobiner l'état exact du document et des variables à n'importe quelle milliseconde pour inspecter où et quand un agent a introduit un bug ou violé un invariant.

---

## 18. Serveur WebSocket et Intégration Éditeur (Monaco Editor)

Le binaire `genos` expose un serveur HTTP et WebSocket temps réel dédié au Syncytium.

```bash
# Lancer le serveur Syncytium CRDT avec dashboard web et WebSocket
genos biological --mode syncytium --serve --port 4791
```

### Endpoints exposés

- `GET /` : Dashboard web interactif avec éditeur collaboratif, badges curseurs et réglette Time-Travel.
- `GET /ws` : Flux WebSocket bidirectionnel pour synchronisation temps réel sub-seconde des deltas CRDT.
- `GET /api/syncytium/state` : Snapshot JSON actuel de l'état partagé, texte et curseurs.
- `GET /api/syncytium/history` : Journal complet des opérations causales avec attribution agent.
- `POST /api/syncytium/rewind` : Rembobinage de l'état à un `target_ms` ou numéro de step spécifique.
- `POST /api/syncytium/op` : Injection programmatique d'une opération CRDT.

### Tuning de synchronisation

Pour missions avec forte contention (beaucoup de conflits) :

```bash
# Augmenter la fréquence de sync (reduits la fenêtre de conflits)
export GENOS_SYNCYTIUM_SYNC_TICK=50
```

Pour missions avec peu de conflit (tranches très indépendantes) :

```bash
# Réduire la fréquence de sync (économise cycles)
export GENOS_SYNCYTIUM_SYNC_TICK=200
```

---

## 17. Limitations et design notes

### Pourquoi pas de "eventual consistency" ?

Syncytium exige **strong consistency** (état unique, partagé, synchronisé) pas eventual consistency (les agents finissent par converger). Raison :

- eventual consistency tolère divergence temporaire (ok pour social media, pas pour transactions) ;
- Syncytium cible les missions où divergence = bug ;
- Pour eventual consistency, utiliser Biocénose ou Trinity.

### Pourquoi 4 rôles ?

- **1 Coordinator** : gère l'état unique ;
- **1 Executor** : fait le travail ;
- **1 Guardian** : détecte les problèmes ;
- **1 Integrator** : merge les résultats.

Chacun est essentiel et non-substituable.

### Pourquoi synchronisation < 1s ?

La latence de synchronisation est critique :

- < 100ms : agents maintiennent une vue cohérente naturellement ;
- 100–1000ms : conflits augmentent mais resolvables ;
- > 1s : risque de divergence irréductible.

100ms est un compromis pratique entre coût de synchronisation et risque de divergence.

### Quand Syncytium échoue ?

Syncytium échoue si :

1. **tâche est strictement séquentielle** : pas de vrai parallélisme ;
2. **état est trop grand** : synchronisation devient coûteuse ;
3. **conflits sont fréquents** : chaque edit redondant avec les autres ;
4. **tolérance à divergence requise** : besoin de eventual consistency.

Dans ces cas, préférer Trinity (hypothèses), A-Team (domaines), ou Biocénose (communauté).

---

## 18. Comparaison avec Trinity, A-Team, Biocénose, Holobionte

| Aspect | Trinity | A-Team | Biocénose | Holobionte | Syncytium |
|--------|---------|--------|-----------|------------|-----------|
| **Décomposition** | Hypothèses (3) | Domaines (N) | Communauté (4) | Hiérarchie (4) | État (4) |
| **Autorité** | Orchest. central | Domaines isolés | Protocole/consensus | Host central | Coordinator |
| **Synchronisation** | Asynchrone | Asynchrone | Asynchrone | Asynchrone | **Synchrone** |
| **Consistency** | Comparative | Per-domain | Consensus | Hierarchical | **Strong** |
| **Parallelisme** | Limité (3 worlds) | Bon | Bon | Délégué | **Maximal** |
| **Meilleur pour** | Explorer hypothèses | Multidisciplinaire | Robustesse critique | Production sécurisée | Temps réel collaboratif |

---

## 19. Synchronicité Somatique et Télémétrie d'Entropie Partagée

Inspirée par la synchronisation somatique et cognitive extrême des jumeaux monozygotes, la primitive `genos_biomimicry_somatic_resonance` dote le Syncytium d'un système nerveux collectif :

- **Propagation instantanée d'ondes d'entropie :** Si un agent de la grappe subit une montée subite d'entropie cognitive ($H(A) > 0.85$, boucle infinie ou échec de test répété), une impulsion somatique est émise instantanément sur le maillage.
- **Réflexes autonomes coordonnés :**
  - Si l'indice de stress collectif franchit le seuil d'alerte, tous les pairs réduisent automatiquement leur budget cognitif ou déclenchent une **cryptobiose préventive coordonnée** (`TRIGGER_COORDINATED_CRYPTOBIOSIS_FREEZE`) pour éviter la corruption en chaîne de l'état partagé.

---

## Références internes

- [ORCHESTRATION.md](ORCHESTRATION.md) : orchestration générale, gates et phases
- [A_TEAM.md](A_TEAM.md) : orchestration multidisciplinaire
- [TRINITY.md](TRINITY.md) : orchestration comparative
- [BIOCENOSE.md](BIOCENOSE.md) : orchestration communautaire
- [HOLOBIONTE.md](HOLOBIONTE.md) : orchestration hiérarchisée intégrée
- [BIOLOGIE_COMPUTATIONNELLE.md](BIOLOGIE_COMPUTATIONNELLE.md) : cadre biologique général
- [biologicalModeService.js](../backend/src/services/biologicalModeService.js) : implémentation des quatre modes
- [syncytiumService.js](../backend/src/services/syncytiumService.js) : service Syncytium
- [somaticResonance.js](../backend/src/services/mcpBioTools/handlers/somaticResonance.js) : handler de résonance somatique
- [agentOrchestrationState.js](../backend/src/services/agentOrchestrationState.js) : état partagé et synchronisation
- [agentRuntimeAdapter.js](../backend/src/services/agentRuntimeAdapter.js) : dispatch des agents
- [test_somatic_resonance.js](../backend/tests/test_somatic_resonance.js) : suite de tests de synchronicité somatique
- Commandes CLI : `genos-cli biological deploy --mode syncytium`
