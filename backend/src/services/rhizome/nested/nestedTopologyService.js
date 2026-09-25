'use strict';

const morphogenesis = require('../../morphogenesis/morphogenesisPlannerService');
const admissionService = require('../security/capabilityAdmissionService');

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

function admit(session, input, policy) {
  if (!Number.isInteger(input.expectedGraphVersion) || input.expectedGraphVersion !== session.graphVersion) {
    throw Object.assign(new Error('Sub-topology candidate was planned against a stale graph.'), { code: 'RHIZOME_NESTED_PLAN_STALE' });
  }
  const node = session.nodes.find((item) => item.nodeId === input.nodeId);
  if (!node || node.kind !== 'SUB_TOPOLOGY') {
    throw Object.assign(new Error('Unknown Rhizome sub-topology candidate.'), { code: 'RHIZOME_NESTED_NODE_UNKNOWN' });
  }
  const target = node.localContext?.targetTopology;
  if (!input.morphogenesisPlan || input.morphogenesisPlan.selectedTopology !== target) {
    throw Object.assign(new Error('Morphogenesis plan does not select the proposed sub-topology.'), { code: 'RHIZOME_NESTED_PLAN_MISMATCH' });
  }
  const active = admissionService.admit(node, input.proof, policy);
  session.nodes = session.nodes.map((item) => item.nodeId === active.nodeId ? active : item);
  session.graphVersion += 1;
  return { node: active, graphVersion: session.graphVersion };
}

module.exports = { propose, candidateNode, admit };
