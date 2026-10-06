'use strict';

const { withTransaction } = require('../../../db');
const store = require('../metapopulationStore');
const migrationStore = require('./migrationStore');

async function recordRescueEvidence(db, metapopulationId, input) {
  return withTransaction(db, async () => {
    const migration = await migrationStore.getMigration(db, metapopulationId, input.migrationId);
    if (!migration || migration.evidence.migrationReason !== 'rescue') {
      throw Object.assign(new Error('A rescue migration is required.'), { code: 'METAPOPULATION_RESCUE_EVIDENCE_INVALID' });
    }
    const field = input.assessment ? 'rescueAssessment' : 'rescueBaseline';
    const value = input.assessment || input.baseline;
    await db.run('UPDATE metapopulation_migrations SET evidence_json = ? WHERE metapopulation_id = ? AND migration_id = ?',
      JSON.stringify({ ...migration.evidence, [field]: value }), metapopulationId, input.migrationId);
    await store.appendEvent(db, metapopulationId, { type: input.assessment ? 'RESCUE_ASSESSMENT_RECORDED' : 'RESCUE_BASELINE_RECORDED',
      payload: { migrationId: input.migrationId, [field]: value }, actor: 'metapopulation-runtime',
      provenance: { source: 'receiver-fitness-adapter' }, occurredAt: new Date().toISOString() });
  });
}

module.exports = { recordRescueEvidence };
