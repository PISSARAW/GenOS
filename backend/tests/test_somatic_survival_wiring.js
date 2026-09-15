const assert = require('assert');
const test = require('node:test');
const fs = require('fs');
const path = require('path');
const { closeDatabase, getDatabase } = require('../src/db');
const adaptive = require('../src/services/adaptiveParameterService');
const { handleSomaticResonance, somaticMeshes } = require('../src/services/mcpBioTools/handlers/somaticResonance');

process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'somatic-survival-test-password';

test('somatic pulses record survival experience and use survival thresholds', async () => {
  const dbPath = path.join(__dirname, `somatic-survival-${Date.now()}.db`);
  const meshId = `somatic-test-${Date.now()}`;
  try {
    await getDatabase(dbPath);
    let result;
    for (let episode = 0; episode < 3; episode++) {
      result = await handleSomaticResonance({
        action: 'emit_somatic_pulse',
        mesh_id: meshId,
        agent_id: 'somatic-test-agent',
        entropy: 0.9,
        survived: false
      });
    }

    assert.equal(result.autonomic_reflex_triggered, 'TRIGGER_COORDINATED_CRYPTOBIOSIS_FREEZE');
    assert.equal(result.survival_experience.phase, 'critical');
    assert.equal(result.survival_experience.survived, false);
    assert.equal(result.survival_experience.result.key, 'survival.critical_threshold');
    assert(adaptive.currentValue('survival.critical_threshold', meshId) < 0.85);
  } finally {
    somaticMeshes.delete(meshId);
    await closeDatabase();
    for (const suffix of ['', '-shm', '-wal']) {
      try { fs.unlinkSync(`${dbPath}${suffix}`); } catch (_) {}
    }
  }
});
