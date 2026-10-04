/**
 * Strategy execution facade (point #8 — promotion différée).
 *
 * Thin delegation layer: the event engine lives in strategyExecutionEvents,
 * the deferred-promotion gate (approval proof, promotion gate evaluation,
 * capsule confinement) lives in strategyPromotionGate. approveRun refuses
 * any promotion without a human-approval proof and a passing promotion gate.
 */

const crypto = require('crypto');
const strategyContracts = require('./strategyContractService');
const events = require('./strategyExecutionEvents');
const progress = require('./strategyExecutionProgress');
const promotionGate = require('./strategyPromotionGate');
const selfModel = require('./selfModelService');
const survivalState = require('./survivalStateService');
const { evaluateReportWithAeis } = require('./epistemic/aeisPromotionBridge');
const { listVerifierDigests } = require('./verifierTrustRegistry');
const immuneMemoryRepository = require('./epistemic/immuneMemoryRepository');

function normalizedBudget(input) {
  const source = input || {};
  return Object.fromEntries(Object.entries(events.DEFAULT_BUDGET).map(([key, fallback]) => {
    const value = Number(source[key]);
    const zeroTokenBudget = key === 'tokens' && source.deterministic === true && value === 0;
    return [key, zeroTokenBudget ? 0 : Number.isFinite(value) && value > 0 ? value : fallback];
  }));
}

function compileExecutionPlan(contract, budgetInput) {
  const budget = normalizedBudget(budgetInput);
  const pipeline = contract.execution_pipeline || [];
  const strategyIds = (contract.strategy_portfolio || []).map((item) => item.id);
  return {
    budget,
    steps: pipeline.map((stageKey, sequence) => ({
      sequence,
      stageKey,
      strategyIds,
      plannedBudget: Object.fromEntries(Object.entries(budget).map(([key, value]) => [key, Number((value / Math.max(pipeline.length, 1)).toFixed(3))]))
    }))
  };
}

async function createExecutionRun(db, context) {
  const contractRecord = context.contractRecord || await strategyContracts.getLatestContract(db, context.agentId);
  if (!contractRecord) throw new Error(`No strategy contract for agent ${context.agentId}`);
  const plan = compileExecutionPlan(contractRecord.contract, context.budget);
  const id = `strategy_run_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  await db.run(
    `INSERT INTO strategy_execution_runs (id, agent_id, contract_id, contract_version, status, budget_json, metrics_json)
     VALUES (?, ?, ?, ?, 'planned', ?, ?)`,
    id, context.agentId, contractRecord.id, contractRecord.version, JSON.stringify(plan.budget),
    JSON.stringify({ tokens: 0, costUsd: 0, latencyMs: 0, events: 0 })
  );
  for (const step of plan.steps) {
    await db.run(
      `INSERT INTO strategy_execution_steps (id, run_id, sequence, stage_key, strategy_ids_json, planned_budget_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      `${id}_step_${step.sequence + 1}`, id, step.sequence, step.stageKey,
      JSON.stringify(step.strategyIds), JSON.stringify(step.plannedBudget)
    );
  }
  return events.getRun(db, id);
}

async function fallbackAfterProgress(db, progress, agentId) {
  if (!progress.failed && !progress.guardrailReason) return null;
  try {
    const adaptation = require('./strategyAdaptationService');
    return await adaptation.useFallbackStrategyIfPrimaryFailed(db, agentId);
  } catch (error) {
    return { changed: false, error: error.message };
  }
}

async function calibrateSelfModel(db, runId) {
  try {
    await selfModel.calibrate(db, runId);
  } catch (_) {}
}

async function sustainReverberation(db, agentId, event) {
  try {
    await require('./reverberationService').updateFromEvent(db, agentId, event);
  } catch (_) {}
}

async function recordExecutionEvent(db, agentId, event) {
  const saved = await progress.recordExecutionEvent(db, agentId, event);
  if (!saved) return null;
  const fallback = await fallbackAfterProgress(db, saved, agentId);
  if (['completed', 'failed', 'blocked', 'cancelled'].includes(saved.run.status)) {
    await calibrateSelfModel(db, saved.run.id);
    await sustainReverberation(db, agentId, event);
  }
  const survival = await observeSurvivalEvent({ db, agentId, event, run: saved.run });
  return { run: saved.run, halt: saved.halt, reason: saved.reason, fallback, survival };
}

async function observeSurvivalEvent({ db, agentId, event, run }) {
  const metrics = run.metrics || {};
  const payload = event.payload || {};
  try {
    return await survivalState.observe(db, agentId, {
      tokens: metrics.tokens,
      activeWorkers: payload.activeWorkers ?? metrics.workersActive ?? 0,
      recentFailures: payload.recentFailures ?? (['failed', 'blocked', 'cancelled'].includes(run.status) ? 1 : 0),
      uncertainty: payload.uncertainty,
      threatLevel: payload.threatLevel,
      integrity: payload.integrity,
      workspaceId: payload.workspaceId
    });
  } catch (error) {
    return { recorded: false, code: error.code || 'SURVIVAL_OBSERVATION_FAILED', error: error.message };
  }
}

async function evaluateAeisPromotion(db, request) {
  const { promotion, id } = request;
  const workspace = await db.get(
    'SELECT w.id, w.path, w.organization_id, w.project_id FROM agents a JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ?',
    promotion.agentId,
  );
  if (!workspace?.path) throw new Error(`Execution run ${id} has no trusted workspace for AEIS verification.`);
  const scopeId = [workspace.organization_id || 'local', workspace.project_id || 'local', workspace.id].join(':');

  let aeisEvaluation = null;
  const immuneMemory = await immuneMemoryRepository.load(db, scopeId);
  try {
    aeisEvaluation = await evaluateReportWithAeis(promotion.report, {
      domain: promotion.contract?.problem_profile?.domain || 'general',
      trustedVerifierDigests: listVerifierDigests(),
      immuneMemory,
      db,
      multiProviderEnabled: promotion.contract?.problem_profile?.multi_provider_verification === true,
      providerAllowlist: promotion.contract?.problem_profile?.aeis_provider_allowlist || [],
      maxVerifierExecutions: promotion.contract?.problem_profile?.aeis_max_verifier_executions,
      scopeId, runId: id,
      allowedWorkspaceRoot: workspace.path,
    });
  } catch (error) {
    throw new Error(`Execution run ${id} AEIS verification failed: ${error.message}`, { cause: error });
  }
  await require('./epistemic/immuneMemoryOutcome').persistEvaluatedMemory(db, {
    report: promotion.report, domain: promotion.contract?.problem_profile?.domain || 'general',
    evaluation: aeisEvaluation, immuneMemory, runId: id, scopeId,
  });
  return aeisEvaluation;
}

async function approveRun(db, id, options) {
  const settings = options || {};
  const row = await db.get('SELECT * FROM strategy_execution_runs WHERE id = ?', id);
  if (!row) throw new Error(`Execution run ${id} not found`);
  if (row.status !== 'awaiting_approval') throw new Error(`Execution run ${id} is not awaiting approval`);
  const promotion = await promotionGate.loadPromotionContext(db, row, settings);
  if (!promotion.report) throw new Error(`Execution run ${id} cannot be promoted without an evidence report.`);
  const receipt = promotionGate.assertApprovalProof(promotion, settings, id);
  await promotionGate.assertPromotionContainment(db, promotion, settings);
  const aeisEvaluation = await evaluateAeisPromotion(db, { promotion, id });
  const gateContext = promotionGate.buildGateContext({ promotion, options: settings, receipt, aeisEvaluation });
  const model = await selfModel.load(db, promotion.agentId, { mission: settings });
  selfModel.assertPromotionConstraints(model, gateContext);
  promotionGate.assertPromotionGate(promotion.contract, gateContext);
  const primitives = events.resolveStagePrimitives('conditional_promotion', promotion.contract.strategy_portfolio);
  const promotionResult = await promotionGate.runPromotionPipeline(promotion, primitives, aeisEvaluation);
  if (!promotionResult.success) throw new Error(`Execution run ${id} promotion failed: ${promotionResult.error || 'unknown error'}`);
  if (promotionResult.controlRegulation?.arbitration?.status === 'blocked') {
    throw new Error(`Execution run ${id} AEIS homeostatic rearbitration blocked promotion.`);
  }
  await db.run('UPDATE strategy_execution_runs SET metrics_json = ? WHERE id = ?', JSON.stringify({
    ...events.safeJson(row.metrics_json, {}),
    aeisPressure: promotionResult.controlRegulation?.homeostasis?.pressure ?? null,
    aeisEvidenceScore: promotionResult.controlRegulation?.feedback?.evidenceScore ?? null,
  }), id);
  await promotionGate.applyPostPromotion(db, promotion, settings);
  await promotionGate.finalizePromotion(db, promotion, settings);
  await selfModel.calibrate(db, id);
  return events.getRun(db, id);
}

module.exports = {
  createExecutionRun,
  hydrateRun: (db, row) => events.hydrateRun(db, row),
  recordExecutionEvent,
  executeStepPrimitives: (db, agentId, options) => events.executeStepPrimitives(db, agentId, options),
  executePipelineWithFeedback: (primitives, context) => require('./strategyExecutionAdapter').executePipelineWithFeedback(primitives, context),
  executePrimitive: (primitive, context) => require('./strategyExecutionAdapter').executePrimitive(primitive, context),
  approveRun,
  getRun: (db, id) => events.getRun(db, id),
  getLatestRun: (db, agentId) => events.getLatestRun(db, agentId),
  listRuns: (db, agentId, requestedLimit) => events.listRuns(db, agentId, requestedLimit),
  MAX_RUN_LIST_LIMIT: events.MAX_RUN_LIST_LIMIT,
  parseRun: (row, steps) => events.parseRun(row, steps || []),
  compileExecutionPlan,
  metricDelta: (payload) => events.metricDelta(payload || {}),
  normalizedBudget,
  unfinishedPhaseReason: (steps, index) => events.unfinishedPhaseReason(steps, index),
  primitiveFailureReason: (step, result) => events.primitiveFailureReason(step, result),
  resolveStagePrimitives: (stageKey, portfolio, options) => events.resolveStagePrimitives(stageKey, portfolio, options),
  STAGE_PRIMITIVE_MAP: events.STAGE_PRIMITIVE_MAP,
  get strategyExecutionAdapter() { return require('./strategyExecutionAdapter'); }
};
