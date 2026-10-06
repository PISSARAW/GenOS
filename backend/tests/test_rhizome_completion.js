'use strict';

const assert = require('node:assert/strict');
const rhizome = require('../src/services/rhizomeCoordinationService');
const runtime = require('../src/services/rhizome/runtime/rhizomeRuntime');
const routing = require('../src/services/rhizome/routing/routePlanner');
const fx = require('./helpers/rhizomeExecutionFixtures');

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'rhizome-completion-test-secret';

async function verifiedNeeds() {
  const session = await rhizome.composeRhizome('Complete every explicit need.', {
    nodes: [fx.node('source'), fx.node('tool', ['answer'])], edges: [fx.edge('bridge', 'source', 'tool')] });
  const needs = Array.from({ length: 5 }, (_, index) => ({ needId: 'need-' + index, capability: 'answer' }));
  const result = await runtime.run({ sessionId: session.sessionId, needs, dynamicVariants: false,
    trustedVerifierDigests: [fx.DIGEST], execute: async () => ({ answer: 42 }), verify: fx.makeReceipt });
  assert.equal(result.results.length, 5, 'stable routing must not skip unprocessed needs');
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.completion.metrics.coverage, 1);
  assert.equal(session.routeResults.length, 5);
  assert.ok(result.completion.latencySamplesMs.every(value => value >= 0));
  const before = await rhizome.graphSnapshot(session.sessionId);
  const replay = await rhizome.recordRouteOutcome(session.sessionId, session.routeResults[0].receipt, { trustedVerifierDigests: [fx.DIGEST] });
  assert.equal(replay.duplicate, true);
  assert.deepEqual(await rhizome.graphSnapshot(session.sessionId), before, 'replay cannot reinforce edges');
  const untrusted = await rhizome.missionMetrics(session.sessionId, { needs, trustedVerifierDigests: [] });
  assert.equal(untrusted.canMerge, false);
  assert.equal(untrusted.metrics.coverage, 0);
  await rhizome.closeSession(session.sessionId);
}

async function growAndExecute() {
  let started = 0, executed = 0, stopped = 0;
  const session = await rhizome.composeRhizome('Attach a real local capability.', { variant: 'routing', budgets: { growth: 1 } });
  const worker = runtime.create({ trustedProviderIds: ['local-service'], trustedVerifierDigests: [fx.DIGEST],
    registrations: [{ providerId: 'local-service', kind: 'service', capabilities: ['answer'],
      start: async () => { started += 1; return { instanceId: 'running-service' }; },
      stop: async () => { stopped += 1; },
      probe: async () => ({ status: 'AVAILABLE', reliability: 0.95, evidenceRefs: ['live-probe:1'] }),
      execute: async () => { executed += 1; return { answer: 42 }; } }],
    verifiers: [{ verifierId: 'independent-review', verifierDigest: fx.DIGEST, capabilities: ['answer'],
      verifyCapability: fx.makeProof, verifyRoute: fx.makeReceipt }] });
  const result = await worker.run({ sessionId: session.sessionId, needs: [{ needId: 'grown', capability: 'answer' }],
    candidates: context => [fx.candidate(context)], dynamicVariants: false });
  assert.equal(result.results[0].status, 'GROWTH_ADMITTED_ROUTE_READY', JSON.stringify(result.results[0].execution));
  assert.equal(result.results[1].status, 'ROUTE_SUCCESS');
  assert.equal(result.status, 'VERIFIED');
  assert.equal(started, 1);
  assert.equal(executed, 1);
  assert.ok(Math.abs(session.budgets.growth - 0.8) < 1e-9);
  assert.equal(session.openGaps.length, 0);
  await assert.rejects(() => rhizome.admitGrowthCandidate(session.sessionId, { expectedGraphVersion: 0, edges: [] }), { code: 'RHIZOME_GROWTH_STALE' });
  const closed = await worker.close({ sessionId: session.sessionId });
  assert.equal(closed.closed, true);
  assert.equal(stopped, 1);
}

async function rollbackAndWaiting() {
  const session = await rhizome.composeRhizome('Reject incomplete admission.', { budgets: { growth: 1 } });
  const worker = runtime.create({ trustedProviderIds: [], trustedVerifierDigests: [] });
  const result = await worker.run({ sessionId: session.sessionId, needs: [{ needId: 'missing', capability: 'answer' }],
    candidates: context => [fx.candidate(context)], dynamicVariants: false });
  assert.equal(result.status, 'INCOMPLETE');
  assert.equal(session.budgets.growth, 1);
  assert.equal(session.nodes.length, 0);
  const snapshot = await rhizome.graphSnapshot(session.sessionId);
  await assert.rejects(() => rhizome.manageCoordinationLocus(session.sessionId, { action: 'assign', locus: {} }), { code: 'RHIZOME_LOCUS_NO_HOLDER' });
  assert.deepEqual(await rhizome.graphSnapshot(session.sessionId), snapshot);
  await rhizome.closeSession(session.sessionId);
}

function boundedSearch() {
  const nodes = [fx.node('source'), fx.node('a'), fx.node('b'), fx.node('target', ['answer'])];
  const edges = [fx.edge('sa', 'source', 'a'), fx.edge('sb', 'source', 'b'), fx.edge('at', 'a', 'target'), fx.edge('bt', 'b', 'target')];
  const graph = { nodes, edges, coordinationLoci: [{ holderNodeId: 'source' }] };
  const need = { needId: 'route', capability: 'answer' };
  const exhausted = routing.plan(graph, need, { maxWork: 1 });
  assert.equal(exhausted.search.exhausted, true);
  assert.equal(exhausted.search.inspectedEdges, 1);
  assert.equal(exhausted.selected, false);
  const low = routing.plan(graph, need, { selection: 'softmax', random: () => 0 });
  const high = routing.plan(graph, need, { selection: 'softmax', random: () => 0.9999 });
  assert.notEqual(low.route.routeId, high.route.routeId);
  assert.ok(Math.abs(low.probabilities.reduce((sum, item) => sum + item.probability, 0) - 1) < 1e-12);
  assert.throws(() => routing.plan(graph, need, { selection: 'softmax', temperature: 0 }), { code: 'RHIZOME_ROUTING_TEMPERATURE_INVALID' });
}

async function run() {
  boundedSearch();
  await verifiedNeeds();
  await growAndExecute();
  await rollbackAndWaiting();
}

run().then(() => console.log('Rhizome completion, growth execution, budgets, replay and bounded routing: PASS'))
  .catch(error => { console.error(error); process.exitCode = 1; });
