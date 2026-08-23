/**
 * GenOS Biology & Resilience Controller
 * Adaptive Apoptosis autopsy, Cryptobiosis freeze/thaw, and hypermutation drift inspection.
 */

const { getDatabase } = require('../db');
const resilienceService = require('../services/resilienceService');
const telemetry = require('../services/telemetryObserver');
const runtimeAdapter = require('../services/agentRuntimeAdapter');

async function triggerApoptosis(req, res, next) {
  try {
    const { agentId = 'agent_worker_1', triggerMetrics = {} } = req.body || {};
    const db = await getDatabase();
    const policy = await db.get('SELECT max_consecutive_failures as maxConsecutiveFailures, max_cost_usd as maxCostUsd, divergence_threshold as divergenceThreshold FROM resilience_policies WHERE id = 1');
    const autopsy = await resilienceService.evaluateApoptosis(agentId, triggerMetrics, db, policy || {});
    if (autopsy.apoptosisExecuted) runtimeAdapter.stopMission(agentId);

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
    const agents = await db.all("SELECT id, status, current_task as currentTask FROM agents WHERE status != 'terminated'");
    const result = resilienceService.freezeCryptobiosis(workspaceId, reason, { ...(req.body?.statePayload || {}), agents });

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
    const result = resilienceService.thawCryptobiosis(snapshotId, targetWorkspaceId);

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
