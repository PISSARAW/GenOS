module.exports = (createMigrationRunner) => [
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
  createMigrationRunner('114-gvx-runtime', 'Fence resumable GVX cycles and reversible runtime operations', async (db) => {
    await require('./migrateGvxRuntime').migrateGvxRuntime(db);
  }),
  createMigrationRunner('114-aeis-authority', 'Persist AEIS dissonance and deduplicated authority feedback', async (db) => {
    await require('./migrateAeisAuthority').migrateAeisAuthority(db);
  }),
];
