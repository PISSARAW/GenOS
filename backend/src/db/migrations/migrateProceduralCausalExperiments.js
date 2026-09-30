'use strict';

async function migrateProceduralCausalExperiments(db) {
  await require('../../services/proceduralCausalExperimentService').ensureSchema(db);
  await db.run(
    'INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (?, ?)',
    '087-procedural-causal-experiments',
    'Persist causal procedural experiments, isolated forks and checkpoints'
  );
}

module.exports = { migrateProceduralCausalExperiments };
