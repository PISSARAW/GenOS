module.exports = (createMigrationRunner) => [
  createMigrationRunner('153-social-development-loop', 'Persist idempotent scoped social development decisions and recovery leases', async (db) => {
    await require('./migrateSocialDevelopmentLoop').migrateSocialDevelopmentLoop(db);
  }),
  createMigrationRunner('151-local-code-test-execution-receipts', 'Persist immutable receipts from the trusted local code test executor', async (db) => {
    await require('./migrateLocalCodeTestExecutionReceipts').migrateLocalCodeTestExecutionReceipts(db);
  }),
  createMigrationRunner('150-ontogenesis-memory-search', 'Persist Ontogenesis memory FTS5 search and synapse graph', async (db) => {
    await require('./migrateOntogenesisMemorySearch').migrateOntogenesisMemorySearch(db);
  }),
  createMigrationRunner('148-metapopulation-cycle-idempotency', 'Fence metapopulation cycle execution with durable idempotency keys', async (db) => {
    await require('./migrateMetapopulationCycleIdempotency').migrateMetapopulationCycleIdempotency(db);
  }),
  createMigrationRunner('148-trajectory-stewardship-outcomes', 'Require dual evidence before trajectory promotion', async (db) => {
    await require('./migrateTrajectoryStewardshipOutcomes').migrateTrajectoryStewardshipOutcomes(db);
  }),
  createMigrationRunner('148-shev-product-qualifications', 'Require distinct project-effect and learning proof for product qualification', async (db) => {
    await require('./migrateShevProductQualifications').migrateShevProductQualifications(db);
  }),
  createMigrationRunner('147-trajectory-stewardships', 'Persist immutable cross-domain trajectory responsibilities', async (db) => {
    await require('./migrateTrajectoryStewardships').migrateTrajectoryStewardships(db);
  }),
  createMigrationRunner('147-shev-product-stewardship', 'Persist immutable product responsibility manifests and stage receipts', async (db) => {
    await require('./migrateShevProductStewardship').migrateShevProductStewardship(db);
  }),
  createMigrationRunner('147-shev-experience-stewardship', 'Persist longitudinal plural experience reviews and bounded direction decisions', async (db) => {
    await require('./migrateShevExperienceStewardship').migrateShevExperienceStewardship(db);
  }),
  createMigrationRunner('147-shev-endogenous-initiative', 'Bind endogenous SHEV initiatives to signed observations and durable arbitration', async (db) => {
    await require('./migrateShevEndogenousInitiative').migrateShevEndogenousInitiative(db);
  }),
  createMigrationRunner('147-shev-coding-stewardship', 'Persist causal coding responsibility beyond delivery', async (db) => {
    await require('./migrateShevCodingStewardship').migrateShevCodingStewardship(db);
  }),
  createMigrationRunner('147-ontogenesis-async-delegation', 'Persist responsibility-derived delegated missions and fenced checkpoints', async (db) => {
    await require('./migrateAsyncDelegation').migrateAsyncDelegation(db);
  }),
  createMigrationRunner('147-ambient-agency-ledger', 'Persist versioned ambient responsibilities', async (db) => {
    await require('./migrateAmbientAgency').migrateAmbientAgency(db);
  }),
  createMigrationRunner('147-production-healing-evidence', 'Persist candidate measurements and independent healing verification receipts', async (db) => {
    await require('./migrateProductionHealingEvidence').migrateProductionHealingEvidence(db);
  }),
  createMigrationRunner('146-production-healing-campaigns', 'Persist production telemetry windows and bounded healing plans', async (db) => {
    await require('./migrateProductionHealingCampaigns').migrateProductionHealingCampaigns(db);
  }),
  createMigrationRunner('147-shev-healing-cycle', 'Persist evidence-bound SHEV project healing episodes', async (db) => {
    await require('./migrateShevHealingCycle').migrateShevHealingCycle(db);
  }),
  createMigrationRunner('146-durable-lineage-memory', 'Persist scoped ancestral memories and inherited risks', async (db) => {
    await require('./migrateLineageMemory').migrateLineageMemory(db);
  }),
  createMigrationRunner('137-morphogenesis-hysteresis', 'Persist scoped transactional morphogenesis hysteresis', async (db) => {
    await require('./migrateMorphogenesisHysteresis').migrateMorphogenesisHysteresis(db);
  }),
  createMigrationRunner('131-runtime-control-reconnect-authorities', 'Persist scoped runtime reconnect authorities and revocations', async (db) => {
    await require('./migrateRuntimeControlReconnectAuthorities')
      .migrateRuntimeControlReconnectAuthorities(db);
  }),
  createMigrationRunner('128-causal-learning-outbox', 'Persist and resume verified causal learning idempotently', async (db) => {
    await require('./migrateCausalLearningOutbox').migrateCausalLearningOutbox(db);
  }),
  createMigrationRunner('129-operator-control-receipts', 'Persist operator commands and immutable final control receipts', async (db) => {
    await require('./migrateOperatorControlReceipts').migrateOperatorControlReceipts(db);
  }),
  createMigrationRunner('128-cell-thread-checkpoints', 'Persist immutable CellThread checkpoints and resumption receipts', async (db) => {
    await require('./migrateCellThreadCheckpoints').migrateCellThreadCheckpoints(db);
  }),
  createMigrationRunner('127-episode-recovery-receipts', 'Persist immutable orphan episode recovery receipts', async (db) => {
    await require('./migrateMissionEpisodeRecovery').migrateMissionEpisodeRecovery(db);
  }),
  createMigrationRunner('125-permission-receipt-lineage', 'Bind permission receipts to exact mission episode cell lineage', async (db) => {
    await require('./migratePermissionReceiptLineage').migratePermissionReceiptLineage(db);
  }),
  createMigrationRunner('124-habitat-enforcement-receipts', 'Persist immutable backend-issued habitat enforcement receipts', async (db) => {
    await require('./migrateHabitatEnforcementReceipts').migrateHabitatEnforcementReceipts(db);
  }),
  createMigrationRunner('120-habitat-revisions', 'Persist immutable executable habitat revisions and mission bindings', async (db) => {
    await require('./migrateHabitatRevisions').migrateHabitatRevisions(db);
  }),
  createMigrationRunner('121-mission-episodes', 'Persist scoped mission episodes and correlated cell threads', async (db) => {
    await require('./migrateMissionEpisodes').migrateMissionEpisodes(db);
  }),
  createMigrationRunner('122-metabolic-ledger', 'Persist append-only provenance-aware metabolic measurements', async (db) => {
    await require('./migrateMetabolicLedger').migrateMetabolicLedger(db);
  }),
  createMigrationRunner('126-metabolic-cell-lineage', 'Bind metabolic observations to backend cell lineage', async (db) => {
    await require('./migrateMetabolicLedgerCellLineage').migrateMetabolicLedgerCellLineage(db);
  }),
  createMigrationRunner('123-tool-permission-membrane', 'Persist scoped tool policies and append-only decision receipts', async (db) => {
    await require('./migrateToolPermissionMembrane').migrateToolPermissionMembrane(db);
  }),
  createMigrationRunner('120-release-force-promotion-receipts', 'Persist append-only authority receipts for forced production promotion', async (db) => {
    await require('./migrateReleaseForcePromotionReceipts').migrateReleaseForcePromotionReceipts(db);
  }),
  createMigrationRunner('118-agent-identity', 'Persist causal individual identity and peer models', async (db) => {
    await require('./migrateAgentIdentity').migrateAgentIdentity(db);
  }),
  createMigrationRunner('119-idempotency-request-binding', 'Bind idempotent HTTP replays to the canonical request body', async (db) => {
    await require('./migrateIdempotencyKeys').migrateIdempotencyKeys(db);
  }),
  createMigrationRunner('114-shev-runtime', 'Close the SHEV perception, monitoring and controlled recovery loop', async (db) => {
    await require('./migrateShevRuntime').migrateShevRuntime(db);
  }),
  createMigrationRunner('115-capability-runtime', 'Persist sealed experiment waves, immutable probes, memory replays and statistical lineage', async (db) => {
    await require('./migrateCapabilityRuntime').migrateCapabilityRuntime(db);
  }),
  createMigrationRunner('109-signal-receptors', 'Persist scoped deterministic signal receptors', async (db) => {
    await require('./migrateSignalReceptors').migrateSignalReceptors(db);
  }),
  createMigrationRunner('110-signal-cognitive-jobs', 'Persist and retry Signal Plane cognitive escalations', async (db) => {
    await require('./migrateSignalCognitiveJobs').migrateSignalCognitiveJobs(db);
  }),
  createMigrationRunner('103-nce-play-observations', 'Persist scoped Play observations with snapshot provenance', async (db) => {
    await require('./migrateNcePlayObservations').migrateNcePlayObservations(db);
  }),
  createMigrationRunner('111-daemon-scout', 'Persist scout colonies and cells', async (db) => {
    await require('./migrateDaemonScout').migrateDaemonScout(db);
  }),
  createMigrationRunner('112-daemon-wake-policy', 'Persist daemon territory wake policy', async (db) => {
    await require('./migrateDaemonWakePolicy').migrateDaemonWakePolicy(db);
  }),
  createMigrationRunner('113-garage-fabric', 'Persist adaptive worker garage queue and leases', async (db) => {
    await require('./migrateGarageFabric').migrateGarageFabric(db);
  }),
  createMigrationRunner('116-garage-domains', 'Persist scoped garage domains and active capacity projection', async (db) => {
    await require('./migrateGarageDomains').migrateGarageDomains(db);
  }),
  createMigrationRunner('114-gvx-runtime', 'Fence resumable GVX cycles and reversible runtime operations', async (db) => {
    await require('./migrateGvxRuntime').migrateGvxRuntime(db);
  }),
  createMigrationRunner('114-aeis-authority', 'Persist AEIS dissonance and deduplicated authority feedback', async (db) => {
    await require('./migrateAeisAuthority').migrateAeisAuthority(db);
  }),
  createMigrationRunner('117-organism-restore-journal', 'Fence and reconcile incomplete organism restores', async (db) => {
    await require('./migrateOrganismRestoreJournal').migrateOrganismRestoreJournal(db);
  }),
  createMigrationRunner('130-morphogenesis-epoch-store', 'Persist scoped morphogenesis epoch checkpoints, results, budgets and barriers', async (db) => {
    await require('./migrateMorphogenesisEpochStore').migrateMorphogenesisEpochStore(db);
  }),
  createMigrationRunner('131-morphogenesis-verified-outcomes', 'Persist independently verified morphogenesis calibration outcomes', async (db) => {
    await require('../../services/morphogenesis/morphogenesisVerifiedOutcomeStore').ensure(db);
  }),
  createMigrationRunner('132-morphogenesis-transition-snapshots', 'Persist authenticated restorable morphogenesis transitions', async (db) => {
    await require('./migrateMorphogenesisTransitionSnapshots')
      .migrateMorphogenesisTransitionSnapshots(db);
  }),
  createMigrationRunner('133-rust-kernel-mission-plans', 'Bind Node missions to immutable Rust kernel plans', async (db) => {
    await require('./migrateRustKernelMissionPlans').migrateRustKernelMissionPlans(db);
  }),
  createMigrationRunner('134-execution-authority-v2', 'Classify historic runs as read-only before enforcing v2 envelopes', async (db) => {
    await require('./migrateExecutionAuthorityV2').migrateExecutionAuthorityV2(db);
  }),
  createMigrationRunner('135-versioned-causal-state', 'Persist authority-bound causal snapshots, forks and replay receipts', async (db) => {
    await require('./migrateVersionedCausalState').migrateVersionedCausalState(db);
  }),
  createMigrationRunner('136-promotion-evidence-dossiers', 'Persist falsifiable evidence dossiers and bounded promotion dispositions', async (db) => {
    await require('./migratePromotionEvidenceDossiers').migratePromotionEvidenceDossiers(db);
  }),
  createMigrationRunner('138-mcp-actor-lease-v2', 'Persist bounded revocable MCP actor leases and immutable receipts', async (db) => {
    await require('./migrateMcpActorLeaseV2').migrateMcpActorLeaseV2(db);
  }),
  createMigrationRunner('135-ontogenesis-durable-foundation', 'Persist Ontogenesis operations, artifacts, outbox and config V2', async (db) => {
    await require('./migrateOntogenesisDurableFoundation').migrateOntogenesisDurableFoundation(db);
  }),
  createMigrationRunner('136-ontogenesis-crash-recovery', 'Persist immutable Ontogenesis crash recovery receipts', async (db) => {
    await require('./migrateOntogenesisCrashRecovery').migrateOntogenesisCrashRecovery(db);
  }),
  createMigrationRunner('137-ontogenesis-offline-continuity', 'Fence Ontogenesis controller handoffs across powered-off hosts', async (db) => {
    await require('./migrateOntogenesisContinuity').migrateOntogenesisContinuity(db);
  }),
  createMigrationRunner('138-ontogenesis-complete-purge', 'Purge Ontogenesis traces and managed worktrees with durable receipts', async (db) => {
    await require('./migrateOntogenesisPurge').migrateOntogenesisPurge(db);
  }),
  createMigrationRunner('139-endogenous-thought-episodes', 'Persist scoped endogenous thought episodes and immutable receipts', async (db) => {
    await require('./migrateEndogenousThoughtEpisodes').migrateEndogenousThoughtEpisodes(db);
  }),
  createMigrationRunner('140-endogenous-thought-detections', 'Persist bounded endogenous detection decisions', async (db) => {
    await require('./migrateEndogenousThoughtDetections').migrateEndogenousThoughtDetections(db);
  }),
  createMigrationRunner('141-endogenous-thought-admissions', 'Persist bounded endogenous admission decisions', async (db) => {
    await require('./migrateEndogenousThoughtAdmissions').migrateEndogenousThoughtAdmissions(db);
  }),
  createMigrationRunner('142-endogenous-thought-tasks', 'Bind admitted thoughts to held Ontogenesis tasks', async (db) => {
    await require('./migrateEndogenousThoughtTasks').migrateEndogenousThoughtTasks(db);
  }),
  createMigrationRunner('143-endogenous-thought-runs', 'Persist authorized read-only endogenous thought runs', async (db) => {
    await require('./migrateEndogenousThoughtRuns').migrateEndogenousThoughtRuns(db);
  }),
  createMigrationRunner('144-endogenous-thought-verifications', 'Persist independently signed endogenous verifications', async (db) => {
    await require('./migrateEndogenousThoughtVerifications')
      .migrateEndogenousThoughtVerifications(db);
  }),
  createMigrationRunner('145-endogenous-thought-learnings', 'Persist verified episode-scoped belief revisions', async (db) => {
    await require('./migrateEndogenousThoughtLearnings').migrateEndogenousThoughtLearnings(db);
  }),
  createMigrationRunner('147-sre-healing-campaigns', 'Persist scoped SRE responsibility and append-only healing transitions', async (db) => {
    await require('./migrateSreHealingCampaigns').migrateSreHealingCampaigns(db);
  }),
  createMigrationRunner('149-ontogenesis-daemon-stewardship', 'Persist bounded Daemon findings as Ontogenesis backlog proposals', async (db) => {
    await require('./migrateOntogenesisDaemonStewardship').migrateOntogenesisDaemonStewardship(db);
  }),
  createMigrationRunner('152-social-mental-models', 'Persist immutable, scoped and source-linked social mental model snapshots', async (db) => {
    await require('./migrateSocialMentalModels').migrateSocialMentalModels(db);
  }),
  createMigrationRunner('154-signal-idempotency', 'Persist durable transport idempotency keys with signal publication', async (db) => {
    await require('./migrateSignalIdempotency').migrateSignalIdempotency(db);
  }),
];
