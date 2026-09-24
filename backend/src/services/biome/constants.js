'use strict';

module.exports = Object.freeze({
  SCOPES: ['mission', 'workspace', 'persistent'],
  SESSION_STATUSES: ['active', 'dormant', 'completed', 'failed'],
  NICHE_STATUSES: ['candidate', 'open', 'colonized', 'saturated', 'declining', 'dormant', 'closed'],
  POPULATION_STATUSES: ['seed', 'growing', 'established', 'saturated', 'declining', 'dormant', 'extinct', 'recolonized'],
  INTERACTION_TYPES: ['competition', 'mutualism', 'commensalism', 'inhibition', 'predation', 'dependency'],
  RESOURCE_KEYS: ['tokens', 'wallClockMs', 'llmCalls', 'toolCalls', 'browserCalls', 'solverCalls', 'cpu', 'gpu', 'workspaceSlots', 'workerSlots', 'contextBytes', 'riskBudget', 'verificationBudget']
});
