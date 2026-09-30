# Natural Search Control Plane

- **Statut au 2026-09-30** : Phases 1–5 : implémentation partielle et expérimentale. Les chemins d'exécution runtime des phases 6–12 sont raccordés, selon la matrice ci-dessous. La reprise des hypothèses, preuves et compteurs de pression est démontrée après fermeture/réouverture SQLite; la durabilité de l'état propre à chacun des sept modules reste incomplète.
- **Portée** : `backend/src/services/search/*.js`, `backend/tests/search/test_*.js`, `docs/adr/0032-natural-search-control-plane.md`.
- **Dernière revue** : 2026-09-30.
- **Preuve de reprise** : `node backend/tests/search/test_natural_search_full_pipeline_e2e.js` exécute le pipeline contre une base SQLite fichier, la ferme et la rouvre, puis vérifie la restauration du ledger, d'une preuve et des compteurs de pression. Cela valide la reprise de ces données, pas celle de tous les états des modules 6–12.

## État d'implémentation

| Composant | Statut | Fichier | Intégration pipeline |
| --- | --- | --- | --- |
| Causal Progress Sensor | ✅ | `causalProgressService.js` | ✅ via `checkNaturalSearchControl()` |
| Entropy×Progression Classifier | ✅ | `entropyProgressClassifier.js` | ✅ |
| Hypothesis Ledger | ✅ | `hypothesisLedgerService.js` | ✅ |
| Search Pressure Model | ✅ | `searchPressureService.js` | ✅ |
| Natural Search Controller | ✅ | `naturalSearchController.js` | ✅ hystérésis + PROCESS_LEVEL |
| Natural Search Actuator | ✅ | `naturalSearchActuatorService.js` | ✅ dispatch des primitives runtime + `ActuatorModules` |
| SearchReceipt | ✅ | `SearchReceipt.js` | ✅ |
| Runtime Integration | ✅ | `agentProcessEventPipeline.js` | ✅ via `checkNaturalSearchControl()` |
| Persistance SQLite | ⚠️ partielle | `searchPersistenceService.js` | Écritures ledger, pression, décisions et journaux; reprise opérationnelle limitée au ledger et aux compteurs de pression |
| E2E — composants isolés | ✅ | `test_natural_search_runtime_e2e.js` | ✅ |
| E2E — pipeline `checkNaturalSearchControl()` | ✅ | `test_natural_search_e2e_pipeline.js` | ✅ appelle `checkNaturalSearchControl()` avec SQLite |
| `test_search_evolution.js` | ✅ | `test_search_evolution.js` | ✅ EVOLUTION process + actuator cohérents |

### Phases 6–12 : raccordement runtime et reprise

| Phase | Module | Point d'entrée runtime | Reprise après redémarrage |
| --- | --- | --- | --- |
| 6 | Search Genome — `searchGenomeService.js` | Actuator `STRESS_HYPERMUTATION` et `EVOLUTION`; instantanés écrits en SQLite | Instantanés écrits, génome courant/population non rechargés |
| 7 | Cognitive Affinity — `cognitiveAffinityService.js` | Actuator `CLONAL_AFFINITY_SEARCH`: crée/classe les variants et propose le variant retenu au ledger | Les hypothèses résultantes sont restaurées; variants transitoires non restaurés |
| 8 | Generalized Foraging — `searchPatchService.js` | Actuator `FORAGE`: crée/actualise un patch et décide du départ | Visites enregistrées; historique et état du patch non rechargés |
| 9 | Causal Replay — `causalReplayService.js` | Actuator `REPLAY_CAUSAL`: rejoue les événements et écrit un journal | Journal écrit; checkpoints et historique causal non rechargés par Natural Search |
| 10 | Negative Search Memory — `negativeSearchMemoryService.js` | Runtime: falsification/échec → `recordNegativeOutcome` | Mémoire en processus, non restaurée depuis SQLite |
| 11 | Search Evolution — `searchEvolutionService.js` | Actuator `EVOLUTION`: fait évoluer la population et écrit un instantané | Instantané écrit, population évoluée non rechargée |
| 12 | Cultural Transmission — `searchCultureService.js` | Après succès `EVOLUTION`/`CLONAL_AFFINITY_SEARCH`: compile et transmet un plasmide | Culture et transmissions non restaurées par ce chemin SQLite |

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

- **Persistance SQLite** : `clearSearchState()` attend le flush avant de supprimer l'état mémoire. À l'initialisation, le runtime recharge les hypothèses, preuves et compteurs de pression. Le test décrit plus haut vérifie ces données après fermeture et réouverture du fichier SQLite. Les artefacts des phases 6–12 ne constituent pas encore une reprise complète: plusieurs sont journalisés sans réhydratation de leur état opérationnel.
- **Provenance** : `resolveProvenance()` route selon le type d'événement (EVIDENCE_REPORT→VERIFIED, AGENT_STEP→SELF_REPORTED, TOOL→OBSERVED, autre→INFERRED). Les champs `payload.provenance` / `payload.evidenceProvenance` sont ignorés : l'autorité sur la provenance vient du runtime, pas du producteur de la claim.
- **Création proactive** : après 5 étapes sans progrès, `proactiveHypothesis()` génère une hypothèse à partir du genome courant.
- **Encapsulation** : les sept modules sont instanciés par `ActuatorModules`; `SearchIntegration` existe et est utilisé pour la mémoire négative. Le raccordement des chemins d'exécution ne garantit pas que chaque état est durable et restauré.

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
