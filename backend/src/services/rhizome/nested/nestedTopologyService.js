'use strict';

const morphogenesis = require('../../morphogenesis/morphogenesisPlannerService');

const TARGETS = Object.freeze({
  hypothesis_competition: 'trinity',
  stable_responsibilities: 'a_team',
  resource_landscape: 'biome',
  persistent_clusters: 'metapopulation',
  shared_state: 'syncytium',
  unknown_structure: 'rhizome'
});

function propose(input) {
  const target = targetFor(input);
  const reason = input.reason || TARGETS[input.needKind] || 'UNKNOWN_STRUCTURE';
  const plan = morphogenesis.planMorphogenesis({
    missionId: input.missionId,
    mission: input.mission,
    problem: input.problem || input.mission,
    currentState: { topology: input.currentTopology || 'rhizome', agents: new Map(), capabilities: input.capabilities || [] },
    proposedTopology: target,
    budget: input.budget || 0,
    expression: input.expression,
    reason
  });
  return { targetTopology: plan.selectedTopology || target, reason, plan };
}

function targetFor(input) {
  const target = input.topology || TARGETS[input.needKind] || 'rhizome';
  if (!Object.values(TARGETS).includes(target)) {
    throw Object.assign(new Error(`Unsupported nested topology '${target}'.`), { code: 'RHIZOME_NESTED_TOPOLOGY_INVALID' });
  }
  return target;
}

function candidateNode(input, proposal) {
  const nodeId = input.nodeId || `topology:${proposal.targetTopology}:${input.missionId || 'mission'}`;
  return {
    nodeId,
    kind: 'SUB_TOPOLOGY',
    capabilities: [`topology:${proposal.targetTopology}`],
    providers: [{ providerId: 'morphogenesis', kind: 'service', reference: proposal.targetTopology }],
    state: 'DISCOVERED',
    availability: { status: 'UNKNOWN' },
    localContext: { targetTopology: proposal.targetTopology, reason: proposal.reason },
    provenance: ['morphogenesis:proposal']
  };
}

module.exports = { propose, candidateNode };
