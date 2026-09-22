'use strict';

const { emit, updateAgent } = require('../src/services/agentOrchestrationState');
const telemetry = require('../src/services/telemetryObserver');

const CONTINUATION_WAIT_TIMEOUT_MS = 10 * 60 * 1000;

async function waitUntilTerminal(db, agentId) {
  const deadline = Date.now() + CONTINUATION_WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const row = await db.get('SELECT status FROM agents WHERE id = ?', agentId);
    if (row && ['completed', 'error', 'failed', 'terminated', 'apoptosis', 'quarantined'].includes(row.status)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

async function waitForContinuationAndReevaluate(input = {}) {
  const { db, id, task, evaluateMissionContinuity, summarizeAgents, continuationResult } = input;
  const contAgentId = continuationResult.dispatched.targetAgentId;
  const reachedTerminal = await waitUntilTerminal(db, contAgentId);
  if (!reachedTerminal) {
    telemetry.emitEvent({
      eventType: 'HOMEOSTASIS_CONTINUATION_TIMEOUT',
      agentId: id,
      action: 'WAIT_TIMEOUT',
      detail: `Continuation worker ${contAgentId} did not reach terminal state in ${CONTINUATION_WAIT_TIMEOUT_MS / 1000}s`,
      payload: { continuationAgentId: contAgentId },
      severity: 'warning'
    });
    return { evaluation: null, organism: null, completionGate: { allowed: false, reason: 'continuation_timeout' }, continuity: null };
  }
  try {
    const refreshedAgents = await db.all('SELECT id, status, parent_agent_id FROM agents WHERE id = ? OR parent_agent_id = ?', id, id);
    const refreshedOutcome = summarizeAgents(refreshedAgents);
    const reeval = await evaluateMissionContinuity({ db, id, task, outcome: refreshedOutcome, agents: refreshedAgents });
    const gateAllowed = reeval.completionGate && reeval.completionGate.allowed === true;
    telemetry.emitEvent({
      eventType: gateAllowed ? 'MISSION_HOMEOSTASIS_ACHIEVED' : 'MISSION_HOMEOSTASIS_CONTINUED',
      agentId: id,
      action: gateAllowed ? 'HOMEOSTASIS_SATISFIED' : 'HOMEOSTASIS_RE_EVALUATED',
      detail: gateAllowed
        ? 'Homeostasis satisfied after continuation worker.'
        : `Homeostasis still blocked after continuation: ${reeval.evaluation?.status || 'unknown'}`,
      payload: { continuationAgentId: contAgentId, gateAllowed, reevalStatus: reeval.evaluation?.status },
      severity: gateAllowed ? 'info' : 'warning'
    });
    return reeval;
  } catch (waitErr) {
    telemetry.emitEvent({
      eventType: 'HOMEOSTASIS_CONTINUATION_WAIT_ERROR',
      agentId: id,
      action: 'WAIT_ERROR',
      detail: waitErr.message,
      severity: 'error'
    });
    return { evaluation: null, organism: null, completionGate: { allowed: false, reason: waitErr.message }, continuity: null };
  }
}

module.exports = { waitForContinuationAndReevaluate, CONTINUATION_WAIT_TIMEOUT_MS };
