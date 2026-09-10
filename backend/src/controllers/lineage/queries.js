/**
 * Lineage queries, genome graph and decision endpoints.
 */

const { getDatabase } = require('../../db');
const telemetry = require('../../services/telemetryObserver');
const { workspaceScope } = require('./helpers');

async function getLineage(req, res) {
  const db = await getDatabase();
  const scope = workspaceScope(req);
  const nodes = await db.all(`SELECT n.* FROM lineage_nodes n JOIN workspaces w ON w.id = n.workspace_id WHERE ${scope.clause} ORDER BY n.created_at LIMIT 2000`, ...scope.params);
  const edges = await db.all(`SELECT e.* FROM lineage_edges e JOIN workspaces w ON w.id = e.workspace_id WHERE ${scope.clause} ORDER BY e.created_at LIMIT 4000`, ...scope.params);

  const formattedNodes = nodes.map(n => ({
    id: n.id,
    label: n.label,
    type: n.node_type,
    score: n.score,
    visits: n.visits,
    pos: { x: n.pos_x, y: n.pos_y },
    summary: n.state_summary
  }));

  const formattedEdges = edges.map(e => ({
    id: e.id,
    source: e.source_node_id,
    target: e.target_node_id,
    type: e.edge_type,
    animated: !!e.is_animated
  }));

  res.json({ nodes: formattedNodes, edges: formattedEdges });
}

async function inspectNode(req, res) {
  const { nodeId } = req.body || {};
  const db = await getDatabase();
  const scope = workspaceScope(req);
  const node = await db.get(`SELECT n.* FROM lineage_nodes n JOIN workspaces w ON w.id = n.workspace_id WHERE n.id = ? AND ${scope.clause}`, nodeId || 'node-root', ...scope.params);

  if (!node) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Node ${nodeId} not found` } });
  }

  res.json({
    nodeId: node.id,
    label: node.label,
    type: node.node_type,
    score: node.score,
    visits: node.visits,
    summary: node.state_summary,
    metadata: {
      isolationMode: 'Branch',
      modelTier: 'Pro',
      astIntegrity: '100% Valid'
    }
  });
}

async function getGenomeGraph(req, res) {
  const db = await getDatabase();
  const tools = await db.all('SELECT name, category FROM mcp_tools LIMIT 8');

  const nodes = [
    { id: 'core', label: 'GenOS Core Engine', type: 'core', mm: { x: 400, y: 120 }, const: { x: 400, y: 300 } }
  ];
  const edges = [];

  tools.forEach((t, i) => {
    const spacing = 120;
    const startX = 400 - ((tools.length - 1) * spacing) / 2;
    const mmX = startX + i * spacing;
    const mmY = 350;

    const angle = (i / tools.length) * Math.PI * 2;
    const r = 200 + (i % 2 === 0 ? 40 : 0);
    const constX = 400 + Math.cos(angle) * r;
    const constY = 300 + Math.sin(angle) * r;

    nodes.push({
      id: `tool_${i}`,
      label: t.name,
      type: 'skill',
      mm: { x: mmX, y: mmY },
      const: { x: constX, y: constY }
    });

    edges.push({ from: 'core', to: `tool_${i}`, onlyConst: false });
    if (i > 0) {
      edges.push({ from: `tool_${i - 1}`, to: `tool_${i}`, onlyConst: true });
    }
  });

  res.json({ nodes, edges });
}

async function synthesizeGenome(req, res) {
  const { cartNodes, title = 'Genome Synthesis' } = req.body || {};
  const db = await getDatabase();
  const decId = `dec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await db.run(
    `INSERT INTO genome_decisions (id, title, content, cart_nodes_json, created_by, category, organization_id, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    decId, title, `Synthesized genome from ${cartNodes ? cartNodes.length : 0} nodes.`, JSON.stringify(cartNodes || []), 'genome_factory', 'Synthesis', req.tenant?.organizationId || null, req.tenant?.projectId || null
  );

  telemetry.emitEvent({
    eventType: 'GENOME_SYNTHESIZED',
    agentId: 'genome_factory',
    action: 'SYNTHESIZE',
    detail: `Synthesized genome with ${cartNodes ? cartNodes.length : 0} nodes`,
    severity: 'info'
  });

  res.status(201).json({ status: 'synthesized', decisionId: decId });
}

async function recordDecision(req, res) {
  const { title, content, category = 'Architecture', createdBy = 'operator' } = req.body || {};
  const db = await getDatabase();
  const id = `dec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await db.run(
    `INSERT INTO genome_decisions (id, title, content, created_by, category, organization_id, project_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id, title || 'Architectural Decision', content || '', createdBy, category, req.tenant?.organizationId || null, req.tenant?.projectId || null
  );

  res.status(201).json({ success: true, id });
}

module.exports = {
  getLineage,
  inspectNode,
  getGenomeGraph,
  synthesizeGenome,
  recordDecision
};
