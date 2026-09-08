const assert = require('node:assert/strict');
const { getDatabase } = require('../src/db');
const agentEvolution = require('../src/services/agentEvolutionService');
const geneticsService = require('../src/services/geneticsService');
const dossierService = require('../src/services/agentDossierService');

async function testBiparentalLineage() {
  console.log('--- Testing Biparental Crossover Lineage DAG ---');
  const db = await getDatabase();
  const workspaceId = `ws_biparental_${Date.now()}`;
  await db.run(
    "INSERT OR IGNORE INTO workspaces (id, name, path) VALUES (?, ?, ?)",
    workspaceId, `Biparental WS ${Date.now()}`, __dirname
  );

  const parentAId = `agent_parent_a_${Date.now()}`;
  const parentBId = `agent_parent_b_${Date.now()}`;
  const childId = `agent_child_c_${Date.now()}`;

  // Insert parents in agents table
  await db.run(
    "INSERT INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id) VALUES (?, 'Parent Alpha', 'architect', 'idle', 'GenOS', 'worker', ?)",
    parentAId, workspaceId
  );
  await db.run(
    "INSERT INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id) VALUES (?, 'Parent Beta', 'security', 'idle', 'GenOS', 'worker', ?)",
    parentBId, workspaceId
  );

  // Insert child in agents table
  await db.run(
    "INSERT INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id, parent_agent_id, lineage_relation) VALUES (?, 'Child Gamma', 'hybrid', 'idle', 'GenOS', 'worker', ?, ?, 'crossover')",
    childId, workspaceId, parentAId
  );

  // Record worker lineage with both parents
  const res = await agentEvolution.recordWorkerLineage(db, {
    agentId: childId,
    name: 'Child Gamma',
    role: 'hybrid',
    workspaceId
  }, {
    parentIds: [parentAId, parentBId],
    parents: { parentA: parentAId, parentB: parentBId },
    edgeType: 'crossover_lineage'
  });

  assert.strictEqual(res.success, true, `recordWorkerLineage failed: ${res.error}`);

  // Check phylogenetic tree
  const tree = await geneticsService.getPhylogeneticTree(workspaceId);
  const childNode = tree.nodes.find((n) => n.id === childId);
  assert.ok(childNode, 'Child node must be in phylogenetic tree');
  assert.strictEqual(childNode.isBiparental, true, 'Child node must be recognized as biparental');
  assert.deepStrictEqual(childNode.parentIds.sort(), [parentAId, parentBId].sort(), 'Child node must have both parents in parentIds');
  assert.ok(childNode.parentId === parentAId || childNode.parentId === parentBId, 'Primary parentId must be set');

  const childEdges = tree.edges.filter((e) => e.target === childId);
  assert.strictEqual(childEdges.length, 2, 'There must be exactly 2 incoming edges to child in tree.edges');
  console.log('  ✅ PASS: Phylogenetic tree exposes biparental DAG without dropping parents.');

  // Check agent dossier
  const dossier = await dossierService.loadAgentDossier(childId);
  assert.ok(dossier?.genome?.lineage, 'Dossier must contain lineage');
  assert.strictEqual(dossier.genome.lineage.biparental, true, 'Dossier lineage must be biparental');
  assert.deepStrictEqual(dossier.genome.lineage.parentAgentIds.sort(), [parentAId, parentBId].sort(), 'Dossier must list all parent agent IDs');
  console.log('  ✅ PASS: Agent dossier exposes biparental heritage.');

  console.log('ALL BIPARENTAL LINEAGE TESTS PASSED');
}

testBiparentalLineage().catch((err) => {
  console.error('❌ Test failed:', err.stack || err);
  process.exit(1);
});
