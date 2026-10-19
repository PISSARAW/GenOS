'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const fixture = require('../../tests/ontogenesisFixture');
const projectStore = require('../services/ontogenesis/projectStore');
const { registerResponsibility } = require('../services/shev/responsibilityService');
const { recordObservation } = require('../services/shev/observationService');
const { authorizationPayload } = require('../services/shev/authorityService');
const { canonicalJson } = require('../services/aTeam/variants/variantExecutionHelpers');
const detector = require('../services/endogenousThoughtDetectionService');
const admission = require('../services/endogenousThoughtAdmissionService');
const queue = require('../services/endogenousThoughtQueueService');
const runner = require('../services/endogenousThoughtRunnerService');
const verifier = require('../services/endogenousThoughtVerificationService');
const verificationContract = require('../services/endogenousThoughtVerificationContractService');
const learner = require('../services/endogenousThoughtLearningService');
const continuation = require('../services/endogenousThoughtContinuationService');
const thoughtStore = require('../services/endogenousThoughtStoreService');

const NOW = Date.now();

function signAuthorization(privateKey, input) {
  const signature = crypto.sign(null, Buffer.from(JSON.stringify(authorizationPayload(input))), privateKey).toString('base64');
  return { ...input, signature };
}

function syntheticVerdictFor(scenarioClass) {
  if (scenarioClass === 'learnable_anomaly') return 'supported';
  if (scenarioClass === 'false_lead') return 'refuted';
  return 'inconclusive';
}

function assessmentFor(scenarioClass) {
  if (scenarioClass === 'unlearnable_noise') {
    return { ref: 'assessment:noise', anomaly: 0.9, novelty: 0.1, expectedInformationGain: 0.9, learningProgress: 0.005, cost: 0.1, risk: 0.05, sampleCount: 5 };
  }
  if (scenarioClass === 'no_anomaly') {
    return { ref: 'assessment:none', anomaly: 0.1, novelty: 0.1, expectedInformationGain: 0.1, learningProgress: 0.5, cost: 0.1, risk: 0.05, sampleCount: 1 };
  }
  return { ref: 'assessment:default', anomaly: 0.95, novelty: 0.8, expectedInformationGain: 0.9, learningProgress: 0.7, cost: 0.1, risk: 0.05, sampleCount: 1 };
}

async function setup(ctx) {
  const { db, projectId, agentId, keys, scenarioClass } = ctx;
  const config = fixture.testConfig();
  await projectStore.createProject(db, { id: projectId, rootPath: 'C:/ett-campaign', branch: 'codex/ett-campaign', objective: 'ETT campaign', config });
  const mandate = { purpose: 'Campagne ETT', autoDiagnose: false, autoInstrument: false, dimensions: [{ name: 'prediction', expected: 'La prédiction converge', acceptance: ['Une observation indépendante mesure l’écart.'] }] };
  await registerResponsibility(db, { projectId, authorityRef: 'delegation:ett-campaign', authorityPublicKey: keys.authority.publicKey.export({ type: 'spki', format: 'pem' }), mandate });
  const observationId = `observation-${scenarioClass}`;
  if (scenarioClass !== 'out_of_mandate') {
    await recordObservation(db, { id: observationId, projectId, domain: 'runtime', dimension: 'prediction', kind: scenarioClass === 'no_anomaly' ? 'state' : 'degradation', epistemicStatus: 'observed', source: 'campaign', observedAt: new Date(NOW - 1000).toISOString(), validUntil: new Date(NOW + 120000).toISOString(), summary: 'Signal', evidenceRefs: ['evidence:campaign'] });
  }
  await db.exec(`CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, project_id TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, status TEXT, runtime_pid INTEGER, is_apoptotic INTEGER NOT NULL DEFAULT 0, cognitive_budget REAL NOT NULL DEFAULT 1);`);
  await db.run('INSERT INTO workspaces(id,organization_id,project_id) VALUES (?,?,?)', `workspace-${projectId}`, 'org-a', projectId);
  await db.run(`INSERT INTO agents(id,workspace_id,status,runtime_pid,is_apoptotic,cognitive_budget) VALUES (?,?,?,?,?,?)`, agentId, `workspace-${projectId}`, 'idle', null, 0, 10);
  return observationId;
}

function canLearn(condition) {
  return condition !== 'metacognition_ablated';
}

function canContinue(condition) {
  return condition !== 'memory_ablated';
}

function syntheticOutcome(ctx, values = {}) {
  return {
    success: true,
    episodes: 0,
    budgetViolations: 0,
    duplicates: 0,
    condition: ctx.condition,
    caseId: ctx.caseId,
    ...values,
    verifiedDiscoveries: 0,
    normalizedCost: 0,
    measurementStatus: 'synthetic_control_only',
    scientificEvidence: false
  };
}

async function tryContinue(ctx) {
  if (!canContinue(ctx.condition)) return false;
  const { db, projectId, keys, episodeId, condition } = ctx;
  try {
    const learnEpisode2 = await thoughtStore.getEpisode(db, { organizationId: 'org-a', projectId, episodeId });
    const unsignedContinue = { operation: 'ett-continue', projectId, subjectId: ctx.learningId || episodeId, expectedVersion: learnEpisode2.version, details: { episodeId, learningRef: ctx.learningReceiptId, policyId: 'ett-continuation-v1', target: 'ett-continuation' }, nonce: `continue-${episodeId}`, expiresAt: new Date(Date.now() + 120000).toISOString() };
    const authorizationContinue = signAuthorization(keys.authority.privateKey, unsignedContinue);
    await continuation.continueLearnedThought(db, { organizationId: 'org-a', projectId, episodeId, nowMs: NOW + 6000, policy: { enabled: true, id: 'ett-continuation-v1', condition }, authorization: authorizationContinue });
    return true;
  } catch (_) {
    return false;
  }
}

async function runChain(ctx) {
  const { db, projectId, agentId, keys, scenarioClass, condition, caseId } = ctx;
  const observationId = await setup(ctx);
  const assessment = assessmentFor(scenarioClass);

  if (scenarioClass === 'out_of_mandate') {
    return syntheticOutcome(ctx);
  }

  const detection = await detector.detectAndQuestion(db, {
    organizationId: 'org-a', projectId, agentId, observationId, nowMs: NOW,
    policy: { enabled: true, id: 'ett-detection-v1', condition, cooldownMs: 0, maxOpenEpisodes: 1, maxBudget: { tokens: 1000, usd: 0.1, seconds: 60 }, minScore: 0.1, minInformationGain: 0.1, minLearningProgress: 0.01 },
    assessment,
    budget: { tokens: 500, usd: 0.05, seconds: 30 }
  });

  if (!detection || !detection.episode) {
    return syntheticOutcome(ctx);
  }

  const episodeId = detection.episode.receipt.payload.episodeId;
  ctx.episodeId = episodeId;
  const admissionCondition = condition === 'agow_arbitration_ablated' ? condition : 'full';
  const admissionResult = await admission.admitQuestion(db, { organizationId: 'org-a', projectId, episodeId, nowMs: NOW + 1000, policy: { enabled: true, id: 'ett-admission-v1', condition: admissionCondition, ttlMs: 60000 } });
  if (admissionResult.status !== 'admitted') {
    return syntheticOutcome(ctx);
  }
  const queued = await queue.queueAdmittedThought(db, { organizationId: 'org-a', projectId, episodeId, nowMs: NOW + 2000, policy: { enabled: true, id: 'ett-queue-v1', priority: 80 } });
  const episode = await thoughtStore.getEpisode(db, { organizationId: 'org-a', projectId, episodeId });

  const unsignedRun = { operation: 'ett-run', projectId, subjectId: episodeId, expectedVersion: episode.version, details: { taskId: queued.binding.receipt.payload.taskId, policyId: 'ett-run-v1', mode: runner.MODE, grantedBy: 'operator:campaign' }, nonce: `run-${episodeId}`, expiresAt: new Date(Date.now() + 120000).toISOString() };
  const authorizationRun = { ...signAuthorization(keys.authority.privateKey, unsignedRun), grantedBy: 'operator:campaign' };
  const runResult = await runner.runQueuedThought(db, { organizationId: 'org-a', projectId, episodeId, nowMs: NOW + 3000, policy: { enabled: true, id: 'ett-run-v1' }, authorization: authorizationRun });
  const runReceipt = runResult.run.receipt;

  const verifyEpisode = await thoughtStore.getEpisode(db, { organizationId: 'org-a', projectId, episodeId });
  const v = syntheticVerdictFor(scenarioClass);
  const publicKey = keys.verifier.publicKey.export({ type: 'spki', format: 'pem' });
  const verification = { verifierId: 'ett-campaign-verifier', publicKey, verdict: v, oracleRef: `oracle:${scenarioClass}`, evidenceRefs: [runReceipt.receiptId, `oracle:${scenarioClass}`], verifiedAt: new Date(NOW + 4000).toISOString(), nonce: `att-${episodeId}`, signature: '' };
  const unsignedVerify = { operation: 'ett-verify', projectId, subjectId: runReceipt.payload.runId, expectedVersion: verifyEpisode.version, details: { episodeId, runRef: runReceipt.receiptId, verifierId: verification.verifierId, verifierKeyDigest: verificationContract.publicKeyDigest(publicKey), policyId: 'ett-verification-v1', oracleRef: verification.oracleRef }, nonce: `verify-${episodeId}`, expiresAt: new Date(Date.now() + 120000).toISOString() };
  const authorizationVerify = signAuthorization(keys.authority.privateKey, unsignedVerify);
  const payload = verifier.buildPayload({ projectId, episodeId, policyId: 'ett-verification-v1', authorizationRef: `shev-authorization:${unsignedVerify.nonce}`, runReceipt, verification });
  verification.signature = crypto.sign(null, Buffer.from(canonicalJson(verificationContract.attestationMaterial(payload))), keys.verifier.privateKey).toString('base64');
  const verifyResult = await verifier.verifyRunningThought(db, { organizationId: 'org-a', projectId, episodeId, policy: { enabled: true, id: 'ett-verification-v1' }, authorization: authorizationVerify, verification });
  const verificationReceipt = verifyResult.verification.receipt;

  let learned = false;
  if (canLearn(condition)) {
    const learnEpisode = await thoughtStore.getEpisode(db, { organizationId: 'org-a', projectId, episodeId });
    const unsignedLearn = { operation: 'ett-learn', projectId, subjectId: verificationReceipt.payload.verificationId, expectedVersion: learnEpisode.version, details: { episodeId, verificationRef: verificationReceipt.receiptId, verdict: v, policyId: 'ett-learning-v1', target: 'ett-episode-belief' }, nonce: `learn-${episodeId}`, expiresAt: new Date(Date.now() + 120000).toISOString() };
    const authorizationLearn = signAuthorization(keys.authority.privateKey, unsignedLearn);
    const learnResult = await learner.learnVerifiedThought(db, { organizationId: 'org-a', projectId, episodeId, nowMs: NOW + 5000, policy: { enabled: true, id: 'ett-learning-v1', condition }, authorization: authorizationLearn });
    learned = true;
    ctx.learningReceiptId = learnResult?.learning?.receipt?.receiptId || null;
    ctx.learningId = learnResult?.learning?.receipt?.payload?.learningId || null;
  }

  let continued = false;
  if (learned) {
    continued = await tryContinue(ctx);
  }

  return syntheticOutcome(ctx, {
    episodes: 1,
    syntheticVerdict: v,
    learned,
    continued
  });
}

async function execute(input) {
  const { condition, caseId, input: caseInput } = input || {};
  const seed = caseInput?.seed;
  const scenarioClass = caseInput?.scenarioClass;
  const projectId = `ett-campaign-${seed}-${scenarioClass}-${condition}`.replace(/[^a-zA-Z0-9-]/g, '');
  const agentId = `agent-${seed}-${scenarioClass}`;
  const keys = { authority: crypto.generateKeyPairSync('ed25519'), verifier: crypto.generateKeyPairSync('ed25519') };
  const filename = path.join(os.tmpdir(), `ett-campaign-${crypto.randomUUID()}.sqlite`);
  let db;
  try {
    db = await fixture.memoryDb(filename);
    const ctx = { db, projectId, agentId, keys, scenarioClass, condition, caseId };
    const result = await runChain(ctx);
    return result;
  } catch (error) {
    return syntheticOutcome({ condition, caseId }, {
      success: false,
      error: String(error.message).slice(0, 200)
    });
  } finally {
    try { if (db) await db.close(); } catch (_) {}
    try { fs.rmSync(filename, { force: true }); } catch (_) {}
  }
}

module.exports = { execute };
