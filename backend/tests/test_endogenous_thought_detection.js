'use strict';

const assert = require('node:assert/strict');
const fixture = require('./ontogenesisFixture');
const projectStore = require('../src/services/ontogenesis/projectStore');
const { registerResponsibility } = require('../src/services/shev/responsibilityService');
const { recordObservation } = require('../src/services/shev/observationService');
const detector = require('../src/services/endogenousThoughtDetectionService');

const NOW = Date.parse('2026-10-18T10:30:00.000Z');
const PROJECT = 'ett-project';
const AGENT = 'ett-agent';

const mandate = {
  purpose: 'Examiner les divergences vérifiées sans action externe',
  autoDiagnose: false, autoInstrument: false,
  dimensions: [{ name: 'prediction', expected: 'La prédiction converge',
    acceptance: ['Une observation indépendante mesure l’écart.'] }]
};

function request(overrides = {}) {
  const base = {
    organizationId: 'org-a', projectId: PROJECT, agentId: AGENT,
    observationId: 'observation-1', nowMs: NOW,
    policy: { enabled: true, id: 'ett-policy-v1', condition: 'full', cooldownMs: 0,
      maxOpenEpisodes: 1, maxBudget: { tokens: 1000, usd: 0.1, seconds: 60 } },
    assessment: { ref: 'assessment:verified:1', anomaly: 0.95, novelty: 0.8,
      expectedInformationGain: 0.9, learningProgress: 0.7, cost: 0.1,
      risk: 0.05, sampleCount: 1 },
    budget: { tokens: 500, usd: 0.05, seconds: 30 }
  };
  return { ...base, ...overrides,
    policy: { ...base.policy, ...(overrides.policy || {}) },
    assessment: { ...base.assessment, ...(overrides.assessment || {}) } };
}

function observation(id, overrides = {}) {
  return { id, projectId: PROJECT, domain: 'runtime', dimension: 'prediction',
    kind: 'degradation', epistemicStatus: 'observed', source: 'prediction-audit',
    observedAt: new Date(NOW - 1000).toISOString(),
    validUntil: new Date(NOW + 60000).toISOString(), summary: 'Divergence mesurée',
    evidenceRefs: [`evidence:${id}`], ...overrides };
}

async function setup(db) {
  await projectStore.createProject(db, { id: PROJECT, rootPath: 'C:/ett',
    branch: 'codex/ett', objective: 'Tester la pensée endogène', config: fixture.testConfig() });
  await registerResponsibility(db, { projectId: PROJECT,
    authorityRef: 'delegation:ett-owner', mandate });
  await recordObservation(db, observation('observation-1'));
  await db.exec(`CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, project_id TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, status TEXT,
      runtime_pid INTEGER, is_apoptotic INTEGER NOT NULL DEFAULT 0,
      cognitive_budget REAL NOT NULL DEFAULT 1);`);
  await db.run('INSERT INTO workspaces(id,organization_id,project_id) VALUES (?,?,?)',
    'workspace-ett', 'org-a', PROJECT);
  await db.run(`INSERT INTO agents(id,workspace_id,status,runtime_pid,is_apoptotic,cognitive_budget)
    VALUES (?,?,?,?,?,?)`, AGENT, 'workspace-ett', 'idle', null, 0, 10);
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => error.code === code);
}

async function exercise(db) {
  assert.deepEqual(await detector.detectAndQuestion(db, request({ policy: { enabled: false } })),
    { status: 'skipped', reason: 'disabled' });

  let generationCalls = 0;
  const questionGenerator = async () => {
    generationCalls += 1;
    return { text: 'Quelle expérience indépendante départage cette divergence ?' };
  };
  const questioned = await detector.detectAndQuestion(db, request({ questionGenerator }));
  assert.equal(questioned.status, 'questioned');
  assert.equal(questioned.detection.payload.decision.outcome, 'candidate');
  assert.equal(questioned.episode.receipt.payload.toState, 'QUESTIONED');
  assert.equal(questioned.episode.receipt.payload.taskRef, null);
  assert.equal(questioned.episode.receipt.payload.jobRef, null);
  assert.equal(questioned.question.receipt.payload.episodeId,
    questioned.episode.receipt.payload.episodeId);
  assert.deepEqual(questioned.detection.payload.boundaries, {
    authorityGranted: false, promotionEligible: false,
    taskCreated: false, externalActionAllowed: false
  });

  const replay = await detector.detectAndQuestion(db, request({ questionGenerator }));
  assert.equal(replay.status, 'questioned');
  assert.equal(replay.detection.replayed, true);
  assert.equal(replay.episode.receipt.receiptId, questioned.episode.receipt.receiptId);
  assert.equal(replay.questionGeneration.status, 'replayed');
  assert.equal(generationCalls, 1);
  await expectCode(detector.detectAndQuestion(db, request({ assessment: { anomaly: 0.7 } })),
    'ENDOGENOUS_DETECTION_IDEMPOTENCY_CONFLICT');

  await recordObservation(db, observation('observation-low'));
  const low = await detector.detectAndQuestion(db, request({ observationId: 'observation-low',
    policy: { id: 'ett-policy-low' }, assessment: { anomaly: 0.1, novelty: 0.1,
      expectedInformationGain: 0.1, learningProgress: 0.1 } }));
  assert.equal(low.status, 'rejected');
  assert.equal(low.reason, 'low-information-gain');

  await recordObservation(db, observation('observation-capacity'));
  const capacity = await detector.detectAndQuestion(db, request({ observationId: 'observation-capacity',
    policy: { id: 'ett-policy-capacity' }, assessment: { ref: 'assessment:capacity' } }));
  assert.equal(capacity.status, 'rejected');
  assert.equal(capacity.reason, 'open-episode-limit');

  await assert.rejects(db.run(`UPDATE endogenous_thought_detection_receipts
    SET outcome='rejected' WHERE project_id=?`, PROJECT), /immutable/);
  await expectCode(detector.detectAndQuestion(db, request({ organizationId: 'org-b',
    policy: { id: 'ett-policy-foreign' } })), 'ENDOGENOUS_AGENT_SCOPE_MISMATCH');

  await recordObservation(db, observation('observation-derived-new',
    { summary: 'Latence réseau orthogonale' }));
  const novelRow = await db.get('SELECT * FROM shev_observations WHERE id=?',
    'observation-derived-new');
  const novel = await detector.deriveAssessment(db, request(), { observation: novelRow }, null);
  await recordObservation(db, observation('observation-derived-repeat',
    { summary: 'Latence réseau orthogonale' }));
  const repeatRow = await db.get('SELECT * FROM shev_observations WHERE id=?',
    'observation-derived-repeat');
  const repeated = await detector.deriveAssessment(db, request(), { observation: repeatRow }, null);
  assert.match(novel.ref, /^assessment:empirical-v2:/);
  assert.ok(repeated.novelty < novel.novelty);
  assert.ok(repeated.expectedInformationGain < novel.expectedInformationGain);
  assert.ok(repeated.learningProgress < novel.learningProgress);
}

async function main() {
  const db = await fixture.memoryDb();
  try {
    await setup(db);
    await exercise(db);
  } finally {
    await db.close();
  }
}

main().then(() => console.log('Bounded endogenous detection and question tests passed.')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
