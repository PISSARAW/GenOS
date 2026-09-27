# Lot racine — 113 services sans import littéral

Statut : enquête 2026-09-27. Deux groupes sont câblés en production par **dispatch dynamique** (pas d'import littéral,
mais appel réel) ; le reste est test-only, bibliothèque ou orphelin strict. Aucun appel artificiel ajouté.

## 1. Philosophie (~30) : dispatch dynamique prouvé

Parcours : entrée `backend/bin/orchestratorActions.cjs:125-126` → `philosophyRouter.handlePhilosophyRequest`
→ table `ADAPTERS` (`philosophyRouter.js:120+`) → `callService` → `require(`./${serviceName}`)` (`:107`) → service
→ résultat consultatif (`promotionEligible=false`) → persistance optionnelle (`philosophyAnalysisPersistenceService`).
Exemples vérifiés : `school.platonism/aristotelianism/stoicism/epicureanism/cartesianism/leibnizianism/spinozism/kantianism/
hegelianism/schopenhauer/nietzsche/bergsonism`, `aesthetics.*`, `art.*`, `truth.*` (`truthSkepticismService`),
`ontology.stances`, `social-epistemology.*`, `scientificMethod.*`, éthiques (`normative/justice/relational/environmental`).
Preuves le 2026-09-27 : parcours `school.platonism` OK avec provenance (sonde `refus.cjs`) ; refus
`Unknown philosophical concept`, `Unknown philosophy operation`, `Unsupported philosophy adapter operation` OK.
Réserve : `test_philosophy_router.js` **échoue** sur `listRelations({relationType:'alternativeTo'})` vide (données de registre,
antérieur à ce lot) et n'atteint donc pas ses propres assertions de refus ; effet décisionnel mesuré nul par design
(matrice §3 : consultatif, ne gouverne pas les gates).
Cas limites : `scholastiqueService` et `substanceService` inscrits au registre (`conceptDefinitions.js`) mais sans entrée
`ADAPTERS` — jamais résolus par le routeur → `orphelin-registre`.

## 2. Variants Trinity (9) : dispatch dynamique prouvé

Parcours : `agentAutonomyPlanService.js:5` / `trinityService.js:117` / `morphogenesis/registry/variantCatalog.js:10` /
`topologyProfileService.js:173` → `trinityVariantService.js:4` → `trinityAdapters.resolveAdapter` → `require(entry.module)` (`:68`)
→ 9 exécuteurs (`AdaptiveSequential, AdversarialCrossExamination, CounterfactualFork, DiversityPlanner, FactorialGrid,
NoveltyArchive, Oracle, RecursiveExecutor, TemporalHorizons`).
Preuves le 2026-09-27 : `node backend/tests/test_trinity_variants.js` → passé ; refus `TRINITY_ADAPTER_UNKNOWN`
(`error.code`, `trinityAdapters.js:50-66`) prouvé par sonde ; résolution dynamique d'un adapter nommé OK.

## 3. Test-only, sans appelant prod (contradiction matrice corrigée)

`plasmidInstallService` (`test_plasmid_install.js:5`) et `genomePromotionService` (`test_genome_promotion.js:4`) passent
en isolation mais n'ont **aucun appelant** dans `backend/src, backend/bin, mcp, shared` (vérifié par `rg` le 2026-09-27).
La matrice §5 (`Invoke YES`) et §6 (`Select PARTIAL`) est corrigée en conséquence : présent et testé, non causal en prod.
Même statut : `controlledRolloutDecisionService`, `experimentalRunnerService`, `experimentalVerdictPlannerService`,
`finalOutputGateService`, `validationProtocolService`, `fitnessParetoDestinyService`, `noReportAblationService`,
`reservedReplicationCampaignService`, `truthGraphSemanticPipelineService`, procéduraux ×14
(`test_procedural_organism_*`), `boundedGossipService`, `gapJunctionService`, `globalWorkspaceService`,
`perceptiveBindingService`, `morphogenesisBenchmarkService`, `morphogeneticPopulationService`,
`interMissionConsolidationService`, `metacognitiveBeliefActionService`.

## 4. Orphelins stricts et bibliothèques

Orphelins stricts (zéro prod, zéro dynamique, zéro test dédié — détail et statuts dans
[lot-suites-racine.md](lot-suites-racine.md), qui corrige aussi `authorityMatrixService` racine en test-only) :
`proceduralNicheScoringService`, `orchestrationAuditService`, `topologyFinalizationService`,
`conceptRegistryService`, `poetBridgeService`, `phenotypicPersistence`.
Bibliothèques (testées, sans effet, à garder comme telles) : `boundedGossip`, `gapJunction`, `globalWorkspace`,
`perceptiveBinding`, `validationProtocol`, `fitnessParetoDestiny`, `conceptRegistry`, `morphogenesisBenchmark`,
`morphogeneticPopulation`, `interMissionConsolidation`, `metacognitiveBeliefAction`.
