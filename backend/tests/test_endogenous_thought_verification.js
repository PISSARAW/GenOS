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
const { canonicalJson } = require('../src/services/aTeam/variants/variantExecutionHelpers');
const detector = require('../src/services/endogenousThoughtDetectionService');
const admission = require('../src/services/endogenousThoughtAdmissionService');
const queue = require('../src/services/endogenousThoughtQueueService');
const runner = require('../src/services/endogenousThoughtRunnerService');
const verifier = require('../src/services/endogenousThoughtVerificationService');
const verificationContract = require('../src/services/endogenousThoughtVerificationContractService');
const thoughtStore = require('../src/services/endogenousThoughtStoreService');

const NOW = Date.now();
const PROJECT = 'ett-verification-project';
const AGENT = 'ett-verification-agent';
const mandate = { purpose: 'Vérifier indépendamment une proposition ETT bornée',
  autoDiagnose: false, autoInstrument: false,
  dimensions: [{ name: 'prediction', expected: 'La prédiction converge',
    acceptance: ['Une observation indépendante mesure l’écart.'] }] };

function signAuthorization(privateKey, input) {
  const signature = crypto.sign(null, Buffer.from(JSON.stringify(authorizationPayload(input))),
    privateKey).toString('base64');
  return { ...input, signature };
}

async function setup(db, publicKey) {
  await projectStore.createProject(db, { id: PROJECT, rootPath: 'C:/ett-verification',
    branch: 'codex/ett-verification', objective: 'Tester la vérification ETT',
    config: fixture.testConfig() });
  await registerResponsibility(db, { projectId: PROJECT,
    authorityRef: 'delegation:ett-verification-owner', authorityPublicKey: publicKey, mandate });
  await recordObservation(db, { id: 'observation-verification', projectId: PROJECT,
    domain: 'runtime', dimension: 'prediction', kind: 'degradation',
    epistemicStatus: 'observed', source: 'prediction-audit',
    observedAt: new Date(NOW - 1000).toISOString(),
    validUntil: new Date(NOW + 120000).toISOString(), summary: 'Divergence mesurée',
    evidenceRefs: ['evidence:verification'] });
  await db.exec(`CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, project_id TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, status TEXT,
      runtime_pid INTEGER, is_apoptotic INTEGER NOT NULL DEFAULT 0,
      cognitive_budget REAL NOT NULL DEFAULT 1);`);
  await db.run('INSERT INTO workspaces(id,organization_id,project_id) VALUES (?,?,?)',
    'workspace-ett-verification', 'org-a', PROJECT);
  await db.run(`INSERT INTO agents(id,workspace_id,status,runtime_pid,is_apoptotic,cognitive_budget)
    VALUES (?,?,?,?,?,?)`, AGENT, 'workspace-ett-verification', 'idle', null, 0, 10);
}

function detectionRequest() {
  return { organizationId: 'org-a', projectId: PROJECT, agentId: AGENT,
    observationId: 'observation-verification', nowMs: NOW,
    policy: { enabled: true, id: 'ett-detection-v1', condition: 'full', cooldownMs: 0,
      maxOpenEpisodes: 1, maxBudget: { tokens: 1000, usd: 0.1, seconds: 60 } },
    assessment: { ref: 'assessment:verification:1', anomaly: 0.95, novelty: 0.8,
      expectedInformationGain: 0.9, learningProgress: 0.7, cost: 0.1,
      risk: 0.05, sampleCount: 1 },
    budget: { tokens: 500, usd: 0.05, seconds: 30 } };
}

async function preparedRun(db, authorityKey) {
  const detected = await detector.detectAndQuestion(db, detectionRequest());
  const episodeId = detected.episode.receipt.payload.episodeId;
  await admission.admitQuestion(db, { organizationId: 'org-a', projectId: PROJECT,
    episodeId, nowMs: NOW + 1000,
    policy: { enabled: true, id: 'ett-admission-v1', condition: 'full', ttlMs: 60000 } });
  const queued = await queue.queueAdmittedThought(db, { organizationId: 'org-a',
    projectId: PROJECT, episodeId, nowMs: NOW + 2000,
    policy: { enabled: true, id: 'ett-queue-v1', priority: 80 } });
  const taskId = queued.binding.receipt.payload.taskId;
  const episode = await thoughtStore.getEpisode(db, { organizationId: 'org-a',
    projectId: PROJECT, episodeId });
  const unsigned = { operation: 'ett-run', projectId: PROJECT, subjectId: episodeId,
    expectedVersion: episode.version, details: { taskId, policyId: 'ett-run-v1',
      mode: runner.MODE, grantedBy: 'operator:test' },
    nonce: `ett-verify-run-${episodeId}`,
    expiresAt: new Date(Date.now() + 120000).toISOString() };
  const authorization = { ...signAuthorization(authorityKey, unsigned), grantedBy: 'operator:test' };
  const result = await runner.runQueuedThought(db, { organizationId: 'org-a',
    projectId: PROJECT, episodeId, nowMs: NOW + 3000,
    policy: { enabled: true, id: 'ett-run-v1' }, authorization });
  return { episodeId, taskId, runReceipt: result.run.receipt };
}

function verificationDraft(subject, verifierKey, overrides = {}) {
  return { verifierId: 'ett-independent-verifier',
    publicKey: verifierKey.publicKey.export({ type: 'spki', format: 'pem' }),
    verdict: 'supported', oracleRef: 'oracle:ett:independent:1',
    evidenceRefs: [subject.runReceipt.receiptId, 'oracle:ett:independent:1',
      'evidence:independent-replay:1'],
    verifiedAt: new Date(NOW + 4000).toISOString(),
    nonce: `ett-verifier-attestation-${subject.episodeId}`, signature: '', ...overrides };
}

async function verificationRequest(db, subject, options) {
  const keys = options.keys;
  const episode = await thoughtStore.getEpisode(db, { organizationId: 'org-a',
    projectId: PROJECT, episodeId: subject.episodeId });
  const verification = verificationDraft(subject, keys.verifier, options.verification);
  const keyDigest = verificationContract.publicKeyDigest(verification.publicKey);
  const unsigned = { operation: 'ett-verify', projectId: PROJECT,
    subjectId: subject.runReceipt.payload.runId, expectedVersion: episode.version,
    details: { episodeId: subject.episodeId, runRef: subject.runReceipt.receiptId,
      verifierId: verification.verifierId, verifierKeyDigest: keyDigest,
      policyId: 'ett-verification-v1', oracleRef: verification.oracleRef },
    nonce: options.authorizationNonce || `ett-verification-auth-${subject.episodeId}`,
    expiresAt: new Date(Date.now() + 120000).toISOString() };
  const authorization = signAuthorization(keys.authority.privateKey, unsigned);
  const payload = verifier.buildPayload({ projectId: PROJECT, episodeId: subject.episodeId,
    policyId: 'ett-verification-v1', authorizationRef: `shev-authorization:${unsigned.nonce}`,
    runReceipt: subject.runReceipt, verification });
  verification.signature = crypto.sign(null,
    Buffer.from(canonicalJson(verificationContract.attestationMaterial(payload))),
    keys.verifier.privateKey).toString('base64');
  return { organizationId: 'org-a', projectId: PROJECT, episodeId: subject.episodeId,
    policy: { enabled: true, id: 'ett-verification-v1' }, authorization, verification };
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => error.code === code);
}

async function exercise(db, keys) {
  const authorityPem = keys.authority.publicKey.export({ type: 'spki', format: 'pem' });
  await setup(db, authorityPem);
  const subject = await preparedRun(db, keys.authority.privateKey);
  const request = await verificationRequest(db, subject, { keys });

  assert.deepEqual(await verifier.verifyRunningThought(db,
    { ...request, policy: { enabled: false } }), { status: 'skipped', reason: 'disabled' });
  const authorityAsVerifier = await verificationRequest(db, subject,
    { keys: { ...keys, verifier: keys.authority } });
  await expectCode(verifier.verifyRunningThought(db, authorityAsVerifier),
    'ENDOGENOUS_VERIFIER_NOT_INDEPENDENT');
  const producerAsVerifier = await verificationRequest(db, subject,
    { keys, verification: { verifierId: AGENT } });
  await expectCode(verifier.verifyRunningThought(db, producerAsVerifier),
    'ENDOGENOUS_VERIFIER_NOT_INDEPENDENT');
  const earlyVerification = await verificationRequest(db, subject, { keys,
    authorizationNonce: `ett-verification-early-${subject.episodeId}`,
    verification: { verifiedAt: new Date(
      Date.parse(subject.runReceipt.payload.completedAt) - 1).toISOString() } });
  await expectCode(verifier.verifyRunningThought(db, earlyVerification),
    'ENDOGENOUS_VERIFICATION_TIMING_INVALID');
  const badSignature = structuredClone(request);
  const corrupted = Buffer.from(request.verification.signature, 'base64');
  corrupted[0] ^= 0xff;
  badSignature.verification.signature = corrupted.toString('base64');
  await expectCode(verifier.verifyRunningThought(db, badSignature),
    'INVALID_ENDOGENOUS_VERIFICATION_CONTRACT');

  const result = await verifier.verifyRunningThought(db, request);
  assert.equal(result.status, 'supported');
  assert.equal(result.episode.receipt.payload.toState, 'VERIFIED');
  assert.equal(result.runtime.task.status, 'done');
  assert.equal(result.runtime.run.status, 'verified');
  assert.equal(result.verification.receipt.payload.verdict, 'supported');
  assert.deepEqual(result.verification.receipt.payload.boundaries,
    verificationContract.BOUNDARIES);
  assert.equal(verificationContract.readReceipt(result.verification.receipt).valid, true);
  const forged = structuredClone(result.verification.receipt);
  forged.payload.verdict = 'refuted';
  assert.equal(verificationContract.readReceipt(forged).valid, false);
  for (const verdict of ['refuted', 'inconclusive']) {
    const classified = structuredClone(result.verification.receipt.payload);
    classified.verdict = verdict;
    classified.attestation.signature = crypto.sign(null,
      Buffer.from(canonicalJson(verificationContract.attestationMaterial(classified))),
      keys.verifier.privateKey).toString('base64');
    assert.equal(verificationContract.validatePayload(classified).valid, true);
  }

  const replay = await verifier.verifyRunningThought(db, request);
  assert.equal(replay.verification.replayed, true);
  assert.equal(replay.episode.replayed, true);
  assert.equal(replay.verification.receipt.receiptId,
    result.verification.receipt.receiptId);
  await expectCode(verifier.verifyRunningThought(db, { ...request, organizationId: 'org-b' }),
    'ENDOGENOUS_EPISODE_NOT_FOUND');
  await assert.rejects(db.run(`UPDATE endogenous_thought_verifications SET verdict='supported'
    WHERE episode_id=?`, subject.episodeId), /immutable/);
  return { subject, request, receiptId: result.verification.receipt.receiptId };
}

async function main() {
  const filename = path.join(os.tmpdir(), `ett-verification-${crypto.randomUUID()}.sqlite`);
  const keys = { authority: crypto.generateKeyPairSync('ed25519'),
    verifier: crypto.generateKeyPairSync('ed25519') };
  let db = await fixture.memoryDb(filename);
  let state;
  try {
    state = await exercise(db, keys);
    await db.close();
    db = await fixture.memoryDb(filename);
    const replay = await verifier.verifyRunningThought(db, state.request);
    assert.equal(replay.verification.receipt.receiptId, state.receiptId);
    assert.equal(replay.verification.replayed, true);
  } finally {
    await db.close().catch(() => {});
    fs.rmSync(filename, { force: true });
  }
}

main().then(() => console.log('Independent endogenous verification tests passed.'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
