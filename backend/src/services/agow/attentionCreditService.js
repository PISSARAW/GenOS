'use strict';

const credit = new Map();

function score(outcome) {
  const bounded = (value) => Math.max(0, Math.min(1, Number(value) || 0));
  const progress = (bounded(outcome.errorReduction) + bounded(outcome.goalProgress) + bounded(outcome.evidenceImprovement)) / 3;
  const cost = Math.max(0, Number(outcome.cost) || 0);
  const latency = Math.max(0, Number(outcome.latencyMs) || 0) / 60000;
  return Math.max(-1, Math.min(1, progress - Math.min(1, (cost + latency) / 2)));
}

function observe(options) {
  const { frameId, capability, module, outcome } = options || {};
  if (!frameId || !capability || !module || !outcome) return { recorded: false, reason: 'missing_attribution' };
  const key = `${capability}:${module}`;
  const prior = credit.get(key) || { observations: 0, meanUtility: 0 };
  const utility = score(outcome);
  const observations = prior.observations + 1;
  const meanUtility = prior.meanUtility + ((utility - prior.meanUtility) / observations);
  const record = { observations, meanUtility, updatedAt: Date.now() };
  credit.set(key, record);
  return { recorded: true, frameId, capability, module, utility, policyHint: Math.max(0, Math.min(1, 0.5 + meanUtility / 2)), record };
}

function get(options) {
  return credit.get(`${options?.capability}:${options?.module}`) || null;
}

function clear() {
  credit.clear();
}

module.exports = { observe, get, clear, score };
