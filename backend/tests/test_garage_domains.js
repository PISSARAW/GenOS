'use strict';

const assert = require('assert/strict');
const { fixture, open, request } = require('./garageFixture');
const domains = require('../src/services/garageDomainService');
const garage = require('../src/services/workerGarageService');
const queue = require('../src/services/garageQueueStore');

async function run() {
  const test = await fixture();
  const second = await open(test.filename);
  try {
    const registered = await Promise.all([
      domains.ensureDomain(test.db, 'orch', 2), domains.ensureDomain(second, 'orch', 2)
    ]);
    assert.equal(registered[0].manager_id, registered[1].manager_id);
    assert.equal(registered[0].active_capacity, 2);
    assert.equal((await domains.ensureDomain(test.db, 'orch', 9)).active_capacity, 2);
    await test.db.run(`INSERT INTO agents(id,execution_mode,status,workspace_id,parent_agent_id,metadata_json)
      VALUES ('sub','worker','running','ws','orch','{"workerKind":"sub_orchestrator"}')`);
    const sub = await domains.ensureDomain(test.db, 'sub', 2);
    assert.deepEqual([sub.parent_manager_id, sub.root_manager_id, sub.project_id], ['orch', 'orch', 'project']);
    await test.db.run(`INSERT INTO agents(id,execution_mode,status,workspace_id,parent_agent_id)
      VALUES ('sub-child','worker','idle','ws','sub'), ('sub-child-2','worker','idle','ws','sub')`);
    await garage.reserveSlot(test.db, { orchestratorId: 'sub', workerId: 'sub-child', name: 'First', role: 'bounded_worker', mission: 'bounded' });
    const reservation = await second.get("SELECT * FROM garage_active_reservations WHERE worker_id = 'sub-child'");
    assert.deepEqual([reservation.manager_id, reservation.root_manager_id, reservation.resource, reservation.amount],
      ['sub', 'orch', 'active_worker', 1]);
    await test.db.run("UPDATE garage_domains SET active_capacity = 1 WHERE manager_id = 'sub'");
    await assert.rejects(garage.reserveSlot(test.db, {
      orchestratorId: 'sub', workerId: 'sub-child-2', name: 'Second', role: 'bounded_worker', mission: 'bounded'
    }), { code: 'WORKER_GARAGE_FULL' });
    await test.db.run("UPDATE agents SET status = 'idle' WHERE id = 'sub-child'");
    assert.equal(await second.get("SELECT worker_id FROM garage_active_reservations WHERE worker_id = 'sub-child'"), undefined);
    await garage.reserveSlot(test.db, { orchestratorId: 'sub', workerId: 'sub-child-2', name: 'Second', role: 'bounded_worker', mission: 'bounded' });
    await test.db.run("UPDATE garage_domains SET queue_capacity = 1 WHERE manager_id = 'orch'");
    await queue.enqueuePersistent(test.db, request({ requestId: 'first-queued' }));
    await assert.rejects(queue.enqueuePersistent(test.db, request({ requestId: 'second-queued', workerId: 'worker-2' })),
      { code: 'GARAGE_QUEUE_FULL' });
    await test.db.run("INSERT INTO agents(id,execution_mode,status,workspace_id) VALUES ('other-root','orchestrator','running','ws')");
    await test.db.run("UPDATE agents SET parent_agent_id = 'other-root' WHERE id = 'sub'");
    await assert.rejects(domains.ensureDomain(test.db, 'sub', 2), { code: 'GARAGE_DOMAIN_BINDING_CONFLICT' });
    await test.db.run("UPDATE agents SET parent_agent_id = 'orch' WHERE id = 'sub'");
    await test.db.run("INSERT INTO workspaces(id,organization_id,project_id) VALUES ('foreign-ws','foreign-org','foreign-project')");
    await test.db.run("UPDATE agents SET workspace_id = 'foreign-ws' WHERE id = 'sub'");
    await assert.rejects(domains.ensureDomain(test.db, 'sub', 2), { code: 'GARAGE_DOMAIN_SCOPE_INVALID' });
  } finally {
    await second.close();
    await test.close();
  }
  console.log('Garage domains: durable hierarchy, admission caps, active projection and binding fence passed.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
