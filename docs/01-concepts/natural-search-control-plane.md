# Natural Search Control Plane

- **Statut au 2026-09-30** : Phases 1–12 raccordées au runtime; l'état des sept modules opérationnels est persisté dans `search_module_state` et restauré après réouverture SQLite. Un E2E vérifie génome, variants, patch, historique de replay, mémoire négative, population évolutionnaire et culture. Cela prouve le round-trip de ces états, pas une reprise d'exécution complète depuis tous les événements de l'agent.
- **Portée** : `backend/src/services/search/*.js`, `backend/tests/search/test_*.js`, `docs/adr/0032-natural-search-control-plane.md`.
- **Dernière revue** : 2026-09-30.
- **Preuve de reprise** : `npm --prefix backend run test:natural-search` exécute les E2E SQLite du pipeline et le test `test_natural_search_module_restore.js`, qui ferme/réouvre SQLite et vérifie l'état opérationnel des sept modules.

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
| Persistance SQLite | ✅ états de modules restaurés | `searchPersistenceService.js`, `moduleStatePersistence.js` | Ledger, preuves, pression et état sérialisable des sept modules rechargés après redémarrage; rejouer les événements source reste hors de ce contrat |
| E2E — composants isolés | ✅ | `test_natural_search_runtime_e2e.js` | ✅ |
| E2E — pipeline `checkNaturalSearchControl()` | ✅ | `test_natural_search_e2e_pipeline.js` | ✅ appelle `checkNaturalSearchControl()` avec SQLite |
| `test_search_evolution.js` | ✅ | `test_search_evolution.js` | ✅ EVOLUTION process + actuator cohérents |

### Phases 6–12 : raccordement runtime et reprise

| Phase | Module | Point d'entrée runtime | Reprise après redémarrage |
| --- | --- | --- | --- |
| 6 | Search Genome — `searchGenomeService.js` | Actuator `STRESS_HYPERMUTATION` et `EVOLUTION`; instantanés + état courant écrits en SQLite | Génome courant rechargé; snapshots historiques restent des enregistrements |
| 7 | Cognitive Affinity — `cognitiveAffinityService.js` | Actuator `CLONAL_AFFINITY_SEARCH`: crée/classe les variants et propose le variant retenu au ledger | Variants transitoires sérialisables restaurés |
| 8 | Generalized Foraging — `searchPatchService.js` | Actuator `FORAGE`: crée/actualise un patch et décide du départ | Patch, historique et visites restaurés; métrique de rendement reste lexicale |
| 9 | Causal Replay — `causalReplayService.js` | Actuator `REPLAY_CAUSAL`: rejoue les événements fournis, garde le point de reprise et les checkpoints en mémoire | Historique de replay sérialisable rechargé; les événements source et l'état externe ne sont pas reconstruits |
| 10 | Negative Search Memory — `negativeSearchMemoryService.js` | Runtime: falsification/échec → `recordNegativeOutcome` | Trails, conditions et TTL restaurés; les trails expirés restent filtrés par leur durée |
| 11 | Search Evolution — `searchEvolutionService.js` | Actuator `EVOLUTION`: fait évoluer la population et écrit un instantané | Population, génération et historique rechargés |
| 12 | Cultural Transmission — `searchCultureService.js` | Après succès `EVOLUTION`/`CLONAL_AFFINITY_SEARCH`: compile et transmet un plasmide | Plasmides et transmissions restaurés dans le service d'Actuator |

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

## Planning-gap (mesure du 2026-09-30)

`npm --prefix backend run test:planning-gap` compare 12 tâches au même budget de
240 expansions et vérifie chaque plan avec le validateur du domaine. GenOS trie
sa frontière par coût cumulé + heuristique (admissibilité TrapChain à corriger), enregistre le meilleur
coût par état et utilise le contrôleur/ledger pour tracer l'exploration. Les
heuristiques Blocksworld comptent les blocs hors préfixe de support; TrapChain
utilise une distance de grille relâchée qui inclut le détour par une
clé même lorsque la porte peut être contournée. `trap-far-key` place désormais la clé du côté accessible du mur : elle
était auparavant derrière la porte qu'elle seule pouvait ouvrir, donc la tâche
était impossible. Résultats mesurés : ReAct 9/12, ToT 11/12, MCTS 6/12, GenOS
12/12. Les plans GenOS sont optimaux pour les sept tâches Blocksworld; les plans
de `bw-swap` (6) et `bw-tower-5` (8) atteignent la longueur BFS optimale. Le
budget est passé de 120 à 240 pour couvrir le cas `bw-table-6` (193 expansions).
ToT laisse encore une tâche irrésolue. Ces tâches restent synthétiques.
Résultats bruts par tâche et plans vérifiés :
`benchmarks/planning-gap/results/2026-09-30-a-star-240.json`.
Ces 12 tâches synthétiques valident le harness et ne mesurent pas des missions
web ou des tâches de planification de production.

## Limitations connues

- **Persistance SQLite** : `clearSearchState()` attend le flush avant de supprimer l'état mémoire. Le runtime recharge hypothèses, preuves, compteurs et états sérialisables des phases 6–12 après réouverture. Il ne reconstitue pas encore l'exécution externe à partir du journal événementiel complet de l'agent.
- **Provenance** : `resolveProvenance()` route selon le type d'événement (EVIDENCE_REPORT→VERIFIED, AGENT_STEP→SELF_REPORTED, TOOL→OBSERVED, autre→INFERRED). Les champs `payload.provenance` / `payload.evidenceProvenance` sont ignorés : l'autorité sur la provenance vient du runtime, pas du producteur de la claim.
- **Création proactive** : après 5 étapes sans progrès, `proactiveHypothesis()` génère une hypothèse à partir du genome courant.
- **Encapsulation** : les sept modules sont instanciés par `ActuatorModules`; `SearchIntegration` existe et est utilisé pour la mémoire négative. Le round-trip JSON ne garantit pas la validité à long terme de chaque format de module lors d'une future migration de schéma.

## Expérience initiale planning-gap (2026-09-23)

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

## Revue contradictoire du 2026-10-01

Le harness contient huit tâches Blocksworld et quatre TrapChain. Son oracle
Blocksworld actuel couvre sept tâches : la limite de profondeur 14 et la limite
de 5000 états excluent `bw-table-6`. Une BFS sans cette coupure trouve 16 actions
(6959 états développés, 7057 découverts), comme le plan GenOS.

Une BFS sur position + clés établit les optimums TrapChain : key-detour 8,
long-detour 10, culdesac 8, far-key 13. Les deux premiers plans GenOS mesurent
11 et 15 : l'heuristique surestime le coût en imposant une clé évitable. Le
succès 12/12 ne prouve donc pas l'optimalité des douze plans. Ces oracles doivent
être intégrés au test avant de revendiquer l'admissibilité.
