module.exports = (createMigrationRunner) => [
  createMigrationRunner('109-signal-receptors', 'Persist scoped deterministic signal receptors', async (db) => {
    await require('./migrateSignalReceptors').migrateSignalReceptors(db);
  }),
  createMigrationRunner('110-signal-cognitive-jobs', 'Persist and retry Signal Plane cognitive escalations', async (db) => {
    await require('./migrateSignalCognitiveJobs').migrateSignalCognitiveJobs(db);
  }),
];
