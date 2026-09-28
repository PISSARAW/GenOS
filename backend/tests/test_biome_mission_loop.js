'use strict';
const assert = require('assert');
const biome = require('../src/services/biomeCoordinationService');
const { runBiomeMission } = require('../src/services/biome/biomeMissionLoop');

async function main() {
  const session = await biome.composeBiome('mission test boucle', { organization: 'energy_huddle' });
  const base = { budget: 100, capabilities: ['forage', 'allocate'], proposal: { patchHistory: [], cost: 10 }, action: { populations: [] }, observations: [] };

  const simulated = await runBiomeMission(session.sessionId, { ...base, adapter: 'simulated' }, {});
  assert.equal(simulated.status, 'completed');
  assert.equal(simulated.simulated, true);
  assert.ok(simulated.steps.length >= 5);

  const over = await runBiomeMission(session.sessionId, { ...base, adapter: 'simulated', proposal: { cost: 1000 } }, {});
  assert.equal(over.status, 'abstained');

  const denied = await runBiomeMission(session.sessionId, { ...base, adapter: 'real' }, { authorize: () => false });
  assert.equal(denied.status, 'abstained');

  const real = await runBiomeMission(session.sessionId, { ...base, adapter: 'real' }, { authorize: () => true });
  assert.equal(real.status, 'completed');
  assert.equal(real.simulated, false);

  const bad = await runBiomeMission(session.sessionId, { ...base, budget: -1 }, {});
  assert.equal(bad.status, 'failed');

  console.log('Biome mission loop checks passed.');
}

main().catch((error) => { console.error(error); process.exit(1); });
