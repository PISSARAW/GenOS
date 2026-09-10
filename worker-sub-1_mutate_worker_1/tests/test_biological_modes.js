const assert = require('assert');
const biologicalMode = require('../src/services/biologicalModeService');

for (const mode of biologicalMode.listModes()) {
  const analysis = biologicalMode.analyzeMission(mode, `Utiliser le ${mode} pour cette mission.`);
  assert.equal(analysis.recommended, true);
  assert.equal(analysis.explicitlyRequested, true);
  assert.equal(analysis.members.length, 4);
  assert.equal(biologicalMode.compose(mode, 'Construire un système').length, 4);
}

assert.equal(biologicalMode.analyzeMission('biome', 'Construire un système').recommended, false);
assert.throws(() => biologicalMode.compose('unknown', 'Mission'), (error) => error.code === 'BIOLOGICAL_MODE_UNKNOWN');
assert.throws(() => biologicalMode.compose('biome', ''), (error) => error.code === 'BIOLOGICAL_MISSION_REQUIRED');
console.log('Biological mode checks passed.');