'use strict';

const assert = require('node:assert/strict');
const { compileExpression } = require('../src/services/morphogenesis/graph/morphologyCompiler');
const { validateMorphologyGraph } = require('../src/services/morphogenesis/graph/morphologyGraphValidator');
const { MorphologyRuntime } = require('../src/services/morphogenesis/runtime/morphologyRuntime');
const { installTopologyPlugins } = require('../src/services/morphogenesis/runtime/topologyPlugins');
const { checkAuthority } = require('../src/services/morphogenesis/typing/authorityCompatibility');
const {
  nestExpression, parallelExpression, sequenceExpression, gateExpression, topologyExpression
} = require('../src/services/morphogenesis/expression');

const MISSION = 'morphology-graph-execution-gate';
const BUDGET = { tokens: 120 };
const INPUT = {
  hypotheses: [{ confidence: 0.8 }, { confidence: 0.2 }],
  evidence: [],
  problemSpace: ['p1'],
  requirements: ['r1'],
  work_packages: ['w1'],
  document: { d: 1 },
  operations: [],
  measurements: { productivity: 1 }
};

function topo(name) {
  return topologyExpression(name, null, { mission: MISSION });
}

function freshRuntime() {
  const runtime = new MorphologyRuntime({ globalBudget: { ...BUDGET } });
  installTopologyPlugins(runtime);
  return runtime;
}

function kindsOf(receipts) {
  return receipts.map((receipt) => receipt.kind).sort();
}

async function gateNest() {
  const expression = nestExpression(
    topo('a_team'),
    parallelExpression([topo('trinity'), topo('rhizome')], { mission: MISSION }),
    { mission: MISSION }
  );
  const graph = compileExpression(expression, { mission: MISSION, globalBudget: { ...BUDGET } });
  assert.equal(validateMorphologyGraph(graph).valid, true, 'NEST graph must be structurally valid');
  const result = await freshRuntime().execute(graph, INPUT);
  assert.equal(result.output.length, 2, 'NEST inner PARALLEL must return 2 branch outputs');
  assert.ok(result.output[0].verified_claims, 'Trinity branch must return verified_claims');
  assert.ok(result.output[1].explored_paths, 'Rhizome branch must return explored_paths');
  assert.ok(result.receipts.length >= 3, 'host + branches + operator receipts expected');
  assert.ok(result.evidence.length > 0, 'evidence dossiers must be collected');
  return result;
}

async function gateSequence() {
  const gate = gateExpression({
    condition: topo('rhizome'),
    thenBranch: topo('a_team'),
    elseBranch: topo('trinity')
  });
  const expression = sequenceExpression(
    [parallelExpression([topo('trinity'), topo('rhizome')], { mission: MISSION }), gate, topo('a_team')],
    { mission: MISSION }
  );
  const graph = compileExpression(expression, { mission: MISSION, globalBudget: { tokens: 200 } });
  assert.equal(validateMorphologyGraph(graph).valid, true, 'SEQUENCE graph must be structurally valid');
  const runtime = new MorphologyRuntime({ globalBudget: { tokens: 200 } });
  installTopologyPlugins(runtime);
  const result = await runtime.execute(graph, INPUT);
  assert.ok(Array.isArray(result.output.verified_claims), 'SEQUENCE must end on A-Team output');
  assert.ok(result.output.architecture, 'A-Team output must carry the architecture subsystem');
  assert.deepEqual(kindsOf(result.receipts), ['GATE', 'PARALLEL', 'SEQUENCE', 'TOPOLOGY', 'TOPOLOGY', 'TOPOLOGY', 'TOPOLOGY', 'TOPOLOGY'], 'one receipt per executed node expected (GATE runs condition + selected branch only)');
  const gateReceipt = result.receipts.find((receipt) => receipt.kind === 'GATE');
  assert.ok(gateReceipt.output.selectedBranch, 'GATE receipt must name the selected branch');
  assert.ok(gateReceipt.output.rejectedNodeId, 'GATE receipt must name the rejected branch');
  assert.ok(gateReceipt.output.reason, 'GATE receipt must carry a reason');
  return result;
}

async function gateFailClosed() {
  const graph = compileExpression(topo('no_such_topology_xyz'), { mission: MISSION, globalBudget: { ...BUDGET } });
  let error = null;
  try {
    await freshRuntime().execute(graph, INPUT);
  } catch (err) {
    error = err;
  }
  assert.ok(error, 'unregistered topology must fail');
  assert.match(error.message, /not registered/, 'fail-closed message expected');
}

async function gateAuthorityAndLearning() {
  const graph = {
    nodes: [
      { nodeId: 'root', parentNodeId: null, authorityBoundary: ['read'] },
      { nodeId: 'child', parentNodeId: 'root', authorityBoundary: ['read', 'write'] }
    ],
    edges: [{ edgeId: 'grant', type: 'AUTHORIZES', fromNodeId: 'root', toNodeId: 'child', properties: { grants: ['write'] } }]
  };
  const errors = checkAuthority(graph);
  assert.ok(errors.some((error) => error.includes('parent authority envelope')));
  assert.ok(errors.some((error) => error.includes('outside target authority')));
  assert.ok(errors.some((error) => error.includes('exceeds source authority')));

  const experiences = [];
  const runtime = new MorphologyRuntime({ globalBudget: { ...BUDGET }, experienceStore: { add: (entry) => experiences.push(entry) } });
  installTopologyPlugins(runtime);
  await runtime.execute(compileExpression(topo('rhizome'), { mission: MISSION, globalBudget: { ...BUDGET } }), INPUT);
  assert.equal(experiences.length, 0, 'unmeasured topology output must not become a zero-quality learning sample');
}

async function run() {
  await gateNest();
  await gateSequence();
  await gateFailClosed();
  await gateAuthorityAndLearning();
  console.log('Morphology graph execution (no stubs, no sqlite): passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
