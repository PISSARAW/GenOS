const { getDatabase } = require('../db');
const telemetry = require('./telemetryObserver');

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback || value;
  }
}

function merkleKey(record) {
  return record.payload_hash || record.id;
}

function buildMerkleEntry(record) {
  return {
    id: record.id,
    subject_type: record.subject_type,
    subject_id: record.subject_id,
    payload_hash: record.payload_hash,
    parent_hash: record.parent_hash,
    algorithm: record.algorithm || 'sha256',
    payload: parseJson(record.payload_json, {}),
    created_at: record.created_at,
    organization_id: record.organization_id,
    project_id: record.project_id
  };
}

function fetchMerkleParent(db, parentHash, scope) {
  if (scope.organizationId && scope.projectId) {
    return db.get('SELECT * FROM provenance_records WHERE payload_hash = ? AND organization_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT 1', parentHash, scope.organizationId, scope.projectId);
  }
  return db.get('SELECT * FROM provenance_records WHERE payload_hash = ? ORDER BY created_at DESC LIMIT 1', parentHash);
}

function buildMerkleResult(lineage, truncated) {
  const rootRecord = lineage[lineage.length - 1];
  return {
    success: true,
    provenanceType: 'merkle_chain',
    lineage,
    records: lineage,
    rootId: rootRecord?.id,
    rootHash: rootRecord?.payload_hash,
    truncated
  };
}

async function traceMerkleProvenance(options) {
  const { db, initialRecord, maxDepth, scope = {} } = options;
  const lineage = [];
  const visited = new Set();
  let current = initialRecord;
  let truncated = false;

  for (let i = 0; i < maxDepth; i++) {
    const key = merkleKey(current);
    if (visited.has(key)) {
      return {
        success: false,
        error: `Causal provenance cycle detected at hash '${key}'.`,
        lineage,
        cycleAt: key
      };
    }
    visited.add(key);

    lineage.push(buildMerkleEntry(current));

    if (!current.parent_hash) break;

    const parentRecord = await fetchMerkleParent(db, current.parent_hash, scope);
    if (!parentRecord) break;

    if (i === maxDepth - 1 && parentRecord && !visited.has(parentRecord.payload_hash)) {
      truncated = true;
    }

    current = parentRecord;
  }

  return buildMerkleResult(lineage, truncated);
}

function edgeQuery(scope) {
  const scoped = scope.organizationId && scope.projectId;
  const filter = scoped ? ' AND w.organization_id = ? AND w.project_id = ?' : '';
  return `SELECT e.source_node_id, e.edge_type FROM lineage_edges e JOIN lineage_nodes n ON n.id = e.target_node_id JOIN workspaces w ON w.id = n.workspace_id WHERE e.target_node_id = ?${filter}`;
}

function edgeArgs(currentId, scope) {
  const scoped = scope.organizationId && scope.projectId;
  return scoped ? [currentId, scope.organizationId, scope.projectId] : [currentId];
}

function fetchLineageEdge(db, currentId, scope) {
  return db.get(edgeQuery(scope), ...edgeArgs(currentId, scope));
}

function fetchAgentEdges(db, currentId, scope) {
  return db.all(edgeQuery(scope), ...edgeArgs(currentId, scope)).catch(() => []);
}

function fetchAgent(db, currentId, scope) {
  if (scope.organizationId && scope.projectId) {
    return db.get('SELECT a.id, a.name, a.parent_agent_id, a.workspace_id, a.lineage_relation, a.current_task FROM agents a JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ? AND w.organization_id = ? AND w.project_id = ?', currentId, scope.organizationId, scope.projectId);
  }
  return db.get('SELECT a.id, a.name, a.parent_agent_id, a.workspace_id, a.lineage_relation, a.current_task FROM agents a WHERE a.id = ?', currentId);
}

function fetchLineageNode(db, currentId, scope) {
  if (scope.organizationId && scope.projectId) {
    return db.get('SELECT n.id, n.label, n.workspace_id, n.node_type, n.state_summary FROM lineage_nodes n JOIN workspaces w ON w.id = n.workspace_id WHERE n.id = ? AND w.organization_id = ? AND w.project_id = ?', currentId, scope.organizationId, scope.projectId);
  }
  return db.get('SELECT id, label, workspace_id, node_type, state_summary FROM lineage_nodes WHERE id = ?', currentId);
}

function buildNodeEntry(lNode, edge) {
  return {
    id: lNode.id,
    name: lNode.label,
    parent_agent_id: edge?.source_node_id || null,
    parent_agent_ids: edge?.source_node_id ? [edge.source_node_id] : [],
    workspace_id: lNode.workspace_id,
    relation: edge?.edge_type || 'dag_node',
    task: lNode.state_summary
  };
}

function buildAgentEntry(agent, parentIds) {
  return {
    id: agent.id,
    name: agent.name,
    parent_agent_id: agent.parent_agent_id || parentIds[0] || null,
    parent_agent_ids: parentIds,
    workspace_id: agent.workspace_id,
    relation: agent.lineage_relation,
    task: agent.current_task
  };
}

function resolveParentIds(edgeRows, agent) {
  if (edgeRows.length > 0) return edgeRows.map((e) => e.source_node_id);
  if (agent.parent_agent_id) return [agent.parent_agent_id];
  return [];
}

function buildAgentResult(lineage, truncated) {
  const rootNode = lineage[lineage.length - 1];
  return {
    success: true,
    provenanceType: 'agent_hierarchy',
    lineage,
    rootId: rootNode?.id,
    truncated
  };
}

async function traceNodeBranch(state, currentId, i) {
  const lNode = await fetchLineageNode(state.db, currentId, state.scope);
  if (!lNode) return { stop: true };

  const edge = await fetchLineageEdge(state.db, currentId, state.scope);
  state.lineage.push(buildNodeEntry(lNode, edge));

  const parentId = edge ? edge.source_node_id : null;
  if (!parentId || parentId === currentId) return { stop: true };
  if (i === state.maxDepth - 1 && parentId && !state.visited.has(parentId)) state.truncated = true;
  return { stop: false, nextId: parentId };
}

async function traceAgentBranch(state, agent, i) {
  const edgeRows = await fetchAgentEdges(state.db, agent.id, state.scope);
  const parentIds = resolveParentIds(edgeRows, agent);
  state.lineage.push(buildAgentEntry(agent, parentIds));

  const nextParentId = agent.parent_agent_id || parentIds[0];
  if (!nextParentId || nextParentId === agent.id) return { stop: true };
  if (i === state.maxDepth - 1 && nextParentId && !state.visited.has(nextParentId)) state.truncated = true;
  return { stop: false, nextId: nextParentId };
}

async function traceAgentStep(state, currentId, i) {
  const agent = await fetchAgent(state.db, currentId, state.scope);
  if (agent) return traceAgentBranch(state, agent, i);
  return traceNodeBranch(state, currentId, i);
}

async function traceAgentProvenance(options) {
  const { db, targetId, maxDepth, scope = {} } = options;
  const state = { db, scope, maxDepth, visited: new Set(), lineage: [], truncated: false };
  let currentId = targetId;

  for (let i = 0; i < maxDepth; i++) {
    if (state.visited.has(currentId)) {
      return {
        success: false,
        error: `Causal provenance cycle detected at '${currentId}'.`,
        lineage: state.lineage,
        cycleAt: currentId
      };
    }
    state.visited.add(currentId);

    const step = await traceAgentStep(state, currentId, i);
    if (step.stop) break;
    currentId = step.nextId;
  }

  return buildAgentResult(state.lineage, state.truncated);
}

function resolveScope(context) {
  return context.organizationId && context.projectId
    ? { organizationId: context.organizationId, projectId: context.projectId }
    : {};
}

function resolveTargetId(context) {
  return context.targetId || context.agentId || context.subjectId || context.payloadHash;
}

function resolveMaxDepth(context) {
  return Math.max(1, Math.min(Number(context.maxDepth || context.max_depth || 10), 100));
}

function isExplicitMerkleTarget(context, targetId) {
  return context.provenanceType === 'merkle'
    || context.type === 'conclusion'
    || targetId.startsWith('prov-')
    || (typeof targetId === 'string' && /^[0-9a-f]{64}$/i.test(targetId));
}

function fetchMerkleRecord(db, targetId, scope) {
  if (scope.organizationId) {
    return db.get('SELECT * FROM provenance_records WHERE (id = ? OR payload_hash = ? OR subject_id = ?) AND organization_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT 1', targetId, targetId, targetId, scope.organizationId, scope.projectId);
  }
  return db.get('SELECT * FROM provenance_records WHERE id = ? OR payload_hash = ? OR subject_id = ? ORDER BY created_at DESC LIMIT 1', targetId, targetId, targetId);
}

function fetchAgentExistence(db, targetId, scope) {
  if (scope.organizationId) {
    return db.get('SELECT a.id FROM agents a JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ? AND w.organization_id = ? AND w.project_id = ?', targetId, scope.organizationId, scope.projectId);
  }
  return db.get('SELECT id FROM agents WHERE id = ?', targetId);
}

function fetchNodeExistence(db, targetId, scope) {
  if (scope.organizationId) {
    return db.get('SELECT n.id FROM lineage_nodes n JOIN workspaces w ON w.id = n.workspace_id WHERE n.id = ? AND w.organization_id = ? AND w.project_id = ?', targetId, scope.organizationId, scope.projectId);
  }
  return db.get('SELECT id FROM lineage_nodes WHERE id = ?', targetId);
}

function fetchDecision(db, targetId, scope) {
  if (scope.organizationId) {
    return db.get('SELECT * FROM genome_decisions WHERE id = ? AND organization_id = ? AND project_id = ?', targetId, scope.organizationId, scope.projectId);
  }
  return db.get('SELECT * FROM genome_decisions WHERE id = ?', targetId);
}

function fetchDecisionProvenance(db, targetId, scope) {
  if (scope.organizationId) {
    return db.get('SELECT * FROM provenance_records WHERE subject_id = ? AND organization_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT 1', targetId, scope.organizationId, scope.projectId);
  }
  return db.get('SELECT * FROM provenance_records WHERE subject_id = ? ORDER BY created_at DESC LIMIT 1', targetId);
}

async function traceMerkleAndEmit(context, targetId, args) {
  const res = await traceMerkleProvenance(args);
  emitTelemetry(context, targetId, res);
  return res;
}

function buildDecisionOrigin(decision) {
  return {
    success: true,
    provenanceType: 'decision_origin',
    lineage: [{
      id: decision.id,
      title: decision.title,
      created_by: decision.created_by,
      category: decision.category,
      created_at: decision.created_at,
      organization_id: decision.organization_id,
      project_id: decision.project_id
    }],
    rootId: decision.id,
    truncated: false
  };
}

function finishUnknown(context, targetId) {
  const notFoundRes = {
    success: true,
    provenanceType: 'unknown',
    lineage: [],
    rootId: null,
    truncated: false
  };
  emitTelemetry(context, targetId, notFoundRes);
  return notFoundRes;
}

async function resolveDecision(options) {
  const { context, targetId, db, decision, maxDepth, scope } = options;
  const decProv = await fetchDecisionProvenance(db, targetId, scope);
  if (decProv) {
    return traceMerkleAndEmit(context, targetId, { db, initialRecord: decProv, maxDepth, scope });
  }
  const res = buildDecisionOrigin(decision);
  emitTelemetry(context, targetId, res);
  return res;
}

async function resolveProvenance(context = {}) {
  const db = await getDatabase();
  const scope = resolveScope(context);
  const targetId = resolveTargetId(context);
  if (!targetId) return { success: false, error: 'targetId required for provenance.' };

  const maxDepth = resolveMaxDepth(context);

  if (isExplicitMerkleTarget(context, targetId)) {
    const provRecord = await fetchMerkleRecord(db, targetId, scope);
    if (provRecord) {
      return traceMerkleAndEmit(context, targetId, { db, initialRecord: provRecord, maxDepth, scope });
    }
  }

  const agentExists = await fetchAgentExistence(db, targetId, scope);
  const lNodeExists = agentExists ? null : await fetchNodeExistence(db, targetId, scope);

  if (agentExists || lNodeExists) {
    const res = await traceAgentProvenance({ db, targetId, maxDepth, scope });
    emitTelemetry(context, targetId, res);
    return res;
  }

  const provRecord = await fetchMerkleRecord(db, targetId, scope);
  if (provRecord) {
    return traceMerkleAndEmit(context, targetId, { db, initialRecord: provRecord, maxDepth, scope });
  }

  const decision = await fetchDecision(db, targetId, scope);
  if (!decision) return finishUnknown(context, targetId);
  return resolveDecision({ context, targetId, db, decision, maxDepth, scope });
}

function emitTelemetry(context, targetId, result) {
  telemetry.emitEvent({
    eventType: 'TEMPORAL_PROVENANCE',
    agentId: context.orchestratorId || context.agentId || 'strategy_adapter',
    action: 'PROVENANCE',
    detail: `Traced ${result.provenanceType || 'causal'} provenance for ${targetId} (${result.lineage?.length || 0} steps).`,
    severity: result.success === false ? 'error' : 'info',
    payload: {
      targetId,
      provenanceType: result.provenanceType,
      lineageDepth: result.lineage?.length || 0,
      rootId: result.rootId,
      rootHash: result.rootHash,
      truncated: result.truncated
    }
  });
}

module.exports = {
  resolveProvenance,
  traceMerkleProvenance,
  traceAgentProvenance
};
