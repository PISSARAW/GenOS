module.exports = (createMigrationRunner) => [
  createMigrationRunner('120-habitat-revisions', 'Persist immutable executable habitat revisions and mission bindings', async (db) => {
    await require('./migrateHabitatRevisions').migrateHabitatRevisions(db);
  }),
  createMigrationRunner('121-mission-episodes', 'Persist scoped mission episodes and correlated cell threads', async (db) => {
    await require('./migrateMissionEpisodes').migrateMissionEpisodes(db);
  }),
  createMigrationRunner('122-metabolic-ledger', 'Persist append-only provenance-aware metabolic measurements', async (db) => {
    await require('./migrateMetabolicLedger').migrateMetabolicLedger(db);
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
];
