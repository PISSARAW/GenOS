'use strict';
const assert = require('node:assert/strict');
const { withFixture, writeRefusals } = require('./helpers/studioGenosFixture.cjs');
const { request } = require('./helpers/studioRequest.cjs');
const root = '/api/studio/agents/consumer-promotion-agent';

async function probe(spec) {
  assert.equal((await fetch(spec.url + root + '/worlds')).status, 401);
  assert.equal((await request(spec, root + '/worlds', { project: 'b06-other' })).status, 404);
  const snapshot = await request(spec, root + '/checkpoints', { body: { reason: 'D01', agentId: 'foreign' } });
  assert.equal(snapshot.status, 201);
  assert.equal(snapshot.value.agentId, spec.settings.agent);
  assert.ok(snapshot.value.workspaceSnapshotHash);
  const branch = await request(spec, root + '/branches', { body: { refName: 'alternative', fromCommitId: snapshot.value.snapshotId } });
  assert.equal(branch.status, 201);
  assert.equal(branch.value.fromCommitId, snapshot.value.snapshotId);
  assert.equal((await request(spec, root + '/branches', { body: { refName: 'bad', fromCommitId: 'missing' } })).status, 404);
  const clone = await request(spec, root + '/clone', { body: {} });
  assert.equal(clone.status, 201);
  const saved = await spec.db.get('SELECT * FROM agents WHERE id = ?', clone.value.clonedAgentId);
  assert.equal(saved.status, 'idle');
  assert.equal(saved.workspace_id, 'consumer-ws');
  const diff = await request(spec, root + '/compare', { body: { rightAgentId: clone.value.clonedAgentId } });
  assert.equal(diff.status, 200);
  assert.ok(diff.value.differences.some(item => item.path === 'identity.id'));
  assert.equal((await request(spec, root + '/compare', { body: { rightAgentId: 'foreign' } })).status, 404);
  const inspected = await request(spec, root + '/worlds');
  assert.equal(inspected.value.cloneIsolation, 'shared_workspace');
  assert.equal(inspected.value.automaticPromotion, false);
  assert.ok(inspected.value.checkpoints.some(item => item.id === branch.value.branchId));
  assert.ok(inspected.value.relatives.some(item => item.id === clone.value.clonedAgentId));
  await writeRefusals(spec, root + '/clone');
  console.log('Studio worlds: durable checkpoint, branch, idle shared clone, diff, tenant/RBAC/archive refusals passed.');
}
withFixture(probe).catch(error => { console.error(error); process.exitCode = 1; });
