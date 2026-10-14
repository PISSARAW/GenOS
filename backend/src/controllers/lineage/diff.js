/**
 * Agent diff endpoints and comparable state helpers.
 */

const { getDatabase } = require('../../db');
const { workspaceScope, loadAgentForScope, firstTrimmed, countOf } = require('./helpers');

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

function isMergeableObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function bothMergeable(left, right) {
  return isMergeableObject(left) && isMergeableObject(right);
}

function unionKeys(left, right) {
  return new Set([...Object.keys(left || {}), ...Object.keys(right || {})]);
}

function joinPath(prefix, key) {
  return prefix ? `${prefix}.${key}` : key;
}

function safeValue(value) {
  return value ?? null;
}

function readKey(source, key) {
  return source?.[key];
}

function diffValues(left, right, prefix = '') {
  const context = { differences: [], left, right, prefix };
  for (const key of unionKeys(left, right)) {
    collectValueDiff(context, key);
  }
  return context.differences;
}

function collectValueDiff(context, key) {
  const { differences, left, right, prefix } = context;
  const path = joinPath(prefix, key);
  const a = readKey(left, key);
  const b = readKey(right, key);
  if (bothMergeable(a, b)) {
    differences.push(...diffValues(a, b, path));
  } else if (JSON.stringify(a) !== JSON.stringify(b)) {
    differences.push({ path, left: safeValue(a), right: safeValue(b) });
  }
}

function rowScope(req, alias, agentId) {
  if (!req.tenant) return { clause: '1 = 1', params: [] };
  const { organizationId, projectId } = req.tenant;
  return {
    clause: `(${alias}.organization_id = ? AND ${alias}.project_id = ? OR (${alias}.organization_id IS NULL AND ${alias}.project_id IS NULL AND EXISTS (SELECT 1 FROM agents scope_agent JOIN workspaces scope_workspace ON scope_workspace.id = scope_agent.workspace_id WHERE scope_agent.id = ? AND scope_workspace.organization_id = ? AND scope_workspace.project_id = ?)))`,
    params: [organizationId, projectId, agentId, organizationId, projectId]
  };
}

function workspaceRowScope(req, alias, agentId) {
  if (!req.tenant) return { clause: '1 = 1', params: [] };
  const { organizationId, projectId } = req.tenant;
  return {
    clause: `(${alias}.organization_id = ? AND ${alias}.project_id = ? OR (${alias}.id IS NULL AND EXISTS (SELECT 1 FROM agents scope_agent JOIN workspaces scope_workspace ON scope_workspace.id = scope_agent.workspace_id WHERE scope_agent.id = ? AND scope_workspace.organization_id = ? AND scope_workspace.project_id = ?)))`,
    params: [organizationId, projectId, agentId, organizationId, projectId]
  };
}

async function agentActivityCounts(db, id, req) {
  const decisionScope = rowScope(req, 'd', id);
  const eventScope = rowScope(req, 'e', id);
  const runScope = workspaceRowScope(req, 'w', id);
  const childScope = workspaceRowScope(req, 'w', id);
  const [decisions, runs, events, children] = await Promise.all([
    db.get(`SELECT COUNT(*) AS count FROM genome_decisions d WHERE d.created_by = ? AND ${decisionScope.clause}`, id, ...decisionScope.params),
    db.get(`SELECT COUNT(*) AS count FROM strategy_execution_runs r JOIN strategy_contracts c ON c.id = r.contract_id LEFT JOIN workspaces w ON w.id = c.workspace_id WHERE r.agent_id = ? AND ${runScope.clause}`, id, ...runScope.params),
    db.get(`SELECT COUNT(*) AS count FROM telemetry_events e WHERE e.agent_id = ? AND ${eventScope.clause}`, id, ...eventScope.params),
    db.get(`SELECT COUNT(*) AS count FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.parent_agent_id = ? AND ${childScope.clause}`, id, ...childScope.params)
  ]);
  return {
    decisions: countOf(decisions),
    executionRuns: countOf(runs),
    telemetryEvents: countOf(events),
    directChildren: countOf(children)
  };
}

async function diffAgents(req, res) {
  const leftId = firstTrimmed(req.body?.leftAgentId, req.body?.agentAId);
  const rightId = firstTrimmed(req.body?.rightAgentId, req.body?.agentBId);
  if (!leftId || !rightId) return res.status(400).json({ error: { code: 'AGENTS_REQUIRED', message: 'leftAgentId and rightAgentId are required.' } });
  const db = await getDatabase();
  const scope = workspaceScope(req);
  const [left, right] = await Promise.all([loadAgentForScope(db, scope, leftId), loadAgentForScope(db, scope, rightId)]);
  if (!left || !right) return res.status(404).json({ error: { code: 'AGENT_NOT_FOUND', message: 'Both agents must exist in the current tenant.' } });
  const [leftState, rightState] = await Promise.all([agentActivityCounts(db, left.id, req), agentActivityCounts(db, right.id, req)]);
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

module.exports = {
  diffAgents
};
