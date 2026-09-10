/**
 * Agent merge endpoint and persistence helpers.
 */

const { getDatabase, withTransaction } = require('../../db');
const telemetry = require('../../services/telemetryObserver');
const { workspaceScope, loadAgentForScope, firstTrimmed, orDefault, nullish } = require('./helpers');

function mergeRequestIds(body) {
  const leftId = firstTrimmed(body?.leftAgentId, body?.agentAId);
  const rightId = firstTrimmed(body?.rightAgentId, body?.agentBId);
  return { leftId, rightId };
}

function newMergeId() {
  return `agent_merge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function mergedFields(left, right, body) {
  return {
    name: body?.name || `Merge of ${left.name} + ${right.name}`,
    role: body?.role || `${left.role}+${right.role}`,
    currentTask: body?.currentTask || 'Merged agent awaiting mission',
    budget: Math.min(Number(nullish(left.cognitive_budget, 0)), Number(nullish(right.cognitive_budget, 0))),
    baseline: Math.min(Number(nullish(left.cognitive_baseline_budget, 100)), Number(nullish(right.cognitive_baseline_budget, 100))),
    dissonance: Math.max(Number(orDefault(left.dissonance_level, 0)), Number(orDefault(right.dissonance_level, 0))),
    eureka: Math.max(Number(orDefault(left.eureka_count, 0)), Number(orDefault(right.eureka_count, 0))),
    maxDissonance: Math.min(Number(nullish(left.cognitive_max_dissonance, 50)), Number(nullish(right.cognitive_max_dissonance, 50)))
  };
}

async function insertMergedAgent(db, mergedId, context) {
  const { left, right, fields } = context;
  await db.run(
    `INSERT INTO agents (
      id, name, name_meaning, role, status, agent_type, execution_mode, workspace_id, fleet_id,
      model_tier, language, isolation_mode, parent_agent_id, lineage_relation, about, current_task,
      dissonance_level, eureka_count, cognitive_budget, cognitive_baseline_budget, cognitive_max_dissonance, is_apoptotic
    ) VALUES (?, ?, ?, ?, 'idle', 'GenOS', 'worker', ?, ?, ?, ?, 'Branch', ?, 'merge', ?, ?, ?, ?, ?, ?, ?, 0)`,
    mergedId,
    fields.name,
    `Hybrid identity of ${left.name} and ${right.name}`,
    fields.role,
    left.workspace_id,
    left.fleet_id || right.fleet_id || null,
    left.model_tier || right.model_tier || 'standard',
    left.language || right.language || 'TypeScript',
    left.id,
    `Merged from ${left.id} and ${right.id}`,
    fields.currentTask,
    fields.dissonance,
    fields.eureka,
    fields.budget,
    fields.baseline,
    fields.maxDissonance
  );
}

async function insertMergeParents(db, left, right) {
  for (const parent of [left, right]) {
    await db.run(
      `INSERT INTO lineage_nodes (id, workspace_id, agent_id, label, node_type, state_summary)
       VALUES (?, ?, ?, ?, 'agent', 'Merge parent') ON CONFLICT(id) DO NOTHING`,
      parent.id, parent.workspace_id, parent.id, parent.name
    );
  }
}

async function insertMergedNode(db, mergedId, context) {
  const { left, right, fields } = context;
  await db.run(
    `INSERT INTO lineage_nodes (id, workspace_id, agent_id, label, node_type, state_summary, metadata)
     VALUES (?, ?, ?, ?, 'merge', 'Merged agent', ?)`,
    mergedId, left.workspace_id, mergedId, fields.name, JSON.stringify({ parentAgentIds: [left.id, right.id], mergePolicy: 'conservative_budget' })
  );
}

async function insertMergeEdges(db, mergedId, context) {
  const { left, right } = context;
  for (const parent of [left, right]) {
    await db.run(
      `INSERT INTO lineage_edges (id, workspace_id, source_node_id, target_node_id, edge_type, metadata)
       VALUES (?, ?, ?, ?, 'merge', ?) ON CONFLICT(id) DO NOTHING`,
      `edge_${parent.id}_${mergedId}`, left.workspace_id, parent.id, mergedId, JSON.stringify({ mergePolicy: 'conservative_budget' })
    );
  }
}

async function mergeAgents(req, res) {
  const { leftId, rightId } = mergeRequestIds(req.body);
  if (!leftId || !rightId || leftId === rightId) return res.status(400).json({ error: { code: 'MERGE_AGENTS_REQUIRED', message: 'Two distinct agent IDs are required.' } });
  const db = await getDatabase();
  const scope = workspaceScope(req);
  const [left, right] = await Promise.all([loadAgentForScope(db, scope, leftId), loadAgentForScope(db, scope, rightId)]);
  if (!left || !right) return res.status(404).json({ error: { code: 'AGENT_NOT_FOUND', message: 'Both agents must exist in the current tenant.' } });
  if (left.workspace_id !== right.workspace_id) return res.status(409).json({ error: { code: 'AGENT_WORKSPACE_MISMATCH', message: 'Agents must belong to the same workspace.' } });

  const mergedId = newMergeId();
  const fields = mergedFields(left, right, req.body);
  const context = { left, right, fields };
  // The five merge rows (agent + parents + node + edges) must land together or
  // not at all, otherwise a failure mid-way leaves a half-merged lineage.
  await withTransaction(db, async () => {
    await insertMergedAgent(db, mergedId, context);
    await insertMergeParents(db, left, right);
    await insertMergedNode(db, mergedId, context);
    await insertMergeEdges(db, mergedId, { left, right });
  });
  telemetry.emitEvent({ eventType: 'AGENTS_MERGED', agentId: mergedId, action: 'MERGE', detail: `Merged agents ${left.id} and ${right.id}`, severity: 'info', payload: { parentAgentIds: [left.id, right.id], mergedId } });
  return res.status(201).json({ success: true, mergedAgentId: mergedId, parentAgentIds: [left.id, right.id], cognitiveBudget: fields.budget, status: 'idle' });
}

module.exports = {
  mergeAgents
};
