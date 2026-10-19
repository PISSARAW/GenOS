'use strict';

const crypto = require('node:crypto');

const MODES = Object.freeze({ ACT: 'ACT', OBSERVE: 'OBSERVE', LEARN: 'LEARN', NO_CHANGE: 'NO_CHANGE' });

function coded(code, message) {
  return Object.assign(new Error(message), { code });
}

function required(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw coded('TRAJECTORY_STEWARDSHIP_INVALID', `${field} must be a non-empty string.`);
  }
  return value.trim();
}

function score(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) {
    throw coded('TRAJECTORY_STEWARDSHIP_INVALID', `${field} must be between zero and one.`);
  }
  return number;
}

function boundedInteger(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw coded('TRAJECTORY_STEWARDSHIP_INVALID', `${field} must be a bounded non-negative integer.`);
  }
  return value;
}

function normalizedDomains(domains) {
  if (!Array.isArray(domains) || domains.length < 1) {
    throw coded('TRAJECTORY_STEWARDSHIP_INVALID', 'At least one responsibility domain is required.');
  }
  const values = [...new Set(domains.map((domain) => required(domain, 'domain')))];
  if (values.length > 16) throw coded('TRAJECTORY_STEWARDSHIP_INVALID', 'Responsibility is limited to sixteen domains.');
  return values.sort();
}

function normalize(input) {
  const policy = input?.policy || {};
  const trajectory = input?.trajectory || {};
  const budget = input?.budget || {};
  return {
    agentId: required(input?.agentId, 'agentId'),
    mandateRef: required(input?.mandateRef, 'mandateRef'),
    projectId: required(input?.projectId, 'projectId'),
    domains: normalizedDomains(input?.domains),
    objectiveRef: required(trajectory.objectiveRef, 'trajectory.objectiveRef'),
    observationRef: required(trajectory.observationRef, 'trajectory.observationRef'),
    gap: score(trajectory.gap, 'trajectory.gap'),
    uncertainty: score(trajectory.uncertainty, 'trajectory.uncertainty'),
    learningPotential: score(trajectory.learningPotential, 'trajectory.learningPotential'),
    observationAgeMs: boundedInteger(trajectory.observationAgeMs, 'trajectory.observationAgeMs'),
    remainingTokens: boundedInteger(budget.remainingTokens, 'budget.remainingTokens'),
    permissions: input?.permissions || {},
    policy: {
      maxObservationAgeMs: boundedInteger(policy.maxObservationAgeMs, 'policy.maxObservationAgeMs'),
      actThreshold: score(policy.actThreshold, 'policy.actThreshold'),
      uncertaintyThreshold: score(policy.uncertaintyThreshold, 'policy.uncertaintyThreshold'),
      learnThreshold: score(policy.learnThreshold, 'policy.learnThreshold'),
      actTokens: boundedInteger(policy.actTokens, 'policy.actTokens'),
      observeTokens: boundedInteger(policy.observeTokens, 'policy.observeTokens'),
      learnTokens: boundedInteger(policy.learnTokens, 'policy.learnTokens')
    }
  };
}

function hasPermission(context, mode) {
  const key = mode.toLowerCase();
  if (context.permissions[key] !== true) return false;
  return mode !== MODES.ACT || context.permissions.explicitWriteLease === true;
}

function hasBudget(context, mode) {
  const requiredTokens = context.policy[`${mode.toLowerCase()}Tokens`];
  return context.remainingTokens >= requiredTokens;
}

function candidateMode(context) {
  const stale = context.observationAgeMs > context.policy.maxObservationAgeMs;
  if (stale || context.uncertainty >= context.policy.uncertaintyThreshold) return MODES.OBSERVE;
  if (context.gap >= context.policy.actThreshold) return MODES.ACT;
  if (context.learningPotential >= context.policy.learnThreshold) return MODES.LEARN;
  return MODES.NO_CHANGE;
}

function reasonFor(context, candidate, selected) {
  if (candidate === MODES.NO_CHANGE) return 'trajectory-within-policy';
  if (!hasPermission(context, candidate)) return `permission-denied:${candidate.toLowerCase()}`;
  if (!hasBudget(context, candidate)) return `budget-insufficient:${candidate.toLowerCase()}`;
  if (selected === MODES.OBSERVE) return 'trajectory-stale-or-uncertain';
  if (selected === MODES.ACT) return 'external-objective-gap';
  return 'learning-opportunity';
}

function goalId(context, mode) {
  const material = [context.projectId, context.agentId, context.mandateRef,
    context.objectiveRef, context.observationRef, ...context.domains, mode].join('\n');
  return `goal_${crypto.createHash('sha256').update(material).digest('hex').slice(0, 24)}`;
}

function arbitrate(rawInput) {
  const context = normalize(rawInput);
  const candidate = candidateMode(context);
  const authorized = candidate === MODES.NO_CHANGE
    || (hasPermission(context, candidate) && hasBudget(context, candidate));
  const mode = authorized ? candidate : MODES.NO_CHANGE;
  return {
    mode,
    candidate,
    reason: reasonFor(context, candidate, mode),
    goal: mode === MODES.NO_CHANGE ? null : {
      goalId: goalId(context, mode),
      kind: 'endogenous-trajectory-goal',
      objectiveRef: context.objectiveRef,
      observationRef: context.observationRef,
      mandateRef: context.mandateRef,
      projectId: context.projectId,
      ownerAgentId: context.agentId,
      domains: context.domains,
      mode
    }
  };
}

module.exports = { MODES, arbitrate, normalize };
