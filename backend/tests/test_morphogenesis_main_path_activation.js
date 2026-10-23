'use strict';

const assert = require('node:assert/strict');
const activation = require('../src/services/agentRuntimeAdapter/missionTopologyActivation');

const TOPOLOGIES = ['biome', 'biocenose', 'holobionte', 'metapopulation', 'rhizome', 'syncytium'];

function graph(topology) {
  return {
    graphId: `graph-${topology}`,
    rootNodeId: `root-${topology}`,
    version: 1,
    nodes: [{ nodeId: `root-${topology}`, topology, workers: [] }]
  };
}

function context() {
  return {
    db: {},
    agentId: 'orchestrator-1',
    dispatchedAgent: { execution_mode: 'orchestrator' },
    contractRecord: { contract: { problem_profile: { uncertainty: 0.8 } } },
    normalizedMission: { prompt: 'Explore and verify the implementation.', executionBudget: { tokens: 30000 },
      morphology: { agents: [{}, {}, {}], variantId: 'default' } },
    autonomyPlan: {
      survival: { constraints: { maxWorkerFanout: 8 } },
      tokenPolicy: { total: 30000, workerShare: 0.6, minimumWorkerTokens: 1000,
        allocation: 'successive_halving_with_reallocation' },
      workers: [{ role: 'legacy' }],
      dispatchWorkers: [{ role: 'legacy' }],
      organization: 'hierarchical'
    }
  };
}

function plan(topology) {
  return {
    selectedTopology: topology,
    selectedVariant: 'default',
    morphologyPatch: { graph: graph(topology) }
  };
}

function compositePlan() {
  const root = { nodeId: 'root-mix', kind: 'OPERATOR', operator: 'PARALLEL', children: ['node-rhizome', 'node-biocenose'], workers: [] };
  return {
    selectedTopology: 'rhizome',
    selectedVariant: 'default',
    morphologyPatch: { graph: {
      graphId: 'graph-mix', rootNodeId: root.nodeId, version: 1,
      nodes: [root,
        { nodeId: 'node-rhizome', kind: 'TOPOLOGY', topology: 'rhizome', workers: [] },
        { nodeId: 'node-biocenose', kind: 'TOPOLOGY', topology: 'biocenose', workers: [] }]
    } }
  };
}

async function verifySelectionSeedsMission() {
  const ctx = context();
  let input;
  ctx.autonomyPlan = null;
  const selected = activation.seedMorphogenesisSelection(ctx, {
    planMorphogenesis: (value) => { input = value; return plan('rhizome'); }
  });
  assert.equal(selected.selectedTopology, 'rhizome');
  assert.equal(ctx.normalizedMission.proposedTopology, 'rhizome');
  assert.equal(ctx.normalizedMission.morphologyTopology, 'rhizome');
  assert.equal(selected.selectedTopology, ctx.morphogenesisSelection.selectedTopology);
  assert.equal(input.budget.tokens, 30000);
  assert.equal(input.variantId, 'default');
}

async function verifyComposedTopologiesDriveDispatch() {
  for (const topology of TOPOLOGIES) {
    const ctx = context();
    const morphologyPlan = plan(topology);
    const assignments = await activation.activateMorphogenesisPlan(ctx, morphologyPlan, {
      composeMode: async () => ({
        organization: `${topology}_organization`,
        members: [
          { role: 'host_orchestrator', executionMode: 'orchestrator' },
          { label: `${topology}-1`, role: 'scout', executionMode: 'worker', workerKind: 'scout_cell' },
          { label: `${topology}-2`, role: 'verifier', executionMode: 'worker', workerKind: 'verifier_worker' }
        ]
      })
    });
    assert.equal(ctx.autonomyPlan.selectedTopology, topology);
    assert.equal(assignments.length, 2);
    assert.equal(ctx.autonomyPlan.tokenPolicy.rounds.initial.workerCount, 2);
    assert.equal(morphologyPlan.morphologyPatch.graph.nodes[0].workers.length, 2);
    assert.equal(ctx.autonomyPlan.organization, `${topology}_organization`);
  }
}

async function verifyActivatedDedicatedPlanIsReused() {
  const ctx = context();
  ctx.autonomyPlan.trinity = { activated: true };
  const assignments = await activation.activateMorphogenesisPlan(ctx, plan('trinity'));
  assert.equal(assignments.length, 1);
  assert.equal(ctx.autonomyPlan.selectedTopology, 'trinity');
}

async function verifyIncompatibleDedicatedTopologyFailsClosed() {
  const ctx = context();
  await assert.rejects(
    activation.activateMorphogenesisPlan(ctx, plan('a_team'), {
      composeMode: async () => {
        throw Object.assign(new Error('A-Team needs two domains.'), {
          code: 'A_TEAM_MULTIDISCIPLINARY_REQUIRED'
        });
      }
    }),
    { code: 'MORPHOGENESIS_TOPOLOGY_INCOMPATIBLE' }
  );
}async function verifyDedicatedMorphologyUsesSelectedGraph() {
  const ctx = context();
  let composedMode = null;
  const assignments = await activation.activateMorphogenesisPlan(ctx, plan('a_team'), {
    composeMode: async ({ mode }) => {
      composedMode = mode;
      return { organization: 'morphogenesis_a_team', members: [
        { role: 'specialist', executionMode: 'worker', workerKind: 'scout_cell' }
      ] };
    }
  });
  assert.equal(composedMode, 'a_team');
  assert.equal(assignments.length, 1);
  assert.equal(ctx.autonomyPlan.selectedTopology, 'a_team');
  assert.equal(ctx.autonomyPlan.topologyComposition.organization, 'morphogenesis_a_team');
}

async function verifyCompositeGraphDrivesMixedDispatch() {
  const ctx = context();
  ctx.autonomyPlan.trinity = { activated: true };
  ctx.autonomyPlan.aTeam = { activated: true };
  const morphologyPlan = compositePlan();
  const assignments = await activation.activateMorphogenesisPlan(ctx, morphologyPlan, {
    composeMode: async ({ mode }) => ({ members: [
      { label: `${mode}-worker`, role: 'scout', executionMode: 'worker', workerKind: 'scout_cell' }
    ] })
  });
  assert.deepEqual(assignments.map((entry) => entry.morphologyTopology), ['rhizome', 'biocenose']);
  assert.equal(morphologyPlan.morphologyPatch.graph.nodes[0].workers.length, 0);
  assert.equal(morphologyPlan.morphologyPatch.graph.nodes[1].workers.length, 1);
  assert.equal(morphologyPlan.morphologyPatch.graph.nodes[2].workers.length, 1);
  assert.equal(ctx.autonomyPlan.topologyComposition.kind, 'morphogenesis_composite');
  assert.equal(ctx.autonomyPlan.trinity.activated, false);
  assert.equal(ctx.autonomyPlan.aTeam.activated, false);
}

async function verifyBudgetGate() {
  const ctx = context();
  ctx.autonomyPlan.tokenPolicy.total = 1000;
  await assert.rejects(
    activation.activateMorphogenesisPlan(ctx, plan('rhizome'), {
      composeMode: async () => ({ members: [
        { role: 'scout', executionMode: 'worker', workerKind: 'scout_cell' },
        { role: 'verifier', executionMode: 'worker', workerKind: 'verifier_worker' }
      ] })
    }),
    { code: 'MORPHOGENESIS_TOPOLOGY_BUDGET_INSUFFICIENT' }
  );
}

async function verifyResourceStewardReceivesPromptSizedInitialBudget() {
  const ctx = context();
  ctx.autonomyPlan.tokenPolicy = { total: 20000, workerShare: 0.7,
    minimumWorkerTokens: 1500, minimumWorkerTokensExplicit: true,
    allocation: 'successive_halving_with_reallocation' };
  await activation.activateMorphogenesisPlan(ctx, plan('biome'), {
    composeMode: async () => ({ members: [
      { role: 'environment_mapper', executionMode: 'worker', workerKind: 'scout_cell',
        methodContract: { methodId: 'scan_literal' } },
      { role: 'resource_steward', executionMode: 'worker', workerKind: 'specialist',
        methodContract: { methodId: 'prompt_defined' } }
    ] })
  });
  assert.deepEqual(ctx.autonomyPlan.tokenPolicy.rounds.initial.workerTokens, [1500, 3000],
    'Morphogenesis activation applies the resource steward minimum instead of an equal split');
  assert.equal(ctx.autonomyPlan.tokenPolicy.rounds.workerPool, 14000,
    'role-aware allocation remains inside the authorized worker pool');
  assert.equal(ctx.autonomyPlan.tokenPolicy.admission.valid, true);
}

async function verifyGenomeCandidateBlocksActivation() {
  const ctx = context();
  const morphologyPlan = plan('rhizome');
  morphologyPlan.genomeAdmission = { status: 'candidate_required', actionCount: 1 };
  await assert.rejects(
    activation.activateMorphogenesisPlan(ctx, morphologyPlan),
    { code: 'MORPHOGENESIS_GENOME_ADMISSION_PENDING' }
  );
}

async function main() {
  await verifySelectionSeedsMission();
  await verifyComposedTopologiesDriveDispatch();
  await verifyCompositeGraphDrivesMixedDispatch();
  await verifyActivatedDedicatedPlanIsReused();
  await verifyDedicatedMorphologyUsesSelectedGraph();
  await verifyIncompatibleDedicatedTopologyFailsClosed();
  await verifyBudgetGate();
  await verifyResourceStewardReceivesPromptSizedInitialBudget();
  await verifyGenomeCandidateBlocksActivation();
  console.log('Morphogenesis main-path activation: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
