/**
 * Provenance Resolver Service
 * Traces causal provenance across:
 * 1. Cryptographic Merkle DAGs (provenance_records: payload_hash -> parent_hash)
 * 2. Agent lineage hierarchy (agents: id -> parent_agent_id)
 * 3. MCTS DAG nodes (lineage_nodes / lineage_edges)
 * 4. Episodic genome decisions (genome_decisions / memory_synapses)
 */

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

/**
 * Traces cryptographic Merkle chain in provenance_records
 */
async function traceMerkleProvenance(db, initialRecord, maxDepth) {
  const lineage = [];
  const visited = new Set();
  let current = initialRecord;
  let truncated = false;

  for (let i = 0; i < maxDepth; i++) {
    const key = current.payload_hash || current.id;
    if (visited.has(key)) {
      return {
        success: false,
        error: `Causal provenance cycle detected at hash '${key}'.`,
        lineage,
        cycleAt: key
      };
    }
    visited.add(key);

    const payload = parseJson(current.payload_json, {});
    lineage.push({
      id: current.id,
      subject_type: current.subject_type,
      subject_id: current.subject_id,
      payload_hash: current.payload_hash,
      parent_hash: current.parent_hash,
      algorithm: current.algorithm || 'sha256',
      payload,
      created_at: current.created_at,
      organization_id: current.organization_id,
      project_id: current.project_id
    });

    if (!current.parent_hash) break;

    const parentRecord = await db.get(
      'SELECT * FROM provenance_records WHERE payload_hash = ? ORDER BY created_at DESC LIMIT 1',
      current.parent_hash
    );

    if (!parentRecord) break;

    if (i === maxDepth - 1 && parentRecord.parent_hash && !visited.has(parentRecord.payload_hash)) {
      truncated = true;
    }

    current = parentRecord;
  }

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

/**
 * Traces agent ancestry hierarchy in agents table and lineage_nodes/edges
 */
async function traceAgentProvenance(db, targetId, maxDepth) {
  const lineage = [];
  let currentId = targetId;
  const visited = new Set();
  let truncated = false;

  for (let i = 0; i < maxDepth; i++) {
    if (visited.has(currentId)) {
      return {
        success: false,
        error: `Causal provenance cycle detected at '${currentId}'.`,
        lineage,
        cycleAt: currentId
      };
    }
    visited.add(currentId);

    const agent = await db.get(
      `SELECT a.id, a.name, a.parent_agent_id, a.workspace_id, a.lineage_relation, a.current_task FROM agents a WHERE a.id = ?`,
      currentId
    );

    if (!agent) {
      const lNode = await db.get(
        `SELECT id, label, workspace_id, node_type, state_summary FROM lineage_nodes WHERE id = ?`,
        currentId
      );
      if (lNode) {
        const edge = await db.get(`SELECT source_node_id, edge_type FROM lineage_edges WHERE target_node_id = ?`, currentId);
        lineage.push({
          id: lNode.id,
          name: lNode.label,
          parent_agent_id: edge?.source_node_id || null,
          parent_agent_ids: edge?.source_node_id ? [edge.source_node_id] : [],
          workspace_id: lNode.workspace_id,
          relation: edge?.edge_type || 'dag_node',
          task: lNode.state_summary
        });
        if (!edge?.source_node_id || edge.source_node_id === currentId) break;
        if (i === maxDepth - 1 && edge.source_node_id && !visited.has(edge.source_node_id)) {
          truncated = true;
        }
        currentId = edge.source_node_id;
        continue;
      }
      break;
    }

    const edgeRows = await db.all(`SELECT source_node_id, edge_type FROM lineage_edges WHERE target_node_id = ?`, currentId).catch(() => []);
    const parentIds = edgeRows.length > 0
      ? edgeRows.map((e) => e.source_node_id)
      : (agent.parent_agent_id ? [agent.parent_agent_id] : []);

    lineage.push({
      id: agent.id,
      name: agent.name,
      parent_agent_id: agent.parent_agent_id || parentIds[0] || null,
      parent_agent_ids: parentIds,
      workspace_id: agent.workspace_id,
      relation: agent.lineage_relation,
      task: agent.current_task
    });

    const nextParentId = agent.parent_agent_id || parentIds[0];
    if (!nextParentId || nextParentId === agent.id) break;

    if (i === maxDepth - 1 && nextParentId && !visited.has(nextParentId)) {
      truncated = true;
    }

    currentId = nextParentId;
  }

  const rootNode = lineage[lineage.length - 1];
  return {
    success: true,
    provenanceType: 'agent_hierarchy',
    lineage,
    rootId: rootNode?.id,
    truncated
  };
}

/**
 * Main entry point for resolving causal and cryptographic provenance
 */
async function resolveProvenance(context = {}) {
  const db = await getDatabase();
  const targetId = context.targetId || context.agentId || context.subjectId || context.payloadHash;
  if (!targetId) return { success: false, error: 'targetId required for provenance.' };

  const maxDepth = Math.max(1, Math.min(Number(context.maxDepth || context.max_depth || 10), 100));

  // 1. Prefer Merkle chain if explicitly requested or if targetId is a provenance record / hash
  const isExplicitMerkle = context.provenanceType === 'merkle'
    || context.type === 'conclusion'
    || targetId.startsWith('prov-')
    || (typeof targetId === 'string' && /^[0-9a-f]{64}$/i.test(targetId));

  if (isExplicitMerkle) {
    const provRecord = await db.get(
      'SELECT * FROM provenance_records WHERE id = ? OR payload_hash = ? OR subject_id = ? ORDER BY created_at DESC LIMIT 1',
      targetId, targetId, targetId
    );
    if (provRecord) {
      const res = await traceMerkleProvenance(db, provRecord, maxDepth);
      emitTelemetry(context, targetId, res);
      return res;
    }
  }

  // 2. Check agents table first if not strictly merkle
  const agentExists = await db.get('SELECT id FROM agents WHERE id = ?', targetId);
  const lNodeExists = !agentExists ? await db.get('SELECT id FROM lineage_nodes WHERE id = ?', targetId) : null;

  if (agentExists || lNodeExists) {
    const res = await traceAgentProvenance(db, targetId, maxDepth);
    emitTelemetry(context, targetId, res);
    return res;
  }

  // 3. Fallback: check provenance_records table (e.g. conclusion, evaluation, decision)
  const provRecord = await db.get(
    'SELECT * FROM provenance_records WHERE id = ? OR payload_hash = ? OR subject_id = ? ORDER BY created_at DESC LIMIT 1',
    targetId, targetId, targetId
  );
  if (provRecord) {
    const res = await traceMerkleProvenance(db, provRecord, maxDepth);
    emitTelemetry(context, targetId, res);
    return res;
  }

  // 4. Fallback: check genome_decisions table (episodic memory)
  const decision = await db.get('SELECT * FROM genome_decisions WHERE id = ?', targetId);
  if (decision) {
    // Check if decision has a corresponding provenance record
    const decProv = await db.get('SELECT * FROM provenance_records WHERE subject_id = ? ORDER BY created_at DESC LIMIT 1', targetId);
    if (decProv) {
      const res = await traceMerkleProvenance(db, decProv, maxDepth);
      emitTelemetry(context, targetId, res);
      return res;
    }
    // Return decision origin
    const res = {
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
    emitTelemetry(context, targetId, res);
    return res;
  }

  // Target not found anywhere
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
