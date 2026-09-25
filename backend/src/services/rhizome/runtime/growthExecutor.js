'use strict';

const rhizome = require('../../rhizomeCoordinationService');

function create(input) {
  return async function execute(context) {
    const candidate = context.growth.candidate;
    const prepared = await resolveProvider(input.resolveProvider, { candidate, need: context.need, sessionId: context.sessionId });
    if (!prepared) return { status: 'GROWTH_WAITING_FOR_PROVIDER' };
    if (prepared.failed) return { status: 'GROWTH_PROVIDER_FAILED', reason: prepared.reason };
    const verification = await resolveVerifier(input.resolveVerifier, { candidate, need: context.need, ...prepared });
    if (!verification) return { status: 'GROWTH_WAITING_FOR_VERIFIER' };
    if (verification.failed) return { status: 'GROWTH_VERIFIER_FAILED', reason: verification.reason };
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

async function resolveProvider(resolve, context) {
  try { return await resolve(context); } catch (error) {
    return { failed: true, reason: error.code || 'PROVIDER_INSTANTIATION_FAILED' };
  }
}

async function resolveVerifier(resolve, context) {
  try { return await resolve(context); } catch (error) {
    return { failed: true, reason: error.code || 'VERIFIER_EXECUTION_FAILED' };
  }
}

module.exports = { create };
