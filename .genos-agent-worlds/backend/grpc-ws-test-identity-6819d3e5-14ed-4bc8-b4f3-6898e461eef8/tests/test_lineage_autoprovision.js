const assert = require('node:assert/strict');
const { getDatabase } = require('../src/db');
const agentEvolution = require('../src/services/agentEvolutionService');
const strategyAdapter = require('../src/services/strategyExecutionAdapter');

async function testAutoProvisionAndLineage() {
  console.log('--- Testing Parent Auto-Provisioning & Lineage Persistence ---');
  const db = await getDatabase();
  const orchestratorId = `orch_fresh_${Date.now()}`;
  const workspaceId = 'ws-fresh-lineage';

  await db.run(
    "INSERT OR IGNORE INTO workspaces (id, name, path) VALUES (?, 'Fresh Lineage WS', ?)",
    workspaceId, __dirname
  );

  // 1. Insert orchestrator ONLY in agents table (NOT in lineage_nodes)
  await db.run(
    "INSERT INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id) VALUES (?, 'Prime Fresh Orchestrator', 'orchestrator', 'idle', 'GenOS', 'orchestrator', ?)",
    orchestratorId, workspaceId
  );

  const priorNode = await db.get('SELECT id FROM lineage_nodes WHERE id = ?', orchestratorId);
  assert.strictEqual(priorNode, undefined, 'Orchestrator should NOT have a prior lineage_nodes entry');

  // 2. Worker lineage record should auto-provision parent
  const workerId = `worker_fresh_${Date.now()}`;
  const recordRes = await agentEvolution.recordWorkerLineage(db, {
    agentId: workerId,
    name: 'Fresh Evolved Worker',
    role: 'tester',
    workspaceId
  }, {
    parentId: orchestratorId,
    edgeType: 'autonomous_worker'
  });

  assert.strictEqual(recordRes.success, true, `recordWorkerLineage must succeed via auto-provisioning: ${recordRes.error}`);

  // Check that parent was auto-provisioned
  const provisionedParent = await db.get('SELECT id, label, node_type FROM lineage_nodes WHERE id = ?', orchestratorId);
  assert.ok(provisionedParent, 'Parent must be auto-provisioned in lineage_nodes');
  assert.strictEqual(provisionedParent.node_type, 'core');
  assert.strictEqual(provisionedParent.label, 'Prime Fresh Orchestrator');

  // Check child node and edge
  const childNode = await db.get('SELECT id, label, node_type FROM lineage_nodes WHERE id = ?', workerId);
  assert.ok(childNode, 'Child must exist in lineage_nodes');
  const edge = await db.get('SELECT source_node_id, target_node_id, edge_type FROM lineage_edges WHERE target_node_id = ?', workerId);
  assert.ok(edge, 'Lineage edge must exist');
  assert.strictEqual(edge.source_node_id, orchestratorId);
  assert.strictEqual(edge.edge_type, 'autonomous_worker');
  console.log('  ✅ PASS: Parent auto-provisioned and worker lineage persisted.');

  // 3. Test fork() records lineage
  const forkRes = await strategyAdapter.executePrimitive('fork', {
    orchestratorId,
    mission: 'test fork lineage'
  });
  assert.strictEqual(forkRes.success, true, `fork must succeed: ${forkRes.error}`);
  const forkedAgent = await db.get('SELECT id, parent_agent_id, lineage_relation FROM agents WHERE id = ?', forkRes.forkedWorkerId);
  assert.strictEqual(forkedAgent.parent_agent_id, orchestratorId);
  assert.strictEqual(forkedAgent.lineage_relation, 'fork');

  const forkedEdge = await db.get('SELECT source_node_id, target_node_id, edge_type FROM lineage_edges WHERE target_node_id = ?', forkRes.forkedWorkerId);
  assert.ok(forkedEdge, 'Lineage edge for fork must exist');
  assert.strictEqual(forkedEdge.edge_type, 'fork');
  console.log('  ✅ PASS: fork() sets lineage_relation and records lineage edge.');

  console.log('ALL AUTO-PROVISIONING TESTS PASSED');
}

testAutoProvisionAndLineage().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
