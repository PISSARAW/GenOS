'use strict';

const explanation = require('./syncytium/history/causalExplanationService');
const counterfactual = require('./syncytium/history/counterfactualService');
const faultLocalization = require('./syncytium/repair/faultLocalizationService');
const localRepair = require('./syncytium/repair/localRepairService');
const semanticRepair = require('./syncytium/repair/semanticRepairService');
const schemaService = require('./syncytiumSchemaService');
const semanticConflicts = require('./syncytium/conflicts/semanticConflictService');

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
    inspectConflicts: async (sessionId, request = {}) => inspectConflicts(sessionId, request, dependencies),
    localizeFaults: async (sessionId, options = {}) => faultLocalization.localize(
      await dependencies.getSession(sessionId, options.db)
    ),
    repairInvariant: async (sessionId, request = {}) => repairInvariant(sessionId, request, dependencies),
    chooseRepairCandidates: (candidates) => semanticRepair.choose(candidates)
  };
}

async function inspectConflicts(sessionId, request, dependencies) {
  if (!request.operation?.kind) throw Object.assign(new Error('Conflict inspection requires an operation kind.'), { code: 'SYNCYTIUM_OPERATION_INVALID' });
  const session = await dependencies.getSession(sessionId, request.options?.db);
  const operation = schemaService.admitOperation(session.schema, request.operation).operation;
  return semanticConflicts.detectCandidate({
    operation, history: session.crdt.getHistory(), schema: session.schema, domains: session.domains
  });
}

async function repairInvariant(sessionId, request, dependencies) {
  const session = await dependencies.getSession(sessionId, request.options?.db);
  const plan = localRepair.propose(session, request.invariantId);
  if (!plan) return { repaired: false, reason: 'NO_SAFE_DETERMINISTIC_REPAIR' };
  const result = await dependencies.applyOperation(sessionId, plan.operation, request.options || {});
  return { repaired: true, plan, result };
}

module.exports = { createSyncytiumDiagnosticsService };
