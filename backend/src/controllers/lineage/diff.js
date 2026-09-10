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

async function agentActivityCounts(db, id) {
  const [decisions, runs, events, children] = await Promise.all([
    db.get('SELECT COUNT(*) AS count FROM genome_decisions WHERE created_by = ?', id),
    db.get('SELECT COUNT(*) AS count FROM strategy_execution_runs WHERE agent_id = ?', id),
    db.get('SELECT COUNT(*) AS count FROM telemetry_events WHERE agent_id = ?', id),
    db.get('SELECT COUNT(*) AS count FROM agents WHERE parent_agent_id = ?', id)
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
  const [leftState, rightState] = await Promise.all([agentActivityCounts(db, left.id), agentActivityCounts(db, right.id)]);
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
