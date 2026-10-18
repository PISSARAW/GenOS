'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const fixture = require('./ontogenesisFixture');
const projectStore = require('../src/services/ontogenesis/projectStore');
const { registerResponsibility } = require('../src/services/shev/responsibilityService');
const { recordObservation } = require('../src/services/shev/observationService');
const { authorizationPayload } = require('../src/services/shev/authorityService');
const detector = require('../src/services/endogenousThoughtDetectionService');
const admission = require('../src/services/endogenousThoughtAdmissionService');
const queue = require('../src/services/endogenousThoughtQueueService');
const runner = require('../src/services/endogenousThoughtRunnerService');
const runContract = require('../src/services/endogenousThoughtRunContractService');
const thoughtStore = require('../src/services/endogenousThoughtStoreService');

const NOW = Date.now();
const PROJECT = 'ett-runner-project';
const AGENT = 'ett-runner-agent';
const mandate = { purpose: 'Exécuter une simulation ETT bornée en lecture seule',
  autoDiagnose: false, autoInstrument: false,
  dimensions: [{ name: 'prediction', expected: 'La prédiction converge',
    acceptance: ['Une observation indépendante mesure l’écart.'] }] };

function detectionRequest() {
  return { organizationId: 'org-a', projectId: PROJECT, agentId: AGENT,
    observationId: 'observation-runner', nowMs: NOW,
    policy: { enabled: true, id: 'ett-detection-v1', condition: 'full', cooldownMs: 0,
      maxOpenEpisodes: 1, maxBudget: { tokens: 1000, usd: 0.1, seconds: 60 } },
    assessment: { ref: 'assessment:runner:1', anomaly: 0.95, novelty: 0.8,
      expectedInformationGain: 0.9, learningProgress: 0.7, cost: 0.1,
      risk: 0.05, sampleCount: 1 },
    budget: { tokens: 500, usd: 0.05, seconds: 30 } };
}

async function setup(db, publicKey) {
  await projectStore.createProject(db, { id: PROJECT, rootPath: 'C:/ett-runner',
    branch: 'codex/ett-runner', objective: 'Tester le runner ETT', config: fixture.testConfig() });
  await registerResponsibility(db, { projectId: PROJECT,
    authorityRef: 'delegation:ett-runner-owner', authorityPublicKey: publicKey, mandate });
  await recordObservation(db, { id: 'observation-runner', projectId: PROJECT,
    domain: 'runtime', dimension: 'prediction', kind: 'degradation',
    epistemicStatus: 'observed', source: 'prediction-audit',
    observedAt: new Date(NOW - 1000).toISOString(),
    validUntil: new Date(NOW + 60000).toISOString(), summary: 'Divergence mesurée',
    evidenceRefs: ['evidence:runner'] });
  await db.exec(`CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, project_id TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, status TEXT,
      runtime_pid INTEGER, is_apoptotic INTEGER NOT NULL DEFAULT 0,
      cognitive_budget REAL NOT NULL DEFAULT 1);`);
  await db.run('INSERT INTO workspaces(id,organization_id,project_id) VALUES (?,?,?)',
    'workspace-ett-runner', 'org-a', PROJECT);
  await db.run(`INSERT INTO agents(id,workspace_id,status,runtime_pid,is_apoptotic,cognitive_budget)
    VALUES (?,?,?,?,?,?)`, AGENT, 'workspace-ett-runner', 'idle', null, 0, 10);
}

async function queuedEpisode(db) {
  const detected = await detector.detectAndQuestion(db, detectionRequest());
  const episodeId = detected.episode.receipt.payload.episodeId;
  await admission.admitQuestion(db, { organizationId: 'org-a', projectId: PROJECT,
    episodeId, nowMs: NOW + 1000,
    policy: { enabled: true, id: 'ett-admission-v1', condition: 'full', ttlMs: 60000 } });
  const queued = await queue.queueAdmittedThought(db, { organizationId: 'org-a',
    projectId: PROJECT, episodeId, nowMs: NOW + 2000,
    policy: { enabled: true, id: 'ett-queue-v1', priority: 80 } });
  return { episodeId, taskId: queued.binding.receipt.payload.taskId };
}

function signedAuthorization(privateKey, subject) {
  const unsigned = { operation: 'ett-run', projectId: PROJECT,
    subjectId: subject.episodeId, expectedVersion: subject.version,
    details: { taskId: subject.taskId, policyId: 'ett-run-v1',
      mode: runner.MODE, grantedBy: 'operator:test' },
    nonce: `ett-runner-nonce-${subject.episodeId}`,
    expiresAt: new Date(Date.now() + 60000).toISOString() };
  const signature = crypto.sign(null, Buffer.from(JSON.stringify(authorizationPayload(unsigned))),
    privateKey).toString('base64');
  return { ...unsigned, grantedBy: 'operator:test', signature };
}

function request(subject, authorization, overrides = {}) {
  return { organizationId: 'org-a', projectId: PROJECT, episodeId: subject.episodeId,
    nowMs: NOW + 3000, policy: { enabled: true, id: 'ett-run-v1' },
    authorization, ...overrides };
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => error.code === code);
}

async function exercise(db, keys) {
  await setup(db, keys.publicKey.export({ type: 'spki', format: 'pem' }));
  const queued = await queuedEpisode(db);
  const episode = await thoughtStore.getEpisode(db, { organizationId: 'org-a',
    projectId: PROJECT, episodeId: queued.episodeId });
  const subject = { ...queued, version: episode.version };
  const authorization = signedAuthorization(keys.privateKey, subject);

  assert.deepEqual(await runner.runQueuedThought(db,
    request(subject, null, { policy: { enabled: false } })),
  { status: 'skipped', reason: 'disabled' });
  const wrong = { ...authorization, details: { ...authorization.details, taskId: 'task:other' } };
  await expectCode(runner.runQueuedThought(db, request(subject, wrong)),
    'ENDOGENOUS_RUN_AUTHORIZATION_INVALID');
  const held = await db.get('SELECT priority FROM ontogenesis_backlog WHERE id=?', subject.taskId);
  await db.run('UPDATE ontogenesis_backlog SET priority=? WHERE id=?', held.priority + 1, subject.taskId);
  await expectCode(runner.runQueuedThought(db, request(subject, authorization)),
    'ENDOGENOUS_RUN_TASK_INTEGRITY_FAILED');
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM shev_authorizations')).n, 0);
  await db.run('UPDATE ontogenesis_backlog SET priority=? WHERE id=?', held.priority, subject.taskId);

  const result = await runner.runQueuedThought(db, request(subject, authorization));
  assert.equal(result.status, 'completed_unverified');
  assert.equal(result.episode.receipt.payload.toState, 'RUNNING');
  assert.equal(result.episode.receipt.payload.jobRef, result.run.receipt.payload.runId);
  assert.equal(result.runtime.task.status, 'verifying');
  assert.equal(result.runtime.task.attempt, 1);
  assert.equal(result.runtime.job.status, 'unverified');
  assert.deepEqual(result.run.receipt.payload.boundaries, runContract.BOUNDARIES);
  assert.equal(result.run.receipt.payload.proposal.hypothesis.includes('reproductible'), true);
  assert.deepEqual(result.run.receipt.payload.usage, { tokens: 0, usd: 0, seconds: 0 });
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM shev_authorizations')).n, 1);
  assert.deepEqual(JSON.parse(result.runtime.job.budgets_json),
    result.run.receipt.payload.budget);
  assert.equal(runContract.readReceipt(result.run.receipt).valid, true);
  const forged = structuredClone(result.run.receipt);
  forged.payload.boundaries.independentlyVerified = true;
  assert.equal(runContract.readReceipt(forged).valid, false);
  const overBudget = structuredClone(result.run.receipt.payload);
  overBudget.usage.tokens = overBudget.budget.tokens + 1;
  assert.deepEqual(runContract.validatePayload(overBudget),
    { valid: false, errors: ['resources'] });
  const afterExpiry = structuredClone(result.run.receipt.payload);
  afterExpiry.completedAt = new Date(Date.parse(afterExpiry.authorization.expiresAt) + 1).toISOString();
  assert.deepEqual(runContract.validatePayload(afterExpiry),
    { valid: false, errors: ['timestamp'] });

  const replay = await runner.runQueuedThought(db, request(subject, authorization));
  assert.equal(replay.run.replayed, true);
  assert.equal(replay.episode.replayed, true);
  assert.equal(replay.run.receipt.receiptId, result.run.receipt.receiptId);
  await expectCode(runner.runQueuedThought(db, request(subject, authorization,
    { organizationId: 'org-b' })), 'ENDOGENOUS_EPISODE_NOT_FOUND');
  await assert.rejects(db.run(`UPDATE endogenous_thought_runs SET status='completed_unverified'
    WHERE episode_id=?`, subject.episodeId), /immutable/);
  return { subject, authorization, receiptId: result.run.receipt.receiptId };
}

async function main() {
  const filename = path.join(os.tmpdir(), `ett-runner-${crypto.randomUUID()}.sqlite`);
  const keys = crypto.generateKeyPairSync('ed25519');
  let db = await fixture.memoryDb(filename);
  let state;
  try {
    state = await exercise(db, keys);
    await db.close();
    db = await fixture.memoryDb(filename);
    const replay = await runner.runQueuedThought(db, request(state.subject, state.authorization));
    assert.equal(replay.run.receipt.receiptId, state.receiptId);
    assert.equal(replay.run.replayed, true);
  } finally {
    await db.close().catch(() => {});
    fs.rmSync(filename, { force: true });
  }
}

main().then(() => console.log('Authorized endogenous read-only runner tests passed.'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
