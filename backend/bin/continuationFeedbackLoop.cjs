'use strict';

const telemetry = require('../src/services/telemetryObserver');
const { markContinuation } = require('../src/services/durableContinuationService');

const CONTINUATION_WAIT_TIMEOUT_MS = 10 * 60 * 1000;

// Unified terminal states — MUST match genos-orchestrate.cjs waitForCompletion
const TERMINAL_STATES = new Set(['completed', 'error', 'terminated', 'apoptosis', 'unverified', 'failed', 'quarantined', 'blocked']);

function isTerminalStatus(status) {
  return TERMINAL_STATES.has(status);
}

async function waitUntilTerminal(db, agentId) {
  const deadline = Date.now() + CONTINUATION_WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const row = await db.get('SELECT status FROM agents WHERE id = ?', agentId);
    if (row && isTerminalStatus(row.status)) {
      return row.status;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return null; // timeout
}

function timeoutResult() {
  return { evaluation: null, organism: null, completionGate: { allowed: false, reason: 'continuation_timeout' }, continuity: null };
}

function waitErrorResult(message) {
  return { evaluation: null, organism: null, completionGate: { allowed: false, reason: message }, continuity: null };
}

async function refreshAndEvaluate(input = {}) {
  const { db, id, task, evaluateMissionContinuity, summarizeAgents } = input;
  const refreshedAgents = await db.all('SELECT id, status, parent_agent_id FROM agents WHERE id = ? OR parent_agent_id = ?', id, id);
  const refreshedOutcome = summarizeAgents(refreshedAgents);
  return evaluateMissionContinuity({ db, id, task, outcome: refreshedOutcome, agents: refreshedAgents });
}

function emitReevalEvent(input = {}) {
  const { id, contAgentId, reeval } = input;
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
}

// Close the continuation_queue record when worker reaches terminal state.
// Uses durableContinuationService.markConsistency for consistency.
async function closeContinuation(db, decisionId, finalStatus) {
  const queueStatus = (finalStatus === 'completed') ? 'completed' : 'failed';
  try {
    await markContinuation({ db, id: decisionId, status: queueStatus });
  } catch {
    // Fallback: direct SQL if service unavailable
    await db.run(
      `UPDATE continuation_queue SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [queueStatus, decisionId]
    );
  }
}

async function waitForContinuationAndReevaluate(input = {}) {
  const { db, id, continuationResult } = input;
  const contAgentId = continuationResult.dispatched.targetAgentId;
  const decisionId = continuationResult.dispatched.decisionId;
  const finalStatus = await waitUntilTerminal(db, contAgentId);
  
  if (!finalStatus) {
    telemetry.emitEvent({
      eventType: 'HOMEOSTASIS_CONTINUATION_TIMEOUT',
      agentId: id,
      action: 'WAIT_TIMEOUT',
      detail: `Continuation worker ${contAgentId} did not reach terminal state in ${CONTINUATION_WAIT_TIMEOUT_MS / 1000}s`,
      payload: { continuationAgentId: contAgentId },
      severity: 'warning'
    });
    // Still close the queue record on timeout
    if (decisionId) await closeContinuation(db, decisionId, 'terminated');
    return timeoutResult();
  }

  // Close the continuation_queue record now that worker is terminal
  if (decisionId) await closeContinuation(db, decisionId, finalStatus);

  try {
    const reeval = await refreshAndEvaluate(input);
    emitReevalEvent({ id, contAgentId, reeval });
    return reeval;
  } catch (waitErr) {
    telemetry.emitEvent({
      eventType: 'HOMEOSTASIS_CONTINUATION_WAIT_ERROR',
      agentId: id,
      action: 'WAIT_ERROR',
      detail: waitErr.message,
      severity: 'error'
    });
    return waitErrorResult(waitErr.message);
  }
}

function applyReeval(current, reeval) {
  if (reeval.completionGate) current.completionGate = reeval.completionGate;
  if (reeval.evaluation) current.evaluation = reeval.evaluation;
  if (reeval.organism) current.organism = reeval.organism;
  if (reeval.continuity) {
    const rounds = current.continuity.rounds;
    current.continuity = { ...current.continuity, ...reeval.continuity, rounds };
  }
  return current;
}

function isSatisfied(current) {
  return current.completionGate && current.completionGate.allowed === true;
}

async function runSingleRound(input = {}) {
  const { db, id, task, evaluateMissionContinuity, summarizeAgents, current, dispatchOne, round } = input;
  const dispatch = await dispatchOne(current);
  if (!dispatch.dispatched || !dispatch.dispatched.targetAgentId) return { done: true, current: { ...current, finalVerdict: dispatch.finalVerdict || current.finalVerdict } };
  current.continuity.dispatched = dispatch.dispatched;
  current.continuity.rounds.push({ round: round + 1, targetAgentId: dispatch.dispatched.targetAgentId });
  const reeval = await waitForContinuationAndReevaluate({
    db, id, task, evaluateMissionContinuity, summarizeAgents, continuationResult: dispatch
  });
  applyReeval(current, reeval);
  if (isSatisfied(current)) {
    current.finalVerdict = 'completed';
    return { done: true, current };
  }
  current.finalVerdict = dispatch.finalVerdict || 'homeostasis_continuation';
  return { done: false, current };
}

async function runBoundedContinuationLoop(input = {}) {
  const { seed, dispatchOne } = input;
  const maxRounds = require('../src/services/homeostasisContinuationService').MAX_HOMEOSTASIS_CONTINUATIONS;
  const current = { ...seed };
  if (!current.continuity) current.continuity = {};
  current.continuity.rounds = [];
  for (let round = 0; round < maxRounds; round += 1) {
    const step = await runSingleRound({ ...input, current, dispatchOne, round });
    if (step.done) return step.current;
  }
  if (current.continuity) current.continuity.budgetExhausted = true;
  current.finalVerdict = 'homeostasis_exhausted';
  return current;
}

module.exports = { waitForContinuationAndReevaluate, runBoundedContinuationLoop, CONTINUATION_WAIT_TIMEOUT_MS, TERMINAL_STATES, isTerminalStatus };
