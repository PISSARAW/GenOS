'use strict';
const assert = require('node:assert/strict');
const { withFixture, writeRefusals } = require('./helpers/studioGenosFixture.cjs');
const { request } = require('./helpers/studioRequest.cjs');

async function creative(spec, root) {
  const body = { prompt: 'Solve', representation: 'A constraint graph', domainRecord: { seenCount: 2, errorHistory: [0.9, 0.7, 0.4] } };
  const result = await request(spec, root + '/creative', { body });
  assert.equal(result.status, 200);
  assert.ok(result.value.learningProgress > 0);
  assert.ok(result.value.enhancedPrompt.includes('A constraint graph'));
  assert.equal(result.value.creativeEffectMeasured, false);
  const flat = await request(spec, root + '/creative', { body: { ...body, domainRecord: { errorHistory: [0.9, 0.9, 0.9] } } });
  assert.equal(flat.value.curiosityScore, 0);
  assert.equal((await request(spec, root + '/creative', { body: { ...body, domainRecord: { errorHistory: [1.1] } } })).status, 400);
  assert.equal((await request(spec, root + '/creative', { body, project: 'b06-other' })).status, 404);
  const memory = await request(spec, '/api/studio/memories/' + result.value.analysisId);
  assert.equal(memory.value.memory.integrityChecked, true);
  await writeRefusals(spec, root + '/creative');
}

async function physics(spec, root) {
  const body = { voltage: 2, distance: 1, lambda: 1, density: 1, threshold: 1.2 };
  const result = await request(spec, root + '/physics', { body });
  assert.equal(result.status, 200);
  assert.equal(result.value.attenuatedVoltage, Number((2 / Math.E).toFixed(6)));
  assert.equal(result.value.isNmdaSpike, false);
  assert.equal(result.value.runtimeApplied, false);
  const spike = await request(spec, root + '/physics', { body: { ...body, distance: 0 } });
  assert.equal(spike.value.isNmdaSpike, true);
  assert.equal(spike.value.outputVoltage, 3.7);
  assert.equal((await request(spec, root + '/physics', { body: { ...body, lambda: 0 } })).status, 400);
  assert.equal((await request(spec, root + '/physics', { body: { ...body, voltage: '2' } })).status, 400);
  await writeRefusals(spec, root + '/physics');
}
withFixture(async spec => {
  const root = '/api/studio/agents/' + spec.settings.agent + '/biomimetic';
  await creative(spec, root);
  await physics(spec, root);
  console.log('Studio biomimetic: existing NCE/curiosity and Rall/NMDA engines, sourced declared analyses and safety bounds passed.');
}).catch(error => { console.error(error); process.exitCode = 1; });
