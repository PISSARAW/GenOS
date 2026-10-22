'use strict';

const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const { compileExpression } = require('../src/services/morphogenesis/graph/morphologyCompiler');
const { validateMorphologyGraph } = require('../src/services/morphogenesis/graph/morphologyGraphValidator');
const { MorphologyRuntime } = require('../src/services/morphogenesis/runtime/morphologyRuntime');
const { installTopologyPlugins } = require('../src/services/morphogenesis/runtime/topologyPlugins');
const {
  topologyExpression, competeExpression, bridgeExpression, federateExpression,
  gateExpression, parallelExpression
} = require('../src/services/morphogenesis/expression');
const { VariantRegistry } = require('../src/services/morphogenesis/variants/variantRegistry');

const MISSION = 'morphology-gate-operators';
const BUDGET = { tokens: 120, growth: 1 };
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

let gateDb = null;
async function ensureDb() {
  if (!gateDb) {
    process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'gate-test-password-2026';
    process.env.GENOS_DB_BACKUP_SKIP = '1';
    gateDb = await require('../src/db').getDatabase(':memory:');
  }
  return gateDb;
}

function freshRuntime(options = {}) {
  const runtime = new MorphologyRuntime({ globalBudget: { ...BUDGET }, ...options });
  installTopologyPlugins(runtime);
  return runtime;
}

function topo(name, variant = null) {
  return topologyExpression(name, variant, { mission: MISSION });
}

function childIds(graph) {
  return graph.nodes.filter((node) => node.parentNodeId === graph.rootNodeId);
}

async function exec(graph, input = INPUT) {
  return freshRuntime().execute(graph, input);
}

function hashText(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function proofHashFor(adapter, role) {
  const implementationHash = hashText(Function.prototype.toString.call(adapter));
  const adapterId = (adapter.name || role) || role;
  const identity = { schema: 'genos.holobiont-adapter-provenance/v1', role, adapterId, adapterVersion: null, implementationHash };
  return hashText(JSON.stringify(identity));
}

async function gateCompete() {
  const expression = competeExpression([topo('trinity'), topo('rhizome')], { mission: MISSION });
  const graph = compileExpression(expression, { mission: MISSION, globalBudget: { ...BUDGET } });
  assert.equal(validateMorphologyGraph(graph).valid, true, 'COMPETE graph must be structurally valid');
  const result = await exec(graph);
  const receipt = result.receipts.find((entry) => entry.kind === 'COMPETE');
  assert.ok(receipt, 'COMPETE receipt must exist');
  assert.ok(receipt.output.winner, 'COMPETE must name a winner');
  assert.ok(['trinity', 'rhizome'].includes(receipt.output.winner), 'winner must be a candidate topology');
  assert.ok(receipt.output.winnerNodeId, 'COMPETE must name the winner node');
  const winnerNode = graph.nodes.find((node) => node.nodeId === receipt.output.winnerNodeId);
  assert.ok(winnerNode, 'winner node must exist in the graph');
  assert.equal(winnerNode.topology, receipt.output.winner);
  assert.ok(result.output.executionMode, 'winning output must carry an execution mode');
}

async function gateBridgeContractViolated() {
  const adapter = { name: 'strict', contract: { requiredOutputs: ['missing_key_xyz'] } };
  const expression = bridgeExpression({ source: topo('trinity'), target: topo('rhizome'), adapter });
  const graph = compileExpression(expression, { mission: MISSION, globalBudget: { ...BUDGET } });
  assert.equal(validateMorphologyGraph(graph).valid, true, 'BRIDGE graph must be structurally valid');
  let error = null;
  try {
    await exec(graph);
  } catch (err) {
    error = err;
  }
  assert.ok(error, 'violated bridge contract must fail closed');
  assert.match(error.message, /contract violated/, 'fail-closed message expected');
}

async function gateBridgeValidBundle() {
  const adapter = { name: 'bundle', transform: 'to_transfer_bundle' };
  const expression = bridgeExpression({ source: topo('trinity'), target: topo('rhizome'), adapter });
  const graph = compileExpression(expression, { mission: MISSION, globalBudget: { ...BUDGET } });
  assert.equal(validateMorphologyGraph(graph).valid, true, 'BRIDGE graph must be structurally valid');
  const [sourceNode, targetNode] = childIds(graph);
  const result = await exec(graph);
  const receipt = result.receipts.find((entry) => entry.kind === 'BRIDGE');
  assert.ok(receipt, 'BRIDGE receipt must exist');
  assert.ok(receipt.output.translated, 'translated bundle must be produced');
  assert.equal(receipt.output.provenance.from, sourceNode.nodeId, 'provenance must name the source node');
  assert.equal(receipt.output.provenance.to, targetNode.nodeId, 'provenance must name the target node');
  assert.equal(receipt.output.provenance.adapter, 'bundle');
  assert.equal(receipt.output.preservation.passed, true, 'semantic preservation must pass');
  assert.equal(result.output.executionMode, 'simulated_controller', 'target topology must receive the transfer');
}

async function gateFederate() {
  const expression = federateExpression([topo('trinity'), topo('rhizome')], { mission: MISSION });
  const graph = compileExpression(expression, { mission: MISSION, globalBudget: { ...BUDGET } });
  assert.equal(validateMorphologyGraph(graph).valid, true, 'FEDERATE graph must be structurally valid');
  const result = await exec(graph);
  const receipt = result.receipts.find((entry) => entry.kind === 'FEDERATE');
  assert.ok(receipt, 'FEDERATE receipt must exist');
  assert.equal(receipt.output.quorumMet, true, 'FEDERATE quorum must be met');
  assert.equal(receipt.output.successful, 2, 'both federated members must complete');
  assert.equal(receipt.output.dispute, true, 'member outputs must differ');
  assert.equal(result.output.executionMode, 'simulated_controller', 'federate output must carry an execution mode');
}

async function gateGateAutonome() {
  const expression = gateExpression({ condition: topo('trinity'), thenBranch: topo('a_team'), elseBranch: topo('rhizome') }, { mission: MISSION });
  const graph = compileExpression(expression, { mission: MISSION, globalBudget: { ...BUDGET } });
  assert.equal(validateMorphologyGraph(graph).valid, true, 'GATE graph must be structurally valid');
  const [, thenNode, elseNode] = childIds(graph);
  const result = await exec(graph);
  const receipt = result.receipts.find((entry) => entry.kind === 'GATE');
  assert.ok(receipt, 'GATE receipt must exist');
  assert.equal(receipt.output.selectedBranch, 'else', 'condition without a truthy value must select the else branch');
  assert.equal(receipt.output.selectedNodeId, elseNode.nodeId);
  assert.equal(receipt.output.rejectedNodeId, thenNode.nodeId);
  assert.ok(receipt.output.reason, 'GATE receipt must carry a reason');
  assert.ok(result.output.explored_paths, 'Rhizome else branch must return explored_paths');
}

async function gateParallelAutonome() {
  const expression = parallelExpression([topo('trinity'), topo('rhizome')], { mission: MISSION });
  const graph = compileExpression(expression, { mission: MISSION, globalBudget: { ...BUDGET } });
  assert.equal(validateMorphologyGraph(graph).valid, true, 'PARALLEL graph must be structurally valid');
  const result = await exec(graph);
  assert.equal(Array.isArray(result.output), true, 'PARALLEL output must be an array of branch outputs');
  assert.equal(result.output.length, 2, 'PARALLEL must return both branch outputs');
  assert.equal(result.output[0].executionMode, 'simulated_controller', 'first branch must carry an execution mode');
  assert.equal(result.output[1].executionMode, 'simulated_controller', 'second branch must carry an execution mode');
}

async function gateChangeVariant() {
  const registry = new VariantRegistry();
  registry.registerTransition({ fromTopology: 'trinity', fromVariant: 'heterogeneous', toTopology: 'trinity', toVariant: 'adversarial' });
  const expression = topo('trinity', 'heterogeneous');
  const graph = compileExpression(expression, { mission: MISSION, globalBudget: { ...BUDGET } });
  assert.equal(validateMorphologyGraph(graph).valid, true, 'variant graph must be structurally valid');
  const rootNode = graph.nodes.find((node) => node.nodeId === graph.rootNodeId);
  assert.equal(rootNode.variant, 'heterogeneous');
  const runtime = freshRuntime({ variantRegistry: registry });
  const result = await runtime.changeVariant({
    nodeId: rootNode.nodeId, graph, newVariant: 'adversarial',
    execContext: {
      adjudicator: { adjudicate: async () => ({ approved: true, reason: 'gate test' }) },
      committer: { commit: async (input) => ({ committed: true, graph: input.graph }) },
      counterfactual: async () => ({ accepted: true })
    }
  });
  assert.equal(result.success, true, 'verified variant patch must succeed');
  assert.equal(result.changed, true, 'variant must be changed');
  const patched = result.graph.nodes.find((node) => node.nodeId === rootNode.nodeId);
  assert.equal(patched.variant, 'adversarial');
  assert.equal(result.graph.version, graph.version + 1, 'graph version must be incremented by one');
}

async function gateTopologyBiome() {
  const input = { ...INPUT, mission: MISSION, maxTicks: 4, capability: 'read', db: await ensureDb() };
  const expression = topo('biome');
  const graph = compileExpression(expression, { mission: MISSION, globalBudget: { ...BUDGET } });
  assert.equal(validateMorphologyGraph(graph).valid, true, 'Biome graph must be structurally valid');
  const result = await exec(graph, input);
  assert.equal(result.output.executionMode, 'service_runtime', 'Biome must run in service runtime mode');
  assert.ok(result.output.sessionId, 'Biome must produce a session id');
  assert.ok(result.output.ecology, 'Biome must return an ecology snapshot');
  assert.equal(Array.isArray(result.output.cycles), true, 'Biome must report executed cycles');
  assert.equal(result.output.cycles.length, 4, 'Biome must run the requested number of ticks');
}

async function gateTopologyBiocenose() {
  const input = {
    ...INPUT, mission: MISSION,
    jury: [ { memberId: 'juror-1', role: 'critic' }, { memberId: 'juror-2', role: 'supporter' } ],
    ballots: {
      'juror-1': { vote: 'approve', confidence: 0.9, evidenceRefs: ['e1'] },
      'juror-2': { vote: 'approve', confidence: 0.8, evidenceRefs: ['e2'] }
    }
  };
  const expression = topo('biocenose');
  const graph = compileExpression(expression, { mission: MISSION, globalBudget: { ...BUDGET } });
  assert.equal(validateMorphologyGraph(graph).valid, true, 'Biocenose graph must be structurally valid');
  const result = await exec(graph, input);
  assert.equal(result.output.executionMode, 'simulated_controller', 'Biocenose must identify its local execution mode');
  assert.equal(result.output.verdict, 'approved', 'unanimous evidenced jury must approve');
  assert.equal(result.output.approved, true, 'Biocenose approved flag must be set');
}

async function gateTopologyHolobionte() {
  const db = await ensureDb();
  const allocation = { policy: { tokens: { basal: 1, preferred: 2, maximum: 10, burstAllowance: 1 } }, available: { tokens: 10 } };
  const trialCapabilityExecutor = async (invocation) => ({
    result: 'trial-result', contributionScore: 0.9, riskScore: 0, contractCompliant: true, unsafeBehavior: false,
    resourcesConsumed: { tokens: 1 },
    verification: { status: 'VERIFIED', verifierId: 'verifier-1', evidenceRefs: ['read-proof'], resultHash: null, selfVerified: false },
    isolationProof: {
      schema: 'genos.holobiont-isolation-proof/v1', status: 'VERIFIED', isolationId: 'iso-1', mechanism: 'sandbox',
      observedAt: new Date().toISOString(),
      boundaries: { process: 'ISOLATED', workspace: 'EPHEMERAL', network: 'DENIED' },
      evidenceRefs: ['read-proof'],
      adapterProofHash: proofHashFor(trialCapabilityExecutor, 'trial')
    }
  });
  const executeCapability = async (invocation) => ({ receiptId: randomUUID(), result: 'holo-result', benefitScore: 0.8, evidenceQuality: 0.9, costScore: 0.2, riskScore: 0.1, contractCompliant: true, unsafeBehavior: false, resourcesConsumed: { tokens: 1 } });
  const verifyCapability = async (invocation) => ({ status: 'VERIFIED', verifierId: 'verifier-1', evidenceRefs: ['read-proof'], resultHash: invocation.resultHash, selfVerified: false });
  const input = {
    db, mission: MISSION, hostId: 'h1', missionId: 'mission-1', capability: 'read',
    allocation, steps: [{ capability: 'read', request: {}, allocation }],
    executeCapability, verifyCapability, trialCapabilityExecutor
  };
  const expression = topo('holobionte');
  const graph = compileExpression(expression, { mission: MISSION, globalBudget: { ...BUDGET } });
  assert.equal(validateMorphologyGraph(graph).valid, true, 'Holobionte graph must be structurally valid');
  const result = await exec(graph, input);
  assert.equal(result.output.status, 'VERIFIED', 'Holobionte mission must verify');
  assert.equal(result.output.executionMode, 'service_runtime', 'Holobionte must run in service runtime mode');
  assert.ok(result.output.sessionId || result.output.holobiontId, 'Holobionte must produce a session');
}

async function gateTopologySyncytium() {
  const input = { ...INPUT, mission: MISSION, document: { a: 1, b: 2 },
    operations: [ { operationId: 'op-1', type: 'set', path: 'a', value: 9 }, { operationId: 'op-2', type: 'set', path: 'c', value: 3 } ] };
  const expression = topo('syncytium');
  const graph = compileExpression(expression, { mission: MISSION, globalBudget: { ...BUDGET } });
  assert.equal(validateMorphologyGraph(graph).valid, true, 'Syncytium graph must be structurally valid');
  const result = await exec(graph, input);
  assert.equal(result.output.executionMode, 'simulated_controller', 'Syncytium must identify its local execution mode');
  assert.equal(result.output.converged, true, 'applied CRDT operations must converge');
  assert.equal(result.output.merged_document.a, 9, 'set operation must be applied');
  assert.equal(result.output.merged_document.c, 3, 'second set operation must be applied');
  assert.equal(result.output.conflicts.length, 0, 'no conflicts on valid operations');
}

async function gateTopologyMetapopulation() {
  const input = { ...INPUT, mission: MISSION, maxTicks: 4, capability: 'read', db: await ensureDb() };
  const expression = topo('metapopulation');
  const graph = compileExpression(expression, { mission: MISSION, globalBudget: { ...BUDGET } });
  assert.equal(validateMorphologyGraph(graph).valid, true, 'Metapopulation graph must be structurally valid');
  const result = await exec(graph, input);
  assert.equal(result.output.executionMode, 'service_runtime', 'Metapopulation must run in service runtime mode');
  assert.ok(result.output.sessionId, 'Metapopulation must produce a session id');
  assert.ok(typeof result.output.status === 'string', 'Metapopulation must report a status');
  assert.ok(result.output.variant, 'Metapopulation must carry a variant');
}

async function run() {
  await gateCompete();
  await gateBridgeContractViolated();
  await gateBridgeValidBundle();
  await gateFederate();
  await gateGateAutonome();
  await gateParallelAutonome();
  await gateChangeVariant();
  await gateTopologyBiome();
  await gateTopologyBiocenose();
  await gateTopologyHolobionte();
  await gateTopologySyncytium();
  await gateTopologyMetapopulation();
  console.log('Morphology gate operators coverage: passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
