'use strict';

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET ||= 'biome-completion-adapter-test-secret';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const biome = require('../src/services/biomeCoordinationService');
const adapter = require('../src/services/topologyCompletionAdapters/biomeAdapter');
const { closureInput } = require('../src/services/topologyCompletionAdapters/dossier');
const completion = require('../src/services/biologicalMissionCompletionService');
const completionEvidence = require('../src/services/missionCompletionEvidenceService');
const workerStore = require('../src/services/biologicalWorkerStore');
const { closeMission } = require('../src/services/missionClosureService');
const { digest: biologicalDigest } = require('../src/services/biologicalIntegrity');
const goalOracle = require('../src/services/biome/contracts/goalVerificationReceipt');

const OWNER = 'mission-biome-owner';
const WORKER = 'biome-worker-1';

function opportunity() {
  return { id: 'analysis', descriptor: 'Analyze the mission', opportunityScore: 1,
    evidenceRefs: ['evidence:opportunity'], requiredCapabilities: ['analysis'],
    resourceProfile: { tokens: { minimum: 1, preferred: 10, maximum: 100 } } };
}

function proof(missionId = OWNER) {
  const content = { schema: 'genos.worker-biological-receipt/v1', missionId,
    workerId: WORKER, runId: `run:${missionId}:${WORKER}`,
    receiptId: `receipt:${missionId}:${WORKER}`,
    result: { status: 'completed', verified: true } };
  return { reference: `sha256:${biologicalDigest(content)}`, content,
    source: 'biological_worker_receipts' };
}

function input(db, options = {}) {
  const sessionId = options.sessionId;
  const missionId = options.missionId || OWNER;
  const workerProof = Object.hasOwn(options, 'workerProof')
    ? options.workerProof : proof(missionId);
  const evidence = options.evidence || {
    members: [{ workerId: WORKER, memberId: WORKER, status: 'completed',
      evidenceRefs: workerProof ? [workerProof.reference] : [] }],
    evidenceProofs: workerProof ? [workerProof] : []
  };
  return { context: { db, mode: 'biome', missionId, sessionId,
    output: { sessionId, complete: true } }, evidence };
}

async function seedMissionBinding(db, sessionId) {
  await db.exec(`CREATE TABLE agents (
      id TEXT PRIMARY KEY, metadata_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE mission_agents (
      mission_id TEXT NOT NULL, agent_id TEXT NOT NULL, role TEXT,
      PRIMARY KEY (mission_id, agent_id)
    );`);
  await db.run('INSERT INTO agents (id, metadata_json) VALUES (?, ?)', WORKER,
    JSON.stringify({ topologySessionId: sessionId }));
  await db.run('INSERT INTO mission_agents VALUES (?, ?, ?)', OWNER, WORKER, 'adaptive_worker');
}

async function createNominal() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const workerProof = proof();
  const runtime = await biome.BiomeRuntime.create('Complete an ecological mission', {
    db, variant: 'resource', maxTicks: 5, missionId: OWNER, producerId: OWNER,
    environment: { opportunities: [opportunity()] },
    verifyGoal: async (request) => ({ sessionId: request.sessionId, tick: request.tick,
      verified: request.tick >= 2, evidenceRefs: request.evidenceRefs,
      oracleReceipt: goalOracle.issue({ missionId: request.missionId,
        producerId: request.producerId, sessionId: request.sessionId,
        tick: request.tick, evidenceRefs: request.evidenceRefs,
        measurements: request.measurements, health: request.measurements.health,
        verified: true, stopCondition: 'goal_achieved', status: 'completed' }) })
  });
  await runtime.step({ totalBudget: 100, resources: { tokens: 100 },
    individuals: [{ individualId: WORKER, role: 'analyst', capabilities: ['analysis'],
      cognitiveRecipe: 'observe-adapt-verify', phenotype: { strategy: 'baseline' } }] });
  await runtime.step({ populationResults: [{ id: 'result-1',
    populationId: 'population:niche-analysis', productivity: 0.8,
    evidenceRefs: ['evidence:fitness-result'] }],
  populationCommands: [{ type: 'adapt', populationId: 'population:niche-analysis',
    individualId: WORKER, patch: { strategy: 'adapted-analysis' },
    evidenceRefs: ['evidence:adaptation'] }], evidenceRefs: [workerProof.reference] });
  await seedMissionBinding(db, runtime.sessionId);
  await workerStore.ensure(db);
  await workerStore.putReceipt(db, workerProof.content);
  const evidence = await completionEvidence.collect({ db, missionId: OWNER,
    members: [{ workerId: WORKER, status: 'completed' }] });
  return { db, sessionId: runtime.sessionId, evidence };
}

async function mutateState(fixture, mutate) {
  const row = await fixture.db.get('SELECT state_json FROM topology_sessions WHERE id = ?',
    fixture.sessionId);
  const state = JSON.parse(row.state_json);
  mutate(state);
  await fixture.db.run('UPDATE topology_sessions SET state_json = ? WHERE id = ?',
    JSON.stringify(state), fixture.sessionId);
}

function oracleInput(state, overrides = {}) {
  const ecology = state.ecology;
  const runtime = ecology.ecologicalState.runtime;
  const goal = runtime.goalVerification;
  return { missionId: OWNER, producerId: OWNER,
    sessionId: state.sessionId || ecology.biomeId, tick: runtime.tick,
    evidenceRefs: goal.evidenceRefs, measurements: runtime.history.at(-1).measurements,
    health: ecology.ecologicalState.health, verified: goal.verified,
    stopCondition: runtime.stopCondition, status: ecology.status, ...overrides };
}

async function withFixture(test) {
  const fixture = await createNominal();
  try { await test(fixture); } finally { await fixture.db.close(); }
}

async function nominal(fixture) {
  const dossier = await adapter.build(input(fixture.db, fixture));
  assert.equal(dossier.topologyValidation.status, 'verified');
  assert.equal(dossier.oracle.receipt.sessionId, fixture.sessionId);
  assert.equal(dossier.oracle.receipt.workerRunIds[0], `run:${OWNER}:${WORKER}`);
  const closed = closeMission(closureInput(dossier));
  assert.equal(closed.verdict, 'succeeded', JSON.stringify(closed));
}

async function servicePipeline(fixture) {
  const output = { status: 'completed', complete: true, sessionId: fixture.sessionId,
    members: [{ workerId: WORKER, status: 'completed' }] };
  const registry = { async build(payload) {
    return closureInput(await adapter.build(payload));
  } };
  await completion.complete({ db: fixture.db, missionId: OWNER, mode: 'biome',
    sessionId: fixture.sessionId, output, expectedCount: 1,
    completionAdapterRegistry: registry });
  assert.equal(output.completionContract.verdict, 'succeeded');
  assert.equal(output.complete, true);
}

async function foreignMissionFails(fixture) {
  const dossier = await adapter.build(input(fixture.db, {
    sessionId: fixture.sessionId, missionId: 'mission-foreign'
  }));
  assert.equal(dossier.topologyValidation.status, 'failed');
  assert.deepEqual(dossier.topologyValidation.reasons, ['biome_mission_scope_mismatch']);
}

async function missingPhaseIsPartial(fixture) {
  await mutateState(fixture, (state) => { state.ecology.ecologicalState.runtime.history = []; });
  const dossier = await adapter.build(input(fixture.db, fixture));
  assert.equal(dossier.topologyValidation.status, 'partial');
  assert.deepEqual(dossier.topologyValidation.reasons, ['biome_ecological_phase_missing']);
}

async function missingProofIsPartial(fixture) {
  const dossier = await adapter.build(input(fixture.db, {
    sessionId: fixture.sessionId, workerProof: null
  }));
  assert.equal(dossier.topologyValidation.status, 'partial');
  assert.deepEqual(dossier.topologyValidation.reasons, ['biome_worker_run_proof_missing']);
}

async function alteredProofFails(fixture) {
  const workerProof = proof();
  workerProof.content.runId = 'run:altered';
  const dossier = await adapter.build(input(fixture.db, {
    sessionId: fixture.sessionId, workerProof
  }));
  assert.equal(dossier.topologyValidation.status, 'failed');
  assert.deepEqual(dossier.topologyValidation.reasons, ['biome_worker_run_proof_invalid']);
}

async function alteredReferenceFails(fixture) {
  const workerProof = structuredClone(fixture.evidence.evidenceProofs[0]);
  workerProof.reference = `sha256:${'0'.repeat(64)}`;
  const evidence = { members: [{ workerId: WORKER, memberId: WORKER,
    status: 'completed', evidenceRefs: [workerProof.reference] }],
  evidenceProofs: [workerProof] };
  const dossier = await adapter.build(input(fixture.db, {
    sessionId: fixture.sessionId, evidence
  }));
  assert.equal(dossier.topologyValidation.status, 'failed');
  assert.deepEqual(dossier.topologyValidation.reasons, ['biome_worker_run_proof_invalid']);
}

async function missingOracleIsPartial(fixture) {
  await mutateState(fixture, (state) => {
    delete state.ecology.ecologicalState.runtime.goalVerification;
  });
  const dossier = await adapter.build(input(fixture.db, fixture));
  assert.equal(dossier.topologyValidation.status, 'partial');
  assert.deepEqual(dossier.topologyValidation.reasons, ['biome_goal_oracle_missing']);
}

async function alteredOracleFails(fixture) {
  await mutateState(fixture, (state) => {
    state.ecology.ecologicalState.runtime.goalVerification.sessionId = 'biome-foreign';
  });
  const dossier = await adapter.build(input(fixture.db, fixture));
  assert.equal(dossier.topologyValidation.status, 'failed');
  assert.deepEqual(dossier.topologyValidation.reasons, ['biome_goal_oracle_scope_mismatch']);
}

async function inventedVerifierFails(fixture) {
  await mutateState(fixture, (state) => {
    state.ecology.ecologicalState.runtime.goalVerification.oracleReceipt.verifierDigest
      = 'biome-goal-verification-runtime';
  });
  const dossier = await adapter.build(input(fixture.db, fixture));
  assert.equal(dossier.topologyValidation.status, 'failed');
  assert.deepEqual(dossier.topologyValidation.reasons,
    ['biome_goal_oracle_not_independent']);
}

async function missingVerifierReceiptIsPartial(fixture) {
  await mutateState(fixture, (state) => {
    delete state.ecology.ecologicalState.runtime.goalVerification.oracleReceipt;
  });
  const dossier = await adapter.build(input(fixture.db, fixture));
  assert.equal(dossier.topologyValidation.status, 'partial');
  assert.deepEqual(dossier.topologyValidation.reasons,
    ['biome_goal_oracle_receipt_missing']);
}

async function foreignReceiptMissionFails(fixture) {
  await mutateState(fixture, (state) => {
    const goal = state.ecology.ecologicalState.runtime.goalVerification;
    goal.oracleReceipt = goalOracle.issue(oracleInput(state, {
      missionId: 'mission-foreign' }));
  });
  const dossier = await adapter.build(input(fixture.db, fixture));
  assert.equal(dossier.topologyValidation.status, 'failed');
  assert.deepEqual(dossier.topologyValidation.reasons,
    ['biome_goal_oracle_scope_mismatch']);
}

async function selfVerificationFails(fixture) {
  await mutateState(fixture, (state) => {
    const goal = state.ecology.ecologicalState.runtime.goalVerification;
    goal.oracleReceipt = goalOracle.issue(oracleInput(state, {
      producerId: '  PrOoF  ' }));
  });
  const dossier = await adapter.build(input(fixture.db, fixture));
  assert.equal(dossier.topologyValidation.status, 'failed');
  assert.deepEqual(dossier.topologyValidation.reasons,
    ['biome_goal_oracle_not_independent']);
}

async function foreignEvidenceFails(fixture) {
  await mutateState(fixture, (state) => {
    const goal = state.ecology.ecologicalState.runtime.goalVerification;
    goal.oracleReceipt = goalOracle.issue(oracleInput(state, {
      evidenceRefs: [`sha256:${'f'.repeat(64)}`] }));
  });
  const dossier = await adapter.build(input(fixture.db, fixture));
  assert.equal(dossier.topologyValidation.status, 'failed');
  assert.deepEqual(dossier.topologyValidation.reasons,
    ['biome_goal_oracle_evidence_mismatch']);
}

async function arbitraryVerifierAliasIgnored(fixture) {
  const row = await fixture.db.get('SELECT state_json FROM topology_sessions WHERE id = ?',
    fixture.sessionId);
  const state = JSON.parse(row.state_json);
  const receipt = goalOracle.issue({ ...oracleInput(state),
    verifierId: 'arbitrary-self-declared-verifier' });
  assert.equal(receipt.verifierId, undefined);
  assert.equal(receipt.verifierDigest, goalOracle.VERIFIER_DIGEST);
}

async function partialOracleCoverageFails(fixture) {
  const row = await fixture.db.get('SELECT state_json FROM topology_sessions WHERE id = ?',
    fixture.sessionId);
  const state = JSON.parse(row.state_json);
  const first = state.ecology.ecologicalState.runtime.goalVerification.evidenceRefs[0];
  const second = `sha256:${'e'.repeat(64)}`;
  const receipt = goalOracle.issue(oracleInput(state, { evidenceRefs: [first] }));
  const assessed = goalOracle.assess(receipt,
    oracleInput(state, { evidenceRefs: [first, second] }));
  assert.equal(assessed.reason, 'biome_goal_oracle_evidence_mismatch');
}

function subjectMutation(name, mutate) {
  return async function subjectMutationTest(fixture) {
    await mutateState(fixture, mutate);
    const dossier = await adapter.build(input(fixture.db, fixture));
    assert.equal(dossier.topologyValidation.status, 'failed', name);
    assert.deepEqual(dossier.topologyValidation.reasons,
      ['biome_goal_oracle_subject_mismatch'], name);
  };
}

const alteredVerifiedFails = subjectMutation('verified', (state) => {
  state.ecology.ecologicalState.runtime.goalVerification.verified = false;
});
const alteredStopConditionFails = subjectMutation('stopCondition', (state) => {
  state.ecology.ecologicalState.runtime.stopCondition = 'max_ticks_reached';
});
const alteredStatusFails = subjectMutation('status', (state) => {
  state.ecology.status = 'active';
});
const alteredMeasurementsFails = subjectMutation('measurements', (state) => {
  state.ecology.ecologicalState.runtime.history.at(-1).measurements.health = 'stressed';
});
const alteredHealthFails = subjectMutation('health', (state) => {
  state.ecology.ecologicalState.health = 'stressed';
});

async function run() {
  const tests = [nominal, servicePipeline, foreignMissionFails, missingPhaseIsPartial,
    missingProofIsPartial, alteredProofFails, alteredReferenceFails,
    missingOracleIsPartial, alteredOracleFails, inventedVerifierFails,
    missingVerifierReceiptIsPartial, foreignReceiptMissionFails,
    selfVerificationFails, foreignEvidenceFails, arbitraryVerifierAliasIgnored,
    partialOracleCoverageFails, alteredVerifiedFails, alteredStopConditionFails,
    alteredStatusFails, alteredMeasurementsFails, alteredHealthFails];
  for (const test of tests) await withFixture(test);
  console.log('Biome completion adapter: PASS');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
