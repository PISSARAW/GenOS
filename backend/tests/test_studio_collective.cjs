'use strict';
const assert = require('node:assert/strict');
const { withFixture, writeRefusals } = require('./helpers/studioGenosFixture.cjs');
const { request } = require('./helpers/studioRequest.cjs');

async function probe(spec) {
  const root = '/api/studio/agents/' + spec.settings.agent + '/collective';
  const catalog = await request(spec, root);
  assert.equal(catalog.status, 200);
  assert.equal(catalog.value.organizations.length, 19);
  assert.equal(catalog.value.topologies.length, 8);
  assert.equal(catalog.value.available, null);
  assert.equal(catalog.value.exercised, false);
  assert.equal((await request(spec, root, { project: 'b06-other' })).status, 404);
  const body = { organization: 'quorum_with_abstention', state: { votes: [{ support: true }, { abstain: true }] } };
  const step = await request(spec, root + '/step', { body });
  assert.equal(step.status, 200);
  assert.equal(step.value.step.reached, true);
  assert.equal(step.value.step.abstentions, 1);
  assert.equal(step.value.runtimeApplied, false);
  const memory = await request(spec, '/api/studio/memories/' + step.value.analysisId);
  assert.equal(memory.value.memory.integrityChecked, true);
  assert.equal(memory.value.memory.sourceAgent, 'b06-key');
  assert.equal(JSON.parse(memory.value.memory.content).agentId, spec.settings.agent);
  assert.equal(memory.value.truthValidated, false);
  const state = { agents: [{ id: 'declared-only', x: 0, y: 0 }], votes: [], pack: [], edges: [] };
  for (const item of catalog.value.organizations) {
    assert.equal((await request(spec, root + '/step', { body: { organization: item.id, state } })).status, 200, item.id);
  }
  assert.equal((await request(spec, root + '/step', { body: { ...body, state: { agents: Array(101).fill({}) } } })).status, 400);
  assert.equal((await request(spec, root + '/step', { body: { ...body, organization: 'unknown' } })).status, 400);
  assert.equal((await request(spec, root + '/step', { body: { ...body, state: '{' } })).status, 400);
  assert.equal((await request(spec, root + '/step', { body, project: 'b06-other' })).status, 404);
  await writeRefusals(spec, root + '/step');
  console.log('Studio collective: real catalog, 19 bounded steps, scoped sourced analyses and invalid/authority refusals passed.');
}
withFixture(probe).catch(error => { console.error(error); process.exitCode = 1; });
