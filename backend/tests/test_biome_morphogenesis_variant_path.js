'use strict';

const assert = require('node:assert/strict');
const continuation = require('../src/services/morphogenesis/missionMorphogenesisContinuation');
const execution = require('../src/services/morphogenesis/missionMorphologyExecution');
const binding = require('../src/services/morphogenesis/morphogenesisMissionBinding');
const admission = require('../src/services/morphogenesis/morphogenesisStrategyAdmission');
const expression = require('../src/services/morphogenesis/expression/morphologyExpression');
const { compileExpression } = require('../src/services/morphogenesis/graph/morphologyCompiler');

const GRAPH_OPTIONS = Object.freeze({ missionId: 'mission-biome-variant', mission: 'Maintenir le service.',
  globalBudget: { tokens: 1000, growth: 1 }, version: 2, status: 'proposed' });
const POLICY = Object.freeze({ kind: 'conditional_morphogenesis_policy', status: 'proposed',
  diagnosis: { signals: {} } });

function plannerPlan(selectedVariant) {
  return { selectedTopology: 'biome', selectedVariant,
    controlReceipt: { topology: { rankings: [{ topology: 'biome' }, { topology: 'rhizome' }] } } };
}

function compositeGraph(selectedVariant) {
  const expr = continuation.adaptiveExpression({ plan: plannerPlan(selectedVariant), state: { plan: {} },
    signals: { failures: 1, average: 40, spread: 10 }, capacity: 3, challenge: null, policy: null });
  return compileExpression(expr, GRAPH_OPTIONS);
}

function leaves(graph) {
  return graph.nodes.filter((node) => node.kind === 'TOPOLOGY');
}

function verifyCompositeKeepsSelectedVariant() {
  const [primary, alternative] = leaves(compositeGraph('resilience'));
  assert.equal(primary.topology, 'biome');
  assert.equal(primary.variant, 'resilience', 'the planner variant must reach the primary leaf');
  assert.equal(alternative.variant || null, null, 'the alternative keeps its own baseline');
  assert.equal(leaves(compositeGraph('default'))[0].variant || null, null,
    'the default alias is not a Biome runtime variant');
}

function verifyAdmissionSeesSelectedVariant() {
  const actualPlan = { selectedTopology: 'biome', selectedVariant: 'resilience',
    morphologyPatch: { graph: compositeGraph('resilience') } };
  const admitted = admission.admitPlannerTransition({ policy: POLICY, actualPlan });
  assert.notEqual(admitted.reason, 'planner_transition_graph_mismatch');
  const bare = compileExpression(expression.competeExpression([
    expression.topologyExpression('biome'), expression.topologyExpression('rhizome')]), GRAPH_OPTIONS);
  const refused = admission.admitPlannerTransition({ policy: POLICY,
    actualPlan: { ...actualPlan, morphologyPatch: { graph: bare } } });
  assert.equal(refused.reason, 'planner_transition_graph_mismatch',
    'a graph that drops the selected variant stays refused');
}

function evidenceReport() {
  return { outcome: 'success', workerArtifact: { type: 'report', content: 'verified',
    provenance: { sourceRefs: ['source:biome-variant-path'] } } };
}

function missionContext(graph) {
  const assignments = ['worker-1', 'worker-2'].map((agentId) => ({ agentId, workerId: agentId,
    role: 'population', capabilities: [], morphologyNodeId: graph.rootNodeId }));
  const results = assignments.map((worker) => ({ workerId: worker.agentId, evidenceReport: evidenceReport() }));
  const autonomyPlan = { selectedTopology: 'biome', tokenPolicy: { rounds: { workerPool: 1000 } },
    morphogenesisDispatchAssignments: assignments,
    morphogenesisPlan: { selectedTopology: 'biome', morphologyPatch: { graph } } };
  binding.bindDispatchResults(autonomyPlan, assignments, results);
  return { agentId: 'orchestrator-1', autonomyPlan,
    normalizedMission: { missionId: GRAPH_OPTIONS.missionId, prompt: GRAPH_OPTIONS.mission, toolLease: ['read'] } };
}

async function runBiomeLeaf(variant) {
  const { MorphologyRuntime } = require('../src/services/morphogenesis/runtime/morphologyRuntime');
  const graph = compileExpression(expression.topologyExpression('biome', variant), GRAPH_OPTIONS);
  const ctx = missionContext(graph);
  const runtime = new MorphologyRuntime({ globalBudget: { tokens: 1000 } });
  const input = { mission: ctx.normalizedMission.prompt, missionId: ctx.normalizedMission.missionId,
    workerResults: ctx.autonomyPlan.workerResults, authority: ['read'], maxTicks: 2 };
  return (await runtime.execute(graph, input)).output;
}

async function verifyRuntimeRunsSelectedVariantOnMissionBudget() {
  const output = await runBiomeLeaf('resilience');
  assert.equal(output.variant, 'resilience');
  assert.equal(output.ecology.individuals, 2, 'mission workers colonize the ecosystem');
  assert.ok(output.actions.some((action) => action.type === 'DISTURBANCE_ASSESSED'),
    'the resilience controller decides each cycle');
  const resources = output.cycles[0].measurements.resources;
  assert.equal(resources.budgetTotal, 1000, 'the node token share bounds the ecological budget');
  assert.equal(output.goalVerified, false, 'no goal oracle was supplied, so nothing is claimed verified');
  assert.equal((await runBiomeLeaf('default')).variant, 'resource',
    'the default alias resolves through the Biome selector instead of failing');
}

async function verifyCompositeExecutionCarriesVariant() {
  const graph = compositeGraph('resilience');
  let observed;
  const ctx = { ...missionContext(graph), db: undefined };
  await execution.executeCompositeMorphology(ctx, { runtime: {
    execute: async (received) => { observed = leaves(received)[0]; return { output: 'observed' }; } } });
  assert.equal(observed.variant, 'resilience');
}

async function main() {
  verifyCompositeKeepsSelectedVariant();
  verifyAdmissionSeesSelectedVariant();
  await verifyRuntimeRunsSelectedVariantOnMissionBudget();
  await verifyCompositeExecutionCarriesVariant();
  console.log('Biome variant reaches the morphogenesis runtime: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
