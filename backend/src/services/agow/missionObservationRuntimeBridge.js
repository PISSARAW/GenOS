'use strict';

const observations = require('./missionObservationService');

async function start(ctx) {
  const agow = ctx.agow;
  if (!agow?.modeReceipt || !agow.accepted) return { recorded: false, reason: 'agow_decision_unavailable' };
  if (!ctx.normalizedMission.missionId) return { recorded: false, reason: 'mission_identity_unavailable' };
  const frame = agow.frame;
  if (![frame?.primaryContent, ...(frame?.secondaryContents || [])].includes(agow.candidateId)) {
    return { recorded: false, reason: 'mission_candidate_not_selected' };
  }
  const native = require('./nativeMissionOutcomeVerifier');
  const measurementContract = native.supports(ctx.normalizedMission) ? native.MEASUREMENT_CONTRACT : undefined;
  return observations.start({ db: ctx.db, agentId: ctx.agentId,
    missionId: ctx.normalizedMission.missionId, runId: ctx.executionRun.id,
    candidateId: agow.candidateId, frameId: frame.frameId, decisionReceiptId: agow.modeReceipt.receiptId,
    controlAuthority: agow.activation === 'bounded' ? 'agow' : 'historical', measurementContract });
}

async function observe(ctx, event) {
  if (!require('../agentTerminalStatusService').isTerminalEvent(event.eventType)) {
    return { recorded: false, reason: 'not_terminal' };
  }
  if (!ctx.executionRun?.id) return { recorded: false, reason: 'execution_run_unavailable' };
  return observations.observe({ db: ctx.db, agentId: ctx.agentId, runId: ctx.executionRun.id, event });
}

module.exports = { start, observe };
