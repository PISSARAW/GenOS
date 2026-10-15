'use strict';

const assert = require('node:assert/strict');
const service = require('../src/services/morphogenesis/missionMorphogenesisContinuation');
const execution = require('../src/services/morphogenesis/missionMorphologyExecution');
const binding = require('../src/services/morphogenesis/morphogenesisMissionBinding');
const missionHelpers = require('../bin/orchestratorMissionHelpers.cjs');
const registry = require('../src/services/morphogenesis/registry/topologyRegistry').createTopologyRegistry();

function state(scores, policy = {}) {
  return {
    db: {},
    normalizedMission: { missionId: 'mission-1', prompt: 'Resolve the changing problem.',
      morphogenesisPolicy: policy, topologyCapabilityInventory: { available: registry.list()
        .flatMap((topology) => registry.get(topology).requiredCapabilities) } },
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
    workerKind: verifier ? 'verifier_worker' : 'scout_cell',
    capabilities: registry.get(mode).requiredCapabilities
  }] });
}

function admissionContext() {
  return { quiescence: { confirmed: true, observedAt: Date.now(), activeProcesses: 0,
    databaseRunningWorkers: 0, activeLeases: 0 },
  parentLease: { allowedTools: ['genos_change_organization', 'genos_change_strategy'] },
  requestedTools: ['genos_change_organization'] };
}

async function verifyEvidenceDrivenMix() {
  const runtimeState = state([25, 35]);
  const result = await service.planContinuation({
    state: runtimeState,
    survivors: [{ agentId: 'worker-1' }, { agentId: 'worker-2' }],
    continuation: { pool: 4000 },
    orchestratorId: 'orchestrator-1', strategyAdmissionContext: admissionContext()
  }, { planMorphogenesis: planner, composeMode });
  assert.equal(result.adapted, false, 'an unverified composite must not reach cohort creation');
  assert.equal(result.reason, 'selector_no_change',
    'the planner fallback cannot replace a morphogenesis policy abstention');
  assert.equal(runtimeState.plan.morphogenesisTransitions, undefined,
    'a rejected topology leaves runtime state unchanged');
}

async function verifyPlannerTransitionAdmission() {
  const runtimeState = state([25]);
  const topologyCapabilities = registry.get('a_team').requiredCapabilities;
  let plannerCalls = 0;
  let outcomeQuery;
  const result = await service.planContinuation({ state: runtimeState,
    survivors: [{ agentId: 'worker-1' }], continuation: { pool: 1000 },
    orchestratorId: 'orchestrator-1', strategyAdmissionContext: admissionContext() }, {
    planMorphogenesis: () => {
      plannerCalls += 1;
      return { selectedTopology: 'a_team', selectedVariant: 'default',
        controlReceipt: { topology: { rankings: [{ topology: 'a_team' }] } } };
    },
    loadVerifiedOutcomes: async (query) => { outcomeQuery = query; return []; },
    composeMode: async () => ({ members: [{ role: 'scout', workerKind: 'scout_cell',
      capabilities: topologyCapabilities, executionMode: 'worker' }] })
  });
  assert.equal(result.adapted, false);
  assert.equal(result.reason, 'selector_no_change');
  assert.equal(plannerCalls, 0);
  assert.equal(outcomeQuery.missionId, 'mission-1');
  assert.equal(outcomeQuery.limit, 120);
  assert.equal(runtimeState.plan.selectedTopology, 'a_team');
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
  await verifyPlannerTransitionAdmission();
  await verifyStableEvidenceKeepsMorphology();
  await verifyPolicyCanFreezeAdaptation();
  verifyPublicMissionOptions();
  await verifyCompositeRuntimeReceivesEvidence();
  console.log('Morphogenesis dynamic continuation: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
