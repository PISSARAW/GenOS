/**
 * GenOS Lineage DAG & Genome Controller
 */

const { getDatabase } = require('../db');
const telemetry = require('../services/telemetryObserver');

async function getLineage(req, res) {
  const db = await getDatabase();
  const nodes = await db.all('SELECT * FROM lineage_nodes ORDER BY created_at LIMIT 2000');
  const edges = await db.all('SELECT * FROM lineage_edges ORDER BY created_at LIMIT 4000');

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
  const node = await db.get('SELECT * FROM lineage_nodes WHERE id = ?', nodeId || 'node-root');

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

async function cloneNode(req, res) {
  const { nodeId, id } = req.body || {};
  const parentId = nodeId || id;
  const clonedId = `node-clone-${Date.now()}`;

  const db = await getDatabase();
  const parentAgent = await db.get('SELECT * FROM agents WHERE id = ?', parentId);
  if (parentAgent) {
    const agentId = `agent_clone_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const orchestratorId = parentAgent.execution_mode === 'orchestrator'
      ? parentAgent.id
      : parentAgent.parent_agent_id;
    if (!orchestratorId) {
      return res.status(409).json({ error: { code: 'WORKER_REQUIRES_ORCHESTRATOR', message: `Cannot clone worker '${parentAgent.name}' without an orchestrator.` } });
    }
    await db.run(
      `INSERT INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id, fleet_id, model_tier, language, isolation_mode, parent_agent_id, lineage_relation, about, current_task) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      agentId, `Clone of ${parentAgent.name}`, parentAgent.role, 'idle', parentAgent.agent_type, 'worker', parentAgent.workspace_id, parentAgent.fleet_id, parentAgent.model_tier, parentAgent.language, 'Branch', orchestratorId, 'clone', parentAgent.about, `Clone ready for a mission from ${parentAgent.name}`
    );
    telemetry.emitEvent({
      eventType: 'AGENT_CLONED',
      agentId,
      action: 'CLONE',
      detail: `Cloned agent ${parentAgent.name}`,
      severity: 'info',
      payload: { parentAgentId: parentAgent.id }
    });
    return res.status(201).json({ success: true, clonedAgentId: agentId, parentAgentId: parentAgent.id, status: 'idle' });
  }

  await db.run(
    `INSERT INTO lineage_nodes (id, workspace_id, label, node_type, score, visits, pos_x, pos_y, state_summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    clonedId, 'ws-genos-core', `Clone of ${parentId || 'Root'}`, 'fork', 0.95, 1, 300, 300, 'Cloned branch agent node'
  );

  telemetry.emitEvent({
    eventType: 'NODE_CLONED',
    agentId: 'lineage_controller',
    action: 'CLONE',
    detail: `Cloned lineage node ${parentId} into ${clonedId}`,
    severity: 'info'
  });

  res.status(201).json({ success: true, clonedNodeId: clonedId });
}

async function killNode(req, res) {
  const { nodeId } = req.body || {};
  const db = await getDatabase();
  await db.run("UPDATE lineage_nodes SET state_summary = 'Apoptosis Terminated' WHERE id = ?", nodeId);

  telemetry.emitEvent({
    eventType: 'NODE_TERMINATED',
    agentId: 'lineage_controller',
    action: 'KILL',
    detail: `Terminated lineage node: ${nodeId}`,
    severity: 'warning'
  });

  res.json({ success: true, message: `Node ${nodeId} terminated successfully.` });
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
    `INSERT INTO genome_decisions (id, title, content, cart_nodes_json, created_by, category) VALUES (?, ?, ?, ?, ?, ?)`,
    decId, title, `Synthesized genome from ${cartNodes ? cartNodes.length : 0} nodes.`, JSON.stringify(cartNodes || []), 'genome_factory', 'Synthesis'
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
    `INSERT INTO genome_decisions (id, title, content, created_by, category) VALUES (?, ?, ?, ?, ?)`,
    id, title || 'Architectural Decision', content || '', createdBy, category
  );

  res.status(201).json({ success: true, id });
}

const geneticsService = require('../services/geneticsService');

async function getPhylogeny(req, res, next) {
  try {
    const workspaceId = req.query.workspaceId || 'ws-genos-core';
    const tree = await geneticsService.getPhylogeneticTree(workspaceId);
    res.json(tree);
  } catch (err) {
    next(err);
  }
}

async function getAlleles(req, res, next) {
  try {
    const alleles = await geneticsService.analyzeAlleles();
    res.json(alleles);
  } catch (err) {
    next(err);
  }
}

async function performCrossover(req, res, next) {
  try {
    const { parentA, parentB, options } = req.body || {};
    if (!parentA?.genes || !parentB?.genes) {
      return res.status(400).json({ error: { code: 'PARENT_GENOMES_REQUIRED', message: 'Two explicit parent genomes are required.' } });
    }
    const result = geneticsService.crossoverGenome(parentA, parentB, options);
    
    telemetry.emitEvent({
      eventType: 'GENOME_CROSSOVER_SYNTHESIZED',
      agentId: 'genome_factory',
      action: 'CROSSOVER',
      detail: `Synthesized child agent DNA '${result.childId}' with fitness score ${result.predictedFitnessScore}`,
      severity: 'info',
      payload: result
    });

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getLineage,
  inspectNode,
  cloneNode,
  killNode,
  getGenomeGraph,
  synthesizeGenome,
  recordDecision,
  getPhylogeny,
  getAlleles,
  performCrossover
};
