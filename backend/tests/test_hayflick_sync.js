const assert = require('node:assert/strict');
const { getDatabase } = require('../src/db');
const genosCli = require('../src/services/genosCli');
const strategyAdapter = require('../src/services/strategyExecutionAdapter');

async function testHayflickSync() {
  console.log('--- Testing Hayflick & Cell Division Sync with SQLite ---');
  const db = await getDatabase();
  const wsId = `ws_hayflick_${Date.now()}`;
  await db.run("INSERT OR IGNORE INTO workspaces (id, name, path) VALUES (?, ?, ?)", wsId, `Hayflick WS ${Date.now()}`, __dirname);

  // 1. Test schizogony lysis sync
  const motherId = `cell_mother_${Date.now()}`;
  await db.run(
    "INSERT INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id, is_apoptotic) VALUES (?, 'Schizont Mother', 'orchestrator', 'running', 'GenOS', 'orchestrator', ?, 0)",
    motherId, wsId
  );
  await db.run(
    "INSERT INTO lineage_nodes (id, workspace_id, agent_id, label, node_type, state_summary) VALUES (?, ?, ?, 'Schizont Mother Node', 'agent', 'Active')",
    motherId, wsId, motherId
  );

  const schizoRes = await genosCli.runCellDivision({
    agentId: motherId,
    mode: 'schizogony',
    merozoiteCount: 4,
    mutationRate: 0.05
  });

  assert.ok(schizoRes.ok, `Schizogony CLI failed: ${schizoRes.stderr}`);
  assert.strictEqual(schizoRes.json.mother_lysed, true);

  // Verify SQLite agent was marked apoptotic
  const lysedAgent = await db.get('SELECT status, is_apoptotic FROM agents WHERE id = ?', motherId);
  assert.strictEqual(lysedAgent.status, 'apoptosis');
  assert.strictEqual(lysedAgent.is_apoptotic, 1);

  // Verify lineage_nodes summary was updated
  const lysedNode = await db.get('SELECT state_summary FROM lineage_nodes WHERE id = ?', motherId);
  assert.ok(lysedNode.state_summary.includes('Lysed mother cell'));
  console.log('  ✅ PASS: Schizogony lysis synchronized with agents and lineage_nodes tables');

  // 2. Test recursive_fork senescence sync
  const orchHayflickId = `orch_senescence_${Date.now()}`;
  await db.run(
    "INSERT INTO agents (id, name, role, status, agent_type, execution_mode, current_task, workspace_id) VALUES (?, 'Hayflick Orch', 'orchestrator', 'running', 'GenOS', 'orchestrator', 'Hayflick test', ?)",
    orchHayflickId, wsId
  );

  // Bud 1 with limit 2
  const b1 = await strategyAdapter.executePrimitive('recursive_fork', {
    orchestratorId: orchHayflickId,
    maxBuds: 2,
    mission: 'Bud 1'
  });
  assert.ok(b1.success);

  // Bud 2 reaches limit
  await db.run("UPDATE agents SET status='idle' WHERE id = ?", b1.forkedWorkerId);
  const b2 = await strategyAdapter.executePrimitive('recursive_fork', {
    orchestratorId: orchHayflickId,
    maxBuds: 2,
    mission: 'Bud 2'
  });
  assert.ok(b2.success);

  // Check that parent node in lineage_nodes is now marked senescent
  const senescentNode = await db.get('SELECT state_summary FROM lineage_nodes WHERE id = ? OR agent_id = ?', orchHayflickId, orchHayflickId);
  assert.ok(senescentNode, 'Parent must exist in lineage_nodes');
  assert.ok(senescentNode.state_summary.includes('Replicative Senescence'), 'Node must be marked as senescent');
  console.log('  ✅ PASS: Reaching Hayflick limit in recursive_fork marks lineage_nodes with Replicative Senescence');

  console.log('ALL HAYFLICK & CELL DIVISION SYNC TESTS PASSED');
}

testHayflickSync().catch((err) => {
  console.error('❌ Test failed:', err.stack || err);
  process.exit(1);
});
