'use strict';

const crypto = require('node:crypto');
const { withTransaction } = require('../db');
const { canonicalJson } = require('./aTeam/variants/variantExecutionHelpers');
const runContract = require('./endogenousThoughtRunContractService');
const verificationContract = require('./endogenousThoughtVerificationContractService');
const thoughtStore = require('./endogenousThoughtStoreService');
const { consumeAuthorization } = require('./shev/authorityService');
const { getResponsibility } = require('./shev/responsibilityService');
const runMigration = require('../db/migrations/migrateEndogenousThoughtRuns');
const verificationMigration = require('../db/migrations/migrateEndogenousThoughtVerifications');

function coded(code, message) {
  return Object.assign(new Error(message), { code });
}

function required(value, code) {
  if (typeof value !== 'string' || !value.trim()) throw coded(code, 'A non-empty value is required.');
  return value.trim();
}

function digest(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function scopedId(prefix, material) {
  return `${prefix}_${digest(material).slice(0, 24)}`;
}

function normalizeInput(input) {
  return { organizationId: required(input?.organizationId, 'ENDOGENOUS_ORGANIZATION_REQUIRED'),
    projectId: required(input?.projectId, 'ENDOGENOUS_PROJECT_REQUIRED'),
    episodeId: required(input?.episodeId, 'ENDOGENOUS_EPISODE_REQUIRED'),
    policyId: required(input?.policy?.id, 'ENDOGENOUS_VERIFICATION_POLICY_REQUIRED'),
    authorization: input.authorization, verification: input.verification };
}

function parseReceipt(row, contract) {
  let receipt;
  try { receipt = JSON.parse(row.receipt_json); } catch (_) {
    throw coded('ENDOGENOUS_VERIFICATION_INTEGRITY_FAILED', 'Stored receipt is not valid JSON.');
  }
  const validation = contract.readReceipt(receipt);
  if (row.content_hash !== digest(receipt) || !validation.valid) {
    throw coded('ENDOGENOUS_VERIFICATION_INTEGRITY_FAILED', 'Stored receipt integrity failed.');
  }
  return receipt;
}

function runRowMatches(row, receipt) {
  const payload = receipt.payload;
  return [payload.runId === row.run_id, payload.episodeId === row.episode_id,
    payload.taskId === row.task_id, receipt.receiptId === row.receipt_id,
    payload.status === row.status, payload.completedAt === row.completed_at].every(Boolean);
}

async function loadRun(db, input) {
  const row = await db.get(`SELECT * FROM endogenous_thought_runs
    WHERE organization_id=? AND project_id=? AND run_id=?`,
  input.organizationId, input.projectId, input.runRef);
  if (!row) throw coded('ENDOGENOUS_VERIFICATION_RUN_NOT_FOUND', 'Unverified run was not found.');
  const receipt = parseReceipt(row, runContract);
  if (!runRowMatches(row, receipt)) {
    throw coded('ENDOGENOUS_VERIFICATION_INTEGRITY_FAILED', 'Run row does not match its receipt.');
  }
  return { row, receipt };
}

function transitionVersion(receipts, state) {
  const entry = receipts.findLast((item) => item.receipt.payload.toState === state);
  if (!entry) throw coded('ENDOGENOUS_VERIFICATION_STATE_CONFLICT', `Episode has no ${state} transition.`);
  return entry.sequence + 1;
}

function authorizationReference(authorization) {
  return `shev-authorization:${required(authorization?.nonce,
    'ENDOGENOUS_VERIFICATION_AUTHORIZATION_REQUIRED')}`;
}

function expectedAuthorization(input, context) {
  const verification = input.verification;
  return { operation: 'ett-verify', projectId: input.projectId,
    subjectId: context.run.receipt.payload.runId, expectedVersion: context.runningVersion,
    details: { episodeId: input.episodeId, runRef: context.run.receipt.receiptId,
      verifierId: verification?.verifierId,
      verifierKeyDigest: verificationContract.publicKeyDigest(verification?.publicKey),
      policyId: input.policyId, oracleRef: verification?.oracleRef },
    nonce: input.authorization?.nonce, expiresAt: input.authorization?.expiresAt,
    signature: input.authorization?.signature };
}

function assertAuthorization(input, expected) {
  const supplied = input.authorization;
  const matches = supplied && supplied.operation === expected.operation
    && supplied.projectId === expected.projectId && supplied.subjectId === expected.subjectId
    && supplied.expectedVersion === expected.expectedVersion
    && canonicalJson(supplied.details) === canonicalJson(expected.details);
  if (!matches) {
    throw coded('ENDOGENOUS_VERIFICATION_AUTHORIZATION_INVALID',
      'Verification authorization scope is invalid.');
  }
  return expected;
}

function buildPayload(input) {
  const verification = input.verification;
  const run = input.runReceipt.payload;
  const identity = { projectId: input.projectId, episodeId: input.episodeId,
    runId: run.runId, verifierId: verification.verifierId, policyId: input.policyId };
  return { verificationId: verificationContract.verificationIdFor(identity),
    episodeId: input.episodeId, projectId: input.projectId, runId: run.runId,
    runRef: input.runReceipt.receiptId, taskId: run.taskId,
    proposalRef: run.proposal.proposalId, policyId: input.policyId,
    authorizationRef: input.authorizationRef, verdict: verification.verdict,
    oracleRef: verification.oracleRef,
    verifier: { id: verification.verifierId,
      keyDigest: verificationContract.publicKeyDigest(verification.publicKey),
      publicKey: verification.publicKey },
    attestation: { nonce: verification.nonce, signature: verification.signature },
    evidenceRefs: [...verification.evidenceRefs], boundaries: verificationContract.BOUNDARIES,
    verifiedAt: verification.verifiedAt };
}

function assertTiming(payload, runReceipt, authorization) {
  const verifiedAt = Date.parse(payload.verifiedAt);
  const completedAt = Date.parse(runReceipt.payload.completedAt);
  const expiresAt = Date.parse(authorization.expiresAt);
  if (Number.isNaN(verifiedAt) || verifiedAt < completedAt || verifiedAt > expiresAt) {
    throw coded('ENDOGENOUS_VERIFICATION_TIMING_INVALID',
      'Verification must follow the run and precede authorization expiry.');
  }
}

async function assertIndependent(db, context) {
  const responsibility = await getResponsibility(db, context.input.projectId);
  if (!responsibility?.authorityPublicKey) {
    throw coded('ENDOGENOUS_VERIFICATION_AUTHORITY_MISSING', 'Project authority key is unavailable.');
  }
  const authorityDigest = verificationContract.publicKeyDigest(responsibility.authorityPublicKey);
  const payload = context.payload;
  const identitiesDistinct = payload.verifier.id !== context.episode.agentId
    && payload.verifier.id !== context.run.receipt.payload.authorization.grantedBy;
  if (!identitiesDistinct || payload.verifier.keyDigest === authorityDigest) {
    throw coded('ENDOGENOUS_VERIFIER_NOT_INDEPENDENT', 'Verifier is not independent from producer or authority.');
  }
}

function verificationIdentity(payload, authorization) {
  return { verificationId: payload.verificationId, runId: payload.runId,
    requestHash: digest({ payload, authorization }) };
}

function verificationRowMatches(row, receipt) {
  const payload = receipt.payload;
  return [payload.verificationId === row.verification_id,
    payload.episodeId === row.episode_id, payload.runId === row.run_id,
    payload.taskId === row.task_id, payload.verifier.id === row.verifier_id,
    payload.verifier.keyDigest === row.verifier_key_digest,
    payload.verdict === row.verdict, payload.authorizationRef === row.authorization_ref,
    receipt.receiptId === row.receipt_id, payload.verifiedAt === row.verified_at].every(Boolean);
}

function readVerification(row, requestHash) {
  if (!row) return null;
  if (row.request_hash !== requestHash) {
    throw coded('ENDOGENOUS_VERIFICATION_IDEMPOTENCY_CONFLICT',
      'Run is bound to another verification request.');
  }
  const receipt = parseReceipt(row, verificationContract);
  if (!verificationRowMatches(row, receipt)) {
    throw coded('ENDOGENOUS_VERIFICATION_INTEGRITY_FAILED',
      'Verification row does not match its receipt.');
  }
  return { receipt, replayed: true };
}

async function storedVerification(db, input, identity) {
  const row = await db.get(`SELECT * FROM endogenous_thought_verifications
    WHERE organization_id=? AND project_id=? AND run_id=?`,
  input.organizationId, input.projectId, identity.runId);
  return readVerification(row, identity.requestHash);
}

async function insertVerification(db, context) {
  const payload = context.receipt.payload;
  await db.run(`INSERT INTO endogenous_thought_verifications
    (organization_id,project_id,verification_id,episode_id,run_id,task_id,verifier_id,
     verifier_key_digest,verdict,authorization_ref,request_hash,receipt_id,content_hash,
     receipt_json,verified_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  context.input.organizationId, context.input.projectId, payload.verificationId,
  payload.episodeId, payload.runId, payload.taskId, payload.verifier.id,
  payload.verifier.keyDigest, payload.verdict, payload.authorizationRef,
  context.identity.requestHash, context.receipt.receiptId, digest(context.receipt),
  canonicalJson(context.receipt), payload.verifiedAt);
}

async function assertUnverifiedRuntime(db, payload) {
  const task = await db.get('SELECT * FROM ontogenesis_backlog WHERE id=?', payload.taskId);
  const run = await db.get('SELECT * FROM ontogenesis_runs WHERE id=?', payload.runId);
  const valid = task?.project_id === payload.projectId && task.status === 'verifying'
    && task.attempt === 1 && run?.project_id === payload.projectId
    && run.task_id === payload.taskId && run.status === 'unverified';
  if (!valid) throw coded('ENDOGENOUS_VERIFICATION_RUNTIME_CONFLICT', 'Run is not awaiting verification.');
}

async function persistVerification(db, context) {
  const receipt = verificationContract.createReceipt(context.payload);
  return withTransaction(db, async () => {
    const replay = await storedVerification(db, context.input, context.identity);
    if (replay) return replay;
    await assertUnverifiedRuntime(db, context.payload);
    await consumeAuthorization(db, context.authorization);
    await insertVerification(db, { ...context, receipt });
    const run = await db.run("UPDATE ontogenesis_runs SET status='verified' WHERE id=? AND status='unverified'",
      context.payload.runId);
    const task = await db.run(`UPDATE ontogenesis_backlog SET status='done',
      updated_at=datetime('now') WHERE id=? AND status='verifying'`,
      context.payload.taskId);
    if (run.changes !== 1 || task.changes !== 1) {
      throw coded('ENDOGENOUS_VERIFICATION_RUNTIME_CONFLICT', 'Runtime state changed during verification.');
    }
    return storedVerification(db, context.input, context.identity);
  });
}

async function verifyCompletedRuntime(db, payload) {
  const task = await db.get('SELECT * FROM ontogenesis_backlog WHERE id=?', payload.taskId);
  const run = await db.get('SELECT * FROM ontogenesis_runs WHERE id=?', payload.runId);
  if (task?.status !== 'done' || run?.status !== 'verified') {
    throw coded('ENDOGENOUS_VERIFICATION_RUNTIME_INTEGRITY_FAILED',
      'Verified runtime state is inconsistent.');
  }
  return { task, run };
}

function transitionPayload(context) {
  const payload = context.verification.receipt.payload;
  const head = context.head.receipt.payload;
  return { transitionId: scopedId('ett_transition_verify', payload.verificationId),
    episodeId: context.input.episodeId, agentId: context.episode.agentId,
    projectId: context.input.projectId, mandateRef: context.episode.mandateRef,
    fromState: 'RUNNING', toState: 'VERIFIED', triggerRef: context.episode.triggerRef,
    questionRef: head.questionRef, decisionRef: head.decisionRef,
    taskRef: payload.taskId, jobRef: payload.runId, budget: context.episode.budget,
    evidenceRefs: [...new Set([...head.evidenceRefs, ...payload.evidenceRefs,
      context.verification.receipt.receiptId])], stopReason: null,
    occurredAt: payload.verifiedAt, previousReceiptId: context.episode.currentReceiptId };
}

async function advanceEpisode(db, context) {
  if (context.episode.currentState === 'VERIFIED') {
    if (context.head.receipt.payload.jobRef !== context.verification.receipt.payload.runId) {
      throw coded('ENDOGENOUS_VERIFICATION_STATE_CONFLICT', 'Verified episode references another run.');
    }
    return { receipt: context.head.receipt, replayed: true, sequence: context.head.sequence };
  }
  if (context.episode.currentState !== 'RUNNING') {
    throw coded('ENDOGENOUS_VERIFICATION_STATE_CONFLICT', 'Episode is not awaiting verification.');
  }
  return thoughtStore.transitionEpisode(db, { organizationId: context.input.organizationId,
    projectId: context.input.projectId, payload: transitionPayload(context) });
}

async function verifyRunningThought(db, rawInput) {
  if (rawInput?.policy?.enabled !== true) return { status: 'skipped', reason: 'disabled' };
  const input = normalizeInput(rawInput);
  await thoughtStore.ensure(db);
  await runMigration.migrateEndogenousThoughtRuns(db);
  await verificationMigration.migrateEndogenousThoughtVerifications(db);
  const episode = await thoughtStore.getEpisode(db, input);
  const receipts = await thoughtStore.listReceipts(db, input);
  const head = receipts.at(-1);
  input.runRef = head.receipt.payload.jobRef;
  if (!input.runRef) throw coded('ENDOGENOUS_VERIFICATION_RUN_NOT_FOUND', 'Running episode has no run reference.');
  const run = await loadRun(db, input);
  const authorization = assertAuthorization(input, expectedAuthorization(input,
    { run, runningVersion: transitionVersion(receipts, 'RUNNING') }));
  const payload = buildPayload({ ...input, runReceipt: run.receipt,
    authorizationRef: authorizationReference(authorization) });
  assertTiming(payload, run.receipt, authorization);
  await assertIndependent(db, { input, episode, run, payload });
  const identity = verificationIdentity(payload, authorization);
  let verification = await storedVerification(db, input, identity);
  if (!verification) {
    if (episode.currentState !== 'RUNNING') {
      throw coded('ENDOGENOUS_VERIFICATION_STATE_CONFLICT', 'Episode is not awaiting verification.');
    }
    verification = await persistVerification(db,
      { input, payload, authorization, identity });
    verification.replayed = false;
  }
  const runtime = await verifyCompletedRuntime(db, payload);
  const advanced = await advanceEpisode(db, { input, episode, head, verification });
  return { status: payload.verdict, verification, runtime, episode: advanced };
}

module.exports = { buildPayload, normalizeInput, verifyRunningThought };
