'use strict';

const { AdaptiveStateService } = require('./adaptiveStateService');

const SCOPE = 'orchestrator_self_model';
const HISTORY_LIMIT = 12;
const DEFAULTS = Object.freeze({ confidence: 0.58, evidenceStrictness: 0.82, riskTolerance: 0.35, maxBlastRadius: 0.4 });
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'blocked', 'cancelled']);

function clamp(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function parseJson(value, fallback = {}) {
  try { return JSON.parse(value || ''); } catch (_) { return fallback; }
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function runMetrics(row) {
  return { status: row.status, budget: parseJson(row.budget_json), metrics: parseJson(row.metrics_json), guardrailReason: row.guardrail_reason };
}

function biasMetrics(runs) {
  const completed = runs.filter((run) => run.status === 'completed');
  const failed = runs.filter((run) => ['failed', 'blocked', 'cancelled'].includes(run.status));
  const overBudget = runs.filter((run) => Number(run.metrics.tokens || 0) > Number(run.budget.tokens || Infinity));
  const prematurePromotions = completed.filter((run) => Boolean(run.guardrailReason));
  return {
    overDelegation: clamp(average(runs.map((run) => Number(run.metrics.workersSpawned || 0) >= 4 && Number(run.metrics.evidenceScore || 0) < 0.5 ? 1 : 0))),
    prematurePromotion: clamp(prematurePromotions.length / Math.max(completed.length, 1)),
    strategyChurn: clamp(failed.length / Math.max(runs.length, 1)),
    budgetMyopia: clamp(overBudget.length / Math.max(runs.length, 1))
  };
}

function knownWeaknesses(biases) {
  const weaknesses = [];
  if (biases.overDelegation >= 0.25) weaknesses.push('over-delegates when uncertainty is high');
  if (biases.prematurePromotion >= 0.1) weaknesses.push('needs replay before promotion on runtime changes');
  if (biases.strategyChurn >= 0.35) weaknesses.push('changes strategy before evidence improves');
  if (biases.budgetMyopia >= 0.25) weaknesses.push('consumes budget too quickly before evidence');
  return weaknesses;
}

function profileFrom(context) {
  return context.plan?.profile || {};
}

function budgetFrom(context) {
  return context.plan?.tokenPolicy || context.mission?.executionBudget || {};
}

function totalTokensFrom(budget) {
  return Number(budget.total || budget.tokens || 0);
}

function lowBudgetStress(totalTokens) {
  return totalTokens > 0 && totalTokens < 8000 ? 0.75 : 0;
}

function stateFrom(context, learned, biases) {
  const profile = profileFrom(context);
  const totalTokens = totalTokensFrom(budgetFrom(context));
  const confidence = clamp(learned.confidence, DEFAULTS.confidence);
  const uncertainty = clamp(profile.uncertainty, 0.5);
  const fatigue = clamp((learned.recentRuns || 0) / HISTORY_LIMIT);
  const stress = clamp(Math.max(uncertainty, biases.strategyChurn, lowBudgetStress(totalTokens)));
  return { energy: clamp(1 - fatigue * 0.55 - stress * 0.25, 0.5), stress, confidence, uncertainty, dissonance: clamp(Math.abs(confidence - (1 - uncertainty))), fatigue, integrity: clamp(1 - biases.prematurePromotion * 0.6 - biases.strategyChurn * 0.25, 0.8) };
}

function decisionPolicy(state, biases) {
  const cautious = state.confidence < 0.5 && state.uncertainty >= 0.5;
  const fanoutPenalty = Math.max(biases.overDelegation, state.fatigue >= 0.65 ? 0.5 : 0);
  return {
    riskTolerance: clamp(DEFAULTS.riskTolerance - state.stress * 0.15),
    evidenceStrictness: clamp(DEFAULTS.evidenceStrictness + biases.prematurePromotion * 0.18 + (state.integrity < 0.7 ? 0.1 : 0)),
    workerFanoutBias: Number((1 - fanoutPenalty).toFixed(3)),
    strategyInertia: clamp(0.35 + biases.strategyChurn * 0.4),
    preferredRecoveryMode: state.integrity < 0.7 ? 'repair_quarantine' : cautious ? 'cautious_probe_then_branch' : 'evidence_gated_execution',
    attentionFocus: state.uncertainty >= 0.6 ? 'targeted_diagnostics' : 'execution_evidence',
    humanEscalationThreshold: clamp(0.72 - state.confidence * 0.2 + state.stress * 0.15),
    requireReplayBeforePromotion: state.integrity < 0.8 || biases.prematurePromotion >= 0.1,
    requireIndependentEvidence: cautious || state.stress >= 0.75
  };
}

function assessment(state, habits, policy) {
  return [`I am in ${state.uncertainty >= 0.6 ? 'high' : 'managed'} uncertainty with ${state.energy >= 0.5 ? 'usable' : 'constrained'} energy.`, habits.knownWeaknesses.length ? `Known weakness: ${habits.knownWeaknesses[0]}.` : 'No recurrent operational weakness is above the intervention threshold.', `Current recommended posture: ${policy.preferredRecoveryMode}.`];
}

function habitsFrom(biases) {
  return { preferredStrategies: { unknown_cause_bug: 'falsification_forks', security: 'red_blue_coevolution', implementation: 'n_way_counterfactual_fork' }, knownWeaknesses: knownWeaknesses(biases), knownStrengths: ['phase-gated evidence', 'isolating worker failures'], biases };
}

async function mergeLearned(db, agentId, patch) {
  const learned = await stateStore(db).restoreObject(SCOPE, agentId) || {};
  const next = { ...learned, ...(patch || {}) };
  await stateStore(db).persistObject(SCOPE, agentId, next, Number(learned.calibration?.observations) || 0);
  return next;
}

function identityFrom(agent) {
  return { role: agent.role || 'Project Orchestrator', executionMode: agent.execution_mode || 'orchestrator', workspaceId: agent.workspace_id || null };
}

function capabilitiesFrom(context, plan) {
  return { availableConcepts: ['Observe', 'Replay', 'Recruit', 'Delegate', 'Immune'], toolLease: context.mission?.toolLease || plan.requiredTools || [], topologies: ['trinity', 'a_team', 'rhizome'], modelTier: 'frontier' };
}

function limitsFrom(context, plan, policy) {
  return { tokenBudget: Number(plan.tokenPolicy?.total || context.mission?.executionBudget?.tokens || 0), workerLimit: Number(plan.workers?.length || 0), riskTolerance: policy.riskTolerance, evidenceStrictness: policy.evidenceStrictness, maxBlastRadius: DEFAULTS.maxBlastRadius };
}

function buildModel(input) {
  const { agent, context, learned, runs } = input;
  const biases = biasMetrics(runs);
  const state = stateFrom(context, learned, biases);
  const policy = decisionPolicy(state, biases);
  const plan = context.plan || {};
  const habits = habitsFrom(biases);
  if (Array.isArray(learned.extraWeaknesses)) {
    habits.knownWeaknesses = [...habits.knownWeaknesses, ...learned.extraWeaknesses.slice(0, 3)];
  }
  return {
    schema: 'genos.orchestrator-self-model/v1alpha1', agentId: agent.id,
    identity: identityFrom(agent), capabilities: capabilitiesFrom(context, plan), limits: limitsFrom(context, plan, policy),
    state, habits, decisionPolicy: policy, selfAssessment: assessment(state, habits, policy), calibration: learned.calibration || { observations: 0, meanAbsoluteError: 0 }
  };
}

function stateStore(db) {
  return new AdaptiveStateService(db);
}

async function ensureStorage(db) {
  await db.run("CREATE TABLE IF NOT EXISTS adaptive_state (scope TEXT NOT NULL, key TEXT NOT NULL, payload_json TEXT NOT NULL DEFAULT '{}', version INTEGER NOT NULL DEFAULT 1, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (scope, key))");
  await db.run("CREATE TABLE IF NOT EXISTS adaptive_state_events (id INTEGER PRIMARY KEY AUTOINCREMENT, scope TEXT NOT NULL, key TEXT NOT NULL, event_type TEXT NOT NULL, event_payload TEXT NOT NULL DEFAULT '{}', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
}

async function load(db, agentId, context = {}) {
  await ensureStorage(db);
  const agent = await db.get('SELECT id, role, execution_mode, workspace_id FROM agents WHERE id = ?', agentId);
  if (!agent) throw new Error(`Agent ${agentId} was not found for self-model construction`);
  const [learned, rows] = await Promise.all([stateStore(db).restoreObject(SCOPE, agentId), db.all('SELECT status, budget_json, metrics_json, guardrail_reason FROM strategy_execution_runs WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?', agentId, HISTORY_LIMIT)]);
  return buildModel({ agent, context, learned: learned || {}, runs: rows.map(runMetrics) });
}

function calibrationUpdate(learned, row) {
  const budget = parseJson(row.budget_json);
  const metrics = parseJson(row.metrics_json);
  const expectedSuccess = clamp(learned.expectedSuccess, DEFAULTS.confidence);
  const actualSuccess = row.status === 'completed' ? 1 : 0;
  const expectedCost = clamp(learned.expectedCost, 0.5);
  const actualCost = clamp(Number(metrics.tokens || 0) / Math.max(Number(budget.tokens || 1), 1));
  const error = Math.abs(expectedSuccess - actualSuccess) + Math.abs(expectedCost - actualCost);
  const observations = Number(learned.calibration?.observations || 0) + 1;
  const meanAbsoluteError = ((Number(learned.calibration?.meanAbsoluteError || 0) * (observations - 1)) + error / 2) / observations;
  return { ...learned, recentRuns: Math.min(HISTORY_LIMIT, Number(learned.recentRuns || 0) + 1), confidence: clamp(expectedSuccess + (actualSuccess - expectedSuccess) * 0.2), expectedSuccess: clamp(expectedSuccess + (actualSuccess - expectedSuccess) * 0.2), expectedCost: clamp(expectedCost + (actualCost - expectedCost) * 0.2), calibration: { observations, meanAbsoluteError: Number(meanAbsoluteError.toFixed(4)), lastRunId: row.id, lastRunStatus: row.status, lastActualCost: Number(actualCost.toFixed(4)) } };
}

async function appendCalibrationEvent(db, row, calibration) {
  await db.run(`INSERT INTO adaptive_state_events
    (scope, key, event_type, event_payload) VALUES (?, ?, ?, ?)`,
    SCOPE, row.agent_id, 'self_model_calibrated', JSON.stringify({ runId: row.id, status: row.status, calibration }));
}

async function recordRunAttribution(db, learned, row) {
  try {
    const expected = clamp(learned.expectedSuccess, DEFAULTS.confidence);
    const actual = row.status === 'completed' ? 1 : 0;
    const metrics = parseJson(row.metrics_json);
    const delegated = Number(metrics.workersSpawned || metrics.workersActive || 0) > 0;
    const coreSelf = require('./coreSelfService');
    await coreSelf.recordAttribution(db, row.agent_id, {
      actionId: row.id,
      attributedToSelf: !delegated,
      predictionError: Math.abs(expected - actual)
    });
  } catch (_) {}
}

async function calibrate(db, runId) {
  await ensureStorage(db);
  const row = await db.get('SELECT id, agent_id, status, budget_json, metrics_json FROM strategy_execution_runs WHERE id = ?', runId);
  if (!row) throw new Error(`Execution run ${runId} was not found for self-model calibration`);
  if (!TERMINAL_STATUSES.has(row.status)) throw Object.assign(new Error(`Self-model calibration requires a terminal run status, got '${row.status}'.`), { code: 'SELF_MODEL_NON_TERMINAL_RUN' });
  const learned = await stateStore(db).restoreObject(SCOPE, row.agent_id) || {};
  if (learned.calibration?.lastRunId === row.id) return learned.calibration;
  const next = calibrationUpdate(learned, row);
  await stateStore(db).persistObject(SCOPE, row.agent_id, next, next.calibration.observations);
  await appendCalibrationEvent(db, row, next.calibration);
  await recordRunAttribution(db, learned, row);
  return next.calibration;
}

function applyToMission(mission, model, plan) {
  const workers = plan.dispatchWorkers?.length || 0;
  const workerLimit = model.decisionPolicy.workerFanoutBias >= 0.75 ? workers : Math.max(1, workers - 1);
  mission.selfAssessment = model.selfAssessment;
  mission.selfModelPolicy = model.decisionPolicy;
  if (workers && workerLimit < workers) plan.survival.constraints.maxWorkerFanout = Math.min(plan.survival.constraints.maxWorkerFanout ?? workerLimit, workerLimit);
  if (model.decisionPolicy.requireReplayBeforePromotion) mission.requiresReplayBeforePromotion = true;
  if (model.decisionPolicy.requireIndependentEvidence) mission.requiresEvidenceBeforePromotion = true;
  return model;
}

function replayPassed(context) {
  if (context.replayVerified === true || context.diffAndReplayPassed === true) return true;
  const receipt = context.replayReceipt || {};
  return receipt.success === true && ['verified', 'completed', 'reproduced', 'success'].includes(String(receipt.status || '').toLowerCase());
}

function hasIndependentEvidence(context) {
  if (context.evidenceVerified === true || context.independentVerification === true) return true;
  const claims = context.report?.claims;
  return Array.isArray(claims) && claims.length > 0 && claims.every((claim) => Array.isArray(claim.evidence) && claim.evidence.length > 0);
}

function assertPromotionConstraints(model, context) {
  if (model.decisionPolicy.requireReplayBeforePromotion && !replayPassed(context)) {
    throw Object.assign(new Error('Self-model requires replay verification before promotion.'), { code: 'SELF_MODEL_REPLAY_REQUIRED' });
  }
  if (model.decisionPolicy.requireIndependentEvidence && !hasIndependentEvidence(context)) {
    throw Object.assign(new Error('Self-model requires independent evidence before promotion.'), { code: 'SELF_MODEL_EVIDENCE_REQUIRED' });
  }
}

module.exports = { SCOPE, load, calibrate, applyToMission, assertPromotionConstraints, biasMetrics, mergeLearned };
