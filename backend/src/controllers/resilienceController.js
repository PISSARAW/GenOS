/**
 * GenOS Biology & Resilience Controller
 * Adaptive Apoptosis autopsy, Cryptobiosis freeze/thaw, and hypermutation drift inspection.
 */

const { getDatabase } = require('../db');
const resilienceService = require('../services/resilienceService');
const telemetry = require('../services/telemetryObserver');

async function triggerApoptosis(req, res, next) {
  try {
    const { agentId = 'agent_worker_1', triggerMetrics = {} } = req.body || {};
    const db = await getDatabase();
    const autopsy = await resilienceService.evaluateApoptosis(agentId, triggerMetrics, db);

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
    const { workspaceId = 'ws-genos-core', reason = 'Operator cryptobiosis freeze' } = req.body || {};
    const result = resilienceService.freezeCryptobiosis(workspaceId, reason, req.body?.statePayload || {});

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

module.exports = {
  triggerApoptosis,
  freezeCryptobiosis,
  thawCryptobiosis,
  getDrift
};
