'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const completionAdapters = require('../src/services/topologyCompletionAdapters');
const { closeMission } = require('../src/services/missionClosureService');
const agentGit = require('../src/services/agentGitService');
const biology = require('../src/services/biologicalIntegrity');
const journal = require('../src/services/trinityExecutionJournal');
const qualificationTrace = require('../src/services/trinityQualificationTrace');
const variants = require('../src/services/trinityVariantService');

const MISSION = 'mission-trinity-completion';
const EXPERIMENT = 'experiment-trinity-completion';
const SNAPSHOT = 'a'.repeat(64);

async function schema(db) {
  await db.exec(`
    CREATE TABLE trinity_experiments (
      id TEXT PRIMARY KEY, mission_id TEXT, mission_snapshot_hash TEXT,
      status TEXT, decision_json TEXT);
    CREATE TABLE trinity_dispatch_configs (
      mission_id TEXT PRIMARY KEY, variant_selection_json TEXT);
    CREATE TABLE trinity_worlds (
      experiment_id TEXT, world_number INTEGER, agent_id TEXT, status TEXT,
      snapshot_hash TEXT, workspace_root TEXT);
    CREATE TABLE trinity_experiment_transitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, experiment_id TEXT,
      from_status TEXT, to_status TEXT, actor TEXT, evidence_ref TEXT);
    CREATE TABLE trinity_runtime_journal (
      mission_id TEXT, stage TEXT, input_hash TEXT, value_json TEXT);
    CREATE TABLE trinity_trace_events (
      mission_id TEXT, stage_id TEXT, stage TEXT, status TEXT,
      event_hash TEXT, event_json TEXT);
    CREATE TABLE strategy_execution_runs (
      id TEXT PRIMARY KEY, agent_id TEXT, status TEXT);
    CREATE TABLE biological_worker_bindings (
      run_id TEXT PRIMARY KEY, mission_id TEXT, agent_id TEXT,
      binding_hash TEXT, binding_json TEXT);
    CREATE TABLE biological_worker_receipts (
      run_id TEXT PRIMARY KEY, mission_id TEXT, payload_hash TEXT, receipt_json TEXT);
    CREATE TABLE agent_git_objects (
      id TEXT PRIMARY KEY, commit_hash TEXT, metadata_json TEXT,
      signature TEXT, signature_algorithm TEXT);
  `);
}

function comparison() {
  const comparativeAnalysis = {};
  return { outcome: 'PROMOTE_WORLD', selectedWorld: 1, comparativeAnalysis };
}

function decisionRecord() {
  const metadata = { experimentId: EXPERIMENT, worldNumber: 1,
    contentHash: 'sha256:candidate', candidateWorkspaceId: 'candidate-1' };
  const decision = { outcome: 'PROMOTED', worldNumber: 1,
    verification: { contentHash: metadata.contentHash, sourceAgentId: 'world-1',
      claimsCoveredByChecks: true, integrationChecks: [{ id: 'test', passed: true }] },
    artifact: { candidateWorkspaceId: metadata.candidateWorkspaceId },
    agentGit: { objectId: 'object-1', commitHash: 'commit-1' },
    variantGates: qualificationTrace.fromComparison(comparison().comparativeAnalysis) };
  const object = { id: 'object-1', commit_hash: 'commit-1',
    metadata_json: JSON.stringify(metadata), signature_algorithm: 'hmac-sha256' };
  object.signature = agentGit.signObject(object.commit_hash, metadata);
  return { decision, object };
}

async function addJournalStage(db, input) {
  const metadata = { stage: input.stage, stageId: `${input.stage}:fixture`,
    correlation: { missionId: MISSION } };
  const event = { stageId: metadata.stageId, stage: input.stage, status: 'completed',
    correlation: metadata.correlation,
    details: { inputHash: input.inputHash, resultDigest: journal.digest(input.value) } };
  const record = { value: input.value, digest: journal.digest(input.value),
    trace: metadata, traceDigest: journal.digest(metadata) };
  await db.run('INSERT INTO trinity_runtime_journal VALUES (?, ?, ?, ?)',
    MISSION, input.stage, input.inputHash, JSON.stringify(record));
  await db.run('INSERT INTO trinity_trace_events VALUES (?, ?, ?, ?, ?, ?)',
    MISSION, metadata.stageId, input.stage, 'completed',
    journal.digest(event), JSON.stringify(event));
}

function workerReceipt(number, missionId = MISSION, runId = `run-${number}`) {
  const workerId = `world-${number}`;
  const content = { schema: 'genos.worker-biological-execution-receipt/v1',
    missionId, runId, workerId, result: { status: 'completed', verified: true } };
  const hash = biology.digest(content);
  return { reference: `sha256:${hash}`, content };
}

async function addWorkerRun(db, input) {
  const proof = input.proof;
  const binding = { runId: proof.content.runId, missionId: input.bindingMission,
    workerId: input.workerId };
  await db.run('INSERT INTO strategy_execution_runs VALUES (?, ?, ?)',
    proof.content.runId, input.workerId, 'completed');
  await db.run('INSERT INTO biological_worker_bindings VALUES (?, ?, ?, ?, ?)',
    proof.content.runId, input.bindingMission, input.workerId,
    biology.digest(binding), JSON.stringify(binding));
  await db.run('INSERT INTO biological_worker_receipts VALUES (?, ?, ?, ?)',
    proof.content.runId, input.bindingMission, biology.digest(proof.content),
    JSON.stringify(proof.content));
}

async function addCanonicalState(db) {
  const { decision, object } = decisionRecord();
  await db.run('INSERT INTO trinity_experiments VALUES (?, ?, ?, ?, ?)',
    EXPERIMENT, MISSION, SNAPSHOT, 'promoted', JSON.stringify(decision));
  await db.run('INSERT INTO trinity_dispatch_configs VALUES (?, ?)', MISSION,
    JSON.stringify({ variant: 'controlled', experimentalDesign: variants.DEFAULT_DESIGN }));
  await db.run('INSERT INTO agent_git_objects VALUES (?, ?, ?, ?, ?)',
    object.id, object.commit_hash, object.metadata_json, object.signature,
    object.signature_algorithm);
  for (let number = 1; number <= 3; number += 1) {
    await db.run('INSERT INTO trinity_worlds VALUES (?, ?, ?, ?, ?, ?)',
      EXPERIMENT, number, `world-${number}`, number === 1 ? 'promoted' : 'compared',
      SNAPSHOT, path.resolve(`trinity-world-${number}`));
  }
  const chain = ['designed', 'sealed_running', 'sealed_complete', 'cross_examining',
    'decided', 'promotion_preparing', 'promoted'];
  for (let index = 0; index < chain.length - 1; index += 1) {
    await db.run(`INSERT INTO trinity_experiment_transitions
      (experiment_id, from_status, to_status, actor, evidence_ref) VALUES (?, ?, ?, ?, ?)`,
    EXPERIMENT, chain[index], chain[index + 1], 'trinity-runtime',
    index === 0 ? SNAPSHOT : index === chain.length - 2 ? object.id : `proof-${index}`);
  }
  const inputHash = journal.digest({ missionId: MISSION });
  const reports = [1, 2, 3].map((number) => ({ worldNumber: number,
    agentId: `world-${number}`, report: { outcome: 'success' } }));
  await addJournalStage(db, { stage: 'initial_reports', inputHash, value: reports });
  await addJournalStage(db, { stage: 'comparison', inputHash, value: comparison() });
}

async function fixture() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await schema(db);
  await addCanonicalState(db);
  const proofs = [];
  for (let number = 1; number <= 3; number += 1) {
    const proof = workerReceipt(number);
    proofs.push(proof);
    await addWorkerRun(db, { proof, bindingMission: MISSION,
      workerId: proof.content.workerId });
  }
  return { db, proofs };
}

function adapterInput(db, proofs, missionId = MISSION) {
  return { context: { db, mode: 'trinity', missionId,
    output: { complete: true } }, evidence: {
    members: proofs.map((proof) => ({ workerId: proof.content.workerId,
      status: 'completed', evidenceRefs: [proof.reference] })), evidenceProofs: proofs } };
}

async function verifyMissingStateIsPartial() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await schema(db);
    const dossier = await completionAdapters.build(adapterInput(db, []));
    assert.equal(dossier.topologyValidation.status, 'partial', JSON.stringify(dossier));
    assert.deepEqual(dossier.topologyValidation.reasons, ['trinity_experiment_missing']);
  } finally { await db.close(); }
}

async function verifyForeignMissionFails() {
  const state = await fixture();
  try {
    const input = adapterInput(state.db, state.proofs, 'foreign-mission');
    input.context.trinityExperimentId = EXPERIMENT;
    const dossier = await completionAdapters.build(input);
    assert.equal(dossier.topologyValidation.status, 'failed', JSON.stringify(dossier));
    assert.deepEqual(dossier.topologyValidation.reasons, ['trinity_mission_scope_mismatch']);
  } finally { await state.db.close(); }
}

async function verifyAmbiguousExperimentIsPartial() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await schema(db);
    for (const id of ['experiment-a', 'experiment-b']) {
      await db.run('INSERT INTO trinity_experiments VALUES (?, ?, ?, ?, ?)',
        id, MISSION, SNAPSHOT, 'designed', '{}');
    }
    const dossier = await completionAdapters.build(adapterInput(db, []));
    assert.equal(dossier.topologyValidation.status, 'partial');
    assert.deepEqual(dossier.topologyValidation.reasons, ['trinity_experiment_ambiguous']);
  } finally { await db.close(); }
}

async function verifyForeignRunFails() {
  const state = await fixture();
  try {
    const foreign = workerReceipt(1, MISSION, 'foreign-run');
    await addWorkerRun(state.db, { proof: foreign, bindingMission: 'foreign-mission',
      workerId: 'world-1' });
    const proofs = [foreign, ...state.proofs.slice(1)];
    const dossier = await completionAdapters.build(adapterInput(state.db, proofs));
    assert.equal(dossier.topologyValidation.status, 'failed');
    assert.deepEqual(dossier.topologyValidation.reasons, ['trinity_world_run_scope_mismatch']);
  } finally { await state.db.close(); }
}

async function verifyMissingProofIsPartial() {
  const state = await fixture();
  try {
    const dossier = await completionAdapters.build(adapterInput(state.db, state.proofs.slice(0, 2)));
    assert.equal(dossier.topologyValidation.status, 'partial');
    assert.deepEqual(dossier.topologyValidation.reasons, ['trinity_world_members_mismatch']);
  } finally { await state.db.close(); }
}

async function verifyMissingPromotionIsPartial() {
  const state = await fixture();
  try {
    const pending = { outcome: 'PROMOTE_WORLD', worldNumber: 1,
      variantGates: qualificationTrace.fromComparison(comparison().comparativeAnalysis) };
    await state.db.run("UPDATE trinity_experiments SET status = 'decided', decision_json = ? WHERE id = ?",
      JSON.stringify(pending), EXPERIMENT);
    await state.db.run("UPDATE trinity_worlds SET status = 'compared' WHERE status = 'promoted'");
    await state.db.run("DELETE FROM trinity_experiment_transitions WHERE to_status IN ('promotion_preparing','promoted')");
    const dossier = await completionAdapters.build(adapterInput(state.db, state.proofs));
    assert.equal(dossier.topologyValidation.status, 'partial', JSON.stringify(dossier));
    assert.ok(dossier.topologyValidation.reasons[0].startsWith('promotion_'));
  } finally { await state.db.close(); }
}

async function verifyCanonicalSuccess() {
  const state = await fixture();
  try {
    const input = await completionAdapters.build(adapterInput(state.db, state.proofs));
    assert.equal(input.topologyValidation.status, 'verified');
    assert.equal(input.oracle.receipt.experimentId, EXPERIMENT);
    assert.deepEqual(input.oracle.receipt.runs.map((item) => item.runId),
      ['run-1', 'run-2', 'run-3']);
    assert.equal(closeMission(input).verdict, 'succeeded');
  } finally { await state.db.close(); }
}

async function run() {
  const tests = [verifyMissingStateIsPartial, verifyForeignMissionFails,
    verifyAmbiguousExperimentIsPartial, verifyForeignRunFails, verifyMissingProofIsPartial,
    verifyMissingPromotionIsPartial, verifyCanonicalSuccess];
  for (const test of tests) await test();
  console.log('Trinity completion adapter: PASS');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
