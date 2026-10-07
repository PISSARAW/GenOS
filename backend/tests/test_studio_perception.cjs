'use strict';
const assert = require('node:assert/strict');
const { withFixture, writeRefusals } = require('./helpers/studioGenosFixture.cjs');
const { request } = require('./helpers/studioRequest.cjs');

async function probe(spec) {
  const root = '/api/studio/agents/' + spec.settings.agent + '/perception';
  const before = await request(spec, root);
  assert.equal(before.value.receipts.length, 0);
  assert.ok(before.value.indicators.every(item => item.status === 'not_run'));
  assert.equal((await request(spec, root, { project: 'b06-other' })).status, 404);
  const planned = await request(spec, root + '/plan', { body: { topic: 'code', budget: 3 } });
  assert.equal(planned.status, 200);
  assert.equal(planned.value.planningOnly, true);
  assert.ok(planned.value.spent <= 3);
  assert.equal((await request(spec, root + '/plan', { body: { topic: 'code', budget: 11 } })).status, 400);
  const observed = await request(spec, root + '/probe', { body: { path: 'a/verify.cjs', agentId: 'forged' } });
  assert.equal(observed.status, 200);
  assert.equal(observed.value.observation.agentId, spec.settings.agent);
  assert.equal(observed.value.informationGain, null);
  const file = await request(spec, '/api/workspaces/consumer-ws/file?path=a%2Fverify.cjs');
  assert.equal(observed.value.version, file.value.version);
  const memory = await request(spec, '/api/studio/memories/' + observed.value.analysisId);
  assert.equal(memory.value.memory.integrityChecked, true);
  assert.equal(JSON.parse(memory.value.memory.content).result.observation.data.content, undefined);
  assert.equal((await request(spec, root + '/probe', { body: { path: '.env' } })).status, 403);
  assert.equal((await request(spec, root + '/probe', { body: { path: '../escape' } })).status, 400);
  assert.equal((await request(spec, root + '/probe', { body: { path: 'absent.txt' } })).status, 404);
  await require('../src/services/conceptRuntimeService').processEvent(spec.db, { agentId: spec.settings.agent,
    event: { id: 'real-producer-event', eventType: 'test' }, observation: {} });
  const after = await request(spec, root);
  assert.equal(after.value.receipts.length, 1);
  assert.equal(after.value.receipts[0].integrityChecked, true);
  assert.equal(after.value.causalEstablished, false);
  assert.equal(after.value.promotionGranted, false);
  const store = new (require('../src/services/adaptiveStateService').AdaptiveStateService)(spec.db);
  const state = await store.restoreObject('concept_runtime', spec.settings.agent);
  state.receipts[0].concepts.metacognition = 'observed';
  await store.persistObject('concept_runtime', spec.settings.agent, state, 1);
  assert.equal((await request(spec, root)).value.receipts[0].integrityChecked, false);
  await writeRefusals(spec, root + '/probe');
  await writeRefusals(spec, root + '/plan');
  console.log('Studio perception: real confined file/version, bounded plan, cognitive producer receipt and absent/refusal states passed.');
}
withFixture(probe).catch(error => { console.error(error); process.exitCode = 1; });
