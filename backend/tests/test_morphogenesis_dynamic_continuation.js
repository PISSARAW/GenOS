'use strict';

const assert = require('node:assert/strict');
const service = require('../src/services/morphogenesis/missionMorphogenesisContinuation');
const execution = require('../src/services/morphogenesis/missionMorphologyExecution');
const binding = require('../src/services/morphogenesis/morphogenesisMissionBinding');
const missionHelpers = require('../bin/orchestratorMissionHelpers.cjs');

function state(scores, policy = {}) {
  return {
    db: {},
    normalizedMission: { missionId: 'mission-1', prompt: 'Resolve the changing problem.',
      morphogenesisPolicy: policy },
    plan: {
      selectedTopology: 'a_team',
      profile: {},
      morphogenesisPlan: { selectedTopology: 'a_team',
        morphologyPatch: { graph: { graphId: 'graph-old', version: 1 } } }
    },
    results: new Map(scores.map((score, index) => [`worker-${index + 1}`, {
      agentId: `worker-${index + 1}`, status: 'completed', evidenceScore: score
    }])),
    workers: new Map(scores.map((score, index) => [`worker-${index + 1}`, {
      agentId: `worker-${index + 1}`, role: index ? 'verifier' : 'scout',
      workerKind: index ? 'verifier_worker' : 'scout_cell'
    }]))
  };
}

function planner() {
  return {
    selectedTopology: 'rhizome',
    selectedVariant: 'default',
    controlReceipt: { topology: { rankings: [
      { topology: 'rhizome', score: 0.8 },
      { topology: 'biocenose', score: 0.7 }
    ] } }
  };
}

function composeMode({ mode }) {
  const verifier = mode === 'biocenose';
  return Promise.resolve({ members: [{
    label: `${mode}-worker`, role: verifier ? 'verifier' : 'scout', executionMode: 'worker',
    workerKind: verifier ? 'verifier_worker' : 'scout_cell'
  }] });
}

async function verifyEvidenceDrivenMix() {
  const runtimeState = state([25, 35]);
  const result = await service.planContinuation({
    state: runtimeState,
    survivors: [{ agentId: 'worker-1' }, { agentId: 'worker-2' }],
    continuation: { pool: 4000 },
    orchestratorId: 'orchestrator-1'
  }, { planMorphogenesis: planner, composeMode });
  assert.equal(result.adapted, true);
  assert.equal(result.receipt.operator, 'COMPETE');
  assert.deepEqual(Object.values(result.assignments).map((entry) => entry.morphologyTopology),
    ['rhizome', 'biocenose']);
  assert.equal(result.plan.morphologyPatch.graph.version, 2);
  const leaves = result.plan.morphologyPatch.graph.nodes.filter((node) => node.kind === 'TOPOLOGY');
  assert.deepEqual(leaves.map((node) => node.workers.length), [1, 1]);
  assert.equal(runtimeState.plan.morphogenesisTransitions.length, 1);
  binding.bindDispatchResults(runtimeState.plan, [...runtimeState.workers.values()], [
    { workerId: 'worker-1', evidenceReport: evidenceReport('analysis') },
    { workerId: 'worker-2', evidenceReport: evidenceReport('verification') }
  ]);
  assert.deepEqual(leaves.map((node) => node.workers[0].agentId), ['worker-1', 'worker-2']);
  assert.deepEqual(leaves.map((node) => node.workers[0].evidenceReport.outcome), ['success', 'success']);
}

function evidenceReport(type) {
  return { outcome: 'success', workerArtifact: { type, content: 'verified',
    provenance: { sourceRefs: [`source:${type}`] } } };
}

async function verifyStableEvidenceKeepsMorphology() {
  const runtimeState = state([90, 92]);
  const result = await service.planContinuation({
    state: runtimeState,
    survivors: [{ agentId: 'worker-1' }],
    continuation: { pool: 2000 },
    orchestratorId: 'orchestrator-1'
  }, { planMorphogenesis: planner, composeMode });
  assert.equal(result.adapted, false);
  assert.equal(result.reason, 'adaptation_not_required');
}

async function verifyPolicyCanFreezeAdaptation() {
  const runtimeState = state([10, 20], { adaptive: false });
  const result = await service.planContinuation({
    state: runtimeState,
    survivors: [{ agentId: 'worker-1' }],
    continuation: { pool: 2000 },
    orchestratorId: 'orchestrator-1'
  }, { planMorphogenesis: planner, composeMode });
  assert.equal(result.adapted, false);
}

function verifyPublicMissionOptions() {
  const expression = { kind: 'PARALLEL', children: [] };
  const policy = { adaptive: false, evidenceThreshold: 80 };
  assert.deepEqual(missionHelpers.missionRuntimeContext({
    morphology_expression: expression, morphogenesis_policy: policy
  }), { morphologyExpression: expression, morphogenesisPolicy: policy });
}

async function verifyCompositeRuntimeReceivesEvidence() {
  let observed;
  const ctx = {
    db: {}, agentId: 'orchestrator-1', normalizedMission: { prompt: 'mission', toolLease: ['read'] },
    autonomyPlan: {
      selectedTopology: 'rhizome', tokenPolicy: {}, workerResults: [{ workerId: 'worker-1' }],
      morphogenesisPlan: { morphologyPatch: { graph: {
        graphId: 'graph-runtime', rootNodeId: 'root', version: 2, globalBudget: {},
        nodes: [{ nodeId: 'root', kind: 'OPERATOR', operator: 'COMPETE' }]
      } } }
    }
  };
  const result = await execution.executeCompositeMorphology(ctx, { runtime: {
    execute: async (graph, input) => { observed = { graph, input }; return { output: 'winner' }; }
  } });
  assert.equal(result.executed, true);
  assert.equal(observed.input.workerResults.length, 1);
  assert.equal(ctx.autonomyPlan.morphogenesisCompositeResult.output, 'winner');
}

async function main() {
  await verifyEvidenceDrivenMix();
  await verifyStableEvidenceKeepsMorphology();
  await verifyPolicyCanFreezeAdaptation();
  verifyPublicMissionOptions();
  await verifyCompositeRuntimeReceivesEvidence();
  console.log('Morphogenesis dynamic continuation: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
