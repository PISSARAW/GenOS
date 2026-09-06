/**
 * GenOS Biology & Resilience Controller
 * Adaptive Apoptosis autopsy, Cryptobiosis freeze/thaw, and hypermutation drift inspection.
 */

const { getDatabase } = require('../db');
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
    const result = resilienceService.freezeCryptobiosis(workspaceId, reason, { ...(req.body?.statePayload || {}), agents });
    let agentId = agents[0]?.id || null;
    if (!agentId) {
      const existing = await db.get('SELECT id FROM agents WHERE id = ?', 'agent_system');
      if (!existing) {
        await db.run("INSERT OR IGNORE INTO agents(id, workspace_id, name, role, status) VALUES ('agent_system', ?, 'System Sentinel', 'System', 'idle')", workspaceId);
      }
      agentId = 'agent_system';
    }
    await db.run(
      'INSERT INTO cryptobiosis_snapshots(snapshot_id, id, agent_id, workspace_id, reason, state_json, capsule_hash, status, frozen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      result.snapshotId, result.snapshotId, agentId, workspaceId, reason, JSON.stringify(result.state), result.snapshotId, 'frozen', result.frozenAt
    );

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

async function thawCryptobiosis(req, res, next) {
  try {
    const { snapshotId, targetWorkspaceId } = req.body || {};
    if (!snapshotId) return res.status(400).json({ error: { code: 'SNAPSHOT_REQUIRED', message: 'snapshotId is required.' } });
    const db = await getDatabase();
    const persisted = req.tenant
      ? await db.get('SELECT cs.* FROM cryptobiosis_snapshots cs JOIN workspaces w ON w.id = cs.workspace_id WHERE cs.id = ? AND w.organization_id = ? AND w.project_id = ?', snapshotId, req.tenant.organizationId, req.tenant.projectId)
      : await db.get('SELECT cs.* FROM cryptobiosis_snapshots cs JOIN workspaces w ON w.id = cs.workspace_id WHERE cs.id = ? AND w.organization_id IS NULL AND w.project_id IS NULL', snapshotId);
    if (!persisted) return res.status(404).json({ error: { code: 'SNAPSHOT_NOT_FOUND', message: `Cryptobiosis snapshot '${snapshotId}' was not found.` } });
    if (targetWorkspaceId && !await scopedWorkspace(db, req, targetWorkspaceId)) return res.status(404).json({ error: { code: 'WORKSPACE_NOT_FOUND', message: `Target workspace '${targetWorkspaceId}' was not found.` } });
    resilienceService.hydrateCryptobiosis({ snapshotId: persisted.id, workspaceId: persisted.workspace_id, reason: persisted.reason, frozenAt: persisted.frozen_at, state: JSON.parse(persisted.state_json || '{}') });
    const result = resilienceService.thawCryptobiosis(snapshotId, targetWorkspaceId);
    for (const agent of result.state.agents || []) {
      await db.run('UPDATE agents SET status = ?, current_task = ?, workspace_id = COALESCE(?, workspace_id), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND workspace_id = ?', agent.status, agent.currentTask || null, targetWorkspaceId || null, agent.id, persisted.workspace_id);
    }
    await db.run('UPDATE cryptobiosis_snapshots SET thawed_at = CURRENT_TIMESTAMP, thawed_by = ? WHERE id = ?', req.user?.username || 'operator', snapshotId);

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
  getPolicy,
  updatePolicy
};
