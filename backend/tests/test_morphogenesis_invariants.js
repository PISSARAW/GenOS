'use strict';

const assert = require('node:assert/strict');
const { validateMorphologyGraph } = require('../src/services/morphogenesis/graph/morphologyGraphValidator');
const { checkState } = require('../src/services/morphogenesis/typing/stateCompatibility');
const { checkAuthority } = require('../src/services/morphogenesis/typing/authorityCompatibility');
const { checkResources } = require('../src/services/morphogenesis/typing/resourceCompatibility');
const { checkEvidence } = require('../src/services/morphogenesis/typing/evidenceCompatibility');
const { checkMorphologyTypes } = require('../src/services/morphogenesis/typing/morphologyTypeChecker');
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
  const authorityGraph = { nodes: [{ nodeId: 'parent', authorityBoundary: { maxActions: ['read'] } }, { nodeId: 'child', parentNodeId: 'parent', authorityBoundary: { maxActions: ['write'] } }], edges: [] };
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
  const flatPatch = createMorphologyPatch({ baseGraphVersion: 1, operations: [{ type: 'CHANGE_PARAMETERS' }], reason: 'parameter change', evidence: [], rollbackPlan: { restoreDomains: ['graph', 'workers', 'leases', 'state', 'budgets'] } });
  assert.equal(flatPatch.operations.length, 1, 'parameter-only update requires no worker spawn');
  const constitution = createMorphologyConstitution({ systemPolicy: { controls: ['human'] }, humanAuthority: {}, securitySandbox: {}, privacyConstraints: {}, maxAutonomy: 1, governanceRequirements: [] });
  assert.equal(Object.isFrozen(constitution.systemPolicy.controls), true, 'nested constitutional policy is immutable');
  console.log('Morphogenesis invariants: passed');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
