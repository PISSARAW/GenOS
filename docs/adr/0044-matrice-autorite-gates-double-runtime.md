---
title: Matrice d'autorité unifiée, gates de provenance et d'observabilité, double runtime
date: 2026-09-24
status: proposed
authors: GenOS
decision-id: 0044
---

# ADR 0044 : Matrice d'autorité unifiée, gates de provenance et d'observabilité, double runtime

## Statut

- **Statut** : Proposé
- **Date** : 2026-09-24
- **Domaine** : Autorité, gouvernance, provenance, observabilité, runtime
- **Décideurs** : GenOS
- **Lié à** : [0040](0040-morphogenese-git-contrefactuel.md), [0042](0042-qpu-organe-specialise.md), [0043](0043-runtime-worker-phenotypes.md)

## Contexte

L'audit de conformité à la spec (8 phénotypes, 22 invariants, boucle runtime)
a révélé trois divergences :

1. `authorityMatrixService.js` utilisait une taxonomie opérationnelle propre
   (`adaptive_worker, security_analyst, contract_auditor, dependency_manager,
   documentation_curator, strategist, orchestrator, elder`) alors que
   `backend/src/services/agents/phenotypeRegistryService.js` expose les 8 phénotypes de la spec
   (`ScoutCell, BoundedWorker, AdaptiveWorker, Specialist, Verifier,
   SubOrchestrator, Orchestrator, ResidentDaemon`).
2. Les invariants `all_high_impact_changes_require_provenance` et
   `missing_observability_increases_uncertainty` n'avaient qu'un enforcement
   conditionnel ou implicite (provenance exigée par contrat, pas par gate
   universel ; `droppedEvents` comptés mais sans formule d'incertitude).
3. Il n'existe pas UNE boucle `main_runtime_loop` : le runtime Rust
   (`crates/genos-orchestrator/src/tick.rs`) et l'orchestrateur Node
   (`backend/bin/genos-orchestrate.cjs` + `morphogenesisRuntime.js`) ordonnent
   chacun un cycle équivalent mais distinct.

## Décision

1. **Matrice unifiée sur les 8 phénotypes spec.** `authorityMatrixService.js`
   expose désormais les 8 profils canoniques alignés sur
   `backend/src/services/agents/phenotypeRegistryService.js`, avec la dimension `signal` de la spec en plus
   des 12 dimensions existantes. Les anciens ids restent résolus via
   `LEGACY_ALIASES` (insensible à la casse) : `adaptive_worker→AdaptiveWorker`,
   `security_analyst/dependency_manager/documentation_curator→Specialist`,
   `contract_auditor→Verifier`, `strategist→SubOrchestrator`,
   `orchestrator/elder→Orchestrator`. `Reconciler` est conservé comme extension
   hors spec explicitement marquée. `topology:false` pour `SubOrchestrator`
   signifie pas de topologie *globale* (topologie locale bornée admise).
2. **Gate universel de provenance** (`highImpactProvenanceGateService.js`).
   Est à fort impact : risque HIGH/CRITICAL, réversibilité faible ou
   irréversible, portée non locale, ou action structurelle
   (`topology, spawn, promote, mutate`). Sans provenance complète
   (hash/record + `evidenceRefs` non vides), verdict `HUMAN_REVIEW`
   (`DENY` si `allowHumanReview:false`). Câblé dans
   `governancePlaneService.evaluate` en escalade seule : un verdict
   `HUMAN_REVIEW/DENY` issu du risque n'est jamais adouci, un `APPROVE`
   bas risque reste `APPROVE` (cas non à fort impact inchangés).
3. **Formule d'incertitude d'observabilité**
   (`observabilityUncertaintyService.js`) : `couverture = delivered /
   (delivered + dropped + errors + blindSpots)`, `incertitude = base +
   (1 - base) * (1 - couverture)`, bornée dans [0,1]. Câblée dans
   `decisionObservabilityService.extractEpistemicPressure` (additif :
   `observabilityCoverage` ajouté seulement si le contexte porte une santé
   d'observabilité, sinon comportement inchangé).
4. **Double runtime acté.** Pas de fusion : `tick.rs` (boucle agent pas à pas)
   et `genos-orchestrate.cjs` + `morphogenesisRuntime.js` (cycle mission +
   morphogenèse) sont les deux cycles officiels. Mapping resolvers
   spec→code : `EnvironmentResolver→environmentModelService.js`,
   `NicheResolver→nicheResolverService.js`, `EpistemicResolver→epistemics.js`,
   `MemoryRouter→memory/memoryRouterService.js`,
   `CognitivePhenotypeResolver→cognition/cognitivePhenotypeResolverService.js`,
   `StrategyResolver→strategies/ + strategyExecutionService.js`,
   `CapabilityResolver→capabilityResolverService.js`,
   `PhenotypeResolver→backend/src/services/agents/phenotypeRegistryService.js`,
   `DevelopmentResolver→development/developmentalStateService.js`,
   `GenotypeResolver→morphogenesis/genotypeResolverService.js`,
   `PlasmidResolver→morphogenesis/plasmidResolverService.js`,
   `ProceduralResolver→proceduralResolverService.js`,
   `ModelResolver→cognitiveSubstrateResolverService.js`,
   `ComputeResolver→storage/compute/computeSubstrateResolver.js`,
   `RelationResolver→morphogenesis/relationResolverService.js`,
   `CommunicationResolver→communication/communicationManifestService.js`,
   `TopologyResolver→morphogenesis/topologyResolverService.js`,
   `CollectivePhysiologyResolver→collectivePhysiologyService.js`,
   `ResourceAllocator→metabolism/resourceLedgerService.js`,
   `ResiliencePlanner→resilience/resilienceStateService.js`,
   `ClinicalPlanner→medical/clinicalTherapyService.js`,
   `AncestralSearch→morphogenesis/ancestralSearchService.js`,
   `CounterfactualPlanner→morphogenesis/counterfactualPlannerService.js`,
   `GovernancePlane→governancePlaneService.js`.
5. **Couches 22/23 scellées.** Couche 22 (substrats) : partielle, routage
   CPU/coûts seuls, sans substrat exotique réel. Couche 23
   (quantum-inspired) : conforme *par analogie* — l'invariant de la spec
   (`analogies_not_physical_quantum_states`) interdit de prétendre au calcul
   quantique ; voir ADR 0042 pour le régime QPU.

## Conséquences

Positives :

- une seule taxonomie d'autorité opposable, vérifiable par
  `authorityMatrixService.resolveCanonical` ;
- aucun changement à fort impact ne passe sans provenance ou revue humaine ;
- la télémétrie manquante augmente l'incertitude au lieu d'être silencieuse ;
- la documentation reflète deux runtimes réels au lieu d'une boucle fictive.

Négatives :

- les anciens ids snake_case sont supportés mais dépréciés (dette à purger) ;
- `evaluate` peut désormais retourner `HUMAN_REVIEW` sur des actions à fort
  impact auparavant `APPROVE` sans provenance (durcissement volontaire) ;
- `Reconciler` reste hors spec et devra être soit spécifié soit retiré.

## Alternatives

- Documenter la divergence sans unifier : rejeté, deux taxonomies concurrentes
  contredisent `capability_is_not_authority` (même capacité, droits différents
  selon le service interrogé).
- Gate provenance bloquant universel (`DENY` sec) : rejeté, trop brutal pour
  les missions supervisées ; `HUMAN_REVIEW` par défaut, `DENY` opt-in.
- Fusionner les deux runtimes en une boucle unique : rejeté, coût élevé pour
  un bénéfice de nommage ; l'ADR acte la réalité au lieu de la masquer.
