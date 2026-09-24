'use strict';

const explanation = require('./syncytium/history/causalExplanationService');
const counterfactual = require('./syncytium/history/counterfactualService');
const faultLocalization = require('./syncytium/repair/faultLocalizationService');
const localRepair = require('./syncytium/repair/localRepairService');
const semanticRepair = require('./syncytium/repair/semanticRepairService');

function createSyncytiumDiagnosticsService(dependencies) {
  return {
    explain: async (sessionId, request = {}) => explanation.explain(
      await dependencies.getSession(sessionId, request.options?.db), request
    ),
    simulateWithout: async (sessionId, opId, options = {}) => counterfactual.simulate(
      await dependencies.getSession(sessionId, options.db), { opId }
    ),
    simulateReplacing: async (sessionId, opId, request = {}) => counterfactual.simulate(
      await dependencies.getSession(sessionId, request.options?.db), { opId, alternative: request.alternative }
    ),
    localizeFaults: async (sessionId, options = {}) => faultLocalization.localize(
      await dependencies.getSession(sessionId, options.db)
    ),
    repairInvariant: async (sessionId, request = {}) => repairInvariant(sessionId, request, dependencies),
    chooseRepairCandidates: (candidates) => semanticRepair.choose(candidates)
  };
}

async function repairInvariant(sessionId, request, dependencies) {
  const session = await dependencies.getSession(sessionId, request.options?.db);
  const plan = localRepair.propose(session, request.invariantId);
  if (!plan) return { repaired: false, reason: 'NO_SAFE_DETERMINISTIC_REPAIR' };
  const result = await dependencies.applyOperation(sessionId, plan.operation, request.options || {});
  return { repaired: true, plan, result };
}

module.exports = { createSyncytiumDiagnosticsService };
