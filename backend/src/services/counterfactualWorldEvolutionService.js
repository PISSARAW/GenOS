'use strict';

const crypto = require('node:crypto');
const { AdaptiveStateService } = require('./adaptiveStateService');
const { getResponsibility } = require('./shev/responsibilityService');

const SCOPE = 'counterfactual_world_evolution';
const MAX_PLANS = 20;
const MIN_CANDIDATES = 2;
const MAX_CANDIDATES = 4;

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function probability(value, field) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new TypeError(`${field} must be between 0 and 1.`);
  }
  return parsed;
}

function finiteNumber(value, field) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new TypeError(`${field} must be finite.`);
  return parsed;
}

function baselineOf(input) {
  const baseline = input?.baseline;
  if (!baseline || !nonEmpty(baseline.evidenceRef) || !nonEmpty(baseline.metric)
    || !nonEmpty(baseline.observedAt)) {
    throw new TypeError('World evolution requires an observed baseline with provenance.');
  }
  return { evidenceRef: baseline.evidenceRef.trim(), metric: baseline.metric.trim(),
    value: finiteNumber(baseline.value, 'baseline.value'), observedAt: baseline.observedAt,
    realityMode: 'real' };
}

function validateCandidates(input, baseline) {
  const candidates = input?.candidates;
  if (!Array.isArray(candidates)
    || candidates.length < MIN_CANDIDATES || candidates.length > MAX_CANDIDATES) {
    throw new TypeError('World evolution requires 2-4 counterfactual candidates.');
  }
  const ids = new Set();
  for (const candidate of candidates) {
    if (!candidate || !nonEmpty(candidate.id) || !nonEmpty(candidate.action)
      || !nonEmpty(candidate.horizon) || !nonEmpty(candidate.requiredPermission)) {
      throw new TypeError('Each candidate requires id, action, horizon and requiredPermission.');
    }
    if (ids.has(candidate.id)) throw new TypeError('Candidate ids must be distinct.');
    if (candidate.metric !== baseline.metric || candidate.horizon !== input.horizon) {
      throw new TypeError('Candidate predictions must share the baseline metric and horizon.');
    }
    ids.add(candidate.id);
  }
}

function branchOf(planId, candidate, baseline) {
  const predictedValue = finiteNumber(candidate.predictedValue, 'candidate.predictedValue');
  return { branchId: candidate.id, action: candidate.action.trim(),
    isolationNamespace: `${planId}::${candidate.id}`, realityMode: 'counterfactual',
    origin: 'counterfactual_simulated', synthetic: true,
    evidenceClass: 'simulation', promotionAllowed: false,
    requiredPermission: candidate.requiredPermission,
    prediction: { metric: baseline.metric, horizon: candidate.horizon,
      baselineValue: baseline.value, value: predictedValue,
      delta: predictedValue - baseline.value,
      probability: probability(candidate.predictedProbability, 'candidate.predictedProbability') },
    risk: probability(candidate.risk, 'candidate.risk'),
    cost: finiteNumber(candidate.cost, 'candidate.cost') };
}

function planIdOf(input) {
  if (nonEmpty(input.planId)) return input.planId.trim();
  return `world-plan-${crypto.randomUUID()}`;
}

async function persistPlan(db, plan) {
  if (!db) return;
  const store = new AdaptiveStateService(db);
  const state = (await store.restoreObject(SCOPE, plan.projectId)) || {};
  const plans = Array.isArray(state.plans) ? state.plans : [];
  await store.persistObject(SCOPE, plan.projectId,
    { ...state, plans: [...plans, plan].slice(-MAX_PLANS) }, plans.length + 1);
}

async function loadState(db, projectId) {
  if (!db) return {};
  return (await new AdaptiveStateService(db).restoreObject(SCOPE, projectId)) || {};
}

function permissionGranted(responsibility, required) {
  if (!responsibility || responsibility.status !== 'active') return false;
  if (required === 'observe') return true;
  if (required === 'diagnose') return responsibility.mandate.autoDiagnose === true;
  if (required === 'instrument') return responsibility.mandate.autoInstrument === true;
  if (required === 'delegated_action') return responsibility.stage === 'delegated';
  return false;
}

function policyOf(input) {
  const policy = input?.policy || {};
  return { maxRisk: probability(policy.maxRisk, 'policy.maxRisk'),
    maxCost: finiteNumber(policy.maxCost, 'policy.maxCost'),
    riskWeight: finiteNumber(policy.riskWeight ?? 1, 'policy.riskWeight'),
    costWeight: finiteNumber(policy.costWeight ?? 1, 'policy.costWeight'),
    minUtility: finiteNumber(policy.minUtility ?? 0, 'policy.minUtility') };
}

function evaluateBranch(branch, context) {
  const permitted = permissionGranted(context.responsibility, branch.requiredPermission);
  const withinRisk = branch.risk <= context.policy.maxRisk;
  const withinCost = branch.cost <= context.policy.maxCost;
  const normalizedCost = context.policy.maxCost > 0 ? branch.cost / context.policy.maxCost : 1;
  const utility = branch.prediction.delta * branch.prediction.probability
    - context.policy.riskWeight * branch.risk - context.policy.costWeight * normalizedCost;
  return { branchId: branch.branchId, action: branch.action,
    permitted, withinRisk, withinCost, utility: Math.round(utility * 1000000) / 1000000,
    eligible: permitted && withinRisk && withinCost };
}

function responsibilityRef(responsibility) {
  return { projectId: responsibility.projectId, authorityRef: responsibility.authorityRef,
    mandateVersion: responsibility.mandateVersion, stage: responsibility.stage };
}

function chooseEvaluation(evaluations, policy) {
  const eligible = evaluations.filter((item) => item.eligible && item.utility >= policy.minUtility)
    .sort((left, right) => right.utility - left.utility || left.branchId.localeCompare(right.branchId));
  return eligible[0] || null;
}

async function persistDecision(db, projectId, state, decision) {
  if (!db) return;
  const decisions = Array.isArray(state.decisions) ? state.decisions : [];
  await new AdaptiveStateService(db).persistObject(SCOPE, projectId,
    { ...state, decisions: [...decisions, decision].slice(-MAX_PLANS) }, decisions.length + 1);
}

async function decideAction(db, input) {
  if (!nonEmpty(input?.projectId) || !nonEmpty(input?.planId)) {
    throw new TypeError('World evolution decision requires projectId and planId.');
  }
  const state = await loadState(db, input.projectId);
  const plan = (state.plans || []).find((item) => item.planId === input.planId);
  if (!plan) throw new Error('Counterfactual world plan was not found.');
  const responsibility = await getResponsibility(db, input.projectId);
  if (!responsibility || responsibility.status !== 'active') {
    throw new Error('An active persistent SHEV responsibility is required.');
  }
  const policy = policyOf(input);
  const evaluations = plan.branches.map((branch) => evaluateBranch(branch, { policy, responsibility }));
  const selected = chooseEvaluation(evaluations, policy);
  const decision = { schema: 'genos.counterfactual-world-decision/v1',
    decisionId: `world-decision-${crypto.randomUUID()}`, planId: plan.planId,
    projectId: input.projectId, outcome: selected ? 'PROPOSE_ACTION' : 'ABSTAIN',
    selectedBranchId: selected?.branchId || null, evaluations,
    responsibility: responsibilityRef(responsibility), promotionAllowed: false,
    requiredNextEvidence: 'independent_real_observation',
    decidedAt: input.now || new Date().toISOString() };
  await persistDecision(db, input.projectId, state, decision);
  return decision;
}

async function planScenarios(db, input) {
  if (!nonEmpty(input?.projectId) || !nonEmpty(input?.plannerAgentId)
    || !nonEmpty(input?.horizon)) {
    throw new TypeError('World evolution requires projectId, plannerAgentId and horizon.');
  }
  const baseline = baselineOf(input);
  validateCandidates(input, baseline);
  const planId = planIdOf(input);
  const branches = input.candidates.map((candidate) => branchOf(planId, candidate, baseline));
  const plan = { schema: 'genos.counterfactual-world-plan/v1', planId,
    projectId: input.projectId, plannerAgentId: input.plannerAgentId,
    baseline, horizon: input.horizon, branches,
    status: 'synthetic_only', promotionAllowed: false,
    requiredNextEvidence: 'independent_real_observation',
    createdAt: input.now || new Date().toISOString() };
  await persistPlan(db, plan);
  return plan;
}

module.exports = { SCOPE, planScenarios, decideAction };
