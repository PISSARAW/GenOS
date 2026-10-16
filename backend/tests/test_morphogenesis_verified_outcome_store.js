'use strict';

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET ||= 'local-morphogenesis-outcome-test-key';

const assert = require('node:assert/strict');
const { openDatabase } = require('./helpers/biologyDatabase');
const { migrationRunners, runMigration } = require('../src/db/migrations/registry');
const store = require('../src/services/morphogenesis/morphogenesisVerifiedOutcomeStore');
const calibration = require('../src/services/morphogenesis/morphogenesisSelectorCalibration');
const receipts = require('../src/services/epistemicVerifierReceiptService');
const trust = require('../src/services/verifierTrustRegistry');
const { planAdaptiveContinuation } = require('../src/services/agentRoundService');
const continuationPlanner = require('../src/services/morphogenesis/missionMorphogenesisContinuation');
const morphogenesisPlanner = require('../src/services/morphogenesis/morphogenesisPlannerService');
const registry = require('../src/services/morphogenesis/registry/topologyRegistry').createTopologyRegistry();

const scope = { organizationId: 'org-a', projectId: 'project-a' };

function outcome(index) {
  const training = index < 30;
  const row = { id: `paired-outcome-${index}`, scale: 'COHORT_REPLACEMENT',
    candidateId: 'variant:trinity:pareto', taskFamily: training ? 'train-family' : 'holdout-family',
    modelId: training ? 'train-model' : 'holdout-model',
    split: training ? 'train' : 'validation', predictedGain: 0.8, actualGain: 0.7,
    predictedCost: 0.1, actualCost: 0.1 };
  row.receipt = receipts.issueReceipt({ resultId: row.id,
    evidenceDigest: calibration.digest(row), verifierDigest: trust.getVerifier('benchmark').digest,
    independent: true, independenceDescriptor: { actorId: 'independent-oracle',
      workspaceId: 'heldout-campaign' } });
  return row;
}

function runtimeState(db) {
  return { db, ...scope, normalizedMission: { missionId: 'live-mission',
    prompt: 'Comparer qualité, coût et latence entre plusieurs objectifs.',
    morphogenesisPolicy: { adaptive: false } },
  plan: { selectedTopology: 'trinity', profile: {}, tokenPolicy: { rounds: {} } },
  results: new Map([['worker-1', { agentId: 'worker-1', status: 'completed',
    evidenceScore: 30, payload: {} }]]),
  workers: new Map([['worker-1', { agentId: 'worker-1', workerKind: 'scout_cell' }]]) };
}

async function verifyStore(db) {
  await db.exec('CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, description TEXT)');
  const migration = migrationRunners.find(item => item.name === '131-morphogenesis-verified-outcomes');
  assert(migration);
  await runMigration(db, migration.name, migration.description);
  const outcomes = Array.from({ length: 40 }, (_, index) => outcome(index));
  for (let index = 0; index < 40; index += 1) {
    const recorded = await store.recordVerifiedOutcome(db,
      { ...scope, missionId: `source-mission-${index}` }, outcomes[index]);
    assert.equal(recorded.recorded, true);
  }
  const replay = await store.recordVerifiedOutcome(db,
    { ...scope, missionId: 'source-mission-0' }, outcomes[0]);
  assert.equal(replay.recorded, false);
  await assert.rejects(() => store.recordVerifiedOutcome(db,
    { ...scope, missionId: 'other-mission' }, outcomes[0]), error =>
    error.code === 'MORPHOGENESIS_VERIFIED_OUTCOME_CONFLICT');
  await assert.rejects(() => store.recordVerifiedOutcome(db,
    { ...scope, missionId: 'invalid-mission' }, { ...outcome(0), id: 'unsigned' }), error =>
    error.code === 'MORPHOGENESIS_VERIFIED_OUTCOME_INVALID');
  await assert.rejects(db.run(`UPDATE morphogenesis_verified_outcomes
    SET outcome_json = '{}' WHERE outcome_id = ?`, 'paired-outcome-0'));
  const loaded = await store.loadVerifiedOutcomes(db, { ...scope, missionId: 'live-mission' });
  assert.equal(loaded.length, 40);
  assert.equal((await store.loadVerifiedOutcomes(db, { organizationId: 'org-a',
    projectId: 'project-b', missionId: 'live-mission' })).length, 0);
  assert.equal((await store.loadVerifiedOutcomes(db, { missionId: 'live-mission' })).length, 0);
  return loaded;
}

async function verifyStandardPath(db) {
  const result = await planAdaptiveContinuation({ state: runtimeState(db),
    survivors: [{ agentId: 'worker-1' }], continuation: { pool: 1000 },
    orchestratorId: 'orchestrator-1' });
  assert.equal(result.reason, 'adaptation_not_required');
  const policy = result.decision.policy;
  assert.equal(policy.portfolio.calibration.verifiedSampleCount, 40);
  assert.equal(policy.portfolio.calibration.scales.COHORT_REPLACEMENT
    .candidates['variant:trinity:pareto'].status, 'calibrated');
  assert.equal(policy.portfolio.ranking.decision.decision, 'PROPOSE');
  assert.equal(policy.portfolio.ranking.decision.selectedId, 'variant:trinity:pareto');
  assert.equal(policy.portfolio.scaleDecision.candidateId, 'variant:trinity:pareto');
  assert.equal(policy.decision.recipe.candidateId, 'variant:trinity:pareto');
  assert.equal(policy.bounds.executionAuthorized, false);
  const isolated = runtimeState(db);
  isolated.projectId = 'project-without-outcomes';
  const empty = await planAdaptiveContinuation({ state: isolated,
    survivors: [{ agentId: 'worker-1' }], continuation: { pool: 1000 },
    orchestratorId: 'orchestrator-2' });
  assert.equal(empty.decision.policy.portfolio.calibration.verifiedSampleCount, 0);
  assert.equal(empty.decision.policy.decision.interventionScale, 'NO_CHANGE');
  const structured = runtimeState(db);
  structured.normalizedMission.prompt = 'Choisir une approche.';
  structured.plan.profile = { multiObjectiveRequired: true };
  structured.normalizedMission.morphogenesisPolicy.priorityWeights = {
    problemFit: 1, capabilityFit: 0, budgetFit: 0, operationalFit: 0,
    coordinationEfficiency: 0
  };
  const withProfile = await planAdaptiveContinuation({ state: structured,
    survivors: [{ agentId: 'worker-1' }], continuation: { pool: 1000 },
    orchestratorId: 'orchestrator-3' });
  const candidate = withProfile.decision.policy.portfolio.candidates.find(item =>
    item.candidateId === 'variant:trinity:pareto');
  assert(candidate.estimatedProblemFit > 0.5);
  assert.equal(withProfile.decision.policy.portfolio.ranking.scoreWeights.problemFit, 1);
}

async function verifyProposedPlanBinding(db) {
  const state = runtimeState(db);
  state.normalizedMission.morphogenesisPolicy = { adaptive: true };
  let planned = false;
  const result = await continuationPlanner.planContinuation({ state,
    survivors: [{ agentId: 'worker-1' }], continuation: { pool: 1000 },
    orchestratorId: 'orchestrator-1' }, {
    loadVerifiedOutcomes: query => store.loadVerifiedOutcomes(db, { ...query, ...scope }),
    planMorphogenesis: context => {
      planned = true;
      assert.equal(context.forceMorphologySelection, false);
      assert.deepEqual(context.topologyProfile, { baseTopology: 'trinity',
        structuralVariants: ['pareto'] });
      return { selectedTopology: 'a_team', selectedVariant: 'project_dag' };
    },
    composeMode: () => { throw new Error('A divergent plan must not compose workers.'); }
  });
  assert.equal(planned, true);
  assert.equal(result.adapted, false);
  assert.equal(result.reason, 'proposed_recipe_plan_mismatch');
  assert.equal(state.plan.morphogenesisTransitions, undefined);
}

async function verifyExactVariantAdmission(db) {
  const state = runtimeState(db);
  state.normalizedMission.morphogenesisPolicy = { adaptive: true };
  const topology = registry.get('trinity');
  const variant = registry.variants.resolve('trinity', 'pareto');
  const capabilities = [...new Set([...(topology.requiredCapabilities || []),
    ...(variant.requiredCapabilities || [])])];
  state.normalizedMission.topologyCapabilityInventory = { available: capabilities };
  const result = await continuationPlanner.planContinuation({ state,
    survivors: [{ agentId: 'worker-1' }], continuation: { pool: 1000 },
    orchestratorId: 'orchestrator-1', strategyAdmissionContext: {
      quiescence: { confirmed: true, observedAt: Date.now(), activeProcesses: 0,
        databaseRunningWorkers: 0, activeLeases: 0 },
      parentLease: { allowedTools: ['genos_change_strategy'] },
      requestedTools: ['genos_change_strategy']
    } }, {
    loadVerifiedOutcomes: query => store.loadVerifiedOutcomes(db, { ...query, ...scope }),
    planMorphogenesis: context => {
      assert.equal(context.topologyProfile.baseTopology, 'trinity');
      assert.deepEqual(context.topologyProfile.structuralVariants, ['pareto']);
      return morphogenesisPlanner.planMorphogenesis(context);
    },
    composeMode: async () => ({ members: [{ role: 'scout', workerKind: 'scout_cell',
      capabilities, executionMode: 'worker' }] })
  });
  assert.equal(result.adapted, true);
  assert.equal(result.receipt.candidateId, 'variant:trinity:pareto');
  assert.equal(result.receipt.selectedVariant, 'pareto');
  assert.equal(result.plan.morphologyPatch.graph.nodes.filter(node => node.kind === 'TOPOLOGY').length, 1);
  assert.equal(result.admission.selectionBasis, 'calibrated_policy_proposal');
}

async function main() {
  const db = openDatabase();
  try {
    await verifyStore(db);
    await verifyStandardPath(db);
    await verifyProposedPlanBinding(db);
    await verifyExactVariantAdmission(db);
  } finally {
    await db.close();
  }
  console.log('Morphogenesis verified outcome store and standard path: PASS');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
