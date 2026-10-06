'use strict';
const assert = require('node:assert/strict');
const fixture = require('./capability_runtime_fixture');
const graphRuntime = require('../src/services/morphogenesis/capabilities/graphCapabilityRuntime');
const lineage = require('../src/services/morphogenesis/capabilities/riskLineage');
const memory = require('../src/services/memory/cambiumConsolidationRuntime');
const niches = require('../src/services/morphogenesis/capabilities/epistemicNicheRuntime');
const { MorphologyRuntime } = require('../src/services/morphogenesis/runtime/morphologyRuntime');
const { CounterfactualSearch } = require('../src/services/morphogenesis/synthesis/morphologySynthesizer');
async function run(db) {
  const graph = { graphId: 'graph', missionId: 'mission', rootNodeId: 'root-node', nodes: [
    { nodeId: 'root-node', kind: 'TOPOLOGY', topology: 'trinity' },
    { nodeId: 'child-node', kind: 'TOPOLOGY', topology: 'a_team', parentNodeId: 'root-node' }
  ] };
  await graphRuntime.bindGraph(db, graph, { scopeId: 'MISSION:graph', units: 10000000 });
  assert.equal((await lineage.node(db, 'child-node')).topology, 'a_team');
  await assert.rejects(graphRuntime.bindGraph(db, graph, { scopeId: 'MISSION:alien', units: 10000000 }), /SCOPE_CONFLICT/);
  await assert.rejects(graphRuntime.verifyOutput(db, { nodeId: 'child-node' }), /CONTRACT_REQUIRED/);
  const runtime = new MorphologyRuntime({ installTopologyPlugins: false });
  runtime.executorRegistry.getExecutorForNode = () => ({ execute: async () => ({ output: {}, context: { state: {} } }) });
  await assert.rejects(runtime.execute(graph, { db }), /CONTRACT_REQUIRED/);
  await extensionChecks(db, graph, runtime);
  const scopeId = 'PROJECT:consolidation';
  const cases = [{ caseId: 'test', environmentVersion: 'v1', facts: { safe: true } }];
  const ref = await fixture.proof(db, scopeId, { cases });
  const result = await memory.consolidate(db, { scopeId, memoryId: 'consolidated',
    episode: { actionType: 'retry', rewardScore: 1 }, history: Array.from({ length: 3 }, () => ({ actionType: 'retry' })),
    contract: { verificationRef: ref, environmentVersion: 'v1', conditions: [{ safe: true }],
      procedure: { rules: [{ when: {}, decision: 'RETRY' }] }, witnesses: [{ witnessId: 'consolidated-witness', status: 'VERIFIED', artifactRef: ref }] } });
  assert.equal(result.promoted, true);
  assert.equal((await memory.recall(db, { scopeId, claimId: 'consolidated', environmentVersion: 'v1', facts: { safe: false } })), null);
  const ecology = { niches: [], ecologicalState: { individuals: [] } };
  const assigned = niches.assign(ecology, { contracts: [{ experimentId: 'niche', hypothesisId: 'h',
    tools: ['sql'], sourceRefs: [ref], verifierId: 'reviewer', utility: 1, cost: 1, intervention: { tool: 'sql' } }] }, []);
  assert.equal(assigned.ecology.niches.length, 1);
  assert.equal(assigned.ecology.niches[0].carryingCapacity, 1);
  const search = new CounterfactualSearch({ maxIterations: 2 });
  const blocked = await search.search({ topology: 'trinity' }, { db, spiral: {
    scopeId: 'MISSION:empty-search', runId: 'search', authorize: async () => true,
    propose: async () => [], adapters: { snapshot: async () => ({}), execute: async () => ({}), verify: async () => ({}), restore: async () => {} }
  } });
  assert.equal(blocked.mode, 'verified-spiral');
  assert.equal(blocked.iterations, 1);
}
module.exports = run;

async function extensionChecks(db, graph, runtime) {
  const renamed = { ...graph, rootNodeId: 'renamed-root', nodes: [{ nodeId: 'renamed-root', kind: 'TOPOLOGY', topology: 'trinity' }] };
  await assert.rejects(runtime.execute(renamed, { db }), /UNBOUND_ROOT/);
  await assert.rejects(graphRuntime.bindGraph(db, renamed, { scopeId: 'MISSION:reset-alias', units: 10000000 }), /SCOPE_CONFLICT/);
  const extended = { ...graph, nodes: [...graph.nodes, { nodeId: 'new-child', kind: 'TOPOLOGY', topology: 'biome' }] };
  await assert.rejects(runtime.execute(extended, { db }), /UNBOUND_NODE/);
  const before = await db.get('SELECT available_units FROM morph_risk_grants WHERE grant_id = ?', ['risk:MISSION:graph']);
  await graphRuntime.bindGraph(db, extended, { scopeId: 'MISSION:graph', units: 10000000 });
  const after = await db.get('SELECT available_units FROM morph_risk_grants WHERE grant_id = ?', ['risk:MISSION:graph']);
  assert.ok(after.available_units < before.available_units);
  assert.equal((await lineage.node(db, 'new-child')).scope_id, 'MISSION:graph');
  await graphRuntime.assertBindings(db, extended);
  const changed = { ...graph, nodes: graph.nodes.map((node) => ({ ...node, topology: 'biocenose' })) };
  await assert.rejects(graphRuntime.bindGraph(db, changed, { scopeId: 'MISSION:graph' }), /TOPOLOGY_TRANSITION/);
}
