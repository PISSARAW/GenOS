---
title: Resident Daemon Ecology
date: 2026-09-23
status: accepted
authors: Bruney
decision-id: 0034
---

# ADR 0034 : Resident Daemon Ecology

## Contexte

GenOS possède aujourd'hui deux daemons persistants :
- `WorkspaceGitDaemon` (agents/orchestration/workspace_git_daemon.agent.json)
- `SentinelDaemonKeeper` (agents/integration/sentinel_daemon_keeper.agent.json)

Ces daemons fonctionnent principalement comme des **cron jobs LLM** : timer de 60 minutes, `pickCandidateFile()` basé sur `mtime`, puis cycle d'autofix. Cette architecture viole plusieurs invariants GenOS :

1. **Le timer n'est pas un système nerveux** — le Signal Plane existe (`docs/01-concepts/signal-plane-zero-text.md`) et stipule : « le LLM est une interruption, pas le substrat »
2. **`mtime` ≠ signal pertinent** — aucune causalité entre date de modification et présence de bug
3. **Daemon = worker long-lived** — confusion entre observation continue et exécution de mission
4. **État en JSON fichier** — `daemon_repo_state.json` avec lock-file maison, hors persistence transactionnelle GenOS
5. **Pas de territoire** — connaissance globale par repo, pas de scoping `repo/ref/path/commit`
6. **Pas de provenance** — findings produits sans chaîne de provenance vers `provenance_records`
7. **Pas d'évidence gates** — `confidence = 0.92` comme vérité synthétique, contradictoire à `claim != evidence`

La Constitution GenOS exige : nature → invariant → hypothèse computationnelle → implémentation → ablation → bénéfice mesuré.

## Décision

Introduire une **écologie de daemons résidents** comme **catégorie d'agents GenOS** à part entière, branchée sur les mécanismes existants :

```
                     REPOSITORY / WORKSPACE
                              │
                ┌─────────────┴─────────────┐
                │                           │
          changements                  événements GenOS
        git/files/tests/...          agents/CI/runtime/...
                │                           │
                └─────────────┬─────────────┘
                              ▼
                  ┌─────────────────────┐
                  │ ResidentDaemonRuntime│
                  └──────────┬──────────┘
                             │
             deterministic sensing first
                             │
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
    Cartographer       Investigator        Reconciler
          │                  │                  │
          │              hypotheses            │
          │                  │                  │
          └─────────────► Verifier ◄────────────┘
                             │
                      typed evidence
                             │
                    daemon_findings
                             │
           ┌─────────────────┴────────────────┐
           │                                  │
    Orchestrator arrives                 serious finding
           │                                  │
           ▼                                  ▼
    Handoff Compiler                     Repair Episode
           │                                  │
     dossier minimal                  isolated capsule
           │                                  │
           ▼                                  ▼
     ORCHESTRATOR                         WORKER
```

**Invariant central** : Le daemon observe et connaît. L'orchestrateur décide. Le worker intervient. Jamais l'inverse.

### Définition normative

> **A GenOS daemon is a persistent, territory-bound agentic process whose primary function is to maintain an evidence-grounded model of its environment across missions.**

### Invariants gravés (non-négociables)

| Invariant                      | Conséquence                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------- |
| daemon ≠ worker long-lived     | sa fonction première n'est pas d'exécuter des missions                          |
| daemon ≠ orchestrator          | il ne choisit pas la mission humaine                                            |
| observation ≠ vérité           | toute conclusion devient claim/finding                                          |
| même LLM ≠ preuve indépendante | plusieurs réflexions du daemon ne renforcent pas artificiellement une hypothèse |
| territoire ≠ vérité globale    | toute connaissance est scoping `repo/ref/path/commit`                           |
| persistance ≠ autorité         | une vieille information doit pouvoir expirer                                    |
| nature ≠ justification         | tout mécanisme biomimétique doit passer une ablation                            |
| mutation ≠ droit implicite     | écrire dans le repo nécessite lease/gate                                        |
| silence > bavardage            | zero-text et dossiers référencés, pas conversation permanente                   |
| réversibilité                  | daemon, knowledge et findings doivent pouvoir être dépréciés/refutés            |

## Architecture cible

### Phase 1 — Territory (service + modèle)

```text
backend/src/services/daemon/
    daemonTerritoryService.js
```

```ts
DaemonTerritory {
    id
    organizationId
    projectId
    workspaceId
    repoIdentity
    rootPath
    scopePath
    ref
    headSha
    parentTerritoryId?
    createdAt
    lastObservedAt
    state
}
```

Exemples :
- `GenOS` — scope: `/`
- `GenOS/backend` — scope: `backend/`
- `GenOS/backend/services` — scope: `backend/src/services/`

**Commit-aware** : un finding établi sur `HEAD = ABC` ne doit jamais être injecté comme vérité à `HEAD = XYZ` sans revalidation.

### Phase 2 — Vrais agents GenOS

```text
agents/daemons/
    resident_daemon.agent.json
    cartographer_daemon.agent.json
    investigator_daemon.agent.json
    verifier_daemon.agent.json
    reconciler_daemon.agent.json
```

Modèle unifié (organelles, pas processus séparés) :
```
ResidentDaemon
    genome
    phenotype
    territory
    organelles:
       cartography
       investigation
       verification
       reconciliation
       handoff
```

Spécialisation par **pression écologique** (budding) seulement sous contrainte mesurée.

### Phase 3 — Physiologie événementielle (remplace `setInterval`)

```text
daemonEventBridgeService.js
daemonReceptorRegistry.js
daemonWakePolicyService.js
```

Pipeline :
```
event
 ↓
deterministic receptor
 ↓
cheap update
 ↓
interesting?
 ├─ no → persistence only
 └─ yes → Natural Search pressure → LLM seulement si nécessaire
```

Événements : `TERRITORY_FILE_CHANGED`, `TERRITORY_COMMIT`, `TEST_FAILED`, `AGENT_COMPLETED`, `FINDING_CREATED`, `RESOURCE_ORPHANED`, `KNOWLEDGE_STALE`, etc.

Respecte `zero-text` : le LLM est une interruption, pas le substrat.

### Phase 4-5 — Cartographer incrémental

Graphe durable (pas Markdown) :
- **Nœuds** : repository, directory, file, module, class, function, symbol, test, endpoint, database_table, schema, config, dependency, documentation, commit, finding, invariant, agent
- **Relations** : CONTAINS, IMPORTS, CALLS, IMPLEMENTS, EXTENDS, READS, WRITES, TESTS, DOCUMENTS, CONFIGURES, GENERATES, DEPENDS_ON, CHANGED_WITH, FAILED_AFTER, FIXED_BY, SUPPORTS, CONTRADICTS

Principe : **le graphe est un index dérivé, pas une vérité fondamentale** — destructible/reconstruisible depuis repo/git/snapshots/telemetry/tests.

Incrémental : `git diff A..B` → invalidate impacted nodes → reparse → propagate affected edges.

### Phase 6 — Interoception du territoire

```text
daemonTerritoryInteroceptionService.js
```

Variables observables (mesurées, jamais inventées par LLM) :
- `change_rate`, `test_failure_pressure`, `build_failure_pressure`, `knowledge_staleness`
- `graph_coverage`, `graph_invalidations`
- `unresolved_findings`, `refuted_findings`
- `dependency_churn`, `contract_drift`
- `orphan_pressure`, `documentation_drift`
- `handoff_demand`, `handoff_usefulness`
- `cpu_pressure`, `inference_pressure`

Homeostasie daemon = territory interoception + machine interoception (existante).

### Phase 7 — Branchement sur Natural Search (existant)

**Ne pas créer** : `daemonHypothesisEngine.js`, `daemonSearchEngine.js`, `daemonDeadEndMemory.js` — duplication de GenOS.

Créer uniquement :
```text
daemonNaturalSearchAdapter.js
```

Transforme `territorial observation` → `GenOS search event`. Les daemons deviennent un **nouveau milieu pour Natural Search**.

### Phase 8 — Finding comme objet épistémique canonique

```text
backend/src/services/daemon/findings/
    findingService.js
    findingEvidenceService.js
    findingLifecycleService.js
```

```text
Finding
    claim
    scope
    headSha
    status: OBSERVED → HYPOTHESIZED → SUPPORTED → REPRODUCED → CAUSALLY_SUPPORTED → REPAIRABLE
              ↘ REFUTED
              ↘ STALE → EXPIRED
    supporting: observational[] | experimental[] | formal[] | causal[] | replicated[] | adversarial[]
    contradicting: [...]
    dependencies: [...]
    limitations: [...]
    hypothesisId
    createdBy
    createdAt
    expiresAt
```

**L'algèbre de preuve est typée, pas réduite à un score** (Constitution).

### Phase 9 — Provenance existante

Chaque observation/finding/evidence/handoff/repair référence `provenance_records` existant. Permet : `finding F123 → E42 observed test failure → snapshot S12 → commit ABC → agent X`.

### Phase 10 — Stigmergie existante

Utiliser `crates/genos-signal/src/stigmergy.rs` : `deposit`, `deposit_repellent`, `evaporate`, `dominant_trail`.

Exemple territoire `backend/auth` :
```
AUTH_CONTRACT_DRIFT      +4.5
TEST_INSTABILITY         +2.1
DEAD_END/FIX-123         -6.2
PERFORMANCE_REGRESSION   +1.0
```

> Une phéromone influence **l'attention**, pas la vérité. « Regarde là », jamais « C'est vrai ».

### Phase 11-13 — Investigator + Verifier

Détecteurs **déterministes** avant LLM :
- test regression, import/reference broken, API/schema mismatch, documentation/code drift, generated artifact drift, dependency incompatibility, configuration mismatch, orphaned runtime resource, repeated failure pattern, coverage hole around changed code, unresolved TODO age/churn, hotspot repeatedly fixed

Chacun renvoie `Observation`, pas `Bug`. Natural Search construit l'hypothèse si nécessaire.

Verifier utilise l'existant : `workspaceSnapshotStore`, `tests`, `sandbox`, `provenance`, `controlledCausalExperimentService`, `Natural Search causal replay`.

### Phase 14-16 — Handoff Protocol

```text
daemon/handoff/
    handoffCompilerService.js
    handoffRelevanceService.js
    handoffFeedbackService.js
```

`ORCHESTRATOR_ENTERED` → `TerritoryBrief` (orienté mission, pas dump complet).

Zero-text signal :
```json
{ "semanticType": "TERRITORY_BRIEF_READY", "briefId": "brief-123", "territoryId": "...", "headSha": "...", "relevanceClass": "high" }
```

Feedback orchestrateur : `USED`, `DECISIVE`, `IRRELEVANT`, `STALE`, `WRONG`, `INCOMPLETE` → `SynapticPlasticityService`, negative memory.

### Phase 17-18 — Séparation Resident / Repair

**Aujourd'hui** : daemon → observe → choisit fichier → modifie → commit → PR

**Demain** :
```
Resident daemon → Finding F123 → verification → REPAIRABLE
Repair Episode → isolated workspace → worker → patch → verification → PR
```

Remplacer `genos-daemon/<repo>` par `genos-repair/F123` ou `genos-repair/<territory>/<finding>`. Réutiliser `createIsolatedWorkspace()`, `agentWorkspaceLifecycleService`, capsule cleanup.

### Phase 19 — Reconciler (autophagie continue)

Responsable : stale PIDs, orphan capsules, orphan worktrees, stale leases, abandoned repair branches, blocked jobs, unconsumed handoffs, stale graph fragments, expired findings, invalid snapshots.

Pipeline : detect → mark suspect → verify owner/liveness → grace period → reconcile → provenance.

### Phase 20 — Lifecycle biologique explicite

Activité : `BOOTSTRAPPING → SURVEYING → DORMANT → FOCUSED → INVESTIGATING → VERIFYING → REPORTING → DORMANT`

Santé (indépendant) : `HEALTHY → STRESSED → DEGRADED → SENESCENT → APOPTOTIC`

### Phase 21 — Hayflick redéfini

Sénescence = révisions cognitives coûteuses (phenotype mutations, territory rebuilds, failed repair promotions, memory rewrites), pas nombre de ticks.

### Phase 22-23 — Spécialisation par pression écologique

Pas de daemons prédéfinis. `ResidentDaemon` → pression (securityFindings, authChurn, secretEvents, dependencyRisk, verificationDemand) → `Security phenotype` émerge. Si pression redescend → phenotype dormant ou bud apoptosis.

Familles après noyau : Security, Contract, Historian, Chaperone, Metabolic, Dependency, Documentation, CrossRepo Symbiont, Repair, DeepResearch.

### Phase 24 — Stockage SQLite (élimine `daemon_repo_state.json`)

Tables minimales :
- `daemon_territories`, `daemon_runtime_state`
- `territory_graph_nodes`, `territory_graph_edges`
- `daemon_findings`, `daemon_finding_evidence`
- `daemon_handoffs`, `daemon_handoff_feedback`

Réutiliser existant : `agents`, `telemetry_events`, `provenance_records`, `signal_blobs`, `snapshots`, `memory`, Natural Search tables.

### Phase 25 — CLI daemon = host minimal

`backend/bin/genos-daemon.cjs` → parse flags, bootstrap DB, load configured resident daemons, start `ResidentDaemonRuntime`, install signal subscriptions, fallback timers, graceful shutdown.

Architecture services proposée :
```
backend/src/services/daemon/
├── residentDaemonRuntime.js
├── daemonRegistryService.js
├── daemonLifecycleService.js
├── daemonTerritoryService.js
├── daemonTerritoryInteroceptionService.js
├── daemonNaturalSearchAdapter.js
├── daemonEventBridgeService.js
├── daemonWakePolicyService.js
├── cartography/
├── findings/
├── investigation/
├── verification/
├── handoff/
├── reconciliation/
└── repair/
```

### Phase 26 — Migration progressive

Compatibilité : `OLD proactiveGitHubAnalyst` → projection compatibilité → lit territory/graph state. Puis dépréciation `runAutofixCycle`, `pickCandidateFile`, persistent worktree → RepairEpisode capsules, migration JSON → SQLite one-time.

### Phase 27 — Génome de base

```json
ResidentDaemon
  identity: { role: "resident_daemon" }
  objectives:
    primary: "maintain an evidence-grounded, revision-aware model of a territory"
  instincts:
    - observe_change
    - protect_provenance
    - avoid_unnecessary_llm
    - falsify_before_escalation
    - handoff_when_relevant
    - preserve_human_authority
  organelles:
    - cartography
    - interoception
    - natural-search
    - findings
    - verification
    - stigmergy
    - handoff
    - reconciliation
  authority:
    filesystem_write: false
    git_push: false
    merge: false
  memory:
    - episodic
    - semantic
    - procedural
    - negative-search
  communication:
    zero_text_first: true
```

**La réparation n'est PAS dans le génome de base.**

### Phase 28 — Orchestrateur reconnaît les daemons

Bootstrap orchestrateur :
```
identify workspace → identify territory → emit ORCHESTRATOR_ENTERED
→ wait short deterministic handoff budget → retrieve TerritoryBrief if available
→ construct world/self/task model → plan
```

Dégradation gracieuse : pas de daemon = continue normally ; daemon périmé = `brief.stale = true` ; daemon crashé = continue normally.

### Phase 29 — Handoff = suggestion, jamais injection invisible

Prompt orchestrateur reçoit :
```
Territorial Finding F12
status: SUPPORTED
claim: foo.js may violate invariant I4
evidence: observational..., experimental...
contradictions: ...
limitations: not causally verified
```

L'orchestrateur sait : what is known, what is believed, why, by whom, how fresh.

### Phase 30 — Sécurité et autorité

Par défaut :
```
Resident daemon: READ, INDEX, OBSERVE, TEST-SAFE, SNAPSHOT, SIGNAL
NO WRITE, NO COMMIT, NO PUSH, NO MERGE
```

RepairEpisode obtient : temporary lease + finding id + scope + allowed commands + budget + expiration. Une lease ne devient jamais « trusted donc tout permis ».

### Phase 31 — Scheduler métabolique

```
cheap sensing           → always
incremental graph update → after changes
static checks           → low cost
LLM reasoning           → only on pressure
deep causal replay      → idle / high-value
memory consolidation    → sleep cycle
```

Utilité computationnelle testable :
$$ U(a) = \frac{ExpectedInformationGain(a) \times Relevance(a) \times Urgency(a)}{ComputeCost(a) + InterferenceCost(a)} $$

### Phase 32-34 — Expérimentation + Ablations obligatoires

Benchmark scientifique (Constitution) :
- A : LLM seul
- B : LLM + GenOS (no resident daemon)
- C : LLM + GenOS (warm resident daemon)

Même model/task/repo/HEAD/tools/token budget.

Mesures : task success, correct localization, time to first relevant symbol, tokens, tool calls, files opened, wrong hypotheses, repeated investigation, patch correctness, regressions, daemon compute cost, handoff usefulness, false-finding rate, staleness errors.

Maturité daemon : C0 (cold) vs C1 (1 commit) vs C5 vs C20 vs C100 → mesurer Performance(N).

Ablations biomimétiques : FULL vs no-stigmergy vs no-negative-memory vs polling vs event-driven vs no-territorial-history vs raw repository digest.

### Phase 35 — Tests techniques indispensables (pré-requis benchmark LLM)

- restart preserves daemon identity + territory knowledge
- branch switch does not contaminate findings
- HEAD change marks evidence stale correctly
- refuted finding remains refuted
- same LLM evidence isn't counted independent
- zero-text signals wake correct daemon
- no signal storm
- graph incremental update == clean rebuild
- crash during graph update remains recoverable
- orchestrator works with daemon unavailable
- daemon cannot write without lease
- repair cannot escape workspace
- expired lease blocks mutation
- tenant isolation holds
- secret never enters handoff/telemetry
- **`rebuild(graph(repo)) == incremental_graph_after_same_changes`** (invariant de test)

### Phase 36 — Ordre d'implémentation concret

| Sprint  | Livraison                                                  |
| ------- | ---------------------------------------------------------- |
| **D0**  | ADR + contrat `ResidentDaemon` + modèle Territory          |
| **D1**  | tables SQLite + persistence + migration ancien JSON        |
| **D2**  | `ResidentDaemonRuntime` + vrai AgentGenome                 |
| **D3**  | EventBridge + zero-text receptors                          |
| **D4**  | TerritoryInteroception + homeostasie                       |
| **D5**  | Cartographer v1 + graphe incrémental                       |
| **D6**  | Finding model + provenance                                 |
| **D7**  | NaturalSearch adapter                                      |
| **D8**  | Resident Investigator                                      |
| **D9**  | Verifier + reproduction + causal receipts                  |
| **D10** | Stigmergic territorial markers                             |
| **D11** | Handoff Protocol                                           |
| **D12** | feedback/plasticité des handoffs                           |
| **D13** | Reconciler/autophagie                                      |
| **D14** | RepairEpisode isolé                                        |
| **D15** | suppression `mtime` + dépréciation autofix actuel          |
| **D16** | spécialisation écologique                                  |
| **D17** | benchmark daemon warm-start                                |
| **D18** | ablations biomimétiques                                    |
| **D19** | optimisation coûts/latence                                 |
| **D20** | promotion expérimentale → stable si preuves suffisantes    |

## MVP (ce qui est réellement construit en premier)

**Seulement** :
- `ResidentDaemonRuntime`, `Territory`
- `Cartographer`, `ResidentInvestigator`, `Verifier`, `Reconciler`
- `Finding`, `TerritoryBrief`
- `Signal Plane`, `Natural Search`, `Provenance`, `Homeostasis`, `Stigmergy`

**Aucune réparation automatique** au début.

**Test décisif MVP** : Un orchestrateur qui arrive sur un repository déjà surveillé par un daemon résout-il mieux et moins cher une mission qu'un orchestrateur équivalent arrivant à froid ?

Si **oui** → justification scientifique pour l'écologie complète.
Si **non** → modifier ou abandonner avant 20k lignes de complexité.

C'est la manière GenOS : la nature suggère le processus de recherche ; GenOS exige que l'expérience décide s'il mérite de survivre.

## Principes

1. **Evidence gates first** — tout finding passe par evidence gates/leases/circuit breakers, jamais par analogie biologique
2. **Claim ≠ evidence** — algèbre de preuve typée, pas score de confiance
3. **Success ≠ truth** — transport réussi ≠ décision valide
4. **Zero-text** — signal minimal, artefact riche à la demande
5. **Réversibilité** — tout peut être déprécié/refuté
6. **Ablation obligatoire** — chaque mécanisme biomimétique doit prouver sa valeur
7. **Provenance native** — réutiliser `provenance_records`, pas créer `daemon_provenance`
8. **Stigmergie native** — réutiliser `genos-signal`, pas créer message bus
9. **Natural Search natif** — adapter, pas dupliquer
10. **Territoire commit-aware** — connaissance scopée à HEAD, invalidée sur changement

## Alternatives

### 1. Améliorer `genos-daemon.cjs` existant (ajouter fonctions)

Rejeté : architecture cron/LLM fondamentale incompatible avec les invariants. Le changement doit être architectural (catégorie d'agent), pas incrémental.

### 2. Lancer 5-10 daemons spécialisés permanents

Rejeté : viole « daemon ≠ worker long-lived », pression inference inutile, pas de pression écologique. Modèle organelles + budding sous contrainte est supérieur.

### 3. Daemon comme simple cache de fichiers (GitIngest-like)

Rejeté : le graphe doit être index dérivé reconstructible, pas cache opaque. Pas de dépendance vitale à un cache.

## Conséquences

### Positives
- Architecture alignée sur Constitution GenOS (evidence gates, zero-text, provenance, Natural Search)
- Daemon devient un **milieu** pour Natural Search, pas un moteur de raisonnement parallèle
- Handoff mesurable et améliorable par plasticité
- Séparation nette observation/décision/intervention
- Expérimentation scientifique intégrée dès le design

### Négatives
- Complexité initiale significative (D0-D6 avant premier handoff utile)
- Migration progressive requise (compatibilité daemon existant)
- Nécessite discipline : ne pas réactiver `pickCandidateFile()` / autofix par commodité
- Benchmarks d'ablation longs (runs runtime complets)

## Prochaines étapes (immédiates)

1. ✅ **ADR 0034** (ce document)
2. ✅ **D0** — Contrat `ResidentDaemon` + modèle `Territory` (schémas + types)
3. ✅ **D1** — Migration SQLite + tables minimales + migration `daemon_repo_state.json`
4. ✅ **D2** — `ResidentDaemonRuntime` + `resident_daemon.agent.json` + registration
5. ✅ **D3** — `EventBridge` + receptors zero-text + fallback timer
6. ✅ **D4** — `TerritoryInteroception` + homéostasie (journal `daemon_events`)
7. ✅ **D5** — `Cartographer` v1 + graphe incrémental (`rebuild == incremental` testé)
8. ✅ **D6** — `Finding` + preuve typée + lifecycle fermé
9. ✅ **D7** — `NaturalSearch` adapter (ledger + pression, zéro moteur dupliqué)
10. ✅ **D8** — `ResidentInvestigator` + 4 détecteurs déterministes
11. ✅ **D9** — `Verifier` + reproduction + règles par détecteur
12. ✅ **D10** — marqueurs stigmergiques territoriaux (attention, pas vérité)
13. ✅ **D11** — `Handoff Protocol` (`TerritoryBrief` + signal `TERRITORY_BRIEF_READY`)
14. ✅ **D12** — feedback/plasticité des handoffs
15. ✅ **D13** — `Reconciler`/autophagie
16. ✅ **D14** — `RepairEpisode` isolé (lease + tracking, exécution par worker)
17. ✅ **D15** — suppression `mtime` + dépréciation autofix (no-op vers RepairEpisode)
18. ✅ **D16** — spécialisation écologique (phénotypes par pression, budding/dormance)
19. ✅ **D17** — benchmark warm-start (proxy déterministe cold vs warm)
20. ✅ **D18** — ablations biomimétiques (6 bras, FULL domine)
21. ✅ **D19** — ordonnanceur métabolique U(a) (LLM gaté, budgets)
22. ✅ **D20** — gate de promotion experimental → stable (reçus persistés)

## État d'implémentation (2026-09-23, D0–D20)

| Sprint | Livraison | Fichiers | Écart au plan |
| ------ | --------- | -------- | ------------- |
| D0 | 3 contrats JSON (`genos.daemon/v1`) | `spec/daemon-territory.schema.json`, `spec/daemon-finding.schema.json`, `spec/resident-daemon.schema.json` | — |
| D1 | migration 037 + `daemonTerritoryService` + migration legacy | `migrateDaemonTerritory.js`, `daemonTerritoryService.js`, `daemonLegacyMigration.js` | — |
| D2 | runtime + génome `resident_daemon` | `residentDaemonRuntime.js`, `agents/daemons/resident_daemon.agent.json` | pas de `daemonRegistryService`/`daemonLifecycleService` séparés (fonctions dans le runtime v1) |
| D3 | bridge + registre + wake policy | `daemonEventBridgeService.js`, `daemonReceptorRegistry.js`, `daemonWakePolicyService.js` | réutilise `signalReceptorService` comme transport, pas de doublon |
| D4 | journal 038 + interoception + `combinePressures` | `migrateDaemonEvents.js`, `daemonTerritoryInteroceptionService.js` | 6 variables mesurées, 10 déclarées `deferred` (D5/D6) — aucune valeur fantôme |
| D5 | graphe 039 + scan/incrémental + adapter JS | `cartography/` (4 fichiers), `migrateTerritoryGraph.js` | relations CALLS/EXTENDS/etc. différées ; invariant `rebuild == incremental` tenu après correction d'un vrai bug (IMPORTS entrants) |
| D6 | findings 040 + lifecycle + preuve typée | `findings/` (3 fichiers), `migrateDaemonFindings.js` | `confidence` interdit ; provenance par référence uniquement |
| D7 | adapter ledger + pression | `daemonNaturalSearchAdapter.js` | testé contre les vraies classes `HypothesisLedger`/`SearchPressureModel` |
| D8 | payload 041 + journal lecture + 4 détecteurs + investigateur | `daemonEventLog.js`, `investigation/` (2 fichiers), `migrateDaemonEventPayload.js` | `pickCandidateFile()` non réutilisé (obsolète comme prévu) |
| D9 | `detector_id` 042 + verifier + reproduction | `verification/` (2 fichiers), `migrateDaemonFindingDetector.js` | reproduction causale complète (snapshot+contrôle) différée ; v1 = re-observation d'événements indépendants |
| D10 | marqueurs 043 + decay + pont partagé | `daemonStigmergyService.js`, `migrateDaemonStigmergy.js` | `PERFORMANCE_REGRESSION` sans mapping pont (local-only, honnête) ; `genos-signal` Rust non branché (pont JS utilisé) |
| D11 | handoffs 044 + brief mission-first + signal zero-text | `handoff/` (3 fichiers), `migrateDaemonHandoffs.js` | brief complet récupéré sur demande uniquement, jamais dans le signal |
| D12 | feedback 045 + plasticité par démotion | `handoffFeedbackService.js`, `migrateDaemonHandoffFeedback.js` | comptage explicite, pas d'entraînement de modèle |
| D13 | reconciler + expiry déclarée + rétention journal | `reconciliation/reconcilerService.js` | PIDs/capsules/leases orphelins hors scope tant que D14 non persisté |
| D14 | repair episodes 050 + lease scopée + exécution worker | `repair/repairEpisodeService.js`, `migrateDaemonRepair.js` | service sans filesystem (capsule provisionnée par le worker) ; reconciler expire les épisodes périmés |
| D15 | suppression `pickCandidateFile()` + autofix en no-op déprécié | `daemonRepoWorkerService.js`, `daemonAgentAutostart.js` | `runAutofixCycle` conservé comme stub (compat) pointant vers RepairEpisode ; sync de branches + MR inchangés |
| D16 | phénotypes 054 + budding/dormance par pression | `specialization/phenotypeService.js`, `migrateDaemonPhenotype.js` | 4/10 familles (security, contract, dependency, documentation) ; 6 autres différées faute de signaux mesurés ; hystérésis 0.3/0.6 |
| D17 | benchmark warm-start + runs 055 | `evaluation/warmStartBenchmark.js` | proxy déterministe (rappel de connaissance), pas succès LLM bout en bout — protocole live A/B/C reste hors ligne |
| D18 | 6 bras d'ablation + deltas vs FULL | `evaluation/ablationRunner.js` | vues filtrées d'un même brief (pas de re-compilation dupliquée) ; FULL domine par construction des vues |
| D19 | ordonnanceur U(a) + plan métabolique | `scheduling/computeScheduler.js` | pur, sans IO ; sensing toujours, LLM gaté (seuil + budget + machine) |
| D20 | gate experimental → stable + reçus | `maturity/promotionService.js` | seuils : ≥3 paires warm, gain moyen ≥1, FULL dominant, faux-findings ≤0.5, 0 staleness, suites vertes |

Chaque sprint : suite de tests dédiée (`backend/tests/test_daemon_*.js`, 24 suites vertes), quality gate 0 violation sur les fichiers du sprint. Deux bugs réels trouvés par les tests : parsing TZ de `last_observed_at`, comparaison de formats `created_at` mixtes.

## Maturité du daemon (D20)

Statut : **EXPERIMENTAL**. Le gate de promotion est implémenté et testé (chemins STABLE et EXPERIMENTAL), mais le protocole live complet (runs LLM A/B/C Phase 32-34 sur même modèle/tâche/repo/HEAD/budget) n'a pas été exécuté : la promotion reste bloquée jusqu'à ces preuves. Le proxy déterministe montre un gain de rappel warm ≥ 0 ; les ablations montrent FULL dominant sur les vues.

## Références

- Constitution GenOS : `GENOS_PHILOSOPHICAL_CONSTITUTION.md`
- Signal Plane zero-text : `docs/01-concepts/signal-plane-zero-text.md`
- Natural Search Control Plane : `docs/01-concepts/natural-search-control-plane.md`
- Épistémologie et evidence : `docs/01-concepts/epistemologie-et-evidence.md`
- Stigmergie : `crates/genos-signal/src/stigmergy.rs`
- Daemons existants : `agents/orchestration/workspace_git_daemon.agent.json`, `agents/integration/sentinel_daemon_keeper.agent.json`
- Runtime agentique : `docs/01-concepts/runtime-agentique.md`
- MCP tools/leases : `docs/03-reference/outils-mcp.md`