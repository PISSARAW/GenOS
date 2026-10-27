'use strict';

const TOPOLOGIES = new Set(['domain', 'a_team', 'trinity', 'biome', 'rhizome', 'syncytium']);
const COLLECTIVE_SCOPES = ['organization', 'mission', 'topology'];

function recommendation(levels) {
  for (const scope of COLLECTIVE_SCOPES) {
    const level = levels?.[scope];
    const variables = level?.variables || {};
    const topology = variables.recommendedTopology;
    if (level?.status !== 'measured' || Number(variables.inefficiency) < 0.7) continue;
    if (!TOPOLOGIES.has(topology) || !level.evidenceRefs?.length) continue;
    return { scope, topology, inefficiency: Number(variables.inefficiency), evidenceRefs: level.evidenceRefs };
  }
  return null;
}

async function propose(options) {
  const diagnostic = recommendation(options.levels);
  if (!diagnostic) return { proposed: false, reason: 'collective_morphology_evidence_unavailable' };
  const proposal = await require('./markets/morphogenesisMarketAdapter').recordProposal({
    agentId: options.agentId, db: options.db, proposal: {
      proposalId: `agow-allostatic:${options.frameId}:${diagnostic.scope}`,
      topology: diagnostic.topology, evidenceRefs: diagnostic.evidenceRefs,
      diagnosis: { kind: 'allostatic_collective_inefficiency', scope: diagnostic.scope,
        inefficiency: diagnostic.inefficiency, frameId: options.frameId }
    }
  });
  return { proposed: proposal.accepted, proposal: proposal.proposal || null,
    reason: proposal.reason || null, activated: false };
}

module.exports = { TOPOLOGIES, COLLECTIVE_SCOPES, recommendation, propose };
