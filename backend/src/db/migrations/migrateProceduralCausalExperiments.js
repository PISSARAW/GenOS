'use strict';

async function migrateProceduralCausalExperiments(db) {
  await require('../../services/proceduralCausalExperimentService').ensureSchema(db);
}

module.exports = { migrateProceduralCausalExperiments };
