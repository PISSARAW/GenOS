'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_SKIP_BOOT_DB_BACKUP = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'model-oracle-route-test-gvx';
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'model-oracle-route-test-receipts';
process.env.GENOS_SECRET_KEY = 'model-oracle-route-test-secret-key-0123456789';
process.env.NODE_ENV = 'test';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { seed } = require('./test_bounded_worker_delegation');
const { getDatabase, closeDatabase } = require('../src/db');
const execution = require('../src/services/strategyExecutionService');
const actionRuntime = require('../src/services/missionActionRuntimeService');
const actionTrust = require('../src/services/missionActionRuntimeTrust');
const provider = require('../src/services/modelProvider');
const workerStore = require('../src/services/biologicalWorkerStore');
const bridge = require('../src/services/routeMissionOutcomeBridge');
const bandit = require('../src/services/routingBanditService');
const registry = require('../src/services/verifierTrustRegistry');
const outcome = require('../src/services/missionOutcomeContract');
const modelSubject = require('../src/services/epistemic/oracleModelSubject');
const modelChecks = require('../src/services/epistemic/oracleModelChecks');
const KEY = 'model-oracle-action-signature-key-0123456789';

function contract() {
  return { execution_pipeline: [], strategy_portfolio: [],
    mission_outcome: { schema: outcome.SCHEMA_V2, goal: 'Answer subset sum',
      statuses: [...outcome.STATUSES], obligations: [{ id: 'answer',
        statement: modelSubject.STATEMENT, oracle: { domain: 'model_subset_sum',
          verifierDigest: registry.ensureVerifier('model_semantic').digest,
          validityDomain: modelSubject.DOMAIN } }] },
    promotion: { require_independent_verification: true,
      require_epistemic_assurance: true,
      native_verification: { executions: 2, latencyMs: 10000 },
      epistemic_verifier_digests: registry.listVerifierDigests() } };
}

async function prepare(db, workspace) {
  await seed(db, workspace);
  const methodContract = { version: 1, methodId: 'model_subset_sum',
    parameters: { values: [3, 5, 7], target: 10 } };
  const workerContract = { mission: { methodContract } };
  await db.run(`INSERT INTO agents
    (id,name,role,status,execution_mode,parent_agent_id,workspace_id,metadata_json)
    VALUES ('model-worker','Model worker','bounded_worker','idle','worker',
      'delegation-sub','delegation-ws',?)`, JSON.stringify({ workerKind: 'bounded_worker', workerContract }));
  await db.run(`INSERT INTO mission_agents (mission_id,agent_id,role)
    VALUES ('delegation-mission','model-worker','bounded_worker')`);
  const value = contract();
  const contractId = 'model-oracle-contract';
  await db.run(`INSERT INTO strategy_contracts
    (id,agent_id,workspace_id,version,primary_strategy,contract_json,contract_hash)
    VALUES (?,?,?,1,'model-route',?,?)`, contractId, 'model-worker', 'delegation-ws',
  JSON.stringify(value), `sha256:${require('../src/services/biologicalIntegrity').digest(value)}`);
  const contractRecord = { id: contractId, agentId: 'model-worker', version: 1, contract: value };
  const run = await execution.createExecutionRun(db, { agentId: 'model-worker',
    missionId: 'delegation-mission', contractRecord,
    budget: { tokens: 500, costUsd: 1, latencyMs: 60000, events: 30 } });
  await require('../src/services/missionEnvelopeAuthority').seal({ db,
    agentId: 'model-worker', executionRun: run, autonomyPlan: {},
    normalizedMission: { missionId: 'delegation-mission', workspaceRoot: workspace,
      timeoutMs: 60000, toolLease: [], capabilities: [] } });
  await db.run(`INSERT INTO provider_configs (provider,model,endpoint,enabled,
    cost_input,cost_output) VALUES ('openai','fixture','https://example.invalid/v1',1,1,1)`);
  return { run, contract: value };
}

function signedAction(run, contractValue) {
  const action = { id: 'solve-subset', kind: 'small_model', covers: ['answer'],
    requiredEvidenceRefs: ['proof:model-fixture'],
    cost: { execution: { tokens: 300, usd: 0.1, latencyMs: 1000 },
      verification: { tokens: 0, usd: 0, latencyMs: 1000 }, maxRetries: 0 },
    execution: { prompt: 'Solve subset sum for [3,5,7] target 10 as JSON.',
      model: 'openai://fixture', oracleDomain: 'model_subset_sum' },
    calibrationReceipt: { probabilityVerified: { min: 0.8, max: 0.9 },
      evidenceRefs: ['proof:model-fixture'], issuer: 'test-only',
      validUntil: new Date(Date.now() + 60000).toISOString() } };
  const signature = crypto.createHmac('sha256', KEY).update(actionTrust.attestationPayload({
    runId: run.id, missionId: 'delegation-mission', contract: contractValue.mission_outcome,
    action })).digest('hex');
  action.calibrationReceipt.signature = `sha256:${signature}`;
  return action;
}

async function execute(db, prepared) {
  const request = { executionRunId: prepared.run.id, agentId: 'model-worker',
    missionId: 'delegation-mission', decision: { mode: 'active',
      actions: [signedAction(prepared.run, prepared.contract)] } };
  const result = await actionRuntime.run({ db, request, config: { active: true, key: KEY } });
  assert.equal(result.status, 'executed_unverified');
  const observations = await workerStore.observations(db, prepared.run.id);
  assert.deepEqual(observations.map((item) => item.event.eventType),
    ['AGENT_RUNTIME_STARTED', 'MODEL_USAGE_OBSERVED', 'EVIDENCE_REPORT']);
  return observations.at(-1).event.payload.evidenceReport;
}

async function complete(db, run, options) {
  const request = { runId: run.id, agentId: 'model-worker' };
  const attested = await require('../src/services/epistemic/nativeOracleCoordinator').prepare(db, request);
  const scope = await require('../src/services/gvxMissionProvenance').agentScope(db, 'model-worker');
  const attestation = await require('../src/services/epistemic/nativeOracleJournal').read(db,
    { ...request, scope, kind: 'attestation' });
  const assembly = await require('../src/services/aeisAssemblyStore').readAssembly(db,
    attestation.value.assemblyId);
  assert.equal(attestation.value.accepted, true,
    JSON.stringify({ evaluation: assembly.evaluation.evaluation,
      results: assembly.evaluation.assembly.verifications.map((item) => ({
        status: item.status, independent: item.independent, evidence: item.executionEvidence })) }));
  const event = {
    id: `complete-${run.id}`, eventType: 'AGENT_COMPLETED', timestamp: new Date().toISOString(),
    payload: { executionRunId: run.id, evidenceReport: options.report,
      nativeOracleRef: attested, usage: { total_tokens: 0, cost_usd: 0 } } };
  const result = await execution.recordExecutionEvent(db, 'model-worker', event);
  assert.equal(result.run.status, 'completed', result.run.guardrailReason);
  assert.equal(result.biologicalReceipt.result.verified, true);
  assert.equal(result.routeLearning.status, options.expectedLearning || 'observed',
    JSON.stringify(result.routeLearning));
  const replay = await execution.recordExecutionEvent(db, 'model-worker', event);
  assert.equal(replay.duplicate, true);
  return result.biologicalReceipt;
}

async function falsify(db, run) {
  const scope = await require('../src/services/gvxMissionProvenance').agentScope(db, 'model-worker');
  const subject = await modelSubject.load(db, { runId: run.id,
    agentId: 'model-worker', scope });
  const wrongDigest = structuredClone(subject.content);
  wrongDigest.modelOutput.digest = `sha256:${'f'.repeat(64)}`;
  assert.equal(modelChecks.checkModel(wrongDigest, 'subset_bitset').status, 'refuted');
  const wrongAnswer = structuredClone(subject.content);
  wrongAnswer.modelOutput.text = JSON.stringify({ found: false, indices: null,
    sum: null, reachableCount: 6 });
  wrongAnswer.modelOutput.digest = modelSubject.digestText(wrongAnswer.modelOutput.text);
  assert.equal(modelChecks.checkModel(wrongAnswer, 'subset_enumeration').status, 'refuted');
  const row = await db.get(`SELECT event_key,event_json FROM biological_worker_observations
    WHERE run_id=? AND event_json LIKE '%EVIDENCE_REPORT%'`, run.id);
  const event = JSON.parse(row.event_json);
  event.payload.evidenceReport.workerArtifact.content.modelOutput.text = 'forged output';
  await assert.rejects(db.run(`UPDATE biological_worker_observations SET event_json=?
    WHERE run_id=? AND event_key=?`, JSON.stringify(event), run.id, row.event_key),
  /Immutable biological observation/);
  assert.equal((await bridge.derive(db, run.id)).success, true,
    'The immutable observation remains the trusted source');
}

async function testLearningFailureDoesNotAlterMission() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-route-learning-failure-'));
  const workspace = path.join(root, 'workspace');
  await fs.mkdir(workspace);
  process.env.GENOS_DB_PATH = path.join(root, 'mission.db');
  process.env.GENOS_STUDIO_ROOT = path.join(root, 'studio');
  process.env.GENOS_CAPSULE_ROOT = path.join(root, 'capsules');
  process.env.GENOS_WORKSPACES_ROOT = root;
  const db = await getDatabase(process.env.GENOS_DB_PATH);
  const originalGenerate = provider.generate;
  const originalIngest = bridge.ingestWithTrace;
  provider.generate = async () => ({ text: JSON.stringify({ found: true,
    indices: [0, 2], sum: 10, reachableCount: 6 }), inputTokens: 8,
  outputTokens: 12, tokenUsageMeasured: true });
  try {
    const prepared = await prepare(db, workspace);
    const report = await execute(db, prepared);
    bridge.ingestWithTrace = async () => { throw Object.assign(new Error('offline'),
      { code: 'LEARNING_OFFLINE' }); };
    const receipt = await complete(db, prepared.run, { report, expectedLearning: 'error' });
    assert.equal(receipt.result.verified, true);
    assert.equal((await bandit.qualifiedObservations(db)).length, 0);
    const run = await db.get('SELECT status FROM strategy_execution_runs WHERE id=?', prepared.run.id);
    assert.equal(run.status, 'completed');
    bridge.ingestWithTrace = originalIngest;
    assert.equal((await bridge.ingestWithTrace(db, prepared.run.id)).status, 'observed');
  } finally {
    bridge.ingestWithTrace = originalIngest;
    provider.generate = originalGenerate;
    await require('../src/services/garageRuntimeService').stop(db);
    await closeDatabase();
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-model-oracle-route-'));
  const workspace = path.join(root, 'workspace');
  await fs.mkdir(workspace);
  process.env.GENOS_DB_PATH = path.join(root, 'mission.db');
  process.env.GENOS_STUDIO_ROOT = path.join(root, 'studio');
  process.env.GENOS_CAPSULE_ROOT = path.join(root, 'capsules');
  process.env.GENOS_WORKSPACES_ROOT = root;
  process.env.GENOS_DISABLE_WORKSPACE_GC = '1';
  let db = await getDatabase(process.env.GENOS_DB_PATH);
  const original = provider.generate;
  let calls = 0;
  provider.generate = async () => { calls += 1;
    return { text: JSON.stringify({ found: true, indices: [0, 2], sum: 10,
      reachableCount: 6 }), inputTokens: 8, outputTokens: 12,
    tokenUsageMeasured: true }; };
  try {
    const prepared = await prepare(db, workspace);
    const report = await execute(db, prepared);
    assert.deepEqual(await bridge.ingestWithTrace(db, prepared.run.id),
      { status: 'refused', reason: 'mission_evidence_ineligible' },
      'Provider transport alone cannot train the route');
    const receipt = await complete(db, prepared.run, { report });
    assert.equal(calls, 1);
    assert.equal(receipt.costs.find((item) => item.register === 'worker_llm_tokens').quantity, 20);
    const derived = await bridge.derive(db, prepared.run.id);
    assert.equal(derived.success, true);
    assert.equal(derived.promptTokens, 8);
    assert.deepEqual(await bridge.ingestWithTrace(db, prepared.run.id), { status: 'duplicate' });
    assert.equal(await bridge.ingest(db, prepared.run.id), null);
    assert.equal((await bandit.qualifiedObservations(db)).length, 1);
    await db.run(`UPDATE mission_action_decisions SET status='shadow' WHERE run_id=?`, prepared.run.id);
    assert.equal(await bridge.derive(db, prepared.run.id), null);
    assert.equal((await bandit.qualifiedObservations(db)).length, 0,
      'Tampered action state cannot remain a qualified training observation');
    assert.equal((await bridge.ingestWithTrace(db, prepared.run.id)).status, 'refused');
    await db.run(`UPDATE mission_action_decisions SET status='executed_unverified' WHERE run_id=?`, prepared.run.id);
    await falsify(db, prepared.run);
    await closeDatabase();
    db = await getDatabase(process.env.GENOS_DB_PATH);
    assert.deepEqual(await bridge.ingestWithTrace(db, prepared.run.id), { status: 'duplicate' },
      'A persisted model route attempt must remain deduplicated after restart');
  } finally {
    provider.generate = original;
    await require('../src/services/garageRuntimeService').stop(db);
    await closeDatabase();
    await fs.rm(root, { recursive: true, force: true });
  }
  await testLearningFailureDoesNotAlterMission();
  console.log('Measured model worker, independent oracle, AEIS receipt and route learning: passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
