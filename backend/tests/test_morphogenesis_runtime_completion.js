'use strict';
const assert = require('node:assert/strict');
const { runMorphogenesisRuntime } = require('../src/services/morphogenesis/runtime/morphogenesisRuntimeV2');
const { MorphologyRuntime } = require('../src/services/morphogenesis/runtime/morphologyRuntime');
const { compileExpression } = require('../src/services/morphogenesis/graph/morphologyCompiler');
const { topologyExpression, parallelExpression } = require('../src/services/morphogenesis/expression');
const { ControlLoopOrchestrator } = require('../src/services/morphogenesis/control/orchestrator');
const { StructuralControlLoop } = require('../src/services/morphogenesis/control/structuralControlLoop');
const rollbackPlan = { restoreDomains: ['graph', 'workers', 'leases', 'state', 'budgets'] };
function graphFor(expression) {
  return compileExpression(expression, { mission: 'completion', globalBudget: { tokens: 100 } });
}
function services(calls, decision = 'APPLY') {
  return {
    observe: async () => ({}), diagnose: async () => ({}), generateNeeds: async () => ({}),
    repairOrSynthesize: async () => ({ graph: graphFor(topologyExpression('trinity')), rollbackPlan }),
    typeCheck: async () => ({ valid: true }), hardGate: async () => ({ passed: true }),
    paretoEvaluate: async () => ({ accepted: true }),
    kernel: { adjudicate: async () => ({ valid: true, decision, command: { id: 'authorized' } }) },
    governance: async () => { calls.push('governance'); return { allowed: true }; },
    transition: async input => { calls.push('transition'); assert.equal(input.authorization.decision.decision, 'APPLY'); return { committed: true }; },
    credit: async () => { calls.push('credit'); return {}; }, memory: async () => { calls.push('memory'); return {}; }
  };
}
async function authorityGates() {
  for (const decision of ['REJECT', 'ROLLBACK', 'SHADOWED', undefined]) {
    const calls = []; const adapters = services(calls, decision || 'UNKNOWN');
    const result = await runMorphogenesisRuntime({}, adapters);
    assert.equal(result.committed, false); assert.deepEqual(calls, []);
  }
  const calls = []; const adapters = services(calls);
  assert.equal((await runMorphogenesisRuntime({}, adapters)).committed, true);
  assert.deepEqual(calls, ['governance', 'transition', 'credit', 'memory']);
  calls.length = 0;
  assert.equal((await runMorphogenesisRuntime({ mode: 'shadow' }, adapters)).decision, 'SHADOWED');
  assert.deepEqual(calls, []);
  assert.equal((await runMorphogenesisRuntime({ mode: 'typo' }, adapters)).decision, 'REJECTED');
  const noChange = await runMorphogenesisRuntime({}, services([], 'NO_CHANGE'));
  assert.equal(noChange.decision, 'NO_CHANGE'); assert.equal(noChange.committed, false);
  adapters.credit = async () => { throw new Error('learning store offline'); };
  const committed = await runMorphogenesisRuntime({}, adapters);
  assert.equal(committed.committed, true); assert.deepEqual(committed.learningErrors, ['learning store offline']);
}
async function governedDispatch() {
  const { MorphogenesisRuntime: MissionRuntime } = require('../src/services/morphogenesis/morphogenesisRuntime');
  const events = [];
  const runtime = new MissionRuntime({ emit: (...args) => events.push(args) });
  assert.throws(() => new MissionRuntime({ emit: {} }), /emitter/);
  const morphology = { topology: 'trinity', agents: [] };
  assert.throws(() => runtime.configureRuntimeServices({}), /Missing governed runtime services/);
  const calls = [];
  runtime.configureRuntimeServices(services(calls));
  const result = await runtime.executeMorphology(morphology);
  assert.equal(result.applied, true); assert.equal(result.proposed, false);
  const rejected = await runtime.executeMorphology(morphology, { runtimeServices: services([], 'REJECT') });
  assert.equal(rejected.applied, false); assert.equal(rejected.committed, false);
  assert.deepEqual(events.map(event => event[1]), ['MORPHOGENESIS_COMPLETED', 'MORPHOGENESIS_PROPOSED']);
  const offline = new MissionRuntime({ emit: () => { throw new Error('telemetry unavailable'); } });
  offline.configureRuntimeServices(services([]));
  const confirmed = await offline.executeMorphology(morphology);
  assert.equal(confirmed.applied, true); assert.equal(confirmed.telemetryError, 'telemetry unavailable');
}

async function counterfactualGates() {
  for (const trial of [null, {}, { accepted: false }, { accepted: 1 }]) {
    const calls = []; const adapters = services(calls);
    const repair = adapters.repairOrSynthesize;
    adapters.repairOrSynthesize = async () => ({ ...await repair(), counterfactualRequired: true });
    adapters.counterfactual = async () => trial;
    const result = await runMorphogenesisRuntime({}, adapters);
    assert.equal(result.committed, false); assert.deepEqual(calls, []);
  }
}
async function executionIsolation() {
  const runtime = new MorphologyRuntime({ installTopologyPlugins: false });
  const seen = [];
  runtime.registerTopology('trinity', { run: async (_args, context) => {
    assert.deepEqual(context.authority, ['read']);
    context.state.nested.items.push(context.nodeId); seen.push(context.state.nested.items.length);
    context.input.document.items.push(context.nodeId); assert.equal(context.input.document.items.length, 1);
    return { output: { ok: true }, state: context.state };
  } });
  const graph = graphFor(parallelExpression([topologyExpression('trinity'), topologyExpression('trinity')]));
  for (const node of graph.nodes) node.authorityBoundary = ['read'];
  const initialState = { nested: { items: [] } };
  const document = { items: [] };
  const result = await runtime.execute(graph, { initialState, document });
  assert.deepEqual(document.items, []);
  assert.deepEqual(seen, [1, 1]); assert.deepEqual(initialState.nested.items, []);
  assert.equal(result.state.nested.items.length, 1);
  const invalid = structuredClone(graph); invalid.nodes[0].children.push('missing');
  await assert.rejects(runtime.execute(invalid), /unknown child/);
  const frozen = graphFor(topologyExpression('trinity')); frozen.nodes[0].lifecycle = 'frozen';
  await assert.rejects(runtime.execute(frozen), /frozen/);
}
async function providerKindsAndLearning() {
  process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'morphogenesis-completion-test';
  const experiences = [];
  const runtime = new MorphologyRuntime({ installTopologyPlugins: false, experienceStore: { add: entry => experiences.push(entry) } });
  for (const kind of ['DIRECT_WORKER', 'ADAPTER', 'ENVIRONMENT']) {
    const graph = { graphId: 'provider-' + kind, version: 1, rootNodeId: 'leaf', nodes: [{ nodeId: 'leaf', kind, budget: { tokens: 10 } }], edges: [] };
    await assert.rejects(runtime.execute(graph), /Node executor required/);
    runtime.registerNodeExecutor(kind, { id: 'test-provider', execute: async () => ({ output: { quality: 1, evidenceQuality: 1 }, evidence: [{ source: 'provider' }] }) });
    const result = await runtime.execute(graph);
    assert.equal(result.receipts[0].verificationStatus, 'not_verified');
    assert.deepEqual(result.evidence, [{ source: 'provider' }]);
    assert.equal(experiences.length, 0);
  }
  const evidence = { status: 'VERIFIED', kind: 'deterministic_verifier', receiptId: 'completion-learning', success: false, value: 0.2,
    learningContext: { problemSignature: 'measured', initialMorphology: { topology: 'trinity' },
      environment: 'unit', model: 'test', harness: 'unit', budget: { tokens: 10 } } };
  const evidenceDigest = require('../src/services/morphogenesis/learning/outcomeEvidenceValidation').evidenceDigest(evidence);
  const verifierDigest = require('../src/services/verifierTrustRegistry').listVerifierDigests()[0];
  evidence.receipt = require('../src/services/epistemicVerifierReceiptService').issueReceipt({
    resultId: evidence.receiptId, evidenceDigest, verifierDigest, independent: true, status: 'verified' });
  runtime.registerTopology('trinity', { run: async () => ({ outcomeEvidence: evidence, finalOutcome: 'success', quality: 1, evidenceQuality: 1 }) });
  await runtime.execute(graphFor(topologyExpression('trinity')));
  assert.equal(experiences.length, 1); assert.equal(experiences[0].quality, 0.2);
  assert.equal(experiences[0].finalOutcome, 'failure');
  await runtime.execute(graphFor(topologyExpression('trinity')));
  assert.equal(experiences.length, 1, 'a signed receipt is learned once per runtime');
}

async function budgetAndStatePersistence() {
  const graph = { graphId: 'state', version: 1, rootNodeId: 'leaf', edges: [],
    globalBudget: { tokens: 20, compute: { cpu: 3 } },
    nodes: [{ nodeId: 'leaf', kind: 'DIRECT_WORKER', budget: { tokens: 10, compute: { cpu: 1 } }, state: { durable: { key: 7 } } }] };
  const runtime = new MorphologyRuntime({ installTopologyPlugins: false, globalBudget: { tokens: 5, compute: { cpu: 2 } } });
  runtime.registerNodeExecutor('DIRECT_WORKER', { execute: async (_input, context) => {
    assert.equal(context.budget.tokens, 5); assert.equal(context.budget.compute.cpu, 1);
    assert.equal(context.state.durable.key, 7);
    context.state.durable.key = 8;
    return { output: 'persisted', state: context.state };
  } });
  const result = await runtime.execute(graph);
  assert.equal(result.state.durable.key, 8); assert.equal(graph.nodes[0].state.durable.key, 7);
  graph.nodes[0].budget.tokens = 0;
  await assert.rejects(runtime.execute(graph), /Budget exhausted/);
  runtime.globalInvariants = [() => false];
  await assert.rejects(runtime.execute(graph), /Global morphology invariant/);
}

async function structuralCommit() {
  const graph = graphFor(topologyExpression('trinity', 'controlled'));
  const context = { graph, rollbackPlan, structuralProposals: [{ type: 'variant_change', nodeId: graph.rootNodeId, to: 'adaptive' }] };
  const loop = new StructuralControlLoop({ patchExecutor: { execute: async patch => {
    assert.equal(patch.operations[0].newVariant, 'adaptive');
    assert.deepEqual(patch.rollbackPlan, rollbackPlan);
    return { success: true, execution: { commitResult: { graph: { ...graph, version: 2 } } } };
  } } });
  const result = await loop.run(context);
  assert.equal(result.results[0].success, true); assert.equal(context.graph.version, 2);
  assert.equal(context.structuralProposals.length, 0);
}
async function serializeTicks() {
  const orchestrator = new ControlLoopOrchestrator();
  let release; let count = 0;
  const barrier = new Promise(resolve => { release = resolve; });
  orchestrator.fastLoop.run = async () => { count++; await barrier; return { executed: false }; };
  orchestrator.structuralLoop.shouldRun = () => false;
  orchestrator.evolutionaryLoop.shouldRun = () => false;
  const first = orchestrator.tick(); const second = orchestrator.tick();
  release(); await Promise.all([first, second]);
  assert.equal(count, 1); assert.equal(orchestrator.tickCount, 1);
}
async function main() {
  const { tokenBudget } = require('../src/services/morphogenesis/morphogenesisBudget');
  assert.equal(tokenBudget({ tokens: 120 }), 120); assert.equal(tokenBudget(80), 80);
  assert.equal(tokenBudget({ tokens: NaN }), 0); assert.equal(tokenBudget(-1), 0);
  await authorityGates(); await counterfactualGates(); await executionIsolation();
  await structuralCommit(); await serializeTicks(); await providerKindsAndLearning(); await governedDispatch(); await budgetAndStatePersistence();
  console.log('Morphogenesis runtime completion: PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
