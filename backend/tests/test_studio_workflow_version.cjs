'use strict';
const assert = require('node:assert/strict');
const { withFixture } = require('./helpers/studioGenosFixture.cjs');
const { request } = require('./helpers/studioRequest.cjs');
const graph = { nodes: [{ id: 'start', type: 'input' }, { id: 'finish', type: 'output' }],
  edges: [{ source: 'start', target: 'finish' }], custom: { preserved: true } };

async function refusalProbes(spec, route) {
  const stale = { expectedVersion: 1, name: 'Stale overwrite' };
  assert.equal((await request(spec, route, { method: 'PUT', body: stale })).status, 409);
  assert.equal((await request(spec, route + '/runs', { body: { expectedVersion: 1 } })).status, 409);
  for (const expectedVersion of ['2', 0, null, 2.5]) {
    assert.equal((await request(spec, route, { method: 'PUT', body: { expectedVersion } })).status, 400);
  }
  assert.equal((await request(spec, route, { project: 'b06-other' })).status, 404);
  assert.equal((await request(spec, route + '/runs', { project: 'b06-other', body: { expectedVersion: 2 } })).status, 404);
}

async function probe(spec) {
  const created = await request(spec, '/api/workflows', { body: { name: 'Builder version test',
    workspaceId: spec.settings.workspace, graph, metadata: { untouched: ['a', 'b'] } } });
  assert.equal(created.status, 201, JSON.stringify(created.value));
  const route = '/api/workflows/' + created.value.id;
  assert.equal((await request(spec, route + '/runs', { body: { expectedVersion: 1 } })).status, 409);
  const saved = await request(spec, route, { method: 'PUT', body: { expectedVersion: 1, status: 'staging' } });
  assert.equal(saved.status, 200, JSON.stringify(saved.value));
  assert.equal(saved.value.version, 2);
  await refusalProbes(spec, route);
  const current = (await request(spec, route)).value;
  assert.equal(current.name, 'Builder version test');
  assert.deepEqual(current.graph, graph);
  assert.deepEqual(current.metadata, { untouched: ['a', 'b'] });
  assert.equal((await spec.db.get('SELECT COUNT(*) AS count FROM workflow_runs')).count, 0);
  const admitted = await request(spec, route + '/runs', { body: { expectedVersion: 2, input: { real: true } } });
  assert.equal(admitted.status, 202, JSON.stringify(admitted.value));
  assert.equal(admitted.value.status, 'queued');
  assert.equal(admitted.value.version, 2);
  await spec.db.run("UPDATE access_keys SET role='viewer' WHERE id='b06-key'");
  assert.equal((await request(spec, route, { method: 'PUT', body: { expectedVersion: 2, name: 'Forbidden' } })).status, 403);
  console.log('Studio workflow versions: create, immutable history, stale save/run refusal, tenant and read-only boundaries passed.');
}
withFixture(probe).catch(error => { console.error(error); process.exitCode = 1; });
