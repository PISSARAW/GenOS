const assert = require('node:assert/strict');
const { getDatabase } = require('../src/db');
const lineageController = require('../src/controllers/lineageController');

async function testLineageLifecycle() {
  console.log('--- Testing Lineage Controller Lifecycle (Clone & Kill) ---');
  const db = await getDatabase();
  const wsId = `ws_lifecycle_${Date.now()}`;
  await db.run("INSERT OR IGNORE INTO workspaces (id, name, path) VALUES (?, ?, ?)", wsId, `Lifecycle WS ${Date.now()}`, __dirname);

  // Setup parent agent and lineage node
  const parentId = `node_source_${Date.now()}`;
  const parentAgentId = `agent_source_${Date.now()}`;

  await db.run(
    "INSERT INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id, cognitive_budget, is_apoptotic) VALUES (?, 'Root Worker', 'worker', 'idle', 'GenOS', 'orchestrator', ?, 100.0, 0)",
    parentAgentId, wsId
  );
  await db.run(
    "INSERT INTO lineage_nodes (id, workspace_id, agent_id, label, node_type, state_summary) VALUES (?, ?, ?, 'Root Worker Node', 'agent', 'Active')",
    parentId, wsId, parentAgentId
  );

  // 1. Test cloneNode
  let clonedResponseData = null;
  const mockReqClone = { body: { nodeId: parentId } };
  const mockResClone = {
    status: (code) => ({
      json: (data) => { clonedResponseData = data; }
    }),
    json: (data) => { clonedResponseData = data; }
  };

  await lineageController.cloneNode(mockReqClone, mockResClone);
  assert.ok(clonedResponseData?.success, 'cloneNode must return success');
  const clonedNodeId = clonedResponseData.clonedNodeId;
  const clonedAgentId = clonedResponseData.clonedAgentId;

  // Check agent exists in agents table
  const clonedAgent = await db.get('SELECT * FROM agents WHERE id = ?', clonedAgentId);
  assert.ok(clonedAgent, 'Cloned agent must exist in agents table');
  assert.strictEqual(clonedAgent.status, 'idle');
  assert.strictEqual(clonedAgent.lineage_relation, 'clone');

  // Check edge exists
  const cloneEdge = await db.get('SELECT * FROM lineage_edges WHERE target_node_id = ?', clonedNodeId);
  assert.ok(cloneEdge, 'Edge connecting parent to clone must exist');
  assert.strictEqual(cloneEdge.source_node_id, parentId);
  assert.strictEqual(cloneEdge.edge_type, 'clone');
  console.log('  ✅ PASS: cloneNode created real worker agent and lineage edge');

  // 2. Test killNode with cascade: true
  let killResponseData = null;
  const mockReqKill = { body: { nodeId: parentId, cascade: true } };
  const mockResKill = {
    status: (code) => ({
      json: (data) => { killResponseData = data; }
    }),
    json: (data) => { killResponseData = data; }
  };

  await lineageController.killNode(mockReqKill, mockResKill);
  assert.ok(killResponseData?.success, 'killNode must succeed');
  assert.ok(killResponseData.cascaded >= 1, 'killNode must have cascaded to clone child');

  // Verify parent agent apoptosis
  const killedParentAgent = await db.get('SELECT status, is_apoptotic, cognitive_budget FROM agents WHERE id = ?', parentAgentId);
  assert.strictEqual(killedParentAgent.status, 'apoptosis');
  assert.strictEqual(killedParentAgent.is_apoptotic, 1);
  assert.strictEqual(killedParentAgent.cognitive_budget, 0);

  // Verify parent node state summary
  const killedParentNode = await db.get('SELECT state_summary FROM lineage_nodes WHERE id = ?', parentId);
  assert.strictEqual(killedParentNode.state_summary, 'Apoptosis Terminated');

  // Verify cascaded child agent apoptosis
  const killedChildAgent = await db.get('SELECT status, is_apoptotic, cognitive_budget FROM agents WHERE id = ?', clonedAgentId);
  assert.strictEqual(killedChildAgent.status, 'apoptosis');
  assert.strictEqual(killedChildAgent.is_apoptotic, 1);
  assert.strictEqual(killedChildAgent.cognitive_budget, 0);

  console.log('  ✅ PASS: killNode executed real apoptosis on agent and cascaded to descendants');

  console.log('ALL LINEAGE LIFECYCLE TESTS PASSED');
}

testLineageLifecycle().catch((err) => {
  console.error('❌ Test failed:', err.stack || err);
  process.exit(1);
});
