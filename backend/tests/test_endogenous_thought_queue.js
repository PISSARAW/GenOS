'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const fixture = require('./ontogenesisFixture');
const projectStore = require('../src/services/ontogenesis/projectStore');
const { registerResponsibility } = require('../src/services/shev/responsibilityService');
const { recordObservation } = require('../src/services/shev/observationService');
const detector = require('../src/services/endogenousThoughtDetectionService');
const admission = require('../src/services/endogenousThoughtAdmissionService');
const queue = require('../src/services/endogenousThoughtQueueService');
const taskContract = require('../src/services/endogenousThoughtTaskContractService');
const selector = require('../src/services/ontogenesis/taskSelector');

const NOW = Date.parse('2026-10-18T11:30:00.000Z');
const PROJECT = 'ett-queue-project';
const AGENT = 'ett-queue-agent';

const mandate = { purpose: 'Mettre en file une question sans l’exécuter',
  autoDiagnose: false, autoInstrument: false,
  dimensions: [{ name: 'prediction', expected: 'La prédiction converge',
    acceptance: ['Une observation indépendante mesure l’écart.'] }] };

function detectionRequest() {
  return { organizationId: 'org-a', projectId: PROJECT, agentId: AGENT,
    observationId: 'observation-queue', nowMs: NOW,
    policy: { enabled: true, id: 'ett-detection-v1', condition: 'full', cooldownMs: 0,
      maxOpenEpisodes: 1, maxBudget: { tokens: 1000, usd: 0.1, seconds: 60 } },
    assessment: { ref: 'assessment:queue:1', anomaly: 0.95, novelty: 0.8,
      expectedInformationGain: 0.9, learningProgress: 0.7, cost: 0.1,
      risk: 0.05, sampleCount: 1 },
    budget: { tokens: 500, usd: 0.05, seconds: 30 } };
}

function admissionRequest(episodeId, condition = 'full') {
  return { organizationId: 'org-a', projectId: PROJECT, episodeId, nowMs: NOW + 1000,
    policy: { enabled: true, id: 'ett-admission-v1', condition, ttlMs: 60000 } };
}

function queueRequest(episodeId, overrides = {}) {
  const policy = { enabled: true, id: 'ett-queue-v1', priority: 73,
    ...(overrides.policy || {}) };
  return { organizationId: 'org-a', projectId: PROJECT, episodeId, nowMs: NOW + 2000,
    ...overrides, policy };
}

async function setup(db) {
  await projectStore.createProject(db, { id: PROJECT, rootPath: 'C:/ett-queue',
    branch: 'codex/ett-queue', objective: 'Tester la file ETT', config: fixture.testConfig() });
  await registerResponsibility(db, { projectId: PROJECT,
    authorityRef: 'delegation:ett-queue-owner', mandate });
  await recordObservation(db, { id: 'observation-queue', projectId: PROJECT,
    domain: 'runtime', dimension: 'prediction', kind: 'degradation',
    epistemicStatus: 'observed', source: 'prediction-audit',
    observedAt: new Date(NOW - 1000).toISOString(),
    validUntil: new Date(NOW + 60000).toISOString(), summary: 'Divergence mesurée',
    evidenceRefs: ['evidence:queue'] });
  await db.exec(`CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, project_id TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, status TEXT,
      runtime_pid INTEGER, is_apoptotic INTEGER NOT NULL DEFAULT 0,
      cognitive_budget REAL NOT NULL DEFAULT 1);`);
  await db.run('INSERT INTO workspaces(id,organization_id,project_id) VALUES (?,?,?)',
    'workspace-ett-queue', 'org-a', PROJECT);
  await db.run(`INSERT INTO agents(id,workspace_id,status,runtime_pid,is_apoptotic,cognitive_budget)
    VALUES (?,?,?,?,?,?)`, AGENT, 'workspace-ett-queue', 'idle', null, 0, 10);
}

async function admittedEpisode(db, condition = 'full') {
  await setup(db);
  const detected = await detector.detectAndQuestion(db, detectionRequest());
  const episodeId = detected.episode.receipt.payload.episodeId;
  const admitted = await admission.admitQuestion(db, admissionRequest(episodeId, condition));
  return { episodeId, admitted };
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => error.code === code);
}

async function exerciseQueue() {
  const db = await fixture.memoryDb();
  try {
    const { episodeId } = await admittedEpisode(db);
    assert.deepEqual(await queue.queueAdmittedThought(db,
      queueRequest(episodeId, { policy: { enabled: false } })),
    { status: 'skipped', reason: 'disabled' });
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM ontogenesis_backlog')).n, 0);

    const result = await queue.queueAdmittedThought(db, queueRequest(episodeId));
    assert.equal(result.status, 'queued');
    assert.equal(result.task.status, 'blocked');
    assert.equal(result.task.priority, 73);
    assert.equal(result.episode.receipt.payload.toState, 'QUEUED');
    assert.equal(result.episode.receipt.payload.taskRef, result.task.id);
    assert.equal(result.episode.receipt.payload.jobRef, null);
    assert.deepEqual(result.binding.receipt.payload.boundaries, queue.BOUNDARIES);
    assert.equal(taskContract.readReceipt(result.binding.receipt).valid, true);
    const forged = structuredClone(result.binding.receipt);
    forged.receiptId = 'rcpt_forged';
    assert.equal(taskContract.readReceipt(forged).valid, false);
    const openBoundary = structuredClone(result.binding.receipt.payload);
    openBoundary.boundaries.executionAuthorized = true;
    assert.equal(taskContract.validatePayload(openBoundary).valid, false);
    assert.equal(selector.selectNextTask([result.task]).blocked, 'taches-bloquees');
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM ontogenesis_execution')).n, 0);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM ontogenesis_runs')).n, 0);

    const replay = await queue.queueAdmittedThought(db, queueRequest(episodeId));
    assert.equal(replay.binding.replayed, true);
    assert.equal(replay.binding.receipt.receiptId, result.binding.receipt.receiptId);
    await expectCode(queue.queueAdmittedThought(db, queueRequest(episodeId,
      { policy: { priority: 74 } })), 'ENDOGENOUS_QUEUE_IDEMPOTENCY_CONFLICT');
    await expectCode(queue.queueAdmittedThought(db, queueRequest(episodeId,
      { organizationId: 'org-b' })), 'ENDOGENOUS_EPISODE_NOT_FOUND');
    await assert.rejects(db.run(`UPDATE endogenous_thought_task_bindings
      SET policy_id='other' WHERE episode_id=?`, episodeId), /immutable/);
  } finally {
    await db.close();
  }
}

async function exerciseRefusal() {
  const db = await fixture.memoryDb();
  try {
    const { episodeId, admitted } = await admittedEpisode(db, 'agow_arbitration_ablated');
    assert.equal(admitted.status, 'abstained');
    await expectCode(queue.queueAdmittedThought(db, queueRequest(episodeId)),
      'ENDOGENOUS_ADMISSION_NOT_GRANTED');
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM ontogenesis_backlog')).n, 0);
  } finally {
    await db.close();
  }
}

async function exerciseRestart() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ett-queue-restart-'));
  const filename = path.join(directory, 'ett.db');
  let db = await fixture.memoryDb(filename);
  try {
    const { episodeId } = await admittedEpisode(db);
    const queued = await queue.queueAdmittedThought(db, queueRequest(episodeId));
    const receiptId = queued.binding.receipt.receiptId;
    await db.close();
    db = await fixture.memoryDb(filename);
    const replay = await queue.queueAdmittedThought(db, queueRequest(episodeId));
    assert.equal(replay.binding.replayed, true);
    assert.equal(replay.binding.receipt.receiptId, receiptId);
    assert.equal(replay.task.status, 'blocked');
    assert.equal(replay.episode.receipt.payload.toState, 'QUEUED');
  } finally {
    await db.close().catch(() => {});
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function main() {
  await exerciseQueue();
  await exerciseRefusal();
  await exerciseRestart();
}

main().then(() => console.log('Held endogenous Ontogenesis queue tests passed.')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
