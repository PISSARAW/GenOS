'use strict';

const crypto = require('node:crypto');
const { AdaptiveStateService } = require('./adaptiveStateService');

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

module.exports = { SCOPE, planScenarios };
