'use strict';

function argumentsFor(context) {
  const record = context.payload.deliveryDecision;
  if (!record) return null;
  return {agentId: context.event.agentId, ...record};
}

async function record({db, mission, event}) {
  if (mission.executionMode !== 'orchestrator') return null;
  const saved = await require('./missionEnvelopeAuthority').assertRun(db, {
    agentId: mission.agentId, runId: event.payload.executionRunId});
  if (!saved.envelope.workspaceVerificationContract) return null;
  const report = event.payload.evidenceReport;
  const deliveryDecision = {title: 'Retain the native tested code candidate for final admission',
    decision: 'Retain this exact candidate subject to the remaining strategy, homeostasis and coverage gates. Withhold delivery if any gate refuses it.',
    organizationId: saved.envelope.scope.organizationId, projectId: saved.envelope.scope.projectId,
    evidence: [event.payload.nativeOracleRef.eventId,
      `genos://quality-receipt/${report.qualityElevationReceipt.receiptId}`,
      `genos://code-replay/${event.payload.executionRunId}`],
    alternatives: ['Withhold the candidate and retain the original workspace'],
    assumptions: ['Passing sealed public tests establishes only the tested finite scope; held-out correctness remains unmeasured.']};
  const observed = require('./agentOrchestrationState').emit(mission.agentId, 'NATIVE_CODE_DELIVERY_DECISION',
    'RECORD_DECISION', deliveryDecision.decision, {executionRunId: event.payload.executionRunId, deliveryDecision});
  const result = await require('./orchestrationActionExecutor').execute({orchestratorId: mission.agentId,
    sourceAgentId: mission.agentId, event: observed, workspaceRoot: mission.workspaceRoot,
    decision: {tool: 'genos_record_decision', action: 'record_native_code_delivery', reason: deliveryDecision.decision}});
  if (!result.executed || !result.result?.proof?.decisionId) throw Error('NATIVE_CODE_DECISION_NOT_PERSISTED');
  return result.result.proof.decisionId;
}
module.exports = {argumentsFor, record};
