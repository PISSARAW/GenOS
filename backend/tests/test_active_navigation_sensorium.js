'use strict';

const assert = require('node:assert/strict');
const { BrowserScoutService } = require('../src/services/browserScoutService');
const sensorium = require('../src/services/perception/sensoriumService');

async function run() {
  const scout = new BrowserScoutService({ workspaceRoot: process.cwd() });
  const sessionId = 'active-navigation-scope';
  const first = await scout.navigate(sessionId, 'https://allowed.invalid/start', {
    navigationScope: ['https://allowed.invalid'], htmlContent: '<h1>allowed</h1>'
  });
  assert.equal(first.success, true);
  const refused = await scout.navigate(sessionId, 'https://outside.invalid/side-effect', {
    navigationScope: ['https://allowed.invalid'], htmlContent: '<h1>outside</h1>'
  });
  assert.equal(refused.success, false);
  assert.equal(refused.refused, true);
  assert.equal(scout.snapshotSession(sessionId).currentUrl, 'https://allowed.invalid/start');

  sensorium.clearSensorium('sensorium-integrity');
  sensorium.createSensorium({ agentId: 'sensorium-integrity' });
  sensorium.recordObservation({ agentId: 'sensorium-integrity', observation: {
    id: 'observation-1', sensorId: 'web', target: first.url, informationGain: 0.5,
    data: { evidenceRef: 'sha256:' + 'b'.repeat(64) }
  } });
  const state = sensorium.snapshotSensorium('sensorium-integrity');
  assert.match(state.observations[0].provenance.observationDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(state.observations[0].provenance.verified, true);
  assert.equal(state.environmentModel.uncertaintyMap[first.url], 0.5);
  console.log('Active navigation scope and sensorium provenance: PASS');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
