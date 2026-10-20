'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const fixture = require('./ontogenesisFixture');
const projectStore = require('../src/services/ontogenesis/projectStore');
const { registerResponsibility } = require('../src/services/shev/responsibilityService');
const { recordObservation } = require('../src/services/shev/observationService');
const { authorizationPayload } = require('../src/services/shev/authorityService');
const { canonicalJson } = require('../src/services/aTeam/variants/variantExecutionHelpers');
const detector = require('../src/services/endogenousThoughtDetectionService');
const admission = require('../src/services/endogenousThoughtAdmissionService');
const queue = require('../src/services/endogenousThoughtQueueService');
const runner = require('../src/services/endogenousThoughtRunnerService');
const verifier = require('../src/services/endogenousThoughtVerificationService');
const loop = require('../src/services/endogenousThoughtLoopService');
const thoughtStore = require('../src/services/endogenousThoughtStoreService');
const migration = require('../src/db/migrations/migrateEndogenousThoughtCycles');

const SOLVER_MODEL = 'genos-test-solver/v1';

function generateKeys() {
  return {
    authority: crypto.generateKeyPairSync('ed25519'),
    verifier: crypto.generateKeyPairSync('ed25519')
  };
}

function signAuth(privateKey, input) {
  const payload = authorizationPayload(input);
  const signature = crypto.sign(null, Buffer.from(JSON.stringify(payload)), privateKey).toString('base64');
  return { ...input, signature };
}

function makeAuthorizer(privateKey, episodeId) {
  return ({ stage, ...material }) => signAuth(privateKey, {
    ...material,
    nonce: `${stage}-${episodeId}-${material.expectedVersion}`,
    expiresAt: new Date(Date.now() + 120000).toISOString()
  });
}

function makeVerifier(keys, projectId, episodeId) {
  return async (input) => {
    const publicKey = keys.verifier.publicKey.export({ type: 'spki', format: 'pem' });
    const verification = {
      verifierId: 'ett-test-verifier', publicKey,
      verdict: 'supported', oracleRef: 'oracle:anomaly',
      evidenceRefs: [input.runReceipt.receiptId, 'oracle:anomaly'],
      verifiedAt: new Date(Date.parse(input.runReceipt.payload.completedAt) + 1).toISOString(),
      nonce: `att-${episodeId}-${input.expectedVersion}`, signature: ''
    };
    const material = {
      operation: 'ett-verify', projectId,
      subjectId: input.runReceipt.payload.runId, expectedVersion: input.expectedVersion,
      details: {
        episodeId, runRef: input.runReceipt.receiptId,
        verifierId: verification.verifierId,
        verifierKeyDigest: input.verificationContract.publicKeyDigest(publicKey),
        policyId: input.policy.id, oracleRef: verification.oracleRef
      }
    };
    const signed = signAuth(keys.authority.privateKey, {
      ...material, nonce: `verify-${episodeId}-${input.expectedVersion}`,
      expiresAt: new Date(Date.now() + 120000).toISOString()
    });
    const payload = input.buildPayload({
      projectId, episodeId, policyId: input.policy.id,
      runReceipt: input.runReceipt, verification,
      authorizationRef: `shev-authorization:${signed.nonce}`
    });
    verification.signature = crypto.sign(null,
      Buffer.from(canonicalJson(input.verificationContract.attestationMaterial(payload))),
      keys.verifier.privateKey).toString('base64');
    return { authorization: signed, verification };
  };
}

async function setupProject(db, opts) {
  const { projectId, agentId, authorityKey } = opts;
  await projectStore.createProject(db, {
    id: projectId, rootPath: `C:/ett-${projectId}`, branch: 'codex/ett',
    objective: 'Test multicycle ETT', config: fixture.testConfig()
  });
  const mandate = {
    purpose: 'Validation multicycle ETT', autoDiagnose: false, autoInstrument: false,
    dimensions: [{ name: 'prediction', expected: 'Convergence', acceptance: ['Preuve'] }]
  };
  await registerResponsibility(db, {
    projectId, authorityRef: `delegation:${projectId}`,
    authorityPublicKey: authorityKey.export({ type: 'spki', format: 'pem' }), mandate
  });
  await recordObservation(db, {
    id: `obs-${projectId}`, projectId, domain: 'runtime', dimension: 'prediction',
    kind: 'degradation', epistemicStatus: 'observed', source: 'test',
    observedAt: new Date(Date.now() - 1000).toISOString(),
    validUntil: new Date(Date.now() + 120000).toISOString(),
    summary: 'Signal degradation', evidenceRefs: ['evidence:test']
  });
  await db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, project_id TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, status TEXT, runtime_pid INTEGER, is_apoptotic INTEGER NOT NULL DEFAULT 0, cognitive_budget REAL NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS genome_decisions (id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, embedding_blob BLOB, created_by TEXT NOT NULL, category TEXT, synaptic_weight REAL, organization_id TEXT, project_id TEXT, evidence_refs_json TEXT NOT NULL DEFAULT '[]', evidence_status TEXT NOT NULL DEFAULT 'provisional', provenance_record_id TEXT, provenance_hash TEXT, last_accessed_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS trajectories (id TEXT PRIMARY KEY, title TEXT, status TEXT, author_name TEXT, semantic_summary TEXT, diff_lines TEXT, created_at TEXT, embedding_blob BLOB, workspace_id TEXT, author_id TEXT);
  `);
  await db.run('INSERT INTO workspaces(id,organization_id,project_id) VALUES (?,?,?)',
    `ws-${projectId}`, 'org-a', projectId);
  await db.run('INSERT INTO agents(id,workspace_id,status,runtime_pid,is_apoptotic,cognitive_budget) VALUES (?,?,?,?,?,?)',
    agentId, `ws-${projectId}`, 'idle', null, 0, 10);
}

async function createEpisode(db, opts) {
  const { projectId, agentId, budget } = opts;
  const reqBudget = budget || { tokens: 500, usd: 0.05, seconds: 30 };
  const detected = await detector.detectAndQuestion(db, {
    organizationId: 'org-a', projectId, agentId,
    observationId: `obs-${projectId}`, nowMs: Date.now(),
    policy: { enabled: true, id: 'ett-detection-v1', condition: 'full', cooldownMs: 0,
      maxOpenEpisodes: 5, maxBudget: { tokens: 5000, usd: 0.5, seconds: 120 } },
    assessment: { ref: `assessment:${projectId}`, anomaly: 0.95, novelty: 0.8,
      expectedInformationGain: 0.9, learningProgress: 0.7, cost: 0.1, risk: 0.05, sampleCount: 1 },
    budget: reqBudget
  });
  return detected.episode.receipt.payload.episodeId;
}

function makeExternalWorker(tokens = 10) {
  const trace = [];
  const worker = {
    model: SOLVER_MODEL,
    solve: async (request) => {
      trace.push({ model: SOLVER_MODEL, sandbox: request.sandbox });
      return { evidenceRefs: [`solver-model:${SOLVER_MODEL}`] };
    }
  };
  return {
    model: SOLVER_MODEL, trace, worker,
    sandbox: {
      kind: 'isolated-read-only', readOnly: true, networkAllowed: false,
      mutationAllowed: false, externalActionAllowed: false,
      execute: async ({ worker: isolatedWorker, ...request }) => isolatedWorker.solve(request)
    },
    usageMeter: {
      snapshot: () => ({ tokens, usd: 0.001, seconds: 1 })
    }
  };
}

async function prepareRunning(db, ctx) {
  const { projectId, episodeId, keys, workerSpec } = ctx;
  await admission.admitQuestion(db, { organizationId: 'org-a', projectId, episodeId,
    nowMs: Date.now(), policy: { enabled: true, id: 'ett-admission-v1', condition: 'full', ttlMs: 60000 } });
  const queued = await queue.queueAdmittedThought(db, { organizationId: 'org-a', projectId, episodeId,
    nowMs: Date.now(), policy: { enabled: true, id: 'ett-queue-v1', priority: 50 } });
  const episode = await thoughtStore.getEpisode(db, { organizationId: 'org-a', projectId, episodeId });
  const material = { operation: 'ett-run', projectId, subjectId: episodeId,
    expectedVersion: episode.version, details: { taskId: queued.binding.receipt.payload.taskId,
      policyId: 'ett-run-v1', mode: runner.MODE, grantedBy: 'ett-test' } };
  const authorization = { ...signAuth(keys.authority.privateKey, { ...material,
    nonce: `run-${episodeId}-${episode.version}`, expiresAt: new Date(Date.now() + 120000).toISOString() }),
  grantedBy: 'ett-test' };
  const extra = workerSpec || makeExternalWorker();
  return runner.runQueuedThought(db, { organizationId: 'org-a', projectId, episodeId,
    policy: { enabled: true, id: 'ett-run-v1' }, authorization, nowMs: Date.now(), ...extra });
}

async function prepareVerified(db, ctx) {
  const runResult = await prepareRunning(db, ctx);
  const verifyFn = makeVerifier(ctx.keys, ctx.projectId, ctx.episodeId);
  const episode = await thoughtStore.getEpisode(db, { organizationId: 'org-a', projectId: ctx.projectId, episodeId: ctx.episodeId });
  const receipts = await thoughtStore.listReceipts(db, { organizationId: 'org-a', projectId: ctx.projectId, episodeId: ctx.episodeId });
  const gated = await verifyFn({ episode, runReceipt: runResult.run.receipt,
    expectedVersion: episode.version, policy: { enabled: true, id: 'ett-verification-v1' },
    organizationId: 'org-a', projectId: ctx.projectId,
    buildPayload: verifier.buildPayload, verificationContract: require('../src/services/endogenousThoughtVerificationContractService') });
  return verifier.verifyRunningThought(db, { organizationId: 'org-a', projectId: ctx.projectId,
    episodeId: ctx.episodeId, policy: { enabled: true, id: 'ett-verification-v1' },
    authorization: gated.authorization, verification: gated.verification, receipts, nowMs: Date.now() });
}

async function testLegacyMigration() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await db.exec(`CREATE TABLE legacy_cycle (
      organization_id TEXT NOT NULL, project_id TEXT NOT NULL,
      episode_id TEXT NOT NULL, artifact_id TEXT NOT NULL,
      UNIQUE(organization_id, project_id, episode_id));
      INSERT INTO legacy_cycle VALUES ('org-a','project-a','episode-a','artifact-a');`);
    assert.equal(await migration.upgradeEpisodeMultiplicity(db, 'legacy_cycle'), true);
    assert.equal(await migration.upgradeEpisodeMultiplicity(db, 'legacy_cycle'), false);
    await db.run("INSERT INTO legacy_cycle VALUES ('org-a','project-a','episode-a','artifact-b')");
    const rows = await db.all('SELECT artifact_id FROM legacy_cycle ORDER BY artifact_id');
    assert.deepEqual(rows.map((row) => row.artifact_id), ['artifact-a', 'artifact-b']);
  } finally {
    await db.close();
  }
}

async function testMultiCycleExecution(keys) {
  const db = await fixture.memoryDb();
  try {
    const projectId = 'proj-multicycle';
    const agentId = 'agent-multicycle';
    await setupProject(db, { projectId, agentId, authorityKey: keys.authority.publicKey });
    const episodeId = await createEpisode(db, { projectId, agentId });
    let questionCount = 0;
    const generatedHypotheses = [];
    const workerSpec = makeExternalWorker(10);
    const result = await loop.runAutonomousLoop(db, {
      organizationId: 'org-a', projectId, episodeId, maxCycles: 3,
      authorize: makeAuthorizer(keys.authority.privateKey, episodeId),
      verify: makeVerifier(keys, projectId, episodeId),
      questionGenerator: (input) => {
        questionCount += 1;
        const verdict = input.context.learning.verdict;
        assert.equal(verdict, 'supported');
        assert.match(input.summary, /Résultat supported/);
        const hypothesis = `${input.previousQuestion.hypothesis} — résultat vérifié ${verdict} ${questionCount}`;
        generatedHypotheses.push(hypothesis);
        return {
          text: `Follow-up question ${questionCount}`,
          hypothesis, method: 'ett-read-only-simulation',
          falsifier: `Falsifier variant ${questionCount}`, expectedEvidence: [`evidence:variant:${questionCount}`]
        };
      },
      ...workerSpec
    });
    assert.equal(result.status, 'stopped');
    assert.equal(result.episode.currentState, 'STOPPED');
    assert.equal(result.cycles.length, 3);
    assert.equal(questionCount, 2);
    assert.ok(generatedHypotheses[1].includes(generatedHypotheses[0]),
      'each follow-up hypothesis must incorporate the preceding verified hypothesis');
    assert.deepEqual(result.cumulativeUsage, { tokens: 30, usd: 0.003, seconds: 3 });
    assert.equal(workerSpec.trace.length, 3);
    assert.ok(workerSpec.trace.every((entry) => entry.model === SOLVER_MODEL));
    assert.ok(workerSpec.trace.every((entry) => entry.sandbox.kind === 'isolated-read-only'
      && entry.sandbox.readOnly && !entry.sandbox.networkAllowed
      && !entry.sandbox.mutationAllowed && !entry.sandbox.externalActionAllowed));
    const runs = await db.all(
      'SELECT receipt_json FROM endogenous_thought_runs WHERE episode_id=?', episodeId);
    assert.equal(runs.length, 3);
    assert.ok(runs.every((row) => JSON.parse(row.receipt_json).payload.evidenceRefs
      .includes(`solver-model:${SOLVER_MODEL}`)), 'each sealed run declares its solver model');
    const authorityDigest = require('../src/services/endogenousThoughtVerificationContractService')
      .publicKeyDigest(keys.authority.publicKey.export({ type: 'spki', format: 'pem' }));
    const verifications = await db.all(
      'SELECT receipt_json FROM endogenous_thought_verifications WHERE episode_id=?', episodeId);
    assert.equal(verifications.length, 3);
    assert.ok(verifications.every((row) => {
      const payload = JSON.parse(row.receipt_json).payload;
      return payload.boundaries.independentVerifier === true
        && payload.verifier.keyDigest !== authorityDigest;
    }), 'every cycle is attested by a verifier independent from the authority');
    const learnings = await db.all(
      'SELECT * FROM endogenous_thought_learnings WHERE episode_id=? ORDER BY learned_at', episodeId);
    assert.equal(learnings.length, 3);
  } finally {
    await db.close();
  }
}

async function testCrashRecoveryRunning(keys) {
  const filename = path.join(os.tmpdir(), `ett-cycle-recovery-${crypto.randomUUID()}.sqlite`);
  let db = await fixture.memoryDb(filename);
  try {
    const projectId = 'proj-recover-run';
    const agentId = 'agent-recover-run';
    await setupProject(db, { projectId, agentId, authorityKey: keys.authority.publicKey });
    const budget = { tokens: 500, usd: 0.05, seconds: 30 };
    const episodeId = await createEpisode(db, { projectId, agentId, budget });
    const workerSpec = makeExternalWorker(15);
    const prepared = await prepareRunning(db, { projectId, episodeId, keys, workerSpec });
    const before = await thoughtStore.getEpisode(db, { organizationId: 'org-a', projectId, episodeId });
    assert.equal(before.currentState, 'RUNNING');
    const runningReceiptId = before.currentReceiptId;
    const runReceiptId = prepared.run.receipt.receiptId;
    await db.close();
    db = await fixture.memoryDb(filename);
    const result = await loop.runAutonomousLoop(db, {
      organizationId: 'org-a', projectId, episodeId, maxCycles: 1,
      authorize: makeAuthorizer(keys.authority.privateKey, episodeId),
      verify: makeVerifier(keys, projectId, episodeId),
      ...workerSpec
    });
    assert.equal(result.status, 'stopped');
    assert.equal(result.episode.currentState, 'STOPPED');
    assert.equal(result.cycles[0].run.run.receipt.receiptId, runReceiptId);
    assert.equal(result.cycles[0].run.run.replayed, true);
    assert.deepEqual(result.cumulativeUsage, { tokens: 15, usd: 0.001, seconds: 1 });
    assert.equal(workerSpec.trace.length, 1, 'restart must not reinvoke the completed solver');
    const receipts = await thoughtStore.listReceipts(db,
      { organizationId: 'org-a', projectId, episodeId });
    assert.ok(receipts.some((entry) => entry.receipt.receiptId === runningReceiptId));
    for (let index = 1; index < receipts.length; index += 1) {
      assert.equal(receipts[index].receipt.payload.previousReceiptId,
        receipts[index - 1].receipt.receiptId, 'restart must preserve receipt lineage');
      assert.deepEqual(receipts[index].receipt.payload.budget, budget);
    }
    const verifications = await db.all('SELECT * FROM endogenous_thought_verifications WHERE episode_id=?', episodeId);
    assert.equal(verifications.length, 1);
  } finally {
    await db.close().catch(() => {});
    fs.rmSync(filename, { force: true });
  }
}

async function testCrashRecoveryVerified(keys) {
  const db = await fixture.memoryDb();
  try {
    const projectId = 'proj-recover-ver';
    const agentId = 'agent-recover-ver';
    await setupProject(db, { projectId, agentId, authorityKey: keys.authority.publicKey });
    const episodeId = await createEpisode(db, { projectId, agentId });
    const workerSpec = makeExternalWorker(20);
    await prepareVerified(db, { projectId, episodeId, keys, workerSpec });
    const before = await thoughtStore.getEpisode(db, { organizationId: 'org-a', projectId, episodeId });
    assert.equal(before.currentState, 'VERIFIED');
    const result = await loop.runAutonomousLoop(db, {
      organizationId: 'org-a', projectId, episodeId, maxCycles: 1,
      authorize: makeAuthorizer(keys.authority.privateKey, episodeId),
      verify: makeVerifier(keys, projectId, episodeId),
      ...workerSpec
    });
    assert.equal(result.status, 'stopped');
    assert.equal(result.episode.currentState, 'STOPPED');
    assert.ok(result.cycles[0].verification?.verification?.receipt);
    assert.equal(result.cumulativeUsage.tokens, 20);
    const learnings = await db.all('SELECT * FROM endogenous_thought_learnings WHERE episode_id=?', episodeId);
    assert.equal(learnings.length, 1);
  } finally {
    await db.close();
  }
}

async function testCumulativeBudgetAcrossRestarts(keys) {
  const db = await fixture.memoryDb();
  try {
    const projectId = 'proj-budget-restart';
    const agentId = 'agent-budget-restart';
    await setupProject(db, { projectId, agentId, authorityKey: keys.authority.publicKey });
    const budget = { tokens: 100, usd: 0.05, seconds: 10 };
    const episodeId = await createEpisode(db, { projectId, agentId, budget });
    const workerSpec = makeExternalWorker(60);
    await prepareRunning(db, { projectId, episodeId, keys, workerSpec });
    const result = await loop.runAutonomousLoop(db, {
      organizationId: 'org-a', projectId, episodeId, maxCycles: 3,
      authorize: makeAuthorizer(keys.authority.privateKey, episodeId),
      verify: makeVerifier(keys, projectId, episodeId),
      ...workerSpec
    });
    assert.equal(result.status, 'stopped');
    assert.equal(result.episode.currentState, 'STOPPED');
    assert.equal(result.cumulativeUsage.tokens, 120);
    const head = (await thoughtStore.listReceipts(db, { organizationId: 'org-a', projectId, episodeId })).at(-1);
    assert.equal(head.receipt.payload.stopReason, 'budget-exhausted');
  } finally {
    await db.close();
  }
}

async function testCorruptPersistedUsageFailsClosed(keys) {
  const db = await fixture.memoryDb();
  try {
    const projectId = 'proj-corrupt-budget';
    const agentId = 'agent-corrupt-budget';
    await setupProject(db, { projectId, agentId, authorityKey: keys.authority.publicKey });
    const episodeId = await createEpisode(db, { projectId, agentId });
    await prepareRunning(db, { projectId, episodeId, keys, workerSpec: makeExternalWorker(15) });
    await db.exec('DROP TRIGGER endogenous_run_no_update');
    await db.run(`UPDATE endogenous_thought_runs SET content_hash='invalid'
      WHERE organization_id=? AND project_id=? AND episode_id=?`, 'org-a', projectId, episodeId);
    await assert.rejects(loop.runAutonomousLoop(db, {
      organizationId: 'org-a', projectId, episodeId, maxCycles: 1,
      authorize: makeAuthorizer(keys.authority.privateKey, episodeId),
      verify: makeVerifier(keys, projectId, episodeId), ...makeExternalWorker(15)
    }), { code: 'ENDOGENOUS_LOOP_USAGE_INTEGRITY_FAILED' });
  } finally {
    await db.close();
  }
}

async function main() {
  const keys = generateKeys();
  await testLegacyMigration();
  await testMultiCycleExecution(keys);
  await testCrashRecoveryRunning(keys);
  await testCrashRecoveryVerified(keys);
  await testCumulativeBudgetAcrossRestarts(keys);
  await testCorruptPersistedUsageFailsClosed(keys);
  console.log('ETT multicycle, crash recovery, and cumulative budget checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
