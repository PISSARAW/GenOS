'use strict';

const bodyService = require('./orchestratorBodyService');
const { extractEvidenceReport, hasDecisionEvidence } = require('./agentEvidenceService');
const FAILURE_EVENTS = new Set(['AGENT_FAILED', 'AGENT_RUNTIME_ERROR', 'WORKER_TASK_FAILED', 'HARD_INVARIANT_FAILURE']);
const OBSERVED_EVENTS = new Set([...FAILURE_EVENTS, 'AGENT_STEP', 'EVIDENCE_REPORT', 'AGENT_COMPLETED']);

function feedbackPercept(event) {
  const report = extractEvidenceReport(event.payload);
  const verified = report.outcome === 'success' && hasDecisionEvidence(event);
  return {
    kind: 'action_consequence', source: 'runtime_observation',
    value: { eventId: event.id, eventType: event.eventType, outcome: report.outcome || null, evidencePresent: verified },
    confidence: 1, cost: 0, timestamp: new Date().toISOString()
  };
}

function updateFailureState(mission, event) {
  if (FAILURE_EVENTS.has(event.eventType)) mission.recentFailures = (Number(mission.recentFailures) || 0) + 1;
  const report = extractEvidenceReport(event.payload);
  if (report.outcome === 'failure') mission.evidenceDebt = [...new Set([...(mission.evidenceDebt || []), `failed_evidence:${event.id}`])];
  // A successful report does not repay unrelated evidence debt.
}

async function refreshMeasuredBudget(ctx) {
  const run = await ctx.db.get('SELECT budget_json, metrics_json FROM strategy_execution_runs WHERE id = ?', ctx.executionRun.id);
  if (!run) return;
  const budget = JSON.parse(run.budget_json || '{}');
  const metrics = JSON.parse(run.metrics_json || '{}');
  if (!Number.isFinite(budget.tokens) || !Number.isFinite(metrics.tokens)) return;
  ctx.runtimeBudget = { ...ctx.runtimeBudget, tokens: Math.max(0, budget.tokens - metrics.tokens) };
}

async function process(ctx, event) {
  if (ctx.dispatchedAgent.execution_mode !== 'orchestrator') return null;
  if (!OBSERVED_EVENTS.has(event.eventType)) return null;
  if (ctx.feedbackEventIds?.has(event.id)) return null;
  updateFailureState(ctx.normalizedMission, event);
  await refreshMeasuredBudget(ctx);
  const workers = await ctx.db.get("SELECT COUNT(*) AS count FROM agents WHERE parent_agent_id = ? AND execution_mode = 'worker' AND runtime_pid IS NOT NULL", ctx.agentId);
  ctx.activeWorkerCount = Number(workers?.count || 0);
  const body = bodyService.buildOrchestratorBody(ctx);
  body.percepts.push(feedbackPercept(event));
  body.sourceEventId = event.id;
  ctx.orchestratorBody = body;
  ctx.normalizedMission.orchestratorBody = body;
  const stopping = body.reflexes.some((reflex) => ['budget_conservation', 'cryptobiosis_suspend'].includes(reflex.id));
  if (stopping) ctx.normalizedMission.autonomousOrchestration = false;
  if (body.worldState.evidenceDebt.length) ctx.normalizedMission.requiresEvidenceBeforePromotion = true;
  const immune = body.reflexes.some((reflex) => reflex.id === 'immune_challenge');
  if (immune) ctx.normalizedMission.requiresEvidenceBeforePromotion = true;
  ctx.emitTracked('ORCHESTRATOR_BODY_STATE', 'SENSE_CONSEQUENCES', 'The orchestrator refreshed its body from a persisted runtime observation.', body, 'info');
  if (!ctx.feedbackEventIds) ctx.feedbackEventIds = new Set();
  ctx.feedbackEventIds.add(event.id);
  return body;
}

module.exports = { process, feedbackPercept };
