'use strict';

const assert = require('node:assert/strict');
const { runActivePerception } = require('../src/services/perception/activePerceptionLoopService');
const sensorium = require('../src/services/perception/sensoriumService');

async function run() {
  sensorium.clearSensorium('active-loop-proof');
  const verified = await runActivePerception({
    agentId: 'active-loop-proof', unknowns: [{ id: 'status', severity: 'high' }],
    capabilities: ['network'], domain: 'knowledge', budget: 10,
    executeProbe: async probe => ({ status: 'observed', verified: true,
      evidenceRef: `sha256:${'a'.repeat(64)}`, uncertaintyBefore: 1, uncertaintyAfter: 0.2,
      target: probe.target })
  });
  assert.equal(verified.status, 'completed');
  assert.equal(verified.claimable, true);
  assert.equal(verified.decision, 'Terminate');
  assert.equal(verified.receipts[0].verified, true);
  assert.equal(verified.receipts[0].evidenceState, 'verified');
  assert.equal(verified.receipts[0].evidenceEnvelope.state, 'verified');
  assert.equal(verified.sensorium.observations[0].provenance.verified, true);
  assert.equal(verified.sensorium.environmentModel.uncertaintyMap.status, 0.2);

  const missing = await runActivePerception({ agentId: 'active-loop-missing', unknowns: [{ id: 'x' }], budget: 1 });
  assert.equal(missing.status, 'not_executed');
  assert.equal(missing.claimable, false);
  assert.equal(missing.decision, 'RequestCapability');

  const unverified = await runActivePerception({
    agentId: 'active-loop-unverified', unknowns: [{ id: 'x' }], budget: 10,
    executeProbe: async () => ({ status: 'observed', verified: false })
  });
  assert.equal(unverified.decision, 'Escalate');
  assert.equal(unverified.claimable, false);
  console.log('Active perception loop provenance and evidence gates: PASS');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
