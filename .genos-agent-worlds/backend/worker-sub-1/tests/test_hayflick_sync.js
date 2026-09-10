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
  const progenyNodes = await db.all(
    "SELECT id, node_type FROM lineage_nodes WHERE workspace_id = ? AND node_type = 'speculative_merozoite' AND metadata LIKE ?",
    wsId,
    `%\"motherAgentId\":\"${motherId}\"%`
  );
  assert.equal(progenyNodes.length, schizoRes.json.progeny_count, 'Every schizogony progeny must be persisted as a lineage node');
  const progenyEdges = await db.all(
    "SELECT target_node_id FROM lineage_edges WHERE workspace_id = ? AND source_node_id = ? AND edge_type = 'schizogony'",
    wsId,
    motherId
  );
  assert.equal(progenyEdges.length, schizoRes.json.progeny_count, 'Every schizogony progeny must have a mother edge');
  console.log('  ✅ PASS: Schizogony lysis synchronized with agents and lineage_nodes tables');

  const fissionMotherId = `cell_fission_${Date.now()}`;
  await db.run(
    "INSERT INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id, is_apoptotic) VALUES (?, 'Fission Mother', 'worker', 'running', 'GenOS', 'worker', ?, 0)",
    fissionMotherId, wsId
  );
  const fissionRes = await genosCli.runCellDivision({ agentId: fissionMotherId, mode: 'binary_fission', mutationRate: 0, seed: 'sync-fission' });
  assert.ok(fissionRes.ok, `Binary fission CLI failed: ${fissionRes.stderr}`);
  const fissionNode = await db.get('SELECT node_type FROM lineage_nodes WHERE id = ?', fissionRes.json.daughter_b_id);
  const fissionEdge = await db.get('SELECT edge_type FROM lineage_edges WHERE source_node_id = ? AND target_node_id = ?', fissionMotherId, fissionRes.json.daughter_b_id);
  assert.equal(fissionNode.node_type, 'binary_fission');
  assert.equal(fissionEdge.edge_type, 'binary_fission');
  console.log('  ✅ PASS: Binary fission descendant and parent edge persisted');

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
