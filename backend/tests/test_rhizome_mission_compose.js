'use strict';

const assert = require('node:assert/strict');
const composer = require('../src/services/topology/biologicalModeComposer.cjs');
const biologicalTopology = require('../src/services/biologicalTopologyService');

async function run() {
  const original = biologicalTopology.composeMode;
  let observed;
  biologicalTopology.composeMode = async (input) => { observed = input; return { sessionId: 'rhizome-1' }; };
  try {
    await composer.composeBiologicalMode({ db: {}, mode: 'rhizome', mission: 'Audit capabilities',
      context: { request: { variantId: 'routing' }, orchestratorId: 'agent-1', missionId: 'mission-1' } });
    assert.equal(observed.options.missionId, 'mission-1');
    assert.equal(observed.options.variantId, 'routing');
  } finally { biologicalTopology.composeMode = original; }
  console.log('Rhizome mission composition binding: PASS');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
