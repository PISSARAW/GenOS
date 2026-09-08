/**
 * GenOS Lineage DAG & Genome Controller
 */

const { getDatabase } = require('../db');
const telemetry = require('../services/telemetryObserver');
const agentEvolution = require('../services/agentEvolutionService');

function workspaceScope(req, alias = 'w') {
  const prefix = alias ? `${alias}.` : '';
  return req.tenant
    ? { clause: `${prefix}organization_id = ? AND ${prefix}project_id = ?`, params: [req.tenant.organizationId, req.tenant.projectId] }
    : { clause: `${prefix}organization_id IS NULL AND ${prefix}project_id IS NULL`, params: [] };
}

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

function comparableAgentState(agent, counts) {
  return {
    identity: {
      id: agent.id,
      name: agent.name,
      nameMeaning: agent.name_meaning,
      role: agent.role,
      agentType: agent.agent_type,
      executionMode: agent.execution_mode,
      modelTier: agent.model_tier,
      language: agent.language,
      lineageRelation: agent.lineage_relation
    },
    conscience: {
      status: agent.status,
      isApoptotic: Boolean(agent.is_apoptotic),
      dissonanceLevel: agent.dissonance_level || 0,
      eurekaCount: agent.eureka_count || 0,
      cognitiveBudget: agent.cognitive_budget || 0,
      cognitiveBaselineBudget: agent.cognitive_baseline_budget || 0
    },
    lineage: {
      parentAgentId: agent.parent_agent_id,
      workspaceId: agent.workspace_id
    },
    activity: counts
  };
}

function diffValues(left, right, prefix = '') {
  const differences = [];
  const keys = new Set([...Object.keys(left || {}), ...Object.keys(right || {})]);
  for (const key of keys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const a = left?.[key];
    const b = right?.[key];
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
      differences.push(...diffValues(a, b, path));
    } else if (JSON.stringify(a) !== JSON.stringify(b)) {
      differences.push({ path, left: a ?? null, right: b ?? null });
    }
  }
  return differences;
}

async function diffAgents(req, res) {
  const leftId = String(req.body?.leftAgentId || req.body?.agentAId || '').trim();
  const rightId = String(req.body?.rightAgentId || req.body?.agentBId || '').trim();
  if (!leftId || !rightId) return res.status(400).json({ error: { code: 'AGENTS_REQUIRED', message: 'leftAgentId and rightAgentId are required.' } });
  const db = await getDatabase();
  const scope = workspaceScope(req);
  const loadAgent = (id) => db.get(`SELECT a.* FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ? AND ${scope.clause}`, id, ...scope.params);
  const [left, right] = await Promise.all([loadAgent(leftId), loadAgent(rightId)]);
  if (!left || !right) return res.status(404).json({ error: { code: 'AGENT_NOT_FOUND', message: 'Both agents must exist in the current tenant.' } });
  const countsFor = async (id) => {
    const [decisions, runs, events, children] = await Promise.all([
      db.get('SELECT COUNT(*) AS count FROM genome_decisions WHERE created_by = ?', id),
      db.get('SELECT COUNT(*) AS count FROM strategy_execution_runs WHERE agent_id = ?', id),
      db.get('SELECT COUNT(*) AS count FROM telemetry_events WHERE agent_id = ?', id),
      db.get('SELECT COUNT(*) AS count FROM agents WHERE parent_agent_id = ?', id)
    ]);
    return { decisions: decisions?.count || 0, executionRuns: runs?.count || 0, telemetryEvents: events?.count || 0, directChildren: children?.count || 0 };
  };
  const [leftState, rightState] = await Promise.all([countsFor(left.id), countsFor(right.id)]);
  const leftComparable = comparableAgentState(left, leftState);
  const rightComparable = comparableAgentState(right, rightState);
  return res.json({
    success: true,
    leftAgentId: left.id,
    rightAgentId: right.id,
    identical: JSON.stringify(leftComparable) === JSON.stringify(rightComparable),
    differences: diffValues(leftComparable, rightComparable),
    left: leftComparable,
    right: rightComparable
  });
}

async function mergeAgents(req, res) {
  const leftId = String(req.body?.leftAgentId || req.body?.agentAId || '').trim();
  const rightId = String(req.body?.rightAgentId || req.body?.agentBId || '').trim();
  if (!leftId || !rightId || leftId === rightId) return res.status(400).json({ error: { code: 'MERGE_AGENTS_REQUIRED', message: 'Two distinct agent IDs are required.' } });
  const db = await getDatabase();
  const scope = workspaceScope(req);
  const loadAgent = (id) => db.get(`SELECT a.* FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ? AND ${scope.clause}`, id, ...scope.params);
  const [left, right] = await Promise.all([loadAgent(leftId), loadAgent(rightId)]);
  if (!left || !right) return res.status(404).json({ error: { code: 'AGENT_NOT_FOUND', message: 'Both agents must exist in the current tenant.' } });
  if (left.workspace_id !== right.workspace_id) return res.status(409).json({ error: { code: 'AGENT_WORKSPACE_MISMATCH', message: 'Agents must belong to the same workspace.' } });

  const mergedId = `agent_merge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const mergedName = req.body?.name || `Merge of ${left.name} + ${right.name}`;
  const mergedRole = req.body?.role || `${left.role}+${right.role}`;
  const mergedBudget = Math.min(Number(left.cognitive_budget ?? 0), Number(right.cognitive_budget ?? 0));
  const mergedBaseline = Math.min(Number(left.cognitive_baseline_budget ?? 100), Number(right.cognitive_baseline_budget ?? 100));
  await db.run(
    `INSERT INTO agents (
      id, name, name_meaning, role, status, agent_type, execution_mode, workspace_id, fleet_id,
      model_tier, language, isolation_mode, parent_agent_id, lineage_relation, about, current_task,
      dissonance_level, eureka_count, cognitive_budget, cognitive_baseline_budget, cognitive_max_dissonance, is_apoptotic
    ) VALUES (?, ?, ?, ?, 'idle', 'GenOS', 'worker', ?, ?, ?, ?, 'Branch', ?, 'merge', ?, ?, ?, ?, ?, ?, ?, 0)`,
    mergedId,
    mergedName,
    `Hybrid identity of ${left.name} and ${right.name}`,
    mergedRole,
    left.workspace_id,
    left.fleet_id || right.fleet_id || null,
    left.model_tier || right.model_tier || 'standard',
    left.language || right.language || 'TypeScript',
    left.id,
    `Merged from ${left.id} and ${right.id}`,
    req.body?.currentTask || 'Merged agent awaiting mission',
    Math.max(Number(left.dissonance_level || 0), Number(right.dissonance_level || 0)),
    Math.max(Number(left.eureka_count || 0), Number(right.eureka_count || 0)),
    mergedBudget,
    mergedBaseline,
    Math.min(Number(left.cognitive_max_dissonance ?? 50), Number(right.cognitive_max_dissonance ?? 50))
  );
  for (const parent of [left, right]) {
    await db.run(
      `INSERT INTO lineage_nodes (id, workspace_id, agent_id, label, node_type, state_summary)
       VALUES (?, ?, ?, ?, 'agent', 'Merge parent') ON CONFLICT(id) DO NOTHING`,
      parent.id, parent.workspace_id, parent.id, parent.name
    );
  }
  await db.run(
    `INSERT INTO lineage_nodes (id, workspace_id, agent_id, label, node_type, state_summary, metadata)
     VALUES (?, ?, ?, ?, 'merge', 'Merged agent', ?)`,
    mergedId, left.workspace_id, mergedId, mergedName, JSON.stringify({ parentAgentIds: [left.id, right.id], mergePolicy: 'conservative_budget' })
  );
  for (const parent of [left, right]) {
    await db.run(
      `INSERT INTO lineage_edges (id, workspace_id, source_node_id, target_node_id, edge_type, metadata)
       VALUES (?, ?, ?, ?, 'merge', ?) ON CONFLICT(id) DO NOTHING`,
      `edge_${parent.id}_${mergedId}`, left.workspace_id, parent.id, mergedId, JSON.stringify({ mergePolicy: 'conservative_budget' })
    );
  }
  telemetry.emitEvent({ eventType: 'AGENTS_MERGED', agentId: mergedId, action: 'MERGE', detail: `Merged agents ${left.id} and ${right.id}`, severity: 'info', payload: { parentAgentIds: [left.id, right.id], mergedId } });
  return res.status(201).json({ success: true, mergedAgentId: mergedId, parentAgentIds: [left.id, right.id], cognitiveBudget: mergedBudget, status: 'idle' });
}

async function cloneNode(req, res) {
  const { nodeId, id } = req.body || {};
  const parentId = nodeId || id;
  const clonedId = `node-clone-${Date.now()}`;

  const db = await getDatabase();
  const scope = workspaceScope(req);
  const parentAgent = await db.get(`SELECT a.* FROM agents a JOIN workspaces w ON w.id = a.workspace_id LEFT JOIN lineage_nodes source_node ON source_node.agent_id = a.id WHERE (a.id = ? OR source_node.id = ?) AND ${scope.clause}`, parentId, parentId, ...scope.params);
  if (parentAgent) {
    const agentId = `agent_clone_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const orchestratorId = parentAgent.execution_mode === 'orchestrator'
      ? parentAgent.id
      : parentAgent.parent_agent_id;
    if (!orchestratorId) {
      return res.status(409).json({ error: { code: 'WORKER_REQUIRES_ORCHESTRATOR', message: `Cannot clone worker '${parentAgent.name}' without an orchestrator.` } });
    }
    await db.run(
      `INSERT INTO agents (
        id, name, name_meaning, role, status, agent_type, execution_mode, workspace_id, fleet_id,
        hallucination_monitoring, hallucination_count, dissonance_level, eureka_count,
        cognitive_budget, cognitive_baseline_budget, cognitive_max_dissonance, conscience_revision,
        is_apoptotic, model_tier, language, isolation_mode, parent_agent_id, lineage_relation,
        about, current_task
      ) VALUES (?, ?, ?, ?, 'idle', ?, 'worker', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Branch', ?, 'clone', ?, ?)`,
      agentId, `Clone of ${parentAgent.name}`, parentAgent.name_meaning || `Clone identity of ${parentAgent.name}`, parentAgent.role,
      parentAgent.agent_type, parentAgent.workspace_id, parentAgent.fleet_id,
      parentAgent.hallucination_monitoring || 0, parentAgent.hallucination_count || 0,
      parentAgent.dissonance_level || 0, parentAgent.eureka_count || 0,
      parentAgent.cognitive_budget ?? 100, parentAgent.cognitive_baseline_budget ?? 100,
      parentAgent.cognitive_max_dissonance ?? 50, parentAgent.conscience_revision || 0,
      parentAgent.is_apoptotic || 0, parentAgent.model_tier, parentAgent.language,
      orchestratorId, parentAgent.about, `Clone ready for a mission from ${parentAgent.name}`
    );
    await db.run(
      `INSERT INTO lineage_nodes (id, workspace_id, agent_id, label, node_type, state_summary)
       VALUES (?, ?, ?, ?, 'agent', ?)
       ON CONFLICT(id) DO NOTHING`,
      parentId, parentAgent.workspace_id, parentAgent.id, parentAgent.name, 'Source agent for clone'
    );
    const lineageResult = await agentEvolution.recordWorkerLineage(db, {
      agentId,
      workspaceId: parentAgent.workspace_id,
      name: `Clone of ${parentAgent.name}`,
      role: parentAgent.role
    }, { parentId, edgeType: 'clone', genes: {}, reproduction: { engine: 'lineage_clone' } });
    if (!lineageResult.success) {
      await db.run('DELETE FROM agents WHERE id = ?', agentId);
      return res.status(409).json({ error: { code: 'LINEAGE_PERSISTENCE_FAILED', message: lineageResult.error } });
    }
    telemetry.emitEvent({
      eventType: 'AGENT_CLONED',
      agentId,
      action: 'CLONE',
      detail: `Cloned agent ${parentAgent.name}`,
      severity: 'info',
      payload: { parentAgentId: parentAgent.id }
    });
    return res.status(201).json({ success: true, clonedAgentId: agentId, clonedNodeId: agentId, parentAgentId: parentAgent.id, status: 'idle' });
  }

  const sourceNode = await db.get(`SELECT n.* FROM lineage_nodes n JOIN workspaces w ON w.id = n.workspace_id WHERE n.id = ? AND ${scope.clause}`, parentId, ...scope.params);
  if (!sourceNode?.workspace_id) {
    return res.status(404).json({ error: { code: 'LINEAGE_NODE_NOT_FOUND', message: `Lineage node '${parentId}' is not available in this project.` } });
  }

  const agentId = `agent_${clonedId}`;
  const orchestrator = await db.get(`SELECT id, fleet_id, model_tier, language FROM agents WHERE workspace_id = ? AND execution_mode = 'orchestrator' LIMIT 1`, sourceNode.workspace_id);
  await db.run(
    `INSERT INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id, fleet_id, model_tier, language, isolation_mode, parent_agent_id, lineage_relation, current_task)
     VALUES (?, ?, 'worker', 'idle', 'GenOS', 'worker', ?, ?, ?, ?, 'Branch', ?, 'clone', 'Cloned node worker')`,
    agentId, `Clone of ${sourceNode.label || parentId}`, sourceNode.workspace_id, orchestrator?.fleet_id || null, orchestrator?.model_tier || 'standard', orchestrator?.language || 'TypeScript', orchestrator?.id || null
  );

  await db.run(
    `INSERT INTO lineage_nodes (id, workspace_id, agent_id, label, node_type, score, visits, pos_x, pos_y, state_summary) VALUES (?, ?, ?, ?, 'fork', 0.95, 1, 300, 300, 'Cloned branch agent node')`,
    clonedId, sourceNode.workspace_id, agentId, `Clone of ${sourceNode.label || parentId || 'Root'}`
  );

  await db.run(
    `INSERT INTO lineage_edges (id, workspace_id, source_node_id, target_node_id, edge_type)
     VALUES (?, ?, ?, ?, 'clone')
     ON CONFLICT(id) DO NOTHING`,
    `edge_${parentId}_${clonedId}`, sourceNode.workspace_id, parentId, clonedId
  );

  telemetry.emitEvent({
    eventType: 'NODE_CLONED',
    agentId: 'lineage_controller',
    action: 'CLONE',
    detail: `Cloned lineage node ${parentId} into ${clonedId}`,
    severity: 'info',
    payload: { clonedAgentId: agentId }
  });

  res.status(201).json({ success: true, clonedNodeId: clonedId, clonedAgentId: agentId });
}

async function killNode(req, res) {
  const { nodeId, cascade = false } = req.body || {};
  const db = await getDatabase();
  const scope = workspaceScope(req);
  const result = await db.run(`UPDATE lineage_nodes SET state_summary = 'Apoptosis Terminated' WHERE id = ? AND workspace_id IN (SELECT id FROM workspaces w WHERE ${scope.clause})`, nodeId, ...scope.params);
  if (!result.changes) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Node ${nodeId} not found in this project.` } });

  // Terminate actual agent in agents table
  await db.run(
    `UPDATE agents SET status = 'apoptosis', is_apoptotic = 1, cognitive_budget = 0, current_task = 'Apoptosis Terminated via Lineage Controller', updated_at = CURRENT_TIMESTAMP
     WHERE (id = ? OR id = (SELECT agent_id FROM lineage_nodes WHERE id = ?))
       AND workspace_id IN (SELECT id FROM workspaces w WHERE ${scope.clause})`,
    nodeId, nodeId, ...scope.params
  );

  let cascadeCount = 0;
  if (cascade) {
    const childEdges = await db.all(`SELECT target_node_id FROM lineage_edges WHERE source_node_id = ?`, nodeId);
    for (const edge of childEdges) {
      await db.run(
        `UPDATE lineage_nodes SET state_summary = 'Cascaded Apoptosis Terminated' WHERE id = ? AND workspace_id IN (SELECT id FROM workspaces w WHERE ${scope.clause})`,
        edge.target_node_id, ...scope.params
      );
      await db.run(
        `UPDATE agents SET status = 'apoptosis', is_apoptotic = 1, cognitive_budget = 0, current_task = 'Cascaded Apoptosis Terminated', updated_at = CURRENT_TIMESTAMP
         WHERE (id = ? OR id = (SELECT agent_id FROM lineage_nodes WHERE id = ?))
           AND workspace_id IN (SELECT id FROM workspaces w WHERE ${scope.clause})`,
        edge.target_node_id, edge.target_node_id, ...scope.params
      );
      cascadeCount++;
    }
  }

  telemetry.emitEvent({
    eventType: 'NODE_TERMINATED',
    agentId: 'lineage_controller',
    action: 'KILL',
    detail: `Terminated lineage node: ${nodeId}${cascade ? ` (cascaded to ${cascadeCount} children)` : ''}`,
    severity: 'warning'
  });

  res.json({ success: true, message: `Node ${nodeId} terminated successfully.`, cascaded: cascadeCount });
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
    const alleles = await geneticsService.analyzeAlleles(req.tenant || {});
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
  diffAgents,
  mergeAgents,
  cloneNode,
  killNode,
  getGenomeGraph,
  synthesizeGenome,
  recordDecision,
  getPhylogeny,
  getAlleles,
  performCrossover
};
