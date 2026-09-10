/**
 * Agent cherry-pick endpoint and patch builders.
 */

const { getDatabase } = require('../../db');
const telemetry = require('../../services/telemetryObserver');
const { workspaceScope, loadAgentForScope, readString, orDefault, nullish } = require('./helpers');

function pickSections(body) {
  return Array.isArray(body?.sections) && body.sections.length
    ? body.sections
    : ['conscience', 'task'];
}

function buildIdentityPatch(state) {
  return {
    name: state.name,
    name_meaning: state.name_meaning,
    role: state.role,
    model_tier: state.model_tier,
    language: state.language
  };
}

function buildConsciencePatch(state) {
  return {
    dissonance_level: orDefault(state.dissonance_level, 0),
    eureka_count: orDefault(state.eureka_count, 0),
    cognitive_budget: nullish(state.cognitive_budget, 0),
    cognitive_baseline_budget: nullish(state.cognitive_baseline_budget, 0),
    cognitive_max_dissonance: nullish(state.cognitive_max_dissonance, 50),
    is_apoptotic: orDefault(state.is_apoptotic, 0)
  };
}

function buildTaskPatch(state) {
  return { current_task: state.current_task };
}

function buildRuntimePatch(state) {
  return { model_tier: state.model_tier, language: state.language, isolation_mode: state.isolation_mode };
}

function cherryPickPatch(sections, state) {
  const identity = sections.includes('identity') ? buildIdentityPatch(state) : {};
  const conscience = sections.includes('conscience') ? buildConsciencePatch(state) : {};
  const task = sections.includes('task') ? buildTaskPatch(state) : {};
  const runtime = sections.includes('runtime') ? buildRuntimePatch(state) : {};
  return { ...identity, ...conscience, ...task, ...runtime };
}

async function cherryPickSourceState(db, context) {
  if (!context.snapshotId) return context.source;
  const snapshot = await db.get('SELECT state_json FROM agent_state_snapshots WHERE id = ? AND agent_id = ?', context.snapshotId, context.sourceAgentId);
  if (!snapshot) return undefined;
  return JSON.parse(snapshot.state_json);
}

function cherryPickIds(body) {
  return {
    sourceAgentId: readString(body, 'sourceAgentId'),
    targetAgentId: readString(body, 'targetAgentId'),
    snapshotId: readString(body, 'snapshotId')
  };
}

function cherryPickValidation(ids, sections) {
  const allowedSections = new Set(['identity', 'conscience', 'task', 'runtime']);
  if (!ids.sourceAgentId || !ids.targetAgentId || ids.sourceAgentId === ids.targetAgentId) {
    return { error: { code: 'AGENTS_REQUIRED', message: 'Distinct sourceAgentId and targetAgentId are required.' } };
  }
  if (sections.some((section) => !allowedSections.has(section))) {
    return { error: { code: 'CHERRY_PICK_SECTION_INVALID', message: 'Unsupported cherry-pick section.' } };
  }
  return null;
}

async function cherryPickAgentState(req, res) {
  const ids = cherryPickIds(req.body);
  const sections = pickSections(req.body);
  const validation = cherryPickValidation(ids, sections);
  if (validation) return res.status(400).json(validation);
  const db = await getDatabase();
  const scope = workspaceScope(req);
  const [source, target] = await Promise.all([loadAgentForScope(db, scope, ids.sourceAgentId), loadAgentForScope(db, scope, ids.targetAgentId)]);
  if (!source || !target) return res.status(404).json({ error: { code: 'AGENT_NOT_FOUND', message: 'Both agents must exist in the current tenant.' } });
  if (source.workspace_id !== target.workspace_id) return res.status(409).json({ error: { code: 'AGENT_WORKSPACE_MISMATCH', message: 'Agents must belong to the same workspace.' } });
  const state = await cherryPickSourceState(db, { source, sourceAgentId: ids.sourceAgentId, snapshotId: ids.snapshotId });
  if (state === undefined) return res.status(404).json({ error: { code: 'AGENT_SNAPSHOT_NOT_FOUND', message: 'Source snapshot is not available.' } });
  const patch = cherryPickPatch(sections, state);
  const assignments = Object.keys(patch);
  const values = assignments.map((field) => patch[field]);
  await db.run(`UPDATE agents SET ${assignments.map((field) => `${field} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, ...values, ids.targetAgentId);
  telemetry.emitEvent({ eventType: 'AGENT_STATE_CHERRY_PICKED', agentId: ids.targetAgentId, action: 'CHERRY_PICK', detail: `Cherry-picked ${sections.join(', ')} from ${ids.sourceAgentId}`, severity: 'info', payload: { sourceAgentId: ids.sourceAgentId, targetAgentId: ids.targetAgentId, snapshotId: ids.snapshotId || null, sections } });
  return res.json({ success: true, sourceAgentId: ids.sourceAgentId, targetAgentId: ids.targetAgentId, snapshotId: ids.snapshotId || null, sections, fieldsApplied: assignments });
}

module.exports = {
  cherryPickAgentState
};
