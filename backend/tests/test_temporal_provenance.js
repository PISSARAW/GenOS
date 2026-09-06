const assert = require('node:assert/strict');
const { getDatabase } = require('../src/db');
const strategyAdapter = require('../src/services/strategyExecutionAdapter');

async function testTemporalProvenance() {
  console.log('--- Testing Temporal Provenance & Truncation Guard ---');
  const db = await getDatabase();
  const wsRoot = `ws_prov_root_${Date.now()}`;
  const wsLeaf = `ws_prov_leaf_${Date.now()}`;

  await db.run("INSERT OR IGNORE INTO workspaces (id, name, path) VALUES (?, ?, ?)", wsRoot, `Prov Root ${Date.now()}`, __dirname);
  await db.run("INSERT OR IGNORE INTO workspaces (id, name, path) VALUES (?, ?, ?)", wsLeaf, `Prov Leaf ${Date.now()}`, __dirname);

  // Build a 15-generation chain
  // Generation 0: root agent in wsRoot
  const rootId = `agent_gen_0_${Date.now()}`;
  await db.run(
    "INSERT INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id, current_task) VALUES (?, 'Root Agent', 'orchestrator', 'idle', 'GenOS', 'orchestrator', ?, 'Genesis')",
    rootId, wsRoot
  );

  let prevId = rootId;
  const chainIds = [rootId];

  for (let i = 1; i < 15; i++) {
    const curId = `agent_gen_${i}_${Date.now()}`;
    const ws = i > 7 ? wsLeaf : wsRoot; // Cross-workspace ancestry boundary at gen 8
    await db.run(
      "INSERT INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id, parent_agent_id, lineage_relation, current_task) VALUES (?, ?, 'worker', 'idle', 'GenOS', 'worker', ?, ?, 'fork', ?)",
      curId, `Agent Gen ${i}`, ws, prevId, `Task generation ${i}`
    );
    chainIds.push(curId);
    prevId = curId;
  }

  const leafId = prevId;

  // 1. Query with maxDepth = 5 -> must detect truncation
  const prov5 = await strategyAdapter.executePrimitive('provenance', {
    targetId: leafId,
    maxDepth: 5
  });
  assert.strictEqual(prov5.success, true, 'Provenance query should succeed');
  assert.strictEqual(prov5.lineage.length, 5, 'Lineage must be capped at maxDepth 5');
  assert.strictEqual(prov5.truncated, true, 'Truncated flag must be true when more ancestors exist');
  assert.ok(prov5.lineage[0].parent_agent_id, 'parent_agent_id must be populated');
  console.log('  ✅ PASS: Truncation correctly detected at depth 5 (truncated: true).');

  // 2. Query with maxDepth = 20 -> must reach root across workspaces
  const provFull = await strategyAdapter.executePrimitive('provenance', {
    targetId: leafId,
    maxDepth: 20
  });
  assert.strictEqual(provFull.success, true, 'Full provenance query should succeed');
  assert.strictEqual(provFull.lineage.length, 15, 'Lineage must trace all 15 generations');
  assert.strictEqual(provFull.truncated, false, 'Truncated flag must be false when root reached');
  assert.strictEqual(provFull.rootId, rootId, 'Root ID must match root agent');

  // Verify workspace transition occurred in lineage
  const leafNode = provFull.lineage[0];
  const rootNode = provFull.lineage[provFull.lineage.length - 1];
  assert.strictEqual(leafNode.workspace_id, wsLeaf);
  assert.strictEqual(rootNode.workspace_id, wsRoot);
  console.log('  ✅ PASS: Cross-workspace provenance traced all 15 generations to root.');

  // 3. Cycle detection
  const cycleA = `agent_cycle_a_${Date.now()}`;
  const cycleB = `agent_cycle_b_${Date.now()}`;
  await db.run("INSERT INTO agents (id, name, role, status, agent_type, workspace_id) VALUES (?, 'Cycle A', 'worker', 'idle', 'GenOS', ?)", cycleA, wsRoot);
  await db.run("INSERT INTO agents (id, name, role, status, agent_type, workspace_id, parent_agent_id) VALUES (?, 'Cycle B', 'worker', 'idle', 'GenOS', ?, ?)", cycleB, wsRoot, cycleA);
  await db.run("UPDATE agents SET parent_agent_id = ? WHERE id = ?", cycleB, cycleA);

  const cycleRes = await strategyAdapter.executePrimitive('provenance', { targetId: cycleA });
  assert.strictEqual(cycleRes.success, false, 'Cycle must fail provenance');
  assert.ok(cycleRes.error.includes('cycle detected'), 'Cycle error message expected');
  console.log('  ✅ PASS: Causal cycle detected and safely rejected.');

  console.log('ALL TEMPORAL PROVENANCE TESTS PASSED');
}

testTemporalProvenance().catch((err) => {
  console.error('❌ Test failed:', err.stack || err);
  process.exit(1);
});
