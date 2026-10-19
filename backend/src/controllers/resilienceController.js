/**
 * GenOS Biology & Resilience Controller
 * Adaptive Apoptosis autopsy, Cryptobiosis freeze/thaw, and hypermutation drift inspection.
 */

const database = require('../db');
const { getDatabase } = database;
const resilienceService = require('../services/resilienceService');
const telemetry = require('../services/telemetryObserver');
const runtimeAdapter = require('../services/agentRuntimeAdapter');

async function scopedWorkspace(db, req, workspaceId) {
  return req.tenant
    ? db.get('SELECT id FROM workspaces WHERE id = ? AND organization_id = ? AND project_id = ?', workspaceId, req.tenant.organizationId, req.tenant.projectId)
    : db.get('SELECT id FROM workspaces WHERE id = ? AND organization_id IS NULL AND project_id IS NULL', workspaceId);
}

async function triggerApoptosis(req, res, next) {
  try {
    const { agentId = 'agent_worker_1', triggerMetrics = {} } = req.body || {};
    const db = await getDatabase();
    const agent = req.tenant
      ? await db.get('SELECT a.id FROM agents a JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ? AND w.organization_id = ? AND w.project_id = ?', agentId, req.tenant.organizationId, req.tenant.projectId)
      : await db.get('SELECT id FROM agents WHERE id = ?', agentId);
    if (!agent && req.tenant) return res.status(404).json({ error: { code: 'AGENT_NOT_FOUND', message: `Agent '${agentId}' was not found in this project.` } });
    const policy = await db.get('SELECT max_consecutive_failures as maxConsecutiveFailures, max_cost_usd as maxCostUsd, divergence_threshold as divergenceThreshold FROM resilience_policies WHERE id = 1');
    const autopsy = await resilienceService.evaluateApoptosis(agentId, triggerMetrics, db, policy || {});
    if (autopsy.apoptosisExecuted) await runtimeAdapter.stopMission(agentId);

    telemetry.emitEvent({
      eventType: 'APOPTOSIS_EVALUATED',
      agentId,
      action: 'APOPTOSIS',
      detail: `Apoptosis evaluation executed for agent '${agentId}'. Terminated: ${autopsy.apoptosisExecuted}`,
      severity: autopsy.apoptosisExecuted ? 'critical' : 'info',
      payload: autopsy
    });

    res.json(autopsy);
  } catch (err) {
    next(err);
  }
}

async function freezeCryptobiosis(req, res, next) {
  try {
    const { workspaceId = 'fleet', reason = 'Operator cryptobiosis freeze' } = req.body || {};
    const db = await getDatabase();
    if (!await scopedWorkspace(db, req, workspaceId)) return res.status(404).json({ error: { code: 'WORKSPACE_NOT_FOUND', message: `Workspace '${workspaceId}' was not found.` } });
    const agents = await db.all("SELECT id, status, current_task as currentTask FROM agents WHERE workspace_id = ? AND status != 'terminated'", workspaceId);
    
    // resilienceService will handle the DB insert if we pass db
    const result = await resilienceService.freezeCryptobiosis(db, workspaceId, reason, { ...(req.body?.statePayload || {}), agents });

    telemetry.emitEvent({
      eventType: 'CRYPTOBIOSIS_FROZEN',
      agentId: 'resilience_sentinel',
      action: 'CRYPTOBIOSIS_FREEZE',
      detail: `Cryptobiosis snapshot '${result.snapshotId}' frozen successfully`,
      severity: 'warning',
      payload: result
    });

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function findSnapshot(db, req, snapshotId) {
  return req.tenant
    ? await db.get("SELECT cs.* FROM cryptobiosis_snapshots cs JOIN workspaces w ON w.id = cs.workspace_id WHERE cs.snapshot_id = ? AND cs.status = 'frozen' AND cs.thawed_at IS NULL AND w.organization_id = ? AND w.project_id = ?", snapshotId, req.tenant.organizationId, req.tenant.projectId)
    : await db.get("SELECT cs.* FROM cryptobiosis_snapshots cs JOIN workspaces w ON w.id = cs.workspace_id WHERE cs.snapshot_id = ? AND cs.status = 'frozen' AND cs.thawed_at IS NULL AND w.organization_id IS NULL AND w.project_id IS NULL", snapshotId);
}

async function thawAgents(db, { agents, targetWorkspaceId, workspaceId }) {
  for (const agent of agents) {
    const updated = await db.run('UPDATE agents SET status = ?, current_task = ?, workspace_id = COALESCE(?, workspace_id), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND workspace_id = ?', agent.status, agent.currentTask || null, targetWorkspaceId || null, agent.id, workspaceId);
    if (updated.changes !== 1) throw thawConflict(`Agent '${agent.id}' changed workspace during thaw.`);
  }
}

function thawConflict(message) {
  return Object.assign(new Error(message), { code: 'CRYPTOBIOSIS_TOPOLOGY_SCOPE_CONFLICT' });
}

async function validateThawBindings(db, input) {
  const cohort = new Set(input.agents.map((agent) => agent.id));
  const target = input.targetWorkspaceId || input.workspaceId;
  for (const item of input.agents) {
    await validateThawBinding(db, { ...input, cohort, target }, item);
  }
  if (target !== input.workspaceId) await validateMovedParentChildren(db, { agents: input.agents, cohort, targetWorkspaceId: target });
}

async function validateThawBinding(db, input, item) {
  const agent = await db.get('SELECT id, parent_agent_id, workspace_id FROM agents WHERE id = ?', item.id);
  if (!agent || agent.workspace_id !== input.workspaceId) throw thawConflict(`Agent '${item.id}' is no longer in the frozen workspace.`);
  if (input.target === input.workspaceId || !agent.parent_agent_id || input.cohort.has(agent.parent_agent_id)) return;
  const parent = await db.get('SELECT workspace_id FROM agents WHERE id = ?', agent.parent_agent_id);
  if (!parent || parent.workspace_id !== input.target) throw thawConflict(`Thawing '${item.id}' would separate it from parent '${agent.parent_agent_id}'.`);
  await validateChildrenRemainBound(db, { parentId: item.id, cohort: input.cohort, targetWorkspaceId: input.target });
}

async function validateMovedParentChildren(db, input) {
  for (const item of input.agents) await validateChildrenRemainBound(db, {
    parentId: item.id, cohort: input.cohort, targetWorkspaceId: input.targetWorkspaceId
  });
}

async function validateChildrenRemainBound(db, input) {
  const children = await db.all('SELECT id, workspace_id FROM agents WHERE parent_agent_id = ?', input.parentId);
  const separated = children.find(child => !input.cohort.has(child.id) && child.workspace_id !== input.targetWorkspaceId);
  if (separated) throw thawConflict(`Thawing '${input.parentId}' would separate it from child '${separated.id}'.`);
}

async function markSnapshotThawed(db, snapshotId, username) {
  const updated = await db.run("UPDATE cryptobiosis_snapshots SET status = 'thawed', thawed_at = CURRENT_TIMESTAMP, thawed_by = ? WHERE snapshot_id = ? AND status = 'frozen' AND thawed_at IS NULL", username || 'operator', snapshotId);
  if (updated.changes !== 1) throw thawConflict(`Cryptobiosis snapshot '${snapshotId}' was already thawed or changed.`);
}

async function thawSnapshotTransaction(tx, input) {
  const persisted = await findSnapshot(tx, input.req, input.snapshotId);
  if (!persisted) return missingSnapshotOutcome(input.snapshotId);
  if (input.targetWorkspaceId && !await scopedWorkspace(tx, input.req, input.targetWorkspaceId)) {
    return { statusCode: 404, error: { code: 'WORKSPACE_NOT_FOUND', message: `Target workspace '${input.targetWorkspaceId}' was not found.` } };
  }
  const result = await resilienceService.thawCryptobiosis(tx, persisted.snapshot_id, input.targetWorkspaceId);
  if (!result.success) return { statusCode: 409, error: { code: result.code || 'THAW_FAILED', message: result.error || 'Snapshot could not be thawed.' } };
  const agents = result.state.agents || [];
  await validateThawBindings(tx, { agents, targetWorkspaceId: input.targetWorkspaceId, workspaceId: persisted.workspace_id });
  await thawAgents(tx, { agents, targetWorkspaceId: input.targetWorkspaceId, workspaceId: persisted.workspace_id });
  await markSnapshotThawed(tx, persisted.snapshot_id, input.username);
  return { result };
}

function missingSnapshotOutcome(snapshotId) {
  return { statusCode: 404, error: { code: 'SNAPSHOT_NOT_FOUND', message: `Cryptobiosis snapshot '${snapshotId}' was not found.` } };
}

async function thawCryptobiosis(req, res, next) {
  try {
    const { snapshotId, targetWorkspaceId } = req.body || {};
    if (!snapshotId) return res.status(400).json({ error: { code: 'SNAPSHOT_REQUIRED', message: 'snapshotId is required.' } });
    const db = await getDatabase();
    const outcome = await database.withTransaction(db, tx => thawSnapshotTransaction(tx, {
      req, snapshotId, targetWorkspaceId, username: req.user?.username || 'operator'
    }));
    if (outcome.statusCode) return res.status(outcome.statusCode).json({ error: outcome.error });
    const result = outcome.result;

    telemetry.emitEvent({
      eventType: 'CRYPTOBIOSIS_THAWED',
      agentId: 'resilience_sentinel',
      action: 'CRYPTOBIOSIS_THAW',
      detail: `Cryptobiosis snapshot '${snapshotId}' revived cleanly`,
      severity: 'info',
      payload: result
    });

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function getDrift(req, res, next) {
  try {
    const { ancestorPrompt, currentPrompt } = req.body || req.query || {};
    const result = resilienceService.trackHypermutationDrift(ancestorPrompt, currentPrompt);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function hypermutatePrompt(req, res, next) {
  try {
    const { prompt, mutationRate, seed, forcePerturbation } = req.body || {};
    const result = resilienceService.somaticHypermutationPrompt(prompt, mutationRate, { seed, forcePerturbation });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getPolicy(req, res, next) {
  try {
    const db = await getDatabase();
    const policy = await db.get('SELECT max_consecutive_failures as maxConsecutiveFailures, max_cost_usd as maxCostUsd, divergence_threshold as divergenceThreshold, updated_at as updatedAt FROM resilience_policies WHERE id = 1');
    res.json(policy);
  } catch (err) { next(err); }
}

async function updatePolicy(req, res, next) {
  try {
    const db = await getDatabase();
    const { maxConsecutiveFailures = 3, maxCostUsd = 1.0, divergenceThreshold = 0.55 } = req.body || {};
    await db.run('UPDATE resilience_policies SET max_consecutive_failures = ?, max_cost_usd = ?, divergence_threshold = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1', maxConsecutiveFailures, maxCostUsd, divergenceThreshold);
    return getPolicy(req, res, next);
  } catch (err) { next(err); }
}

module.exports = {
  triggerApoptosis,
  freezeCryptobiosis,
  thawCryptobiosis,
  getDrift,
  hypermutatePrompt,
  getPolicy,
  updatePolicy
};
