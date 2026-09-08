const assert = require('node:assert/strict');
const { getDatabase } = require('../src/db');
const lineageService = require('../src/grpc_services/lineageService');

async function testGrpcLineage() {
  console.log('--- Testing gRPC Lineage Service ---');
  const db = await getDatabase();
  const orgId = `org_grpc_${Date.now()}`;
  const projId = `proj_grpc_${Date.now()}`;
  const wsId = `ws_grpc_${Date.now()}`;

  await db.run("INSERT OR IGNORE INTO organizations (id, name) VALUES (?, ?)", orgId, `Org ${Date.now()}`);
  await db.run("INSERT OR IGNORE INTO projects (id, organization_id, name) VALUES (?, ?, ?)", projId, orgId, `Proj ${Date.now()}`);
  await db.run("INSERT OR IGNORE INTO workspaces (id, name, path, organization_id, project_id) VALUES (?, ?, ?, ?, ?)",
    wsId, `gRPC WS ${Date.now()}`, __dirname, orgId, projId
  );

  // 1. Ping
  await new Promise((resolve) => {
    lineageService.Ping({}, (err, res) => {
      assert.ifError(err);
      assert.ok(res.status.includes('alive'));
      resolve();
    });
  });
  console.log('  ✅ PASS: gRPC LineageService.Ping');

  // 2. RecordLineage with parent in agents table only
  const parentId = `agent_parent_grpc_${Date.now()}`;
  const childId = `agent_child_grpc_${Date.now()}`;

  await db.run("INSERT INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id) VALUES (?, 'gRPC Parent', 'orchestrator', 'idle', 'GenOS', 'orchestrator', ?)", parentId, wsId);
  await db.run("INSERT INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id) VALUES (?, 'gRPC Child', 'worker', 'idle', 'GenOS', 'worker', ?)", childId, wsId);

  await new Promise((resolve) => {
    lineageService.RecordLineage({
      request: {
        agent_id: childId,
        parent_id: parentId,
        role: 'worker',
        score: 95.5,
        organization_id: orgId,
        project_id: projId,
        workspace_id: wsId
      }
    }, (err, res) => {
      assert.ifError(err);
      assert.strictEqual(res.success, true, 'RecordLineage must succeed even when parent was in agents table');
      resolve();
    });
  });

  const childNode = await db.get('SELECT * FROM lineage_nodes WHERE id = ?', childId);
  assert.ok(childNode, 'Child node must be created in lineage_nodes');
  const edge = await db.get('SELECT * FROM lineage_edges WHERE target_node_id = ?', childId);
  assert.ok(edge, 'Lineage edge must connect parent to child');
  assert.strictEqual(edge.source_node_id, parentId);
  console.log('  ✅ PASS: gRPC LineageService.RecordLineage auto-provisions and persists DAG');

  // 3. GetPhylogeny
  await new Promise((resolve) => {
    lineageService.GetPhylogeny({
      request: {
        organization_id: orgId,
        project_id: projId,
        workspace_id: wsId
      }
    }, (err, res) => {
      assert.ifError(err);
      assert.ok(res.node_count >= 2, 'Phylogeny must return at least parent and child nodes');
      const nodes = JSON.parse(res.nodes_json);
      const edges = JSON.parse(res.edges_json);
      assert.ok(nodes.some((n) => n.id === childId));
      assert.ok(nodes.some((n) => n.id === parentId));
      assert.ok(edges.some((e) => e.target_node_id === childId && e.source_node_id === parentId));
      resolve();
    });
  });
  console.log('  ✅ PASS: gRPC LineageService.GetPhylogeny returns scoped DAG');

  console.log('ALL GRPC LINEAGE TESTS PASSED');
}

testGrpcLineage().catch((err) => {
  console.error('❌ Test failed:', err.stack || err);
  process.exit(1);
});
