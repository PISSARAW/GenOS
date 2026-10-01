'use strict';

const SCOPE = 'agow_attention_credit';

function score(outcome) {
  const bounded = (value) => Math.max(0, Math.min(1, Number(value) || 0));
  const progress = (bounded(outcome.errorReduction) + bounded(outcome.goalProgress) + bounded(outcome.evidenceImprovement)) / 3;
  const cost = Math.max(0, Number(outcome.cost) || 0);
  const latency = Math.max(0, Number(outcome.latencyMs) || 0) / 60000;
  return Math.max(-1, Math.min(1, progress - Math.min(1, (cost + latency) / 2)));
}

async function observe(options) {
  const { frameId, capability, module, outcome } = options || {};
  if (!options.agentId || !frameId || !capability || !module || !outcome) return { recorded: false, reason: 'missing_attribution' };
  const key = `${capability}:${module}`;
  const persistence = require('./agowStatePersistenceService');
  const loaded = await persistence.load({ scope: SCOPE, agentId: options.agentId, db: options.db });
  const prior = loaded.state[key] || { observations: 0, meanUtility: 0 };
  const utility = score(outcome);
  const observations = prior.observations + 1;
  const meanUtility = prior.meanUtility + ((utility - prior.meanUtility) / observations);
  const record = { observations, meanUtility, updatedAt: Date.now() };
  await persistence.save({ scope: SCOPE, agentId: options.agentId, db: loaded.db, state: { ...loaded.state, [key]: record }, version: observations });
  return { recorded: true, frameId, capability, module, utility, policyHint: Math.max(0, Math.min(1, 0.5 + meanUtility / 2)), record };
}

async function get(options) {
  const loaded = await require('./agowStatePersistenceService').load({ scope: SCOPE, agentId: options.agentId, db: options.db });
  return loaded.state[`${options.capability}:${options.module}`] || null;
}

async function clear(options) {
  if (options?.agentId) await require('./agowStatePersistenceService').save({ scope: SCOPE, agentId: options.agentId, db: options.db, state: {} });
}

module.exports = { observe, get, clear, score };
