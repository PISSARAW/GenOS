'use strict';

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET ||= 'local-morphogenesis-outcome-test-key';

const assert = require('node:assert/strict');
const { openDatabase } = require('./helpers/biologyDatabase');
const { migrationRunners, runMigration } = require('../src/db/migrations/registry');
const store = require('../src/services/morphogenesis/morphogenesisVerifiedOutcomeStore');
const calibration = require('../src/services/morphogenesis/morphogenesisSelectorCalibration');
const paired = require('../src/services/morphogenesis/morphogenesisPairedOutcomeProducer');
const pairEvidence = require('../src/services/morphogenesis/morphogenesisPairedOutcomeEvidence');
const transitions = require('../src/services/morphogenesis/morphogenesisTransitionReceipt');
const receipts = require('../src/services/epistemicVerifierReceiptService');
const trust = require('../src/services/verifierTrustRegistry');
const { planAdaptiveContinuation } = require('../src/services/agentRoundService');
const continuationPlanner = require('../src/services/morphogenesis/missionMorphogenesisContinuation');
const morphogenesisPlanner = require('../src/services/morphogenesis/morphogenesisPlannerService');
const registry = require('../src/services/morphogenesis/registry/topologyRegistry').createTopologyRegistry();

const scope = { organizationId: 'org-a', projectId: 'project-a' };

function outcome(index, candidateId = 'variant:trinity:pareto') {
  const training = index % 40 < 30;
  const taskId = `task-${index}`;
  const modelId = training ? 'train-model' : 'holdout-model';
  const taskFamily = training ? 'train-family' : 'holdout-family';
  const workerId = `replacement-worker-${index}`;
  const state = { workers: new Map([[workerId, { workerKind: 'scout_cell',
    morphologyTopology: 'trinity', morphologyVariant: 'pareto' }]]) };
  const adaptation = { receipt: {}, admission: { status: 'admitted',
    selectionBasis: 'calibrated_policy_proposal', recipe: {
      id: candidateId, topology: 'trinity', variant: 'pareto' } },
  plan: { morphologyPatch: { graph: { graphId: `graph-${index}`, version: 1 } } } };
  const transitionReceipt = transitions.sealTransitionReceipt({ state,
    survivors: [{ agentId: workerId }], continuation: { perWorkerTokens: 100 }, adaptation });
  transitions.finalizeTransitionQueue(transitionReceipt, [workerId]);
  const shared = { taskId, seed: index, taskFamily, modelId,
    startedAt: '2026-10-15T10:00:00.000Z', budgetTokens: 1000,
    latencyBudgetMs: 1000, toolPolicyHash: 'none', completed: true };
  const candidate = signedAttempt({ ...shared, id: `candidate-${index}`,
    workspaceId: `candidate-workspace-${index}`, quality: 0.8,
    tokens: 500, latencyMs: 500, transitionId: transitionReceipt.transitionId,
    workerResults: [{ agentId: workerId, workerKind: 'scout_cell', topology: 'trinity',
      variant: 'pareto', allocatedTokens: 100, transitionId: transitionReceipt.transitionId,
      status: 'completed' }] });
  const control = signedAttempt({ ...shared, id: `control-${index}`,
    workspaceId: `control-workspace-${index}`, quality: 0.1,
    tokens: 300, latencyMs: 300, transitionId: null, workerResults: [] });
  const prediction = { id: `prediction-${index}`, candidateId,
    taskId, seed: index, split: training ? 'train' : 'validation',
    method: 'fixture_prior', recordedAt: '2026-10-14T10:00:00.000Z',
    predictedGain: 0.8, predictedCost: 0.2 };
  prediction.receipt = sign(prediction.id,
    pairEvidence.sha(pairEvidence.observedPrediction(prediction)),
    { checkedAt: prediction.recordedAt });
  const row = paired.buildRow({ candidate, control, prediction, transitionReceipt });
  row.receipt = sign(row.id, calibration.digest(row));
  return row;
}

function sign(resultId, evidenceDigest, options = {}) {
  return receipts.issueReceipt({ resultId, evidenceDigest,
    verifierDigest: trust.getVerifier('benchmark').digest, independent: true,
    checkedAt: options.checkedAt,
    independenceDescriptor: { actorId: 'independent-oracle',
      workspaceId: options.workspaceId || 'oracle-workspace' } });
}

function signedAttempt(attempt) {
  attempt.oracleReceipt = sign(attempt.id, pairEvidence.sha(pairEvidence.observedAttempt(attempt)));
  return attempt;
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
    const recorded = await paired.recordPairedOutcome(db, {
      scope: { ...scope, missionId: `source-mission-${index}` },
      pair: outcomes[index].pairEvidence, receipt: outcomes[index].receipt });
    assert.equal(recorded.recorded, true);
  }
  const replay = await store.recordVerifiedOutcome(db,
    { ...scope, missionId: 'source-mission-0' }, outcomes[0]);
  assert.equal(replay.recorded, false);
  const replayPair = await paired.recordPairedOutcome(db, {
    scope: { ...scope, missionId: 'source-mission-0' },
    pair: outcomes[0].pairEvidence, receipt: outcomes[0].receipt });
  assert.equal(replayPair.recorded, false);
  await assert.rejects(() => paired.recordPairedOutcome(db, {
    scope: { ...scope, missionId: 'unsigned-pair' }, pair: outcomes[0].pairEvidence }), error =>
    error.code === 'MORPHOGENESIS_PAIR_UNQUALIFIED');
  await assert.rejects(() => store.recordVerifiedOutcome(db,
    { ...scope, missionId: 'other-mission' }, outcomes[0]), error =>
    error.code === 'MORPHOGENESIS_VERIFIED_OUTCOME_CONFLICT');
  await assert.rejects(() => store.recordVerifiedOutcome(db,
    { ...scope, missionId: 'invalid-mission' }, { ...outcome(0), id: 'unsigned' }), error =>
    error.code === 'MORPHOGENESIS_VERIFIED_OUTCOME_INVALID');
  await assert.rejects(() => store.recordVerifiedOutcome(db,
    { ...scope, missionId: 'legacy-mission' }, { ...outcomes[0], pairEvidence: undefined }), error =>
    error.code === 'MORPHOGENESIS_VERIFIED_OUTCOME_INVALID');
  await assert.rejects(db.run(`UPDATE morphogenesis_verified_outcomes
    SET outcome_json = '{}' WHERE outcome_id = ?`, outcomes[0].id));
  const loaded = await store.loadVerifiedOutcomes(db, { ...scope, missionId: 'live-mission' });
  assert.equal(loaded.length, 40);
  assert.equal((await store.loadVerifiedOutcomes(db, { organizationId: 'org-a',
    projectId: 'project-b', missionId: 'live-mission' })).length, 0);
  assert.equal((await store.loadVerifiedOutcomes(db, { missionId: 'live-mission' })).length, 0);
  await verifyCandidateStratification(db);
  verifyPairRefusals(outcomes);
  return loaded;
}

async function verifyCandidateStratification(db) {
  const stratifiedScope = { organizationId: 'org-a', projectId: 'stratified',
    missionId: 'comparison-mission' };
  for (let group = 0; group < 4; group += 1) {
    for (let sample = 0; sample < 40; sample += 1) {
      const index = 1000 + group * 40 + sample;
      await store.recordVerifiedOutcome(db, stratifiedScope,
        outcome(index, `variant:trinity:portfolio-${group}`));
    }
  }
  const rows = await store.loadVerifiedOutcomes(db, stratifiedScope);
  assert.equal(rows.length, 160, 'all four candidates retain 30 train and 10 validation rows');
  const compiled = calibration.compileCalibration(rows);
  for (let group = 0; group < 4; group += 1) {
    assert.equal(compiled.scales.COHORT_REPLACEMENT
      .candidates[`variant:trinity:portfolio-${group}`].status, 'calibrated');
  }
}

function verifyPairRefusals(outcomes) {
  const pair = outcomes[0].pairEvidence;
  const candidateWorkspaceReceipt = sign(outcomes[0].id,
    calibration.digest(outcomes[0]), { workspaceId: pair.candidate.workspaceId });
  assert.equal(calibration.verifiedRow({ ...outcomes[0], receipt: candidateWorkspaceReceipt }),
    false, 'a final verdict from an execution workspace is not independent');
  const prematureReceipt = sign(outcomes[0].id, calibration.digest(outcomes[0]),
    { checkedAt: '2026-10-15T09:00:00.000Z' });
  assert.equal(calibration.verifiedRow({ ...outcomes[0], receipt: prematureReceipt }),
    false, 'the final verdict must follow both source verdicts');
  const forgedQuality = structuredClone(pair);
  forgedQuality.candidate.quality = 1;
  assert.throws(() => paired.buildRow(forgedQuality), /evidence_or_transition_mismatch/);
  const wrongTransition = { ...pair, transitionReceipt: outcomes[1].pairEvidence.transitionReceipt };
  assert.throws(() => paired.buildRow(wrongTransition), /evidence_or_transition_mismatch/);
  const hindsight = structuredClone(pair);
  hindsight.prediction.recordedAt = '2026-10-17T10:00:00.000Z';
  hindsight.prediction.receipt = sign(hindsight.prediction.id,
    pairEvidence.sha(pairEvidence.observedPrediction(hindsight.prediction)),
    { checkedAt: hindsight.prediction.recordedAt });
  assert.throws(() => paired.buildRow(hindsight), /evidence_or_transition_mismatch/);
  const modelDrift = structuredClone(pair);
  modelDrift.control.modelId = 'different-model';
  modelDrift.control.oracleReceipt = sign(modelDrift.control.id,
    pairEvidence.sha(pairEvidence.observedAttempt(modelDrift.control)));
  assert.throws(() => paired.buildRow(modelDrift), /evidence_or_transition_mismatch/);
  const regression = structuredClone(pair);
  regression.candidate.quality = 0.1;
  regression.control.quality = 0.8;
  regression.candidate.oracleReceipt = sign(regression.candidate.id,
    pairEvidence.sha(pairEvidence.observedAttempt(regression.candidate)));
  regression.control.oracleReceipt = sign(regression.control.id,
    pairEvidence.sha(pairEvidence.observedAttempt(regression.control)));
  assert.equal(paired.buildRow(regression).actualGain, -0.7);
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
      requestedTools: ['genos_change_strategy'],
      now: Date.now(),
      resourceResolution: { status: 'READY_FOR_ADMISSION', observedAt: Date.now(),
        roles: [{ roleId: 'role-1', workerKind: 'scout_cell', status: 'READY', instanceId: 'w-1' }] },
      resourceReservation: { reserved: true, workers: [{ roleId: 'role-1', instanceId: 'w-1' }],
        daemons: [], revalidatedAt: Date.now() }
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
