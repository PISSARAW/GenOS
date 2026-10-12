'use strict';

const { quoteActionCost, KINDS } = require('./actionCostQuoteService');
const { validate: validateContract } = require('./missionOutcomeContract');

const ACTIVE_KINDS = new Set([...KINDS].filter((kind) => kind !== 'none' && kind !== 'abstain'));
const METRICS = ['tokens', 'usd', 'latencyMs'];

function validateBudget(budget) {
  for (const metric of METRICS) {
    if (!Number.isFinite(budget?.[metric]) || budget[metric] < 0) {
      throw new RangeError(`Available ${metric} budget must be finite and nonnegative.`);
    }
  }
}

function validateWeights(weights) {
  for (const metric of METRICS) {
    if (!Number.isFinite(weights?.[metric]) || weights[metric] < 0) {
      throw new RangeError(`Policy ${metric} weight must be finite and nonnegative.`);
    }
  }
  const sum = METRICS.reduce((total, metric) => total + weights[metric], 0);
  if (Math.abs(sum - 1) > 1e-9) throw new RangeError('Policy weights must sum to one.');
}

function validateInput(input) {
  validateContract(input?.contract);
  if (typeof input.missionId !== 'string' || !input.missionId.trim()) {
    throw new TypeError('A missionId is required.');
  }
  if (!Array.isArray(input.actions)) throw new TypeError('Actions must be an array.');
  validateBudget(input.budget);
  validateWeights(input.policy?.weights);
  const ids = new Set();
  for (const action of input.actions) {
    if (typeof action?.id !== 'string' || !action.id.trim() || ids.has(action.id)) {
      throw new TypeError('Action IDs must be unique nonempty strings.');
    }
    if (!ACTIVE_KINDS.has(action.kind)) throw new TypeError('Unsupported active action kind.');
    ids.add(action.id);
  }
}

function openObligations(input, adapters) {
  const ids = input.contract.obligations.map((obligation) => obligation.id);
  const outcome = input.outcome;
  if (outcome?.status !== 'verified' && outcome?.status !== 'abstained') return ids;
  if (adapters.verifyOutcome?.(outcome, input.contract) !== true) return ids;
  if (outcome.status === 'verified') return [];
  return ids;
}

function quoteFor(action) {
  try {
    return quoteActionCost({ ...action.cost, id: action.id, kind: action.kind });
  } catch (error) {
    return { id: action.id, kind: action.kind, status: 'invalid', missing: [error.message] };
  }
}

function hasBudget(quote, budget) {
  return METRICS.every((metric) => quote.reservationRequired[metric] <= budget[metric]);
}

function calibrationOf(action, input, adapters) {
  const receipt = action.calibrationReceipt;
  const probability = receipt?.probabilityVerified;
  if (!probability || !Number.isFinite(probability.min) || !Number.isFinite(probability.max)
      || probability.min < 0 || probability.max > 1 || probability.min > probability.max) return null;
  if (adapters.verifyCalibration?.(receipt, { action, missionId: input.missionId,
    goal: input.contract.goal }) !== true) return null;
  return probability;
}

function evidenceReady(action, input, adapters) {
  if (!Array.isArray(action.covers) || !action.covers.length) return false;
  const obligations = new Set(input.contract.obligations.map((item) => item.id));
  if (!action.covers.every((id) => obligations.has(id))) return false;
  const required = action.requiredEvidenceRefs || [];
  if (!Array.isArray(required)) return false;
  return required.every((ref) => typeof ref === 'string' && ref.length > 0
    && adapters.verifyEvidence?.(ref, input.contract) === true);
}

function costPenalty(quote, input) {
  return METRICS.reduce((total, metric) => {
    const maximum = quote.total[metric].max;
    const available = input.budget[metric];
    return total + input.policy.weights[metric] * (available === 0 ? 0 : maximum / available);
  }, 0);
}

function ineligibilityReason(action, quote, context) {
  const { input, adapters, open } = context;
  if (!open.length) return 'mission_already_verified';
  if (!action.covers?.some((id) => open.includes(id))) return 'no_open_obligation';
  if (adapters.verifyAuthority?.(action, input.contract) !== true) return 'authority_unverified';
  if (!evidenceReady(action, input, adapters)) return 'evidence_unverified';
  if (quote.status !== 'complete') return 'cost_incomplete';
  if (!hasBudget(quote, input.budget)) return 'budget_exceeded';
  return null;
}

function activeAlternative(action, context) {
  const { input, adapters } = context;
  const quote = quoteFor(action);
  let reason = ineligibilityReason(action, quote, context);
  const probability = reason ? null : calibrationOf(action, input, adapters);
  if (!reason && !probability) reason = 'calibration_unverified';
  const score = reason ? null : probability.min / (1 + costPenalty(quote, input));
  return { id: action.id, kind: action.kind, eligible: !reason, reason, quote,
    probabilityVerified: probability, score };
}

function terminalAlternative(kind, input, adapters) {
  const expected = kind === 'none' ? 'verified' : 'abstained';
  const valid = input.outcome?.status === expected
    && adapters.verifyOutcome?.(input.outcome, input.contract) === true;
  const quote = quoteActionCost({ kind, inactionRisk: { probability: 0, impact: 0 } });
  return { id: kind, kind, eligible: valid, reason: valid ? null : 'terminal_outcome_unverified',
    quote, probabilityVerified: valid ? { min: kind === 'none' ? 1 : 0,
      max: kind === 'none' ? 1 : 0 } : null, score: valid ? (kind === 'none' ? 1 : 0) : null };
}

function rank(left, right) {
  if (left.score !== right.score) return right.score - left.score;
  if (left.quote.total.tokens.max !== right.quote.total.tokens.max) {
    return left.quote.total.tokens.max - right.quote.total.tokens.max;
  }
  return left.id.localeCompare(right.id);
}

function decideMissionAction(input, adapters = {}) {
  validateInput(input);
  const open = openObligations(input, adapters);
  const alternatives = [terminalAlternative('none', input, adapters),
    terminalAlternative('abstain', input, adapters),
    ...input.actions.map((action) => activeAlternative(action, { input, adapters, open }))];
  const eligible = alternatives.filter((alternative) => alternative.eligible).sort(rank);
  const selected = eligible[0] || null;
  return {
    status: selected ? 'shadow' : 'need_evidence', missionId: input.missionId,
    goal: input.contract.goal, openObligations: open, selectedId: selected?.id || null,
    alternatives, objective: 'lower_bound_verified_probability_per_normalized_complete_cost',
    executable: false,
    journal: { missionId: input.missionId, selectedId: selected?.id || null,
      alternatives: alternatives.map((option) => ({ id: option.id, kind: option.kind,
        eligible: option.eligible, reason: option.reason, score: option.score,
        reservationRequired: option.quote.reservationRequired || null })) }
  };
}

module.exports = { decideMissionAction };
