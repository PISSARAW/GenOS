const assert = require('assert');
const biologicalMode = require('../src/services/biologicalModeService');

for (const mode of biologicalMode.listModes()) {
  const analysis = biologicalMode.analyzeMission(mode, `Utiliser le ${mode} pour cette mission.`);
  assert.equal(analysis.recommended, true);
  assert.equal(analysis.explicitlyRequested, true);
  assert.equal(analysis.members.length, 4);
  assert.equal(biologicalMode.compose(mode, 'Construire un système').length, 4);
}

const rhizome = biologicalMode.analyzeMission('rhizome', 'Déployer un rhizome décentralisé.');
assert.deepEqual(rhizome.members.map((member) => member.role), [
  'rootless_coordinator', 'capability_offshoot', 'local_bridge', 'boundary_scout'
]);

const metapopulation = biologicalMode.analyzeMission(
  'metapopulation',
  'Utiliser quorum sensing, plasticité synaptique et régénération.'
);
assert.deepEqual(metapopulation.mechanisms, ['quorum_sensing', 'synaptic_plasticity', 'regeneration']);
assert.equal(metapopulation.members.every((member) => member.mechanisms.join(',') === metapopulation.mechanisms.join(',')), true);

assert.equal(biologicalMode.analyzeMission('biome', 'Construire un système').recommended, false);
assert.throws(() => biologicalMode.compose('unknown', 'Mission'), (error) => error.code === 'BIOLOGICAL_MODE_UNKNOWN');
assert.throws(() => biologicalMode.compose('biome', ''), (error) => error.code === 'BIOLOGICAL_MISSION_REQUIRED');
console.log('Biological mode checks passed.');