'use strict';

const schemaService = require('../../syncytiumSchemaService');

const POLICY_PRIORITY = Object.freeze(['code', 'graph', 'transactional', 'speculative', 'hierarchical']);
const FIELD_SETS = Object.freeze({
  code: { files: 'MAP', tests: 'ADD_WINS_SET', builds: 'MV_REGISTER' },
  graph: { graph_nodes: 'MAP', graph_edges: 'MAP' },
  transactional: { budget: 'ESCROW_COUNTER', inventory: 'ESCROW_COUNTER', capacity: 'ESCROW_COUNTER', reservations: 'MAP' },
  epistemic: { claims: 'ADD_WINS_SET', evidence: 'ADD_WINS_SET', refutations: 'ADD_WINS_SET', uncertainty: 'ADD_WINS_SET' },
  blackboard: { events: 'ADD_WINS_SET' },
  document: { sections: 'SEQUENCE', comments: 'ADD_WINS_SET' },
  realtimeControl: { controls: 'STATE_MACHINE' }
});
const DEFINITIONS = Object.freeze([
  definition('hard', ['serialized', 'critical', 'transactional'], ['CRDT_SHARED_STATE', 'INVARIANT_GATES'], 'SERIALIZABLE', 'ALL_SUBSCRIBED', ['ROLLBACK', 'COORDINATE'], ['invariant_violation', 'authority_violation']),
  definition('soft', ['eventual', 'offline', 'local-first'], ['CRDT_SHARED_STATE', 'RESILIENCE_RECOVERY'], 'EVENTUAL', 'SELECTIVE', ['MERGE', 'RECONCILE'], ['unrecoverable_conflict']),
  definition('code', ['code', 'refactor', 'source', 'module'], ['CRDT_SHARED_STATE', 'SEMANTIC_CONFLICTS', 'EVIDENCE_BARRIER'], 'INVARIANT_PRESERVING', 'SELECTIVE', ['RESTORE_CHECKPOINT', 'REPLAY_TESTS'], ['build_failure', 'unresolved_import']),
  definition('document', ['document', 'text', 'draft', 'section'], ['CRDT_SHARED_STATE', 'CAUSAL_STATE'], 'CAUSAL', 'ALL_SUBSCRIBED', ['REPLAY_SEQUENCE'], ['causal_gap']),
  definition('graph', ['graph', 'node', 'edge', 'dependency graph'], ['CRDT_SHARED_STATE', 'SEMANTIC_CONFLICTS', 'INVARIANT_GATES'], 'INVARIANT_PRESERVING', 'SELECTIVE', ['REBUILD_PROJECTION', 'REMOVE_INVALID_EDGE'], ['dangling_edge', 'cycle']),
  definition('transactional', ['budget', 'inventory', 'capacity', 'reservation'], ['TRANSACTIONAL_SHARED_STATE', 'INVARIANT_GATES'], 'SERIALIZABLE', 'SELECTIVE', ['ROLLBACK_TRANSACTION'], ['resource_exhaustion', 'precondition_failed']),
  definition('epistemic', ['claim', 'evidence', 'refutation', 'hypothesis'], ['PROVENANCE', 'EVIDENCE_BARRIER', 'CAUSAL_STATE'], 'APPEND_ONLY', 'SELECTIVE', ['PRESERVE_COUNTEREVIDENCE'], ['missing_provenance']),
  definition('blackboard', ['blackboard', 'problem', 'verification', 'unresolved dependency'], ['CRDT_SHARED_STATE', 'SELECTIVE_SYNC'], 'APPEND_ONLY', 'SELECTIVE', ['KEEP_EVENT_HISTORY'], ['unanswered_critical_problem']),
  definition('localFirst', ['local-first', 'partition', 'offline'], ['CRDT_SHARED_STATE', 'RESILIENCE_RECOVERY', 'SELECTIVE_SYNC'], 'EVENTUAL', 'LOCAL_FIRST', ['QUEUE_AND_RECONCILE'], ['partition_budget_exceeded']),
  definition('speculative', ['speculative', 'counterfactual', 'what-if'], ['CAUSAL_STATE', 'CAPSULES_SNAPSHOTS'], 'CAUSAL', 'BRANCH_ONLY', ['DISCARD_BRANCH', 'PROMOTE_VALIDATED'], ['promotion_gate_failed']),
  definition('hierarchical', ['hierarchical', 'region', 'multi-region', '1000 agents'], ['SELECTIVE_SYNC', 'INVARIANT_GATES'], 'INVARIANT_PRESERVING', 'REGION_BOUNDARY', ['RECONCILE_BOUNDARY'], ['critical_boundary_violation']),
  definition('realtimeControl', ['realtime control', 'reflex', 'safety signal'], ['SIGNALING_BUS', 'INVARIANT_GATES'], 'SERIALIZABLE', 'REFLEX_AND_DELTA', ['STOP_AND_REPAIR'], ['safety_signal'])
]);

function definition(...values) {
  const [id, keywords, capabilities, zone, replication, repairs, stopConditions] = values;
  return Object.freeze({ id, keywords, capabilities, zone, replication, repairs, stopConditions });
}

function createPolicy(definitionItem) {
  return Object.freeze({
    id: definitionItem.id,
    analyzeFit: (mission, context) => analyzeFit(definitionItem, mission, context),
    configureSchema: (context) => configureSchema(definitionItem, context),
    configureConsistencyZones: (context) => configureConsistencyZones(definitionItem, context),
    configureDomains: (context) => configureDomains(definitionItem, context),
    configureInvariants: (context) => configureInvariants(definitionItem, context),
    configureReplication: () => ({ strategy: definitionItem.replication, selective: definitionItem.replication !== 'ALL_SUBSCRIBED' }),
    configureRepair: () => [...definitionItem.repairs],
    configureStopConditions: () => [...definitionItem.stopConditions]
  });
}

const POLICIES = Object.freeze(Object.fromEntries(DEFINITIONS.map((item) => [item.id, createPolicy(item)])));

function analyzeFit(definitionItem, mission, context = {}) {
  const text = String(mission || '').toLowerCase();
  const matches = definitionItem.keywords.filter((keyword) => text.includes(keyword));
  const explicit = context.variantId === definitionItem.id;
  return {
    variantId: definitionItem.id,
    score: explicit ? 1 : matches.length / definitionItem.keywords.length,
    matchedSignals: matches,
    requiredCapabilities: [...definitionItem.capabilities],
    recommended: explicit || matches.length > 0
  };
}

function configureSchema(definitionItem, context = {}) {
  const fields = Object.fromEntries(Object.entries(FIELD_SETS[definitionItem.id] || {})
    .map(([path, dataType]) => [path, { dataType, consistencyZone: fieldZone(definitionItem, path) }]));
  Object.assign(fields, normalizeFields(context.fields));
  return schemaService.compile({
    schemaId: `syncytium-${definitionItem.id}-policy-v1`, fields,
    invariants: context.invariants || []
  });
}

function fieldZone(definitionItem, path) {
  if (definitionItem.id === 'transactional' && ['budget', 'inventory', 'capacity'].includes(path)) return 'INVARIANT_PRESERVING';
  if (['epistemic', 'blackboard'].includes(definitionItem.id)) return 'APPEND_ONLY';
  return definitionItem.zone;
}

function normalizeFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([path, definitionItem]) => [path, {
    ...definitionItem, consistencyZone: definitionItem.consistencyZone || 'EVENTUAL'
  }]));
}

function configureConsistencyZones(definitionItem, context = {}) {
  const schema = configureSchema(definitionItem, context);
  return Object.fromEntries(Object.entries(schema.fields).map(([path, field]) => [path, field.consistencyZone]));
}

function configureDomains(definitionItem, context = {}) {
  if (definitionItem.id !== 'hierarchical') return Array.isArray(context.nuclearDomains) ? [...context.nuclearDomains] : [];
  return regionsToDomains(context.regions || [], contractPaths(context.sharedContracts));
}

function contractPaths(contracts) {
  if (Array.isArray(contracts)) return contracts.map((contract) => contract.path).filter(Boolean);
  return Object.keys(contracts || {});
}

function regionsToDomains(regions, contractPaths) {
  const members = regions.flatMap((region) => region.members || []);
  return [
    { domainId: 'organism', members, owns: contractPaths },
    ...regions.map((region) => ({
      domainId: region.regionId, members: [...(region.members || [])],
      owns: [...(region.localFields || [])].map((field) => typeof field === 'string' ? field : field.path),
      mayRead: contractPaths, mayWrite: contractPaths, subscriptions: contractPaths
    }))
  ];
}

function configureInvariants(definitionItem, context = {}) {
  const schema = configureSchema(definitionItem, context);
  return { ...schema.invariants };
}

function getPolicy(variantId) {
  const policy = POLICIES[String(variantId || '').trim()];
  if (!policy) throw Object.assign(new Error(`Unknown Syncytium variant '${variantId}'.`), { code: 'SYNCYTIUM_VARIANT_POLICY_UNKNOWN' });
  return policy;
}

function listPolicies() {
  return DEFINITIONS.map((item) => ({ id: item.id, requiredCapabilities: [...item.capabilities] }));
}

function selectPolicy(mission, context = {}) {
  if (context.variantId) return getPolicy(context.variantId);
  const ranking = Object.values(POLICIES).map((policy) => ({ policy, fit: policy.analyzeFit(mission, context) }));
  const priority = [...POLICY_PRIORITY, ...DEFINITIONS.map((item) => item.id).filter((id) => !POLICY_PRIORITY.includes(id))];
  ranking.sort((left, right) => right.fit.score - left.fit.score
    || priority.indexOf(left.policy.id) - priority.indexOf(right.policy.id));
  return ranking.find((item) => item.fit.recommended)?.policy || POLICIES.hard;
}

function createVariantPolicyService(syncytium) {
  return {
    listVariantPolicies: () => listPolicies(),
    analyzeVariantFit: (mission, context) => Object.values(POLICIES).map((policy) => policy.analyzeFit(mission, context || {})),
    createPolicySession: (mission, request) => createPolicySession({ mission, request: request || {}, syncytium })
  };
}

async function createPolicySession(context) {
  const { mission, request, syncytium } = context;
  const policy = request.variantId ? getPolicy(request.variantId) : selectPolicy(mission, request);
  const configuration = request.configuration || {};
  const schema = policy.configureSchema(configuration);
  const session = await syncytium.createSession(mission, {
    ...(request.sessionOptions || {}), schema,
    nuclearDomains: policy.configureDomains({
      ...configuration, nuclearDomains: configuration.nuclearDomains || request.sessionOptions?.nuclearDomains
    })
  });
  return {
    ...session,
    variantPolicy: {
      id: policy.id, fit: policy.analyzeFit(mission, { variantId: policy.id }),
      consistencyZones: policy.configureConsistencyZones(configuration),
      invariants: policy.configureInvariants(configuration),
      replication: policy.configureReplication(), repair: policy.configureRepair(),
      stopConditions: policy.configureStopConditions()
    }
  };
}

module.exports = {
  POLICY_PRIORITY, createPolicy, getPolicy, listPolicies, selectPolicy, createVariantPolicyService
};
