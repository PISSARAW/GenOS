'use strict';

const assert = require('node:assert/strict');
const fixture = require('./ontogenesisFixture');
const projectStore = require('../src/services/ontogenesis/projectStore');
const { registerResponsibility } = require('../src/services/shev/responsibilityService');
const { recordObservation } = require('../src/services/shev/observationService');
const detector = require('../src/services/endogenousThoughtDetectionService');
const admission = require('../src/services/endogenousThoughtAdmissionService');
const admissionContract = require('../src/services/endogenousThoughtAdmissionContractService');

const NOW = Date.parse('2026-10-18T11:00:00.000Z');
const PROJECT = 'ett-admission-project';
const AGENT = 'ett-admission-agent';

const mandate = { purpose: 'Arbitrer une question vérifiée sans action externe',
  autoDiagnose: false, autoInstrument: false,
  dimensions: [{ name: 'prediction', expected: 'La prédiction converge',
    acceptance: ['Une observation indépendante mesure l’écart.'] }] };

function detectionRequest() {
  return { organizationId: 'org-a', projectId: PROJECT, agentId: AGENT,
    observationId: 'observation-admission', nowMs: NOW,
    policy: { enabled: true, id: 'ett-detection-v1', condition: 'full', cooldownMs: 0,
      maxOpenEpisodes: 1, maxBudget: { tokens: 1000, usd: 0.1, seconds: 60 } },
    assessment: { ref: 'assessment:admission:1', anomaly: 0.95, novelty: 0.8,
      expectedInformationGain: 0.9, learningProgress: 0.7, cost: 0.1,
      risk: 0.05, sampleCount: 1 },
    budget: { tokens: 500, usd: 0.05, seconds: 30 } };
}

function admissionRequest(episodeId, overrides = {}) {
  const policy = { enabled: true, id: 'ett-admission-v1', condition: 'full', ttlMs: 60000,
    ...(overrides.policy || {}) };
  return { organizationId: 'org-a', projectId: PROJECT, episodeId, nowMs: NOW + 1000,
    ...overrides, policy };
}

async function setup(db) {
  await projectStore.createProject(db, { id: PROJECT, rootPath: 'C:/ett-admission',
    branch: 'codex/ett-admission', objective: 'Tester l’admission ETT', config: fixture.testConfig() });
  await registerResponsibility(db, { projectId: PROJECT,
    authorityRef: 'delegation:ett-admission-owner', mandate });
  await recordObservation(db, { id: 'observation-admission', projectId: PROJECT,
    domain: 'runtime', dimension: 'prediction', kind: 'degradation',
    epistemicStatus: 'observed', source: 'prediction-audit',
    observedAt: new Date(NOW - 1000).toISOString(),
    validUntil: new Date(NOW + 60000).toISOString(), summary: 'Divergence mesurée',
    evidenceRefs: ['evidence:admission'] });
  await db.exec(`CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, project_id TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, status TEXT,
      runtime_pid INTEGER, is_apoptotic INTEGER NOT NULL DEFAULT 0,
      cognitive_budget REAL NOT NULL DEFAULT 1);`);
  await db.run('INSERT INTO workspaces(id,organization_id,project_id) VALUES (?,?,?)',
    'workspace-ett-admission', 'org-a', PROJECT);
  await db.run(`INSERT INTO agents(id,workspace_id,status,runtime_pid,is_apoptotic,cognitive_budget)
    VALUES (?,?,?,?,?,?)`, AGENT, 'workspace-ett-admission', 'idle', null, 0, 10);
}

async function questionedEpisode(db) {
  await setup(db);
  const result = await detector.detectAndQuestion(db, detectionRequest());
  assert.equal(result.status, 'questioned');
  return result.episode.receipt.payload.episodeId;
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => error.code === code);
}

async function exerciseAdmission() {
  const db = await fixture.memoryDb();
  try {
    const episodeId = await questionedEpisode(db);
    assert.deepEqual(await admission.admitQuestion(db,
      admissionRequest(episodeId, { policy: { enabled: false } })),
    { status: 'skipped', reason: 'disabled' });

    process.env.GENOS_AGOW_MODE = 'off';
    const result = await admission.admitQuestion(db, admissionRequest(episodeId));
    assert.equal(result.status, 'admitted');
    assert.equal(result.episode.receipt.payload.toState, 'ADMITTED');
    assert.equal(result.episode.receipt.payload.taskRef, null);
    assert.equal(result.episode.receipt.payload.jobRef, null);
    assert.equal(process.env.GENOS_AGOW_MODE, 'off');
    assert.equal(admissionContract.readReceipt(result.decision.receipt).valid, true);
    assert.deepEqual(result.decision.receipt.payload.boundaries, admission.BOUNDARIES);
    assert.equal(Object.keys(result.decision.receipt.payload.arbitration.activations).length, 2);
    const forged = structuredClone(result.decision.receipt);
    forged.receiptId = 'rcpt_forged';
    assert.equal(admissionContract.readReceipt(forged).valid, false);
    const unknownWinner = structuredClone(result.decision.receipt.payload);
    unknownWinner.arbitration.winners = ['candidate:unknown'];
    assert.equal(admissionContract.validatePayload(unknownWinner).valid, false);
    const openBoundary = structuredClone(result.decision.receipt.payload);
    openBoundary.boundaries.unexpectedCapability = false;
    assert.equal(admissionContract.validatePayload(openBoundary).valid, false);

    const replay = await admission.admitQuestion(db, admissionRequest(episodeId));
    assert.equal(replay.status, 'admitted');
    assert.equal(replay.decision.replayed, true);
    assert.equal(replay.decision.receipt.receiptId, result.decision.receipt.receiptId);
    await expectCode(admission.admitQuestion(db, admissionRequest(episodeId,
      { policy: { condition: 'agow_arbitration_ablated' } })),
    'ENDOGENOUS_ADMISSION_IDEMPOTENCY_CONFLICT');
    await expectCode(admission.admitQuestion(db, admissionRequest(episodeId,
      { organizationId: 'org-b' })), 'ENDOGENOUS_EPISODE_NOT_FOUND');
    await assert.rejects(db.run(`UPDATE endogenous_thought_admission_decisions
      SET outcome='abstained' WHERE episode_id=?`, episodeId), /immutable/);
  } finally {
    delete process.env.GENOS_AGOW_MODE;
    await db.close();
  }
}

async function exerciseAblation() {
  const db = await fixture.memoryDb();
  try {
    const episodeId = await questionedEpisode(db);
    const result = await admission.admitQuestion(db, admissionRequest(episodeId,
      { policy: { condition: 'agow_arbitration_ablated' } }));
    assert.equal(result.status, 'abstained');
    assert.equal(result.episode.receipt.payload.toState, 'ABSTAINED');
    assert.equal(result.decision.receipt.payload.selectedCandidateId, null);
    assert.equal(result.decision.receipt.payload.arbitration.rounds, 0);
    assert.equal(result.decision.receipt.payload.reason, 'agow-arbitration-ablated');
  } finally {
    await db.close();
  }
}

async function main() {
  await exerciseAdmission();
  await exerciseAblation();
}

main().then(() => console.log('Bounded endogenous admission tests passed.')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
