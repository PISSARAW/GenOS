/**
 * Lineage node/agent clone endpoint and persistence helpers.
 */

const { getDatabase, withTransaction } = require('../../db');
const telemetry = require('../../services/telemetryObserver');
const agentEvolution = require('../../services/agentEvolutionService');
const { workspaceScope, orDefault, nullish } = require('./helpers');

function newCloneAgentId() {
  return `agent_clone_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function cloneOrchestratorId(parentAgent) {
  return parentAgent.execution_mode === 'orchestrator'
    ? parentAgent.id
    : parentAgent.parent_agent_id;
}

function cloneLabel(sourceNode, parentId) {
  return sourceNode.label || parentId;
}

function orchestratorDefaults(orchestrator) {
  return {
    fleetId: orchestrator?.fleet_id || null,
    modelTier: orchestrator?.model_tier || 'standard',
    language: orchestrator?.language || 'TypeScript',
    id: orchestrator?.id || null
  };
}

async function insertClonedAgent(db, agentId, context) {
  const { parentAgent, orchestratorId } = context;
  await db.run(
    `INSERT INTO agents (
      id, name, name_meaning, role, status, agent_type, execution_mode, workspace_id, fleet_id,
      hallucination_monitoring, hallucination_count, dissonance_level, eureka_count,
      cognitive_budget, cognitive_baseline_budget, cognitive_max_dissonance, conscience_revision,
      is_apoptotic, model_tier, language, isolation_mode, parent_agent_id, lineage_relation,
      about, current_task
    ) VALUES (?, ?, ?, ?, 'idle', ?, 'worker', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Branch', ?, 'clone', ?, ?)`,
    agentId, `Clone of ${parentAgent.name}`, orDefault(parentAgent.name_meaning, `Clone identity of ${parentAgent.name}`), parentAgent.role,
    parentAgent.agent_type, parentAgent.workspace_id, parentAgent.fleet_id,
    orDefault(parentAgent.hallucination_monitoring, 0), orDefault(parentAgent.hallucination_count, 0),
    orDefault(parentAgent.dissonance_level, 0), orDefault(parentAgent.eureka_count, 0),
    nullish(parentAgent.cognitive_budget, 100), nullish(parentAgent.cognitive_baseline_budget, 100),
    nullish(parentAgent.cognitive_max_dissonance, 50), orDefault(parentAgent.conscience_revision, 0),
    orDefault(parentAgent.is_apoptotic, 0), parentAgent.model_tier, parentAgent.language,
    orchestratorId, parentAgent.about, `Clone ready for a mission from ${parentAgent.name}`
  );
}

async function cloneFromAgent(db, context) {
  const { parentAgent, parentId } = context;
  const agentId = newCloneAgentId();
  const orchestratorId = cloneOrchestratorId(parentAgent);
  if (!orchestratorId) {
    return { status: 409, body: { error: { code: 'WORKER_REQUIRES_ORCHESTRATOR', message: `Cannot clone worker '${parentAgent.name}' without an orchestrator.` } } };
  }
  // Agent + lineage node + lineage edges are written atomically. If lineage
  // persistence fails we throw inside the transaction so nothing (including the
  // agent) is left behind, instead of a non-atomic compensating DELETE.
  const failure = await withTransaction(db, async () => {
    await insertClonedAgent(db, agentId, { parentAgent, orchestratorId });
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
      throw Object.assign(new Error(lineageResult.error), { code: 'LINEAGE_PERSISTENCE_FAILED' });
    }
    return null;
  }).catch((error) => error);
  if (failure) {
    return { status: 409, body: { error: { code: 'LINEAGE_PERSISTENCE_FAILED', message: failure.message } } };
  }
  telemetry.emitEvent({
    eventType: 'AGENT_CLONED',
    agentId,
    action: 'CLONE',
    detail: `Cloned agent ${parentAgent.name}`,
    severity: 'info',
    payload: { parentAgentId: parentAgent.id }
  });
  return { status: 201, body: { success: true, clonedAgentId: agentId, clonedNodeId: agentId, parentAgentId: parentAgent.id, status: 'idle' } };
}

async function cloneFromNode(db, context) {
  const { parentId, clonedId, sourceNode } = context;
  const agentId = `agent_${clonedId}`;
  const label = cloneLabel(sourceNode, parentId);
  const orchestrator = await db.get(`SELECT id, fleet_id, model_tier, language FROM agents WHERE workspace_id = ? AND execution_mode = 'orchestrator' LIMIT 1`, sourceNode.workspace_id);
  const defaults = orchestratorDefaults(orchestrator);
  await withTransaction(db, async () => {
    await db.run(
      `INSERT INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id, fleet_id, model_tier, language, isolation_mode, parent_agent_id, lineage_relation, current_task)
       VALUES (?, ?, 'worker', 'idle', 'GenOS', 'worker', ?, ?, ?, ?, 'Branch', ?, 'clone', 'Cloned node worker')`,
      agentId, `Clone of ${label}`, sourceNode.workspace_id, defaults.fleetId, defaults.modelTier, defaults.language, defaults.id
    );

    await db.run(
      `INSERT INTO lineage_nodes (id, workspace_id, agent_id, label, node_type, score, visits, pos_x, pos_y, state_summary) VALUES (?, ?, ?, ?, 'fork', 0.95, 1, 300, 300, 'Cloned branch agent node')`,
      clonedId, sourceNode.workspace_id, agentId, `Clone of ${label || 'Root'}`
    );

    await db.run(
      `INSERT INTO lineage_edges (id, workspace_id, source_node_id, target_node_id, edge_type)
       VALUES (?, ?, ?, ?, 'clone')
       ON CONFLICT(id) DO NOTHING`,
      `edge_${parentId}_${clonedId}`, sourceNode.workspace_id, parentId, clonedId
    );
  });

  telemetry.emitEvent({
    eventType: 'NODE_CLONED',
    agentId: 'lineage_controller',
    action: 'CLONE',
    detail: `Cloned lineage node ${parentId} into ${clonedId}`,
    severity: 'info',
    payload: { clonedAgentId: agentId }
  });

  return { status: 201, body: { success: true, clonedNodeId: clonedId, clonedAgentId: agentId } };
}

async function cloneNode(req, res) {
  const { nodeId, id } = req.body || {};
  const parentId = nodeId || id;
  const clonedId = `node-clone-${Date.now()}`;

  const db = await getDatabase();
  const scope = workspaceScope(req);
  const parentAgent = await db.get(`SELECT a.* FROM agents a JOIN workspaces w ON w.id = a.workspace_id LEFT JOIN lineage_nodes source_node ON source_node.agent_id = a.id WHERE (a.id = ? OR source_node.id = ?) AND ${scope.clause}`, parentId, parentId, ...scope.params);
  if (parentAgent) {
    const response = await cloneFromAgent(db, { parentAgent, parentId });
    return res.status(response.status).json(response.body);
  }

  const sourceNode = await db.get(`SELECT n.* FROM lineage_nodes n JOIN workspaces w ON w.id = n.workspace_id WHERE n.id = ? AND ${scope.clause}`, parentId, ...scope.params);
  if (!sourceNode?.workspace_id) {
    return res.status(404).json({ error: { code: 'LINEAGE_NODE_NOT_FOUND', message: `Lineage node '${parentId}' is not available in this project.` } });
  }

  const response = await cloneFromNode(db, { parentId, clonedId, sourceNode });
  return res.status(response.status).json(response.body);
}

module.exports = {
  cloneNode
};
