'use strict';

const observerService = require('./observer');
const policy = require('./policy');
const { workerEvidenceRounds } = require('../agentOrchestrationState');

function invalidateDossier(ctx, reason) {
  const parent = ctx.normalizedMission.orchestratorAgentId || ctx.normalizedMission.orchestratorId;
  const round = workerEvidenceRounds.get(parent);
  const entries = round?.events.get(ctx.agentId);
  if (!entries) return;
  round.events.set(ctx.agentId, entries.map((entry) => invalidateEntry(entry, ctx.executionRun.id, reason)));
}

function invalidateEntry(entry, runId, reason) {
  if (entry.executionRunId !== runId) return entry;
  if (entry.failure?.category === 'stale_plan') return entry;
  const { evidenceReport, noAnswerProof, ...historical } = entry;
  return { ...historical, historicalEvidenceReport: evidenceReport, historicalNoAnswerProof: noAnswerProof,
    failure: { category: 'stale_plan', reason } };
}

function markUnverified(ctx, reason) {
  ctx.state.missionDomainState.unverified = true;
  ctx.state.missionDomainState.domainVerdict = 'unverified';
  invalidateDossier(ctx, reason);
}

function onChange(ctx, change) {
  const state = ctx.continuousObserver.state;
  if (state.mode === 'control') markUnverified(ctx, change.reason);
  require('./sensoriumBridge').publish(ctx, change.observations);
  if (change.observations.length && ctx.child?.genosCaptureBarrier) {
    try {
      ctx.child.send({ type: 'genos-observation-update', agentId: ctx.agentId,
        runId: ctx.executionRun.id, planRevision: state.planRevision,
        observations: change.observations }, (error) => {
        if (error) state.coverageFailure = 'observation_delivery_failed';
      });
    } catch (_) { state.coverageFailure = 'observation_delivery_failed'; }
  }
  ctx.emitTracked('CONTINUOUS_OBSERVATION', 'OBSERVE', 'Mission dependencies changed or observation coverage was lost.', {
    planRevision: state.planRevision, mode: state.mode, reason: change.reason,
    observations: change.observations, requiresReassessment: state.mode === 'control'
  }, 'warning');
}

function start(ctx) {
  observerService.start(ctx.continuousObserver, (change) => onChange(ctx, change));
}

function completion(event) {
  if (event.eventType === 'EVIDENCE_REPORT') {
    const report = require('../agentEvidence/evidenceHelpers').extractEvidenceReport(event.payload);
    return ['success', 'no_answer'].includes(report.outcome);
  }
  return ['AGENT_COMPLETED', 'WORKER_NO_ANSWER_PROVEN', 'MISSION_NO_ANSWER_PROVEN'].includes(event.eventType);
}

function guard(ctx, event, verify = true) {
  const observer = ctx.continuousObserver;
  if (!observer || !completion(event)) return event;
  const result = verify ? observerService.scan(observer, true) : policy.verdict(observer.state);
  const identity = event.payload?.executionRunId;
  if (identity && identity !== observer.state.runId) Object.assign(result, { eligible: false, reason: 'execution_run_mismatch' });
  if (observer.state.mode !== 'control') return shadowEvent(observer, event, result);
  if (result.eligible) return pendingCompletion(observer, event);
  markUnverified(ctx, result.reason);
  return { ...event, eventType: 'AGENT_HALTED', action: 'CONTINUOUS_EVIDENCE_GATE',
    detail: `Result withheld: ${result.reason}.`, severity: 'warning', status: 'unverified',
    payload: { executionRunId: ctx.executionRun.id, planRevision: observer.state.planRevision,
      failure: { category: 'stale_plan', reason: result.reason },
      rejectedEventType: event.eventType, historicalResult: event.payload } };
}

function shadowEvent(observer, event, result) {
  return { ...event, payload: { ...event.payload, continuousExecution: {
    mode: 'observe', wouldReject: !result.eligible, reason: result.reason, planRevision: observer.state.planRevision
  } } };
}

function pendingCompletion(observer, event) {
  if (event.eventType !== 'AGENT_COMPLETED' || observer.state.closed) return event;
  return { ...event, eventType: 'CONTINUOUS_COMPLETION_PENDING', action: 'AWAIT_FINAL_SCAN', status: 'running',
    payload: { ...event.payload, planRevision: observer.state.planRevision } };
}

function capabilities(ctx) {
  const observer = ctx.continuousObserver;
  if (!observer) return { continuousObservation: false };
  return { continuousObservation: true, mode: observer.state.mode, planRevision: 0,
    livePlanUpdate: Boolean(ctx.child?.genosCaptureBarrier), resultFreshnessGate: observer.state.mode === 'control',
    dependencies: observer.state.baselines.map((item) => item.target) };
}

async function close(ctx) {
  await observerService.close(ctx.continuousObserver);
  const observer = ctx.continuousObserver;
  if (!observer || observer.state.mode !== 'control') return;
  const result = policy.verdict(observer.state);
  if (!result.eligible) markUnverified(ctx, result.reason);
}

module.exports = { start, guard, capabilities, close, invalidateDossier };
