'use strict';

const assert = require('assert/strict');
const { spawnSync } = require('child_process');
const path = require('path');
const { fixture, open, request } = require('./garageFixture');
const store = require('../src/services/garageQueueStore');
const garage = require('../src/services/workerGarageService');

async function persistence(test) {
  const first = await store.enqueuePersistent(test.db, request({ requestId: 'idempotent' }));
  assert.equal((await store.enqueuePersistent(test.db, request({ requestId: 'idempotent' }))).request_id, first.request_id);
  await assert.rejects(store.enqueuePersistent(test.db, request({ requestId: 'idempotent', prompt: 'Different' })), { code: 'GARAGE_IDEMPOTENCY_CONFLICT' });
  await assert.rejects(store.enqueuePersistent(test.db, request({ organizationId: 'other' })), { code: 'GARAGE_SCOPE_INVALID' });
  await assert.rejects(store.enqueuePersistent(test.db, request({ workerId: 'unknown' })), { code: 'GARAGE_SCOPE_INVALID' });
  const child = spawnSync(process.execPath, ['-e',
    "const f=require('./garageFixture');f.open(process.argv[1]).then(async db=>{const row=await db.get('SELECT status FROM garage_queue WHERE request_id = ?', 'idempotent'); console.log(row.status);await db.close()}).catch(e=>{console.error(e);process.exitCode=1})", test.filename],
  { cwd: __dirname, encoding: 'utf8', windowsHide: true, timeout: 60000 });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout.trim(), 'queued', 'a fresh process reads the durable queue');
}

async function fencing(test) {
  const second = await open(test.filename);
  try {
    const claims = await Promise.all([store.claimNextPersistent(test.db, { orchestratorId: 'orch' }),
      store.claimNextPersistent(second, { orchestratorId: 'orch' })]);
    assert.equal(claims.filter(Boolean).length, 1, 'only one connection claims a worker');
    const claim = claims.find(Boolean);
    assert.equal(await store.updatePersistent(test.db, { requestId: claim.request_id, leaseId: 'stale', status: 'failed' }), false);
    await assert.rejects(store.updatePersistent(test.db, { requestId: claim.request_id, status: 'running' }), { code: 'GARAGE_FENCE_REQUIRED' });
    await assert.rejects(store.updatePersistent(test.db, { requestId: claim.request_id, leaseId: claim.lease_id,
      status: 'completed', result: { verified: false } }), { code: 'GARAGE_EVIDENCE_REQUIRED' });
    await test.db.run("UPDATE garage_queue SET lease_expires_at = '2000-01-01T00:00:00.000Z' WHERE request_id = ?", claim.request_id);
    assert.equal(await store.expirePersistent(test.db), 1);
    const fresh = await store.claimNextPersistent(test.db, { orchestratorId: 'orch' });
    assert.notEqual(fresh.lease_id, claim.lease_id);
    assert.equal(await store.updatePersistent(test.db, { requestId: claim.request_id, leaseId: claim.lease_id, status: 'failed' }), false);
    await store.updatePersistent(test.db, { requestId: fresh.request_id, leaseId: fresh.lease_id, status: 'failed' });
  } finally { await second.close(); }
}

async function capacity(test) {
  garage.setDynamicCapacity('orch', 1);
  const options = (workerId) => ({ orchestratorId: 'orch', workerId, name: workerId, role: 'implementation', mission: 'bounded' });
  const second = await open(test.filename);
  try {
    const results = await Promise.allSettled([garage.reserveSlot(test.db, options('worker-2')), garage.reserveSlot(second, options('worker-3'))]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal((await garage.state(test.db, 'orch')).occupied, 1);
  } finally { await second.close(); garage.releaseDynamicCapacity('orch'); }
}

async function run() {
  const test = await fixture();
  try { await persistence(test); await fencing(test); await capacity(test); await projectCapacity(test); await nestedProjectCapacity(test); }
  finally { await test.close(); }
  console.log('Garage runtime store: durable restart, idempotency, scope, fencing and atomic capacity passed.');
}

async function projectCapacity(test) {
  const limit = garage.projectCapacity();
  await test.db.run("UPDATE agents SET status = 'idle' WHERE execution_mode = 'worker'");
  await test.db.run("INSERT INTO agents(id,execution_mode,status,workspace_id) VALUES ('other-orch','orchestrator','running','ws')");
  for (let index = 0; index < limit - 1; index++) {
    await test.db.run(`INSERT INTO agents(id,execution_mode,status,workspace_id,parent_agent_id)
      VALUES (?,'worker','running','ws','other-orch')`, `occupied-${index}`);
  }
  const second = await open(test.filename);
  const options = (workerId) => ({ orchestratorId: 'orch', workerId, name: workerId, role: 'implementation', mission: 'bounded' });
  try {
    const results = await Promise.allSettled([garage.reserveSlot(test.db, options('worker-4')), garage.reserveSlot(second, options('worker-5'))]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.find((result) => result.status === 'rejected').reason.code, 'PROJECT_WORKER_CAPACITY_FULL');
    assert.equal((await test.db.get("SELECT COUNT(*) AS count FROM agents WHERE execution_mode = 'worker' AND status = 'running'")).count, limit);
  } finally { await second.close(); }
}

async function nestedProjectCapacity(test) {
  const limit = garage.projectCapacity();
  await test.db.run("UPDATE agents SET status = 'idle' WHERE execution_mode = 'worker'");
  await test.db.run(`INSERT INTO agents(id,execution_mode,status,workspace_id,parent_agent_id,metadata_json)
    VALUES ('nested-sub','worker','running',NULL,'other-orch','{"workerKind":"sub_orchestrator"}')`);
  await test.db.run(`INSERT INTO agents(id,execution_mode,status,workspace_id,parent_agent_id)
    VALUES ('nested-middle','worker','running',NULL,'nested-sub'),
      ('nested-deep','worker','running',NULL,'nested-middle')`);
  for (let index = 0; index < limit - 4; index++) {
    await test.db.run(`INSERT INTO agents(id,execution_mode,status,workspace_id,parent_agent_id)
      VALUES (?,'worker','running',NULL,'nested-deep')`, `nested-${index}`);
  }
  await test.db.run(`INSERT INTO agents(id,execution_mode,status,workspace_id,parent_agent_id)
    VALUES ('nested-candidate','worker','idle',NULL,'nested-sub')`);
  const second = await open(test.filename);
  try {
    const results = await Promise.allSettled([
      garage.reserveSlot(test.db, { orchestratorId: 'orch', workerId: 'worker-5', name: 'worker-5', role: 'implementation', mission: 'bounded' }),
      garage.reserveSlot(second, { orchestratorId: 'nested-sub', workerId: 'nested-candidate', name: 'nested-candidate', role: 'implementation', mission: 'bounded' })
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.find((result) => result.status === 'rejected').reason.code, 'PROJECT_WORKER_CAPACITY_FULL');
    const occupied = await require('../src/services/garageProjectCapacity').countActive(test.db,
      { organization_id: 'org', project_id: 'project' });
    assert.equal(occupied, limit, 'descendants share the project ceiling through multiple ancestors');
  } finally { await second.close(); }
  await test.db.run("INSERT INTO workspaces(id,organization_id,project_id) VALUES ('foreign-ws','org','project')");
  await test.db.run(`INSERT INTO agents(id,execution_mode,status,workspace_id,parent_agent_id)
    VALUES ('foreign-worker','worker','idle','foreign-ws','orch')`);
  await assert.rejects(garage.reserveSlot(test.db, { orchestratorId: 'orch', workerId: 'foreign-worker',
    name: 'foreign-worker', role: 'implementation', mission: 'bounded' }), { code: 'GARAGE_SCOPE_INVALID' });
}

run().catch((failure) => { console.error(failure); process.exitCode = 1; });
