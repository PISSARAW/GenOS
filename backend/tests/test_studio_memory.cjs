'use strict';
const assert = require('node:assert/strict');
const { withFixture, writeRefusals } = require('./helpers/studioGenosFixture.cjs');
const { request } = require('./helpers/studioRequest.cjs');

async function probe(spec) {
  const base = '/api/studio/memories';
  const created = await request(spec, base, { body: { title: 'Expérience D02', content: 'Le transport ne prouve pas une décision.', createdBy: 'forged' } });
  assert.equal(created.status, 200);
  assert.equal(created.value.evidenceStatus, 'provisional');
  const route = base + '/' + created.value.id;
  const inspected = await request(spec, route);
  assert.equal(inspected.status, 200);
  assert.equal(inspected.value.memory.sourceAgent, 'b06-key');
  assert.equal(inspected.value.truthValidated, false);
  assert.equal((await request(spec, route, { project: 'b06-other' })).status, 404);
  const list = await request(spec, base + '?q=Exp%C3%A9rience');
  assert.equal(list.value.memories.length, 1);
  const body = { targetAgentId: spec.settings.agent, reason: 'Réutiliser le garde-fou' };
  assert.equal((await request(spec, route + '/transfer', { body: { ...body, targetAgentId: 'foreign' } })).status, 404);
  const transferred = await request(spec, route + '/transfer', { body });
  assert.equal(transferred.status, 200);
  assert.equal(transferred.value.parentHash, created.value.provenanceHash);
  assert.equal(transferred.value.promotionGranted, false);
  const child = await spec.db.get('SELECT * FROM genome_decisions WHERE id = ?', transferred.value.id);
  assert.equal(child.created_by, spec.settings.agent);
  const parent = await spec.db.get('SELECT parent_hash FROM provenance_records WHERE id = ?', child.provenance_record_id);
  assert.equal(parent.parent_hash, created.value.provenanceHash);
  assert.equal((await request(spec, base, { body: { title: 'Invalid', content: 'Invalid', evidenceRefs: ['x'] } })).status, 400);
  await spec.db.run('UPDATE genome_decisions SET content = ? WHERE id = ?', 'tampered', created.value.id);
  assert.equal((await request(spec, route + '/transfer', { body })).status, 409);
  assert.equal((await request(spec, route)).status, 409);
  await writeRefusals(spec, base);
  console.log('Studio memory: scoped search, sourced decision, provenance transfer, tamper and authority refusals passed.');
}
withFixture(probe).catch(error => { console.error(error); process.exitCode = 1; });
