'use strict';

const rhizome = require('../../rhizomeCoordinationService');

function create(input) {
  return async function execute(context) {
    const candidate = context.growth.candidate;
    const prepared = await input.resolveProvider({ candidate, need: context.need, sessionId: context.sessionId });
    if (!prepared) return { status: 'GROWTH_WAITING_FOR_PROVIDER' };
    const verification = await input.resolveVerifier({ candidate, need: context.need, ...prepared });
    if (!verification) return { status: 'GROWTH_WAITING_FOR_VERIFIER' };
    const admissionPolicy = input.admissionPolicy;
    try {
      const admission = await rhizome.admitGrowthCandidate(context.sessionId, {
        candidateId: candidate.candidateId,
        expectedGraphVersion: context.growth.graphVersion,
        node: prepared.node,
        edges: prepared.edges,
        proof: verification
      }, { ...context.options, admissionPolicy });
      const route = await rhizome.routeToCapability(context.sessionId, context.need, context.options);
      return { status: route.selected ? 'GROWTH_ADMITTED_ROUTE_READY' : 'GROWTH_ADMITTED_ROUTE_MISSING', admission, route };
    } catch (error) {
      return { status: 'GROWTH_REJECTED', reason: error.code || 'GROWTH_ADMISSION_FAILED' };
    }
  };
}

module.exports = { create };
