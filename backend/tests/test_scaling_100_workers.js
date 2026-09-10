const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Configure environment for 100 workers before loading services
process.env.GENOS_MAX_ACTIVE_WORKERS = '100';
process.env.GENOS_MAX_AUTONOMOUS_WORKERS = '100';
process.env.GENOS_MAX_ATEAM_MEMBERS = '100';
process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'test-admin-password';

const garage = require('../src/services/workerGarageService');
const aTeam = require('../src/services/aTeamService');
const inferenceGateway = require('../src/services/inferenceGatewayService');
const circuitBreaker = require('../src/services/circuitBreaker');
const { calculateInheritedCognitiveBudget } = require('../src/services/agentFleetService');
const { getDatabase, closeDatabase } = require('../src/db');

async function run() {
  console.log('--- 1. Testing Configurable Worker Capacities ---');
  assert.equal(garage.MAX_ACTIVE_WORKERS, 100, 'garage.MAX_ACTIVE_WORKERS should dynamically reflect 100');
  assert.equal(garage.maxActiveWorkers(), 100, 'maxActiveWorkers() should return 100');
  assert.ok(garage.projectCapacity() >= 100, 'projectCapacity() should adapt to at least 100');
  assert.equal(aTeam.MAX_MEMBERS, 100, 'aTeam.MAX_MEMBERS should reflect 100');

  console.log('--- 2. Testing Inference Gateway Adaptive Queues ---');
  const gatewayStats = inferenceGateway.stats();
  assert.ok(gatewayStats.capacity >= 400, `gateway capacity should scale to at least 400, got ${gatewayStats.capacity}`);

  console.log('--- 3. Testing Circuit Breaker Loop Exemption ---');
  for (let i = 0; i < 10; i++) {
    const check = circuitBreaker.canExecute('worker_deployment', 'admin', 'test_scope');
    assert.equal(check.allowed, true, `worker_deployment should be allowed consecutively without loop error (call ${i + 1})`);
  }

  console.log('--- 4. Testing Inherited Cognitive Budget for 100 Workers ---');
  const perWorkerBudget = calculateInheritedCognitiveBudget(100, 0.6, 100);
  assert.equal(perWorkerBudget, 0.6, 'per-worker cognitive budget should be 0.6 for 100 workers');

  console.log('--- 5. Testing Database Integration & Garage Reservation for 100 Workers ---');
  const dbPath = path.resolve(__dirname, 'test-scaling-100.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

  const db = await getDatabase(dbPath);
  try {
    await db.run("INSERT INTO organizations (id, name) VALUES ('scale-org', 'Scale Org')");
    await db.run("INSERT INTO projects (id, organization_id, name) VALUES ('scale-project', 'scale-org', 'Scale Project')");
    await db.run("INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES ('scale-workspace', 'Scale Workspace', ?, 'scale-org', 'scale-project')", __dirname);
    await db.run("INSERT INTO agents (id, name, role, status, execution_mode, workspace_id, cognitive_budget) VALUES ('orchestrator-100', 'Orchestrator 100', 'orchestrator', 'running', 'orchestrator', 'scale-workspace', 100.0)");

    // Check initial state
    let state = await garage.state(db, 'orchestrator-100');
    assert.equal(state.capacity, 100);
    assert.equal(state.occupied, 0);
    assert.equal(state.available, 100);

    // Populate and reserve 100 workers
    console.log('Inserting and reserving 100 workers...');
    for (let i = 1; i <= 100; i++) {
      const workerId = `worker-${i}`;
      await db.run(
        "INSERT INTO agents (id, name, role, status, execution_mode, parent_agent_id) VALUES (?, ?, 'implementation', 'idle', 'worker', 'orchestrator-100')",
        workerId, `Worker ${i}`
      );
      const reserved = await garage.reserveSlot(db, {
        orchestratorId: 'orchestrator-100',
        workerId,
        name: `Worker ${i} Running`,
        role: 'implementation',
        mission: `Subtask ${i}`
      });
      assert.equal(reserved.reserved, true);
      assert.ok(reserved.slot >= 1 && reserved.slot <= i);
    }

    state = await garage.state(db, 'orchestrator-100');
    assert.equal(state.capacity, 100);
    assert.equal(state.occupied, 100);
    assert.equal(state.available, 0);

    // 101st worker should be rejected
    await db.run(
      "INSERT INTO agents (id, name, role, status, execution_mode, parent_agent_id) VALUES ('worker-101', 'Worker 101', 'implementation', 'idle', 'worker', 'orchestrator-100')"
    );
    await assert.rejects(
      () => garage.reserveSlot(db, {
        orchestratorId: 'orchestrator-100',
        workerId: 'worker-101',
        name: 'Worker 101 Running',
        role: 'implementation',
        mission: 'Subtask 101'
      }),
      (err) => err.code === 'WORKER_GARAGE_FULL'
    );

    // Precision-safe debit test on orchestrator cognitive budget
    let currentBudget = 100.0;
    for (let i = 1; i <= 100; i++) {
      const debit = await db.run(
        `UPDATE agents
         SET cognitive_budget = ROUND(MAX(0, COALESCE(cognitive_budget, 0) - ?), 6), updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND (cognitive_budget >= ? OR (? - cognitive_budget) < 0.0001)`,
        perWorkerBudget,
        'orchestrator-100',
        perWorkerBudget,
        perWorkerBudget
      );
      assert.equal(debit.changes, 1, `Debit for worker ${i} should succeed without precision failure`);
    }

    const finalOrchestrator = await db.get("SELECT cognitive_budget FROM agents WHERE id = 'orchestrator-100'");
    assert.ok(Math.abs(finalOrchestrator.cognitive_budget - 40.0) < 0.01, `Remaining budget should be ~40, got ${finalOrchestrator.cognitive_budget}`);

    console.log('--- 6. Testing 100 Concurrent withTransaction Writes ---');
    const { withTransaction, withWriteRetry } = require('../src/db');
    assert.equal(typeof withWriteRetry, 'function', 'withWriteRetry must be exported');

    // Launch 100 concurrent write transactions at the exact same moment
    await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        withTransaction(db, async (txDb) => {
          await txDb.run(
            "UPDATE agents SET eureka_count = eureka_count + 1 WHERE id = 'orchestrator-100'"
          );
        })
      )
    );

    const updatedOrchestrator = await db.get("SELECT eureka_count FROM agents WHERE id = 'orchestrator-100'");
    assert.equal(updatedOrchestrator.eureka_count, 100, `Expected 100 successful transactional increments, got ${updatedOrchestrator.eureka_count}`);

  } finally {
    await closeDatabase();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  }

  console.log('All 100-worker scaling tests passed successfully!');
}

run().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
