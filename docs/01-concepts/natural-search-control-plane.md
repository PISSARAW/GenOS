# Natural Search Control Plane

- **Statut** : Phases 1–5 : implémentation partielle avec intégration runtime expérimentale. Phases 6–12 : composants prototypes présents, intégration complète aux primitives runtime non démontrée. Persistance SQLite : service implémenté et branché au cycle runtime (save + flush), durabilité inter-redémarrage non démontrée.
- **Portée** : `backend/src/services/search/*.js`, `backend/tests/search/test_*.js`, `docs/adr/0032-natural-search-control-plane.md`.
- **Dernière revue** : 2026-09-23.
- **Jeu de tests** : `npm --prefix backend run test:natural-search` lance `test_natural_search_controller.js` (Controller + hystérésis), `test_natural_search_runtime_e2e.js`, `test_natural_search_e2e_pipeline.js` (pipeline réel `checkNaturalSearchControl()` avec DB SQLite) et `test_natural_search_full_pipeline_e2e.js`. Le `run_validation_suite.js profile=smoke` exécute les 5 suites Natural Search.

## État d'implémentation

| Composant | Statut | Fichier | Intégration pipeline |
| --- | --- | --- | --- |
|| Causal Progress Sensor | ✅ | `causalProgressService.js` | ✅ via `checkNaturalSearchControl()` |
|| Entropy×Progression Classifier | ✅ | `entropyProgressClassifier.js` | ✅ |
|| Hypothesis Ledger | ✅ | `hypothesisLedgerService.js` | ✅ |
|| Search Pressure Model | ✅ | `searchPressureService.js` | ✅ |
|| Natural Search Controller | ✅ | `naturalSearchController.js` | ✅ hystérésis + PROCESS_LEVEL |
|| Natural Search Actuator | ✅ | `naturalSearchActuatorService.js` | ✅ primitives GenOS réelles + persistance via `SearchPersistence` + encapsulation des 7 modules isolés via `ActuatorModules` |
|| SearchReceipt | ✅ | `SearchReceipt.js` | ✅ |
|| Runtime Integration | ✅ | `agentProcessEventPipeline.js` | ✅ via `checkNaturalSearchControl()` |
|| Persistance SQLite | ✅ | `searchPersistenceService.js` | ✅ `saveHypothesis`/`saveProof`/`savePressure`/`saveDecision`/`savePatchVisit`/`saveGenomeSnapshot`/`saveReplayLog` + flush garanti dans `clearSearchState` |
|| E2E — composants isolés | ✅ | `test_natural_search_runtime_e2e.js` | ✅ |
|| E2E — pipeline `checkNaturalSearchControl()` | ✅ | `test_natural_search_e2e_pipeline.js` | ✅ appelle `checkNaturalSearchControl()` avec DB SQLite réelle |
|| `test_search_evolution.js` | ✅ | `test_search_evolution.js` | ✅ EVOLUTION process + actuator cohérents |
|| SearchGenome | ✅ intégré | `searchGenomeService.js` | ✅ via Actuator (FORAGE/STRESS_HYPERMUTATION/EVOLUTION) |
|| Cognitive Affinity | ✅ intégré | `cognitiveAffinityService.js` | ✅ via Actuator (CLONAL_AFFINITY_SEARCH → createVariants + selectBestVariant) |
|| Generalized Foraging | ✅ intégré | `searchPatchService.js` | ✅ via Actuator (FORAGE → patch lifecycle) |
|| Causal Replay Service | ✅ intégré | `causalReplayService.js` | ✅ via Actuator (REPLAY_CAUSAL → checkpoints + replay) |
|| Negative Search Memory | ✅ intégré | `negativeSearchMemoryService.js` | ✅ via runtime (falsification → recordNegativeOutcome) |
|| Search Evolution | ✅ intégré | `searchEvolutionService.js` | ✅ via Actuator (EVOLUTION → evolveSearchPopulation) |
|| Cultural Transmission | ✅ intégré | `searchCultureService.js` | ✅ via runtime (succès EVOLUTION/CLONAL → compilePlasmid + transmit) |

## Architecture finale

```
Event (AGENT_STEP / EVIDENCE_REPORT / AGENT_FAILED)
  ↓
agentProcessEventPipeline.processEventQueueImpl()
  ↓
checkNaturalSearchControl(ctx, event)
  ├─ CausalProgressService.ingestEvent()
  ├─ HypothesisLedger.addEvidence() / propose()   ← PROVENANCE forcé à SELF_REPORTED par le runtime
  ├─ NaturalSearchController.selectProcess()
  │    └─ PROCESS_LEVEL (CONTINUE=0 … EVOLUTION=6)
  │    └─ Hystérésis : blocage downgrade uniquement, escalation toujours autorisée
  ├─ NaturalSearchActuator.execute()
  │    ├─ FORAGE           → forage() + SearchPatchService (patch lifecycle + MVT)
  │    ├─ PLASTICITE       → plasticity() + applySnapshotState (DB)
  │    ├─ CLONAL_AFFINITY_SEARCH → clonalAffinity() + CognitiveAffinity (createVariants + selectBestVariant) + ledger.propose
  │    ├─ STRESS_HYPERMUTATION   → hypermutation() + SearchGenomeService.mutateGenome + saveGenomeSnapshot
  │    ├─ SPECIATION             → speciation() + INSERT niches (DB)
  │    ├─ EVOLUTION              → evolution() + SearchEvolutionEngine.evolve + saveGenomeSnapshot
  │    ├─ REPLAY_CAUSAL          → replayCausal() + CausalReplayService (checkpoints) + saveReplayLog
  │    └─ CONTINUE               → no-op
  ├─ Negative Search Memory (falsification → recordNegativeOutcome)
  ├─ Cultural Transmission (succès EVOLUTION/CLONAL → compilePlasmid + transmit)
  └─ SearchPersistence.saveHypothesis/saveProof/savePressureState/saveDecision/savePatchVisit/saveGenomeSnapshot/saveReplayLog()
      ↓ (à la fin)
  clearSearchState() → flushSearchState() → suppression état mémoire
```

## Points d'audit résolus

| Point | Description | Statut |
| --- | --- | --- |
| 1 | Hystérésis : mapping PHASE_EXIT + logique hold | ✅ corrigé |
| 2 | Actuator : enum EVOLUTION + méthodes *Sync | ✅ corrigé |
| 3 | Hypothèses à partir d'événements runtime (`maybeProposeHypothesis`) | ✅ implémenté |
| 4 | Preuve → hypothèse par `hypothesisId` (rejet preuve sans ID + falsifiée) | ✅ implémenté |
| 5 | `executeProcess({selection, searchCtx, actuator})` + `searchCtx` transmis | ✅ corrigé |
| 6 | Source unique `searchProcessTypes.js` | ✅ implémenté |
| 7 | Actuator → primitives GenOS réelles (PLASTICITE/CLONAL/SPECIATION/REPLAY_CAUSAL/EVOLUTION) | ✅ terminé |
| 8 | Persistence SQLite opérationnelle (API async `sqlite`) | ✅ implémenté |
| 9 | E2E pipeline `checkNaturalSearchControl()` avec vraie DB SQLite | ✅ implémenté |
|| 11 | Actuator → encapsulation des 7 modules isolés via `ActuatorModules` (actuatorModules.js) | ✅ terminé |
|| 12 | Mémoire négative + culture branchées au runtime (falsification → recordNegativeOutcome, succès → compilePlasmid + transmit) | ✅ implémenté |

### Correctifs P0/P1 livrés le 2026-09-23

- **`stepsSinceChange` compteur** : reset à 0 au changement de processus, incrémenté sinon (était figé / jamais mis à jour).
- **Provenance runtime-only** : `payload.provenance` / `payload.evidenceProvenance` ignorés dans `resolveProvenance()` ; un agent ne peut plus s'auto-attribuer `observed`/`verified`.
- **`ingestFailureEvidence agentId`** : `ReferenceError` corrigé (`searchState.agentId` persisté dans `getOrCreateSearchState`), signature `checkNaturalSearchControl(ctx, event, finalEvent)` alignée sur l'appel pipeline à 3 arguments.
- **Protocole hypothèses runtime** : nouveau `hypothesisEventProtocol.js` — `HYPOTHESIS_PROPOSED` (avec `hypothesisId` explicite), `HYPOTHESIS_TEST_STARTED`, `HYPOTHESIS_PROGRESS`, `HYPOTHESIS_FALSIFIED`, `HYPOTHESIS_SUSPENDED`, plus proposition via `hypothesisStatement` et auto-génération sur gain d'information.
- **CI** : doublon `test:natural-search` supprimé dans `package.json`, suite `full_pipeline_e2e` ajoutée à `test:natural-search` et au profil `smoke` de `run_validation_suite.js`.

### Correctifs P0/P1 livrés le 2026-09-22

- **`ledger.PROVENANCE → undefined`** : `naturalSearchRuntime.js` importait `HypothesisLedger, HYPOTHESIS_STATUS` depuis `hypothesisLedgerService` mais utilisait `ledger.PROVENANCE.SELF_REPORTED`. Correction : import explicite `{ HypothesisLedger, HYPOTHESIS_STATUS, PROVENANCE }` et usage de `PROVENANCE.SELF_REPORTED`. Le runtime force `SELF_REPORTED` pour toute preuve injectée via `ingestEvidence`.
- **Hystérésis inversée (escalade bloquée)** : l'ancienne logique faisait `holdProcess = true` quand `p >= PHASE_ENTER[lastProcess]`, ce qui bloquait toute montée. Correction : `PROCESS_LEVEL` explicite + hystérésis uniquement sur `desiredLevel < currentLevel`.
- **`stepsSinceChange` ne reset pas** : incrémenté dans tous les cas sans reset au changement de processus. Correction : reset à 0 quand `process !== this.lastProcess`, incrémente sinon.
- **Actuator `EVOLUTION` manquant** : l'Actuateur n'exportait pas `EVOLUTION` dans son `SEARCH_PROCESS` local. L'Actuator utilise désormais `searchProcessTypes.js` comme source unique.
- **`executeProcess` sans agentId** : `searchCtx.agentId` requis, sinon log + retour null.
- **Path `../../db` vs `../db`** : le chemin relatif correct depuis `services/search/` vers `db/` est `../../db`.

## Limitations connues

- **Persistence SQLite** : flush garanti via `clearSearchState()` → `flushSearchState()`.
- **Provenance** : `resolveProvenance()` route selon le type d'événement (EVIDENCE_REPORT→VERIFIED, AGENT_STEP→SELF_REPORTED, TOOL→OBSERVED, autre→INFERRED). Les champs `payload.provenance` / `payload.evidenceProvenance` sont ignorés : l'autorité sur la provenance vient du runtime, pas du producteur de la claim.
- **Création proactive** : après 5 étapes sans progrès, `proactiveHypothesis()` génère une hypothèse à partir du genome courant.
- **Encapsulation** : les 7 modules isolés (SearchGenome, CognitiveAffinity, SearchPatch, CausalReplay, NegativeSearchMemory, SearchEvolution, SearchCulture) sont directement instanciés par `ActuatorModules` dans l'Actuator, pas via `SearchIntegration` (service non existant dans ce commit).

## Expérience décisive planning-gap (2026-09-23)

- **Protocole** : même modèle du monde (successeurs + heuristique partagés), même budget (120 expansions), vérificateur indépendant qui rejoue chaque plan. 12 tâches long-horizon (Blocksworld type Sussman + TrapChain à clés/détours). Commande : `npm --prefix backend run test:planning-gap`. Résultats bruts : `benchmarks/planning-gap/results/2026-09-23-baseline.json`.
- **Résultat** : ReAct 8/12, ToT 10/12, MCTS 3/12, GenOS 6/12. La myopie est démontrée (`bw-swap` piège le glouton pendant que ToT réussit), mais **le planning gap n'est pas fermé** : à budget égal, ToT fait mieux que le contrôleur actuel.
- **Lecture** : le contrôle pression + hystérésis + ledger + mémoire négative sous-explore sur les tours longues (largeur dictée par le rayon trop souvent à 1–2, faisceau tronqué à 4). Piste : élargir le rayon STRUCTUREL/RADICAL et conserver la diversité du faisceau au lieu de tronquer au meilleur score heuristique.

## Principe fondamental

> **Nature is not a database of solutions. Nature is a collection of search processes.**

$$\boxed{
\text{Observe}
\rightarrow
\text{Measure progress}
\rightarrow
\text{Sense pressure}
\rightarrow
\text{Change search process}
\rightarrow
\text{Test}
\rightarrow
\text{Remember}
}$$

## Références biologiques

1. Spiro, Parkinson & Othmer 1997 — chemotaxie bactérienne
2. Schwab, Casasa & Moczek 2019 — plasticité développementale
3. Foster 2007 — mutagenèse de stress
4. Bowers, Boyle & Damoiseaux 2018 — maturation d'affinité
