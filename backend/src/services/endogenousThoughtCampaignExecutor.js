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
const loop = require('../services/endogenousThoughtLoopService');
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
  const dimension = scenarioClass === 'out_of_mandate' ? 'foreign-tenant' : 'prediction';
  await recordObservation(db, { id: observationId, projectId, domain: 'runtime', dimension,
    kind: scenarioClass === 'no_anomaly' ? 'state' : 'degradation',
    epistemicStatus: 'observed', source: 'campaign',
    observedAt: new Date(NOW - 1000).toISOString(),
    validUntil: new Date(NOW + 120000).toISOString(),
    summary: ctx.publicSummary || 'Signal', evidenceRefs: ctx.evidenceRefs || ['evidence:campaign'] });
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

function minimumScore(condition) {
  return condition === 'curiosity_ablated' ? 0.75 : 0.1;
}

function usefulDevelopmentResult(verdict, learned) {
  return learned && ['supported', 'refuted'].includes(verdict) ? 1 : 0;
}

function syntheticOutcome(ctx, values = {}) {
  return {
    success: true,
    episodes: 0,
    budgetViolations: 0,
    duplicates: 0,
    condition: ctx.condition,
    caseId: ctx.caseId,
    problemId: ctx.caseInput?.problem?.problemId || null,
    developmentUtility: 0,
    ...values,
    verifiedDiscoveries: 0,
    normalizedCost: 0,
    measurementStatus: 'synthetic_control_only',
    scientificEvidence: false
  };
}

function plannedControlOutcome(ctx, detection) {
  return syntheticOutcome(ctx, {
    stage: 'planned_control', decisionReason: detection.reason,
    plannedControl: { planId: 'ett-planned-abstention-v1',
      action: 'bounded_abstention', executed: true },
    syntheticVerdict: syntheticVerdictFor(ctx.scenarioClass)
  });
}

function rejectedDetectionOutcome(ctx, detection) {
  if (ctx.condition === 'planned_control') return plannedControlOutcome(ctx, detection);
  return syntheticOutcome(ctx, { stage: 'detection',
    decisionReason: detection?.reason || 'no-candidate',
    ablationEffect: ctx.condition === 'full' ? null : ctx.condition });
}

async function tryContinue(ctx) {
  if (!canContinue(ctx.condition)) return false;
  const { db, projectId, keys, episodeId, condition, scenarioClass } = ctx;
  try {
    const authorize = ({ stage, ...material }) => signAuthorization(keys.authority.privateKey, {
      ...material, nonce: `${stage}-${episodeId}-${material.expectedVersion}`,
      expiresAt: new Date(Date.now() + 120000).toISOString()
    });
    const verify = async (input) => {
      const publicKey = keys.verifier.publicKey.export({ type: 'spki', format: 'pem' });
      const independent = ctx.modelAdapter
        ? ctx.modelAdapter.verify(input.runReceipt.payload.proposal,
          input.runReceipt.payload.evidenceRefs) : null;
      const verdict = independent?.verdict || syntheticVerdictFor(scenarioClass);
      const oracleEvidence = independent ? `oracle-sha256:${independent.oracleDigest}` : `oracle:${scenarioClass}`;
      const verification = { verifierId: 'ett-campaign-verifier', publicKey,
        verdict, oracleRef: oracleEvidence,
        evidenceRefs: [input.runReceipt.receiptId, oracleEvidence],
        verifiedAt: new Date(Date.parse(input.runReceipt.payload.completedAt) + 1).toISOString(),
        nonce: `att-${episodeId}-${input.expectedVersion}`, signature: '' };
      const material = { operation: 'ett-verify', projectId,
        subjectId: input.runReceipt.payload.runId, expectedVersion: input.expectedVersion,
        details: { episodeId, runRef: input.runReceipt.receiptId,
          verifierId: verification.verifierId,
          verifierKeyDigest: input.verificationContract.publicKeyDigest(publicKey),
          policyId: input.policy.id, oracleRef: verification.oracleRef } };
      const authorization = await authorize({ stage: 'verify', ...material });
      const payload = input.buildPayload({ projectId, episodeId, policyId: input.policy.id,
        runReceipt: input.runReceipt, verification,
        authorizationRef: `shev-authorization:${authorization.nonce}` });
      verification.signature = crypto.sign(null,
        Buffer.from(canonicalJson(input.verificationContract.attestationMaterial(payload))),
        keys.verifier.privateKey).toString('base64');
      return { authorization, verification };
    };
    const result = await loop.runAutonomousLoop(db, { organizationId: 'org-a', projectId,
      episodeId, condition, maxCycles: 1, nowMs: NOW + 6000, authorize, verify,
      ...(ctx.modelAdapter ? { worker: ctx.modelAdapter.worker,
        sandbox: ctx.modelAdapter.sandbox, usageMeter: ctx.modelAdapter.usageMeter } : {}),
      questionGenerator: ctx.modelAdapter?.questionGenerator || (({ previousQuestion }) => ({
        text: `Quel test de suivi réfute ${previousQuestion.hypothesis} ?`,
        hypothesis: previousQuestion.hypothesis, falsifier: previousQuestion.falsifier,
        method: previousQuestion.method })) });
    return result.cycles.length === 1 && result.episode.currentState === 'STOPPED';
  } catch (error) {
    ctx.continuationError = error.code || error.message;
    return false;
  }
}

async function learnVerified(ctx) {
  if (!canLearn(ctx.condition)) return false;
  const { db, projectId, episodeId, verificationReceipt, verdict, keys, condition } = ctx;
  const episode = await thoughtStore.getEpisode(db, { organizationId: 'org-a',
    projectId, episodeId });
  const unsigned = { operation: 'ett-learn', projectId,
    subjectId: verificationReceipt.payload.verificationId, expectedVersion: episode.version,
    details: { episodeId, verificationRef: verificationReceipt.receiptId,
      verdict, policyId: 'ett-learning-v1', target: 'ett-episode-belief' },
    nonce: `learn-${episodeId}`, expiresAt: new Date(Date.now() + 120000).toISOString() };
  const authorization = signAuthorization(keys.authority.privateKey, unsigned);
  const result = await learner.learnVerifiedThought(db, { organizationId: 'org-a', projectId,
    episodeId, nowMs: NOW + 5000,
    policy: { enabled: true, id: 'ett-learning-v1', condition }, authorization });
  ctx.learningReceiptId = result?.learning?.receipt?.receiptId || null;
  ctx.learningId = result?.learning?.receipt?.payload?.learningId || null;
  return true;
}

async function continueLearnedThought(ctx, learned) {
  if (!learned) return false;
  return tryContinue(ctx);
}

async function runChain(ctx) {
  const { db, projectId, agentId, keys, scenarioClass, condition, caseId } = ctx;
  const observationId = await setup(ctx);
  const assessment = assessmentFor(scenarioClass);

  const detection = await detector.detectAndQuestion(db, require('./endogenousThoughtCampaignExecutorValues1.js').runChainValue1({ NOW, agentId, assessment, condition, get ctx() { return ctx; }, minimumScore, observationId, projectId }));

  if (!detection?.episode) return rejectedDetectionOutcome(ctx, detection);

  const episodeId = detection.episode.receipt.payload.episodeId;
  ctx.episodeId = episodeId;
  ctx.questionRef = detection.question?.receipt?.receiptId || null;
  const admissionCondition = condition === 'agow_arbitration_ablated' ? condition : 'full';
  const admissionResult = await admission.admitQuestion(db, { organizationId: 'org-a', projectId, episodeId, nowMs: NOW + 1000, policy: { enabled: true, id: 'ett-admission-v1', condition: admissionCondition, ttlMs: 60000 } });
  if (admissionResult.status !== 'admitted') {
    return syntheticOutcome(ctx, { episodes: 1, stage: 'admission',
      decisionReason: admissionResult.decision.receipt.payload.reason,
      terminalState: 'ABSTAINED', ablationEffect: condition });
  }
  const queued = await queue.queueAdmittedThought(db, { organizationId: 'org-a', projectId, episodeId, nowMs: NOW + 2000, policy: { enabled: true, id: 'ett-queue-v1', priority: 80 } });
  const episode = await thoughtStore.getEpisode(db, { organizationId: 'org-a', projectId, episodeId });

  const unsignedRun = { operation: 'ett-run', projectId, subjectId: episodeId, expectedVersion: episode.version, details: { taskId: queued.binding.receipt.payload.taskId, policyId: 'ett-run-v1', mode: runner.MODE, grantedBy: 'operator:campaign' }, nonce: `run-${episodeId}`, expiresAt: new Date(Date.now() + 120000).toISOString() };
  const authorizationRun = { ...signAuthorization(keys.authority.privateKey, unsignedRun), grantedBy: 'operator:campaign' };
  const runResult = await runner.runQueuedThought(db, { organizationId: 'org-a', projectId,
    episodeId, nowMs: NOW + 3000, policy: { enabled: true, id: 'ett-run-v1' },
    authorization: authorizationRun,
    ...(ctx.modelAdapter ? { worker: ctx.modelAdapter.worker,
      sandbox: ctx.modelAdapter.sandbox, usageMeter: ctx.modelAdapter.usageMeter } : {}) });
  const runReceipt = runResult.run.receipt;
  ctx.runReceiptRef = runReceipt.receiptId;

  const verifyEpisode = await thoughtStore.getEpisode(db, { organizationId: 'org-a', projectId, episodeId });
  const independent = ctx.modelAdapter
    ? ctx.modelAdapter.verify(runReceipt.payload.proposal, runReceipt.payload.evidenceRefs) : null;
  const v = independent?.verdict || syntheticVerdictFor(scenarioClass);
  ctx.independentVerification = independent;
  const publicKey = keys.verifier.publicKey.export({ type: 'spki', format: 'pem' });
  const oracleEvidence = independent ? `oracle-sha256:${independent.oracleDigest}` : `oracle:${scenarioClass}`;
  const verification = { verifierId: 'ett-campaign-verifier', publicKey, verdict: v,
    oracleRef: oracleEvidence, evidenceRefs: [runReceipt.receiptId, oracleEvidence],
    verifiedAt: new Date(NOW + 4000).toISOString(), nonce: `att-${episodeId}`, signature: '' };
  const unsignedVerify = { operation: 'ett-verify', projectId, subjectId: runReceipt.payload.runId, expectedVersion: verifyEpisode.version, details: { episodeId, runRef: runReceipt.receiptId, verifierId: verification.verifierId, verifierKeyDigest: verificationContract.publicKeyDigest(publicKey), policyId: 'ett-verification-v1', oracleRef: verification.oracleRef }, nonce: `verify-${episodeId}`, expiresAt: new Date(Date.now() + 120000).toISOString() };
  const authorizationVerify = signAuthorization(keys.authority.privateKey, unsignedVerify);
  const payload = verifier.buildPayload({ projectId, episodeId, policyId: 'ett-verification-v1', authorizationRef: `shev-authorization:${unsignedVerify.nonce}`, runReceipt, verification });
  verification.signature = crypto.sign(null, Buffer.from(canonicalJson(verificationContract.attestationMaterial(payload))), keys.verifier.privateKey).toString('base64');
  const verifyResult = await verifier.verifyRunningThought(db, { organizationId: 'org-a', projectId, episodeId, policy: { enabled: true, id: 'ett-verification-v1' }, authorization: authorizationVerify, verification });
  const verificationReceipt = verifyResult.verification.receipt;
  ctx.verificationReceiptRef = verificationReceipt.receiptId;

  ctx.verificationReceipt = verificationReceipt;
  ctx.verdict = v;
  const learned = await learnVerified(ctx);

  const continued = await continueLearnedThought(ctx, learned);

  const finalEpisode = await thoughtStore.getEpisode(db, { organizationId: 'org-a',
    projectId, episodeId });
  const failed = Boolean(ctx.continuationError);

  if (ctx.modelAdapter) return modelOutcome(ctx, require('./endogenousThoughtCampaignExecutorValues1.js').runChainValue2({ continued, get ctx() { return ctx; }, failed, finalEpisode, learned, v }));

  return syntheticOutcome(ctx, require('./endogenousThoughtCampaignExecutorValues1.js').runChainValue4({ continued, get ctx() { return ctx; }, failed, finalEpisode, learned, usefulDevelopmentResult, v }));
}

function modelOutcome(ctx, values) {
  const usage = ctx.modelAdapter.usageSummary();
  const budget = { tokens: 12000, seconds: 1800 };
  const normalizedCost = (usage.tokens / budget.tokens + usage.seconds / budget.seconds) / 2;
  return { ...values, condition: ctx.condition, caseId: ctx.caseId,
    scientificEvidence: usage.measured && Boolean(ctx.independentVerification),
    measurementStatus: 'ollama_provider_token_counters_and_host_time',
    provider: ctx.modelAdapter.model, providerCalls: usage.calls,
    providerCallDetails: usage.callDetails,
    measuredTokens: usage.tokens, measuredHostSeconds: usage.seconds,
    measuredCostUsd: 0, verifiedDiscoveries: values.verified ? 1 : 0,
    normalizedCost, developmentUtility: values.verified ? 1 : 0,
    modelOutputIsEvidence: false,
    submittedAnswerId: ctx.independentVerification?.submittedAnswerId || null,
    oracleVerdict: ctx.independentVerification?.verdict || null,
    oracleDigest: ctx.independentVerification?.oracleDigest || null,
    ettTrace: require('./endogenousThoughtCampaignExecutorValues1.js').modelOutcomeValue5({ get ctx() { return ctx; } }) };
}

async function execute(input) {
  const { condition, caseId, input: caseInput } = input || {};
  const seed = caseInput?.seed;
  const scenarioClass = caseInput?.scenarioClass;
  const projectId = `ett-campaign-${seed}-${scenarioClass}-${condition}`.replace(/[^a-zA-Z0-9-]/g, '');
  const agentId = `agent-${seed}-${scenarioClass}`;
  const keys = { authority: crypto.generateKeyPairSync('ed25519'), verifier: crypto.generateKeyPairSync('ed25519') };
  const filename = path.join(os.tmpdir(), `ett-campaign-${crypto.randomUUID()}.sqlite`);
  const modelAdapter = input?.runtimeAdapter || null;
  let db;
  try {
    db = await fixture.memoryDb(filename);
    const ctx = require('./endogenousThoughtCampaignExecutorValues1.js').executeValue6({ JSON, agentId, caseId, caseInput, condition, get db() { return db; }, keys, modelAdapter, projectId, scenarioClass });
    const result = await runChain(ctx);
    return result;
  } catch (error) {
    if (modelAdapter) return modelOutcome({ condition, caseId, modelAdapter }, {
      success: false, verified: false,
      failure: { stage: 'execution', code: error.code || 'ETT_MODEL_EXECUTION_FAILED',
        message: String(error.message).slice(0, 200) }
    });
    return syntheticOutcome({ condition, caseId, caseInput }, {
      success: false,
      error: String(error.message).slice(0, 200),
      failure: require('./endogenousThoughtCampaignExecutorValues1.js').executeValue3({ String, error })
    });
  } finally {
    try { if (db) await db.close(); } catch (_) {}
    try { fs.rmSync(filename, { force: true }); } catch (_) {}
  }
}

module.exports = { execute };
