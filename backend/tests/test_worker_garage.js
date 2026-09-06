const assert = require('assert');
const fs = require('fs');
const path = require('path');
const garage = require('../src/services/workerGarageService');
const { getDatabase, closeDatabase } = require('../src/db');

async function run() {
  assert.equal(garage.MAX_ACTIVE_WORKERS, 3);
  assert.equal(garage.workerName({ role: 'implementation', hypothesis: 'minimal_patch' }), 'Implement · minimal patch');
  assert.equal(garage.workerName({ role: 'independent_reviewer', hypothesis: 'configuration_or_dependency' }), 'Verify · configuration or dependency');
  assert.equal(garage.workerName({ role: 'literary_author', hypothesis: 'human voice' }), 'Write · human voice');
  assert.equal(garage.workerName({ role: 'dramaturg', hypothesis: 'causal ending' }), 'Structure · causal ending');
  assert.equal(garage.workerName({ role: 'literary_critic', hypothesis: 'blind reading' }), 'Critique · blind reading');

  const dbPath = path.resolve(__dirname, 'worker-garage-test.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = await getDatabase(dbPath);
  try {
    await db.run("INSERT INTO agents (id, name, role, status, execution_mode) VALUES ('garage-root', 'Root', 'orchestrator', 'running', 'orchestrator')");
    for (let index = 1; index <= 3; index += 1) {
      await db.run(
        "INSERT INTO agents (id, name, role, status, execution_mode, parent_agent_id) VALUES (?, ?, 'implementation', 'running', 'worker', 'garage-root')",
        `garage-worker-${index}`, `Worker ${index}`
      );
    }
    let current = await garage.state(db, 'garage-root');
    assert.deepEqual({ capacity: current.capacity, occupied: current.occupied, available: current.available }, { capacity: 3, occupied: 3, available: 0 });
    await assert.rejects(() => garage.requireAvailableSlot(db, 'garage-root', 'garage-worker-4'), (error) => error.code === 'WORKER_GARAGE_FULL');

    await db.run("UPDATE agents SET status = 'idle' WHERE id = 'garage-worker-2'");
    current = await garage.requireAvailableSlot(db, 'garage-root', 'garage-worker-4');
    assert.equal(current.available, 1);
    assert.equal(current.slot, 3);

    await db.run("INSERT INTO agents (id, name, role, status, execution_mode, parent_agent_id) VALUES ('garage-worker-4', 'Old name', 'worker', 'idle', 'worker', 'garage-root')");
    const reserved = await garage.reserveSlot(db, {
      orchestratorId: 'garage-root', workerId: 'garage-worker-4',
      name: 'Verify · replacement mission', role: 'independent_reviewer', mission: 'replacement mission'
    });
    assert.equal(reserved.slot, 3);
    assert.equal(reserved.available, 0);
    assert.equal(reserved.reserved, true);
    const renamed = await db.get("SELECT name, current_task, status FROM agents WHERE id = 'garage-worker-4'");
    assert.deepEqual(renamed, { name: 'Verify · replacement mission', current_task: 'replacement mission', status: 'running' });

    await db.run("UPDATE agents SET status = 'blocked', current_task = 'Stopping on operator request' WHERE id = 'garage-worker-4'");
    current = await garage.state(db, 'garage-root');
    assert.equal(current.occupied, 3, 'a stopping worker keeps its slot until the process exits');
    await db.run("UPDATE agents SET current_task = 'Runtime halted: operator request' WHERE id = 'garage-worker-4'");
    current = await garage.state(db, 'garage-root');
    assert.equal(current.available, 1, 'the slot is free after the runtime has exited');

    await db.run("UPDATE agents SET role = 'independent_reviewer', about = 'Worker scope: token refresh race conditions', name = 'Verify · token refresh race conditions', status = 'idle' WHERE id = 'garage-worker-2'");
    const reusable = await garage.findReusableWorker(db, 'garage-root', {
      role: 'independent_reviewer', mission: 'Audit the token refresh race condition'
    });
    assert.equal(reusable.id, 'garage-worker-2', 'an idle specialist is revived for a mission in its scope');
    assert.deepEqual(reusable.affinity.shared.sort(), ['condition', 'race', 'refresh', 'token']);

    const unrelated = await garage.findReusableWorker(db, 'garage-root', {
      role: 'independent_reviewer', mission: 'Audit invoice rounding and VAT totals'
    });
    assert.equal(unrelated, null, 'an idle specialist is not reused outside its scope');

    await db.run("UPDATE agents SET status = 'running' WHERE id = 'garage-worker-2'");
    const active = await garage.findReusableWorker(db, 'garage-root', {
      role: 'independent_reviewer', mission: 'Audit the token refresh race condition'
    });
    assert.equal(active, null, 'an active specialist cannot be revived a second time');
  } finally {
    await closeDatabase();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  }
  console.log('Worker garage checks passed.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
