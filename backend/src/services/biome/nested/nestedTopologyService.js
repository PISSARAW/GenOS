'use strict';

const TARGETS = Object.freeze({
  hypothesis_competition: 'trinity',
  stable_responsibilities: 'a_team',
  resource_landscape: 'biome',
  persistent_clusters: 'metapopulation',
  shared_state: 'syncytium',
  unknown_structure: 'rhizome'
});

function propose(input = {}) {
  const morphogenesis = require('../../morphogenesis/morphogenesisPlannerService');
  const target = targetFor(input);
  const reason = input.reason || TARGETS[input.needKind] || 'UNKNOWN_STRUCTURE';
  const plan = morphogenesis.planMorphogenesis({
    missionId: input.missionId,
    mission: input.mission,
    problem: input.problem || input.mission,
    currentState: { topology: input.currentTopology || 'biome', agents: new Map(), capabilities: input.capabilities || [] },
    proposedTopology: target,
    budget: input.budget || 0,
    expression: input.expression,
    reason
  });
  return { targetTopology: plan.selectedTopology || target, reason, plan };
}

function targetFor(input = {}) {
  const target = input.topology || TARGETS[input.needKind] || 'rhizome';
  const allowed = Object.values(TARGETS);
  if (!allowed.includes(target)) {
    throw Object.assign(new Error(`Unsupported nested topology '${target}'.`), { code: 'BIOME_NESTED_TOPOLOGY_INVALID' });
  }
  return target;
}

function candidateNode(input = {}, proposal = {}) {
  const target = proposal.targetTopology || targetFor(input);
  const nodeId = input.nodeId || `topology:${target}:${input.missionId || 'mission'}`;
  return {
    nodeId,
    kind: 'SUB_TOPOLOGY',
    capabilities: [`topology:${target}`],
    providers: [{ providerId: 'morphogenesis', kind: 'service', reference: target }],
    state: 'DISCOVERED',
    availability: { status: 'UNKNOWN' },
    localContext: { targetTopology: target, reason: proposal.reason || 'UNKNOWN_STRUCTURE' },
    provenance: ['morphogenesis:proposal']
  };
}

module.exports = { propose, candidateNode, targetFor, TARGETS };
