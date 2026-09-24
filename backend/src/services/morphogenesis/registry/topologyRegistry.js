'use strict';

const { contractFor } = require('../../topologyCapabilityService');
const { createTopologyContract, validateTopologyContract } = require('./topologyContract');
const { createTopologyVersionRegistry } = require('./topologyVersionRegistry');
const { createVariantRegistry } = require('./variantRegistry');
const { createTopologyRelationRegistry } = require('./topologyRelationRegistry');

const DEFINITIONS = Object.freeze({
  trinity: { problemSemantics: ['competing hypotheses', 'experimental comparison'], inputSemantics: { unit: 'claims_or_hypotheses' }, outputSemantics: { unit: 'evidence_backed_synthesis' }, independenceModel: { required: true }, stateModel: { writes: 'isolated', reads: 'shared' }, authorityModel: { decision: 'evidence_gated' }, communicationModel: { default: 'orchestrator_mediated' }, evidenceModel: { mode: 'comparative_barrier' }, resourceModel: { budget: 'pooled' }, lifecycleModel: { persistence: 'mission_scoped' }, strengths: ['independent comparison'], weaknesses: ['coordination overhead'], failureModes: ['correlated hypotheses'], observables: ['hypothesis_count', 'comparison_coverage'] },
  a_team: { problemSemantics: ['decomposable directed work'], inputSemantics: { unit: 'work_packages' }, outputSemantics: { unit: 'integrated_result' }, independenceModel: { required: false }, stateModel: { writes: 'per_domain', reads: 'shared' }, authorityModel: { decision: 'coordinator_directed' }, communicationModel: { default: 'orchestrator_mediated' }, evidenceModel: { mode: 'per_domain_dossier' }, resourceModel: { budget: 'per_domain' }, lifecycleModel: { persistence: 'mission_scoped' }, strengths: ['role specialization'], weaknesses: ['central coordination load'], failureModes: ['coordinator bottleneck'], observables: ['handoff_latency', 'domain_coverage'] },
  biome: { problemSemantics: ['ecological resource allocation'], inputSemantics: { unit: 'resource_landscape' }, outputSemantics: { unit: 'resource_allocation' }, independenceModel: { required: false }, stateModel: { writes: 'environmental' }, authorityModel: { decision: 'distributed' }, communicationModel: { default: 'shared_trail' }, evidenceModel: { mode: 'ecological_observation' }, resourceModel: { budget: 'pooled' }, lifecycleModel: { persistence: 'environmental' }, strengths: ['adaptive allocation'], weaknesses: ['coordination overhead'], failureModes: ['resource monopolization'], observables: ['resource_utilization', 'population_health'] },
  biocenose: { problemSemantics: ['collective judgment'], inputSemantics: { unit: 'claims_for_deliberation' }, outputSemantics: { unit: 'quorum_decision' }, independenceModel: { required: true }, stateModel: { writes: 'individual', reads: 'shared' }, authorityModel: { decision: 'quorum' }, communicationModel: { default: 'broadcast' }, evidenceModel: { mode: 'weighted_consensus' }, resourceModel: { budget: 'pooled' }, lifecycleModel: { persistence: 'mission_scoped' }, strengths: ['plural deliberation'], weaknesses: ['quorum latency'], failureModes: ['herding'], observables: ['quorum_margin', 'abstention_rate'] },
  holobionte: { problemSemantics: ['interdependent host and symbiont work'], inputSemantics: { unit: 'host_objective_and_contracts' }, outputSemantics: { unit: 'host_accepted_contribution' }, independenceModel: { required: false }, stateModel: { writes: 'symbiont_scoped' }, authorityModel: { decision: 'host_veto' }, communicationModel: { default: 'capability' }, evidenceModel: { mode: 'host_veto' }, resourceModel: { budget: 'host_controlled' }, lifecycleModel: { persistence: 'session_defined' }, strengths: ['specialist symbiosis'], weaknesses: ['host bottleneck'], failureModes: ['unverified contribution promotion'], observables: ['contract_compliance', 'symbiont_health'] },
  syncytium: { problemSemantics: ['tightly coupled shared state'], inputSemantics: { unit: 'shared_state_and_invariants' }, outputSemantics: { unit: 'consistent_state' }, independenceModel: { required: false }, stateModel: { writes: 'shared_crdt' }, authorityModel: { decision: 'invariant_constrained' }, communicationModel: { default: 'continuous_sync' }, evidenceModel: { mode: 'invariant_consistency' }, resourceModel: { budget: 'pooled' }, lifecycleModel: { persistence: 'state_dependent' }, strengths: ['shared state continuity'], weaknesses: ['write contention'], failureModes: ['conflicting updates'], observables: ['conflict_rate', 'invariant_violations'] },
  rhizome: { problemSemantics: ['unknown structure and open exploration'], inputSemantics: { unit: 'open_problem' }, outputSemantics: { unit: 'distributed_dossier' }, independenceModel: { required: true }, stateModel: { writes: 'distributed' }, authorityModel: { decision: 'decentralized' }, communicationModel: { default: 'capability_mesh' }, evidenceModel: { mode: 'distributed_dossier' }, resourceModel: { budget: 'per_branch' }, lifecycleModel: { persistence: 'branch_scoped' }, strengths: ['decentralized exploration'], weaknesses: ['integration cost'], failureModes: ['duplicate exploration'], observables: ['branch_coverage', 'orphaned_findings'] },
  metapopulation: { problemSemantics: ['isolated populations with migration'], inputSemantics: { unit: 'niches' }, outputSemantics: { unit: 'migrated_best_known_results' }, independenceModel: { required: true }, stateModel: { writes: 'population_local' }, authorityModel: { decision: 'local_with_quorum' }, communicationModel: { default: 'adaptive_neighbors' }, evidenceModel: { mode: 'quorum_dossier' }, resourceModel: { budget: 'pooled' }, lifecycleModel: { persistence: 'lineage_recovery' }, strengths: ['failure isolation'], weaknesses: ['migration delay'], failureModes: ['population collapse'], observables: ['migration_gain', 'population_survival'] }
});

function createTopologyRegistry() {
  const context = {
    versionRegistry: createTopologyVersionRegistry(),
    variantRegistry: createVariantRegistry(),
    relationRegistry: createTopologyRelationRegistry(),
    topologyIds: Object.keys(DEFINITIONS)
  };

  for (const topologyId of context.topologyIds) {
    const capabilities = contractFor({ mode: topologyId });
    registerTopology(context, {
      topologyId,
      contractVersion: '2.0.0',
      ...DEFINITIONS[topologyId],
      requiredCapabilities: capabilities.required,
      variants: ['default'],
      validParents: [],
      validChildren: [],
      transitionIn: [],
      transitionOut: []
    }, true);
  }

  context.relationRegistry.register({ left: 'biocenose', right: 'holobionte', relation: 'SYNERGISTIC', evidenceStatus: 'conceptual' });
  context.relationRegistry.register({ left: 'trinity', right: 'syncytium', relation: 'SYNERGISTIC', evidenceStatus: 'conceptual' });
  context.relationRegistry.register({ left: 'syncytium', right: 'biocenose', relation: 'COMPATIBLE_WITH_ADAPTER', adapterRequired: true, evidenceStatus: 'conceptual' });
  context.relationRegistry.register({ left: 'a_team', right: 'rhizome', relation: 'COMPATIBLE_WITH_ADAPTER', adapterRequired: true, evidenceStatus: 'conceptual' });

  return {
    register: (input, makeCurrent) => registerTopology(context, input, makeCurrent),
    get: (topologyId, version) => context.versionRegistry.get(topologyId, version),
    list: () => [...context.topologyIds],
    variants: context.variantRegistry,
    relations: context.relationRegistry,
    versions: context.versionRegistry
  };
}

function registerTopology(context, input, makeCurrent = false) {
  const contract = createTopologyContract(input);
  const validation = validateTopologyContract(contract);
  if (!validation.valid) throw new Error(`Invalid topology contract: ${validation.errors.join('; ')}`);
  if (!context.topologyIds.includes(contract.topologyId)) context.topologyIds.push(contract.topologyId);
  const saved = context.versionRegistry.register(contract, makeCurrent);
  if (!context.variantRegistry.list(contract.topologyId).includes('default')) {
    context.variantRegistry.register({ topology: contract.topologyId, variantId: 'default' });
  }
  return saved;
}

module.exports = { DEFINITIONS, createTopologyRegistry };
