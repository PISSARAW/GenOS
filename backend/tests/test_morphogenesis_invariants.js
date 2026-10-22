'use strict';

const assert = require('node:assert/strict');
const { validateMorphologyGraph } = require('../src/services/morphogenesis/graph/morphologyGraphValidator');
const { checkState } = require('../src/services/morphogenesis/typing/stateCompatibility');
const { checkAuthority } = require('../src/services/morphogenesis/typing/authorityCompatibility');
const { checkResources } = require('../src/services/morphogenesis/typing/resourceCompatibility');
const { checkEvidence } = require('../src/services/morphogenesis/typing/evidenceCompatibility');
const { checkMorphologyTypes } = require('../src/services/morphogenesis/typing/morphologyTypeChecker');
const { checkGraph } = require('../src/services/morphogenesis/graph/morphologyTypeChecker');
const { compileExpression } = require('../src/services/morphogenesis/graph/morphologyCompiler');
const api = require('../src/services/morphogenesis/api');
const barriers = require('../src/services/morphogenesis/barriers');
const roles = require('../src/services/morphogenesis/roles');
const { createTopologyAdapterRegistry } = require('../src/services/morphogenesis/adapters/topologyAdapterRegistry');
const { validateMorphogenesisProposal } = require('../src/services/morphogenesis/runtime/morphogenesisProposalValidator');
const { authorizeLocalMorphogenesis, createMorphogenesisLease } = require('../src/services/morphogenesis/transitions/morphogenesisLease');
const { evaluateWorkerMigration } = require('../src/services/morphogenesis/transitions/workerMorphologyMigrationService');
const { createMorphologyPatch, validateMorphologyPatch } = require('../src/services/morphogenesis/transitions/morphologyPatch');
const { assessNecessity } = require('../src/services/morphogenesis/health/morphologicalNecessityService');
const { planPruning } = require('../src/services/morphogenesis/pruning/morphologyPruner');
const { repairSmallestRegion } = require('../src/services/morphogenesis/control/localFirstMorphogenesisService');
const { runLocalMorphogenesis } = require('../src/services/morphogenesis/transitions/localMorphogenesisController');
const { createMorphologyConstitution } = require('../src/services/morphogenesis/genome/morphologyConstitution');

function sealedTrinityGraph() {
  return {
    rootNodeId: 'trinity', nodes: [
      { nodeId: 'trinity', topology: 'trinity' },
      { nodeId: 'branch-a', topology: 'a_team', parentNodeId: 'trinity', lifecycle: 'sealed' },
      { nodeId: 'branch-b', topology: 'a_team', parentNodeId: 'trinity', lifecycle: 'sealed' },
      { nodeId: 'worker-a', parentNodeId: 'branch-a' }, { nodeId: 'worker-b', parentNodeId: 'branch-b' }
    ], edges: [{ edgeId: 'shared', type: 'SHARES_STATE', fromNodeId: 'worker-a', toNodeId: 'worker-b', properties: { mode: 'live' } }]
  };
}

async function run() {
  const cycle = { graphId: 'cycle', rootNodeId: 'a', nodes: [{ nodeId: 'a' }, { nodeId: 'b', parentNodeId: 'a' }], edges: [{ edgeId: 'e1', type: 'CONTAINS', fromNodeId: 'a', toNodeId: 'b' }, { edgeId: 'e2', type: 'CONTAINS', fromNodeId: 'b', toNodeId: 'a' }] };
  assert.equal(validateMorphologyGraph(cycle).valid, false, 'containment cycles must be rejected');
  assert.ok(checkState(sealedTrinityGraph()).length > 0, 'live cross-chamber state must be rejected after sealing');
  const metapopulation = { nodes: [{ nodeId: 'population', topology: 'metapopulation' }, { nodeId: 'deme-a', parentNodeId: 'population' }, { nodeId: 'deme-b', parentNodeId: 'population' }], edges: [{ edgeId: 'sync-all', type: 'SHARES_STATE', fromNodeId: 'deme-a', toNodeId: 'deme-b', properties: { force: true } }] };
  assert.ok(checkState(metapopulation).length > 0, 'forced population-wide state sync must be rejected');
  const authorityGraph = { nodes: [{ nodeId: 'parent', authorityBoundary: ['read'] }, { nodeId: 'child', parentNodeId: 'parent', authorityBoundary: ['write'] }], edges: [] };
  assert.ok(checkAuthority(authorityGraph).length > 0, 'nested authority cannot exceed the parent envelope');
  assert.ok(checkResources({ nodes: [{ nodeId: 'rhizome', topology: 'rhizome', budget: {} }], edges: [] }).length > 0, 'Rhizome requires explicit growth budget');
  const voteGraph = { nodes: [{ nodeId: 'bio', topology: 'biocenose', evidencePolicy: { produces: ['vote'] }, lifecycle: 'open' }, { nodeId: 'observer', parentNodeId: 'other' }], edges: [{ edgeId: 'vote', type: 'EXCHANGES_EVIDENCE', fromNodeId: 'bio', toNodeId: 'observer' }] };
  assert.ok(checkEvidence(voteGraph).length > 0, 'unsealed Biocenose votes cannot cross the boundary');
  const mismatch = { graphId: 'mismatch', rootNodeId: 'parent', nodes: [{ nodeId: 'parent', topology: 'a_team', budget: { growth: 2 } }, { nodeId: 'child', topology: 'rhizome', parentNodeId: 'parent', budget: { growth: 1 } }], edges: [] };
  const contracts = { a_team: { inputSemantics: { type: 'result' } }, rhizome: { outputSemantics: { type: 'hypothesis' } } };
  assert.ok(checkMorphologyTypes(mismatch, contracts).errors.some((error) => error.includes('adapter')), 'incompatible child output needs an adapter');
  const adapters = createTopologyAdapterRegistry();
  adapters.register({ id: 'test-adapter', version: '1', fromTopology: 'rhizome', toTopology: 'a_team', evidenceStatus: 'conceptual', adapt: (value) => value });
  assert.ok(checkMorphologyTypes(mismatch, { ...contracts, adapters }).errors.some((error) => error.includes('unverified')), 'unverified adapter fidelity cannot pass promotion typing');
  const lease = createMorphogenesisLease({ nodeId: 'branch-a', allowedOperators: ['NEST'], allowedTopologies: ['syncytium'], maxWorkers: 2, maxDepth: 1, tokenBudget: 10, transitionBudget: 1, stateBoundaries: ['local'], authorityCeiling: ['local'], expiresAt: 1000 });
  const request = { nodeId: 'branch-a', affectedNodeIds: ['branch-a', 'worker-a'], operations: [{ type: 'NEST' }], topologies: ['syncytium'], requiredStateBoundaries: ['local'], requiredAuthority: ['local'], workerCount: 1, depth: 1, tokenCost: 5, transitionCost: 1, now: 10, graphContext: sealedTrinityGraph() };
  assert.equal(authorizeLocalMorphogenesis(lease, request).allowed, true, 'bounded local mutation should pass');
  assert.equal(authorizeLocalMorphogenesis(lease, { ...request, affectedNodeIds: ['branch-b'] }).allowed, false, 'child authority cannot cross its subtree');
  assert.equal(authorizeLocalMorphogenesis(lease, { ...request, globalMutation: true }).allowed, false, 'global change must be rejected');
  assert.equal(authorizeLocalMorphogenesis(lease, { ...request, tokenCost: 11 }).allowed, false, 'child budget cannot exceed its lease');
  assert.equal((await runLocalMorphogenesis({ lease, request, context: {}, adapters: {} })).authorization.allowed, false, 'runtime rejects leases without an issuer verifier');
  assert.equal(evaluateWorkerMigration({ scores: { phenotypeFit: 1, capabilityFit: 1, memoryRelevance: 1, stateCompatibility: 1, relationshipContinuity: 1, migrationCost: 0 } }).action, 'reuse', 'compatible worker should be reused');
  assert.equal(validateMorphologyPatch({ operations: [{ type: 'NEST' }], baseGraphVersion: 1, reason: 'test', evidence: [], rollbackPlan: {} }).valid, false, 'structural transition without state migration must fail');
  assert.equal(validateMorphogenesisProposal({ decision: 'NO_CHANGE', reason: 'no gain', evidence: [], expectedGainOfBestAlternative: 0, transitionCost: 0 }).valid, true, 'NO_CHANGE is a valid decision');
  assert.equal(assessNecessity({ nodeId: 'unused', utilityWithNode: 1, utilityWithoutNode: 0.99, cost: 0.8 }).pruneCandidate, true, 'costly low-value node is prunable');
  assert.equal(planPruning([{ id: 'unused', necessity: { pruneCandidate: true } }]).candidates[0].preserveEvidence, true, 'pruning preserves evidence');
  const attempts = [];
  const repair = await repairSmallestRegion({ nodeId: 'x' }, { repair: async (level) => { attempts.push(level); return { valid: level === 'node' }; } });
  assert.deepEqual(attempts, ['node'], 'local repair stops at the smallest successful region');
  assert.equal(repair.level, 'node');
  const flatPatch = createMorphologyPatch({ baseGraphVersion: 1, operations: [{ type: 'CHANGE_BUDGET' }], reason: 'parameter change', evidence: [], rollbackPlan: { restoreDomains: ['graph', 'workers', 'leases', 'state', 'budgets'] } });
  assert.equal(flatPatch.operations.length, 1, 'parameter-only update requires no worker spawn');
  const constitution = createMorphologyConstitution({ systemPolicy: { controls: ['human'] }, humanAuthority: {}, securitySandbox: {}, privacyConstraints: {}, maxAutonomy: 1, governanceRequirements: [] });
  assert.equal(Object.isFrozen(constitution.systemPolicy.controls), true, 'nested constitutional policy is immutable');
  testFluentApi();
  testBarriers();
  testRolesAndDefaults();
  testGraphValidatorAndTypeCheckers();
  console.log('Morphogenesis invariants: passed');
}

function testFluentApi() {
  const expr = api.sequence([
    api.nest(api.trinity({ deliberationRounds: 3 }), api.aTeam('self_healing'), { slot: 'chamber-1' }),
    api.parallel([api.biome('resource_competition'), api.biocenose('adversarial_trial')], { mergePolicy: 'union' }),
    api.gate(api.holobionte(), api.syncytium('crdt_doc'), api.rhizome('hypothesis_tree')),
    api.compete([api.trinity(), api.metapopulation('ring_migration')], 'fitness'),
    api.wrap(api.trinity(), 'quarantine', { strict: true }),
    api.bridge(api.rhizome(), api.aTeam(), { name: 'hyp-to-pkg' }),
    api.federate([{ morphology: api.trinity(), weight: 2 }, { topology: api.biocenose(), weight: 1 }], { quorum: api.computeQuorum(0.6, 3) })
  ]);
  const graph = compileExpression(expr, { mission: 'fluent-api', globalBudget: { tokens: 100, growth: 2 } });
  assert.equal(validateMorphologyGraph(graph).valid, true, 'compiled fluent API graph must be valid');
  assert.equal(api.computeQuorum(0.6, 4), 3, '60% quorum of 4 is 3');
}

function testBarriers() {
  assert.equal(barriers.budgetBarrier.DEFAULT_OVERCOMMIT_RATIO, 1.5);
  assert.equal(barriers.evidenceBarrier.DEFAULT_EPSILON, 0.1);
  assert.equal(barriers.authorityBarrier.check('centralized', 'hierarchical').valid, true);
  assert.equal(barriers.authorityBarrier.check('centralized', 'democratic').valid, false);
  assert.equal(barriers.authorityBarrier.check({ authorityModel: { structure: 'quorum' } }, { authorityModel: { structure: 'quorum' } }).valid, true, 'reflexive authority must be valid');
  assert.equal(barriers.stateBarrier.check('Syncytium', 'parallel').valid, false, 'Syncytium-parallel shared state is forbidden');
  assert.equal(barriers.stateBarrier.check({ stateModel: { topology: 'Trinity' } }, { stateModel: { topology: 'ATeam' } }).valid, true);
  assert.equal(barriers.evidenceBarrier.check(0.8, 0.75, 0.1).valid, true);
  assert.equal(barriers.evidenceBarrier.check({ evidenceModel: { calibration: 0.5 } }, { evidenceModel: { calibration: 0.8 } }, 0.1).valid, false);
  assert.equal(barriers.budgetBarrier.check([{ tokens: 60 }, { tokens: 80 }], { tokens: 100 }).valid, true);
  assert.equal(barriers.budgetBarrier.check([90, 90], 100, 1.5).valid, false);
  const c1 = { lifecycleModel: { timeout: 10, warmup: 2 } };
  const c2 = { lifecycleModel: { timeout: 15, warmup: 5 } };
  assert.equal(barriers.lifecycleBarrier.check([c1, c2], 2).valid, true);
  assert.equal(barriers.lifecycleBarrier.check([c1, c2], () => 9).valid, false);
  const pContract = { authorityModel: { structure: 'centralized' }, stateModel: { topology: 'Trinity' }, evidenceModel: { calibration: 0.85 }, resourceModel: { budget: 50 }, lifecycleModel: { timeout: 10, warmup: 1 } };
  const cContract = { authorityModel: { structure: 'hierarchical' }, stateModel: { topology: 'ATeam' }, evidenceModel: { calibration: 0.8 }, resourceModel: { budget: 50 }, lifecycleModel: { timeout: 10, warmup: 1 } };
  const all = barriers.checkAll([[pContract, cContract]], [pContract, cContract], { globalBudget: 100, latency: 1 });
  assert.equal(all.valid, true, 'checkAll must pass when all 5 barriers are satisfied');
}

function testRolesAndDefaults() {
  assert.equal(roles.DEFAULT_CONFIG.defaultTopology, 'Trinity');
  assert.equal(roles.DEFAULT_CONFIG.overcommitRatio, 1.5);
  assert.equal(roles.DEFAULT_CONFIG.memoryRetention, 30);
  assert.equal(roles.DEFAULT_CONFIG.firewallPolicy, 'STRICT');
  const ctrl = roles.createMorphogeneticController();
  const blocked = ctrl.decideTransition({ currentUtility: 0.5, candidateUtility: 0.9, transitionCost: 0.05, now: 1000, lastTransitionTime: 500, profile: { functionalDecomposability: 0.8 } });
  assert.equal(blocked.transition, 'none', 'cooldown must block premature transition');
  const lowDelta = ctrl.decideTransition({ currentUtility: 0.5, candidateUtility: 0.58, transitionCost: 0.05, now: 400000, lastTransitionTime: 0, profile: { functionalDecomposability: 0.8 } });
  assert.equal(lowDelta.transition, 'none', 'hysteresis must block marginal gain');
  const allowed = ctrl.decideTransition({ currentUtility: 0.4, candidateUtility: 0.8, transitionCost: 0.05, now: 400000, lastTransitionTime: 0, profile: { functionalDecomposability: 0.8 } });
  assert.equal(allowed.transition, 'split', 'net gain above hysteresis after cooldown must transition');
  const adapter = roles.createTopologyAdapter({ phi_translate: (x) => ({ b: x.a * 2 }), fidelity: (out, inp) => (inp.b === out.a * 2 ? 1 : 0) });
  assert.equal(adapter.translate({ payload: { a: 3 } }).fidelity, 1);
  const mem = roles.createMorphologyMemory({ memoryRetention: 30, maxEntries: 2 });
  mem.record({ problemSignature: 'sig-1', graphConfig: 'g1', performance: 0.6, recordedAt: 1000 });
  mem.record({ problemSignature: 'sig-1', graphConfig: 'g2', performance: 0.9, recordedAt: 2000 });
  assert.equal(mem.lookupBySignature('sig-1', 2500).graphConfig, 'g2', 'lookup selects highest fresh performance');
  const epi = roles.createErrorEpidemiologist();
  epi.recordTransmission({ sourceNodeId: 'n1', targetNodeId: 'n2', errorId: 'e1' });
  epi.recordTransmission({ sourceNodeId: 'n2', targetNodeId: 'n3', errorId: 'e1' });
  assert.equal(epi.assessPropagation('e1').R_error, 2, '1 primary root source + 2 secondary targets yields R_error = 2');
  const fw = roles.createInformationFirewallManager();
  assert.equal(fw.policy, 'STRICT');
}

function testGraphValidatorAndTypeCheckers() {
  const depthOk = { graphId: 'g1', rootNodeId: 'n0', maxDepth: 1, nodes: [{ nodeId: 'n0' }, { nodeId: 'n1', parentNodeId: 'n0' }], edges: [] };
  assert.equal(validateMorphologyGraph(depthOk).valid, true, 'depth equal to maxDepth must be valid');
  const depthOverflow = { graphId: 'g2', rootNodeId: 'n0', maxDepth: 1, nodes: [{ nodeId: 'n0' }, { nodeId: 'n1', parentNodeId: 'n0' }, { nodeId: 'n2', parentNodeId: 'n1' }], edges: [] };
  assert.equal(validateMorphologyGraph(depthOverflow).valid, false, 'depth exceeding maxDepth must be rejected');
  const childrenOverflow = { graphId: 'g3', rootNodeId: 'n0', maxChildren: 1, nodes: [{ nodeId: 'n0' }, { nodeId: 'n1', parentNodeId: 'n0' }, { nodeId: 'n2', parentNodeId: 'n0' }], edges: [] };
  assert.equal(validateMorphologyGraph(childrenOverflow).valid, false, 'children exceeding maxChildren must be rejected');
  const typed = checkMorphologyTypes({ graphId: 'g4', rootNodeId: 'p', globalBudget: 10, nodes: [{ nodeId: 'p', topology: 'trinity' }, { nodeId: 'c1', topology: 'a_team', parentNodeId: 'p', budget: 10 }, { nodeId: 'c2', topology: 'a_team', parentNodeId: 'p', budget: 10 }], edges: [] });
  assert.equal(typed.valid, false, 'child budgets exceeding 1.5x global budget must fail type check');
  assert.equal(typed.resourceBudgetValid, false);
  const graphTyped = checkGraph({ graph: { graphId: 'g5', rootNodeId: 'p', nodes: [{ nodeId: 'p', topology: 'trinity' }], edges: [] } });
  assert.equal(graphTyped.valid, true);
  assert.equal(graphTyped.authorityCompatible, true);
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
