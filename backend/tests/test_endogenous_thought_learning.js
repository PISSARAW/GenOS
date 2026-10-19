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
const learner = require('../src/services/endogenousThoughtLearningService');
const learningContract = require('../src/services/endogenousThoughtLearningContractService');
const vectorMemory = require('../src/services/vectorMemoryService');
const thoughtStore = require('../src/services/endogenousThoughtStoreService');

const NOW = Date.now();
const PROJECT = 'ett-learning-project';
const AGENT = 'ett-learning-agent';
const mandate = { purpose: 'Apprendre uniquement depuis une vérification ETT indépendante',
  autoDiagnose: false, autoInstrument: false,
  dimensions: [{ name: 'prediction', expected: 'La prédiction converge',
    acceptance: ['Une observation indépendante mesure l’écart.'] }] };

function signAuthorization(privateKey, input) {
  const signature = crypto.sign(null, Buffer.from(JSON.stringify(authorizationPayload(input))),
    privateKey).toString('base64');
  return { ...input, signature };
}

async function setup(db, publicKey) {
  await projectStore.createProject(db, { id: PROJECT, rootPath: 'C:/ett-learning',
    branch: 'codex/ett-learning', objective: 'Tester l’apprentissage ETT borné',
    config: fixture.testConfig() });
  await registerResponsibility(db, { projectId: PROJECT,
    authorityRef: 'delegation:ett-learning-owner', authorityPublicKey: publicKey, mandate });
  await recordObservation(db, { id: 'observation-learning', projectId: PROJECT,
    domain: 'runtime', dimension: 'prediction', kind: 'degradation',
    epistemicStatus: 'observed', source: 'prediction-audit',
    observedAt: new Date(NOW - 1000).toISOString(),
    validUntil: new Date(NOW + 120000).toISOString(), summary: 'Divergence mesurée',
    evidenceRefs: ['evidence:learning'] });
  await db.exec(`CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, project_id TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, status TEXT,
      runtime_pid INTEGER, is_apoptotic INTEGER NOT NULL DEFAULT 0,
      cognitive_budget REAL NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS genome_decisions (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL,
      embedding_blob BLOB, created_by TEXT NOT NULL, category TEXT,
      synaptic_weight REAL, organization_id TEXT, project_id TEXT,
      evidence_refs_json TEXT NOT NULL DEFAULT '[]', evidence_status TEXT NOT NULL DEFAULT 'provisional',
      provenance_record_id TEXT, provenance_hash TEXT, last_accessed_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS trajectories (
      id TEXT PRIMARY KEY, title TEXT, status TEXT, author_name TEXT, semantic_summary TEXT,
      diff_lines TEXT, created_at TEXT, embedding_blob BLOB, workspace_id TEXT, author_id TEXT);`);
  await db.run('INSERT INTO workspaces(id,organization_id,project_id) VALUES (?,?,?)',
    'workspace-ett-learning', 'org-a', PROJECT);
  await db.run(`INSERT INTO agents(id,workspace_id,status,runtime_pid,is_apoptotic,cognitive_budget)
    VALUES (?,?,?,?,?,?)`, AGENT, 'workspace-ett-learning', 'idle', null, 0, 10);
}

function detectionRequest() {
  return { organizationId: 'org-a', projectId: PROJECT, agentId: AGENT,
    observationId: 'observation-learning', nowMs: NOW,
    policy: { enabled: true, id: 'ett-detection-v1', condition: 'full', cooldownMs: 0,
      maxOpenEpisodes: 1, maxBudget: { tokens: 1000, usd: 0.1, seconds: 60 } },
    assessment: { ref: 'assessment:learning:1', anomaly: 0.95, novelty: 0.8,
      expectedInformationGain: 0.9, learningProgress: 0.7, cost: 0.1,
      risk: 0.05, sampleCount: 1 },
    budget: { tokens: 500, usd: 0.05, seconds: 30 } };
}

async function prepareRun(db, authorityKey) {
  const detected = await detector.detectAndQuestion(db, detectionRequest());
  const episodeId = detected.episode.receipt.payload.episodeId;
  await admission.admitQuestion(db, { organizationId: 'org-a', projectId: PROJECT,
    episodeId, nowMs: NOW + 1000,
    policy: { enabled: true, id: 'ett-admission-v1', condition: 'full', ttlMs: 60000 } });
  const queued = await queue.queueAdmittedThought(db, { organizationId: 'org-a',
    projectId: PROJECT, episodeId, nowMs: NOW + 2000,
    policy: { enabled: true, id: 'ett-queue-v1', priority: 80 } });
  const episode = await thoughtStore.getEpisode(db, { organizationId: 'org-a',
    projectId: PROJECT, episodeId });
  const unsigned = { operation: 'ett-run', projectId: PROJECT, subjectId: episodeId,
    expectedVersion: episode.version, details: { taskId: queued.binding.receipt.payload.taskId,
      policyId: 'ett-run-v1', mode: runner.MODE, grantedBy: 'operator:test' },
    nonce: `ett-learning-run-${episodeId}`,
    expiresAt: new Date(Date.now() + 120000).toISOString() };
  const authorization = { ...signAuthorization(authorityKey, unsigned), grantedBy: 'operator:test' };
  const result = await runner.runQueuedThought(db, { organizationId: 'org-a',
    projectId: PROJECT, episodeId, nowMs: NOW + 3000,
    policy: { enabled: true, id: 'ett-run-v1' }, authorization });
  return { episodeId, runReceipt: result.run.receipt };
}

async function verifyRun(db, subject, keys) {
  const episode = await thoughtStore.getEpisode(db, { organizationId: 'org-a',
    projectId: PROJECT, episodeId: subject.episodeId });
  const publicKey = keys.verifier.publicKey.export({ type: 'spki', format: 'pem' });
  const verification = { verifierId: 'ett-learning-independent-verifier', publicKey,
    verdict: 'supported', oracleRef: 'oracle:ett:learning:1',
    evidenceRefs: [subject.runReceipt.receiptId, 'oracle:ett:learning:1'],
    verifiedAt: new Date(NOW + 4000).toISOString(),
    nonce: `ett-learning-attestation-${subject.episodeId}`, signature: '' };
  const unsigned = { operation: 'ett-verify', projectId: PROJECT,
    subjectId: subject.runReceipt.payload.runId, expectedVersion: episode.version,
    details: { episodeId: subject.episodeId, runRef: subject.runReceipt.receiptId,
      verifierId: verification.verifierId,
      verifierKeyDigest: verificationContract.publicKeyDigest(publicKey),
      policyId: 'ett-verification-v1', oracleRef: verification.oracleRef },
    nonce: `ett-learning-verify-${subject.episodeId}`,
    expiresAt: new Date(Date.now() + 120000).toISOString() };
  const authorization = signAuthorization(keys.authority.privateKey, unsigned);
  const payload = verifier.buildPayload({ projectId: PROJECT, episodeId: subject.episodeId,
    policyId: 'ett-verification-v1', authorizationRef: `shev-authorization:${unsigned.nonce}`,
    runReceipt: subject.runReceipt, verification });
  verification.signature = crypto.sign(null,
    Buffer.from(canonicalJson(verificationContract.attestationMaterial(payload))),
    keys.verifier.privateKey).toString('base64');
  const result = await verifier.verifyRunningThought(db, { organizationId: 'org-a',
    projectId: PROJECT, episodeId: subject.episodeId,
    policy: { enabled: true, id: 'ett-verification-v1' }, authorization, verification });
  return result.verification.receipt;
}

async function learningRequest(db, subject, options = {}) {
  const keys = options.keys;
  const episode = await thoughtStore.getEpisode(db, { organizationId: 'org-a',
    projectId: PROJECT, episodeId: subject.episodeId });
  const verification = subject.verificationReceipt.payload;
  const unsigned = { operation: 'ett-learn', projectId: PROJECT,
    subjectId: verification.verificationId, expectedVersion: episode.version,
    details: { episodeId: subject.episodeId,
      verificationRef: subject.verificationReceipt.receiptId,
      verdict: verification.verdict, policyId: 'ett-learning-v1',
      target: 'ett-episode-belief' },
    nonce: options.nonce || `ett-learning-auth-${subject.episodeId}`,
    expiresAt: new Date(Date.now() + 120000).toISOString() };
  return { organizationId: 'org-a', projectId: PROJECT, episodeId: subject.episodeId,
    nowMs: options.nowMs ?? NOW + 5000,
    policy: { enabled: true, id: 'ett-learning-v1' },
    authorization: signAuthorization(keys.authority.privateKey, unsigned) };
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => error.code === code);
}

async function exercise(db, keys) {
  const authorityPem = keys.authority.publicKey.export({ type: 'spki', format: 'pem' });
  await setup(db, authorityPem);
  const run = await prepareRun(db, keys.authority.privateKey);
  await expectCode(learner.learnVerifiedThought(db, { organizationId: 'org-a',
    projectId: PROJECT, episodeId: run.episodeId, nowMs: NOW + 4000,
    policy: { enabled: true, id: 'ett-learning-v1' }, authorization: {} }),
  'ENDOGENOUS_LEARNING_VERIFICATION_NOT_FOUND');
  const verificationReceipt = await verifyRun(db, run, keys);
  const subject = { ...run, verificationReceipt };
  const request = await learningRequest(db, subject, { keys });
  assert.deepEqual(await learner.learnVerifiedThought(db,
    { ...request, policy: { enabled: false } }), { status: 'skipped', reason: 'disabled' });

  const early = await learningRequest(db, subject,
    { keys, nonce: `ett-learning-early-${subject.episodeId}`, nowMs: NOW + 3999 });
  await expectCode(learner.learnVerifiedThought(db, early),
    'ENDOGENOUS_LEARNING_TIMING_INVALID');
  const invalidSignature = await learningRequest(db, subject,
    { keys, nonce: `ett-learning-invalid-${subject.episodeId}` });
  const signature = Buffer.from(invalidSignature.authorization.signature, 'base64');
  signature[0] ^= 0xff;
  invalidSignature.authorization.signature = signature.toString('base64');
  await assert.rejects(learner.learnVerifiedThought(db, invalidSignature), /signature is invalid/);

  const result = await learner.learnVerifiedThought(db, request);
  const payload = result.learning.receipt.payload;
  assert.equal(result.status, 'reinforce');
  assert.equal(result.episode.receipt.payload.toState, 'LEARNED');
  assert.deepEqual(payload.revision, learningContract.revisionFor('supported'));
  assert.deepEqual(payload.boundaries, learningContract.BOUNDARIES);
  assert.equal(learningContract.readReceipt(result.learning.receipt).valid, true);
  assert.equal(result.learning.receipt.contractVersion, 'v2');
  assert.equal(payload.boundaries.productionMemoryMutated, false);
  const legacyPayload = structuredClone(payload);
  legacyPayload.boundaries.productionMemoryMutated = true;
  const legacyId = crypto.createHash('sha256')
    .update(canonicalJson(`EndogenousThoughtLearning:${canonicalJson(legacyPayload)}`)).digest('hex');
  const legacyReceipt = { ...result.learning.receipt,
    schema: 'genos.EndogenousThoughtLearning.receipt/v1', contractVersion: 'v1',
    receiptId: `rcpt_${legacyId.slice(0, 24)}`, sourceRefs: [...legacyPayload.evidenceRefs],
    issuedAt: legacyPayload.learnedAt, payload: legacyPayload };
  assert.equal(learningContract.readReceipt(legacyReceipt).valid, true);
  assert.equal(result.searchImpact.modified, true, JSON.stringify(result.memory));
  assert.equal(result.searchImpact.durable, true);
  const memoryRow = await db.get('SELECT content FROM genome_decisions WHERE id=?', result.memoryId);
  const beliefDocument = JSON.parse(memoryRow.content);
  assert.equal(beliefDocument.schema, 'genos.EndogenousVerifiedBelief/v1');
  assert.equal(beliefDocument.claim.hypothesis.includes('reproductible'), true);
  assert.equal(beliefDocument.verification.verificationRef, payload.verificationRef);
  assert.deepEqual(beliefDocument.verification.evidenceRefs, payload.evidenceRefs);
  const recalled = await vectorMemory.searchMemory(beliefDocument.claim.hypothesis,
    { organizationId: 'org-a', projectId: PROJECT, limit: 10 }, db);
  assert.equal(recalled.allScoredExperiences.some((item) => item.id === result.memoryId), true);
  for (const verdict of ['refuted', 'inconclusive']) {
    const variant = structuredClone(payload);
    variant.verdict = verdict;
    variant.revision = learningContract.revisionFor(verdict);
    assert.equal(learningContract.validatePayload(variant).valid, true);
  }
  assert.equal(learningContract.revisionFor('inconclusive').applied, false);

  const replay = await learner.learnVerifiedThought(db, request);
  assert.equal(replay.learning.replayed, true);
  assert.equal(replay.episode.replayed, true);
  assert.equal(replay.learning.receipt.receiptId, result.learning.receipt.receiptId);
  const originalStore = vectorMemory.storeMemory;
  vectorMemory.storeMemory = async () => null;
  try {
    const failedMemory = await learner.learnVerifiedThought(db, request);
    assert.equal(failedMemory.memoryId, null);
    assert.equal(failedMemory.memory.productionMemoryMutated, false);
    assert.equal(failedMemory.memory.errorCode, 'ENDOGENOUS_MEMORY_NOT_PERSISTED');
    assert.deepEqual(failedMemory.searchImpact, { modified: false, durable: false });
  } finally { vectorMemory.storeMemory = originalStore; }
  await expectCode(learner.learnVerifiedThought(db, { ...request, organizationId: 'org-b' }),
    'ENDOGENOUS_EPISODE_NOT_FOUND');
  await assert.rejects(db.run(`UPDATE endogenous_thought_learnings SET verdict='supported'
    WHERE episode_id=?`, subject.episodeId), /immutable/);
  return { request, receiptId: result.learning.receipt.receiptId };
}

async function main() {
  const filename = path.join(os.tmpdir(), `ett-learning-${crypto.randomUUID()}.sqlite`);
  const keys = { authority: crypto.generateKeyPairSync('ed25519'),
    verifier: crypto.generateKeyPairSync('ed25519') };
  let db = await fixture.memoryDb(filename);
  let state;
  try {
    state = await exercise(db, keys);
    await db.close();
    db = await fixture.memoryDb(filename);
    const replay = await learner.learnVerifiedThought(db, state.request);
    assert.equal(replay.learning.receipt.receiptId, state.receiptId);
    assert.equal(replay.learning.replayed, true);
  } finally {
    await db.close().catch(() => {});
    fs.rmSync(filename, { force: true });
  }
}

main().then(() => console.log('Bounded endogenous learning tests passed.'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
