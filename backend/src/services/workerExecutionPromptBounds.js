'use strict';

function minimumKnown(values) {
  const known = values.filter(value => Number.isSafeInteger(value) && value >= 0);
  return known.length ? Math.min(...known) : null;
}

function observedTools(lease) {
  if (!Array.isArray(lease) || !lease.every(value => typeof value === 'string' && value.trim())) return null;
  return [...new Set(lease)];
}

function project(self, mission) {
  const contract = mission.workerContract || {};
  const executionConstraints = { source: 'runtime_mission',
    tokenBudget: minimumKnown([mission.executionBudget?.tokens, mission.workerTokenLimit, contract.resources?.maxTokens]),
    workerLimit: minimumKnown([contract.spawnBudget]), tools: observedTools(mission.toolLease) };
  return { ...self, operational: { ...self.operational, executionConstraints } };
}

function legacyLimit(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function display(operational) {
  const observed = operational.executionConstraints;
  const bounds = observed || { tokenBudget: legacyLimit(operational.tokenBudget),
    workerLimit: legacyLimit(operational.workerLimit), tools: observedTools(operational.tools) };
  return { tokenBudget: bounds.tokenBudget ?? 'non observé', workerLimit: bounds.workerLimit ?? 'non observé',
    tools: bounds.tools === null ? 'non observés' : bounds.tools.join(', ') || 'aucun' };
}

module.exports = { project, display };
