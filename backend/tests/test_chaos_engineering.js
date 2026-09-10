/**
 * Tests for Chaos Engineering & Regeneration Steward Lineage Recovery.
 */

const assert = require('assert');
const { getDatabase } = require('../src/db');
const chaosService = require('../src/services/chaosEngineeringService');
const { activeProcesses } = require('../src/services/agentOrchestrationState');

async function testChaosEngineering() {
  console.log('--- Testing Chaos Engineering & Regeneration Steward ---');
  const db = await getDatabase();

  const wsId = `ws_chaos_${Date.now()}`;
  const orchestratorId = `orch_${Date.now()}`;
  const workerId = `worker_${Date.now()}`;

  // Seed workspace
  const orgId = `org_chaos_${Date.now()}`;
  const projId = `proj_chaos_${Date.now()}`;
  await db.run("INSERT INTO organizations(id, name) VALUES(?, ?) ON CONFLICT DO NOTHING", orgId, `Chaos Org ${orgId}`);
  await db.run("INSERT INTO projects(id, organization_id, name) VALUES(?, ?, ?) ON CONFLICT DO NOTHING", projId, orgId, `Chaos Project ${projId}`);
  await db.run(
    `INSERT INTO workspaces (id, name, path, organization_id, project_id)
     VALUES (?, 'Chaos WS', ?, ?, ?)`,
    wsId, `C:/tmp/chaos_${Date.now()}`, orgId, projId
  );

  // Seed parent orchestrator
  await db.run(
    `INSERT INTO agents (id, name, role, status, execution_mode, workspace_id, fleet_id)
     VALUES (?, 'Stem Orchestrator', 'Orchestrator', 'running', 'orchestrator', ?, 'fleet-chaos-1')`,
    orchestratorId, wsId
  );

  // Seed worker agent with lineage
  await db.run(
    `INSERT INTO agents (id, name, role, status, execution_mode, workspace_id, fleet_id, parent_agent_id, lineage_relation)
     VALUES (?, 'Pioneer Worker', 'Solver', 'running', 'worker', ?, 'fleet-chaos-1', ?, 'fork')`,
    workerId, wsId, orchestratorId
  );

  // Seed lineage node
  await db.run(
    `INSERT INTO lineage_nodes (id, workspace_id, agent_id, label, node_type)
     VALUES (?, ?, ?, 'Worker L1 Node', 'agent')`,
    `node_${workerId}`, wsId, workerId
  );

  // Simulate active process in map
  const dummyChild = {
    pid: 77777,
    exitCode: null,
    signalCode: null,
    kill: (signal) => { dummyChild.signalCode = signal; }
  };
  activeProcesses.set(workerId, { child: dummyChild });

  // 1. Dry run chaos injection
  const dryResult = await chaosService.injectChaos({
    agentId: workerId,
    dryRun: true,
    reason: 'Dry Run Validation'
  });
  assert(dryResult.success, 'Dry run chaos should succeed');
  assert.equal(dryResult.dryRun, true);
  assert.equal(dryResult.targetAgent.id, workerId);
  assert.equal(dryResult.targetAgent.pid, 77777);
  assert.equal(dryResult.lineage.parentAgentId, orchestratorId);
  assert.equal(dryResult.lineage.relation, 'fork');
  assert.equal(dryResult.regenerationSteward.activated, false, 'Dry run must not claim the steward ran');
  assert.equal(dryResult.regenerationSteward.missionPreserved, null, 'Mission preservation is not verifiable');
  console.log('✓ Dry-run chaos successfully verified lineage L_i without terminating process');

  // 2. Live chaos injection (terminates worker PID)
  const liveResult = await chaosService.injectChaos({
    agentId: workerId,
    dryRun: false,
    reason: 'Live Process Termination'
  });
  assert(liveResult.success, 'Live chaos injection should succeed');
  assert.equal(liveResult.targetAgent.pid, 77777);
  assert.equal(liveResult.lineage.parentAgentId, orchestratorId);
  assert.equal(liveResult.regenerationSteward.strategy, 'lineage_reconstruction');
  assert.equal(liveResult.regenerationSteward.activated, true, 'Steward only activates after a real kill');
  console.log('✓ Live chaos successfully executed and triggered Regeneration Steward reconstruction');

  // 3. No live process: the service must report failure instead of
  // fabricating a PID and a successful regeneration.
  activeProcesses.delete(workerId);
  const noProcessResult = await chaosService.injectChaos({
    agentId: workerId,
    dryRun: false,
    reason: 'No live process drill'
  });
  assert.equal(noProcessResult.success, false, 'Killing a worker with no live process must fail');
  assert.equal(noProcessResult.error, 'NO_ACTIVE_PROCESS');
  assert.equal(noProcessResult.targetAgent.pid, null);
  assert.equal(noProcessResult.regenerationSteward.activated, false);
  console.log('✓ Chaos without a live process reports an honest failure (no fabricated PID)');

  // 4. Cross-worker: the in-memory map is empty but agents.runtime_pid still
  // records the live PID, so chaos must target that persisted PID instead of
  // silently no-op'ing.
  await db.run('UPDATE agents SET runtime_pid = ?, runtime_executable = NULL WHERE id = ?', 88888, workerId);
  const persistedResult = await chaosService.injectChaos({
    agentId: workerId,
    dryRun: true,
    reason: 'Cross-worker persisted PID drill'
  });
  assert.equal(persistedResult.success, true);
  assert.equal(persistedResult.targetAgent.pid, 88888, 'must resolve the persisted runtime_pid');
  await db.run('UPDATE agents SET runtime_pid = NULL WHERE id = ?', workerId);
  console.log('✓ Chaos resolves the persisted runtime_pid when the process lives on another worker');

  // Clean up
  console.log('All Chaos Engineering tests passed successfully.');
}

if (require.main === module) {
  testChaosEngineering()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Chaos Engineering test failed:', err);
      process.exit(1);
    });
}

module.exports = { testChaosEngineering };
