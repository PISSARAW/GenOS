'use strict';

const crypto = require('node:crypto');
const { withTransaction } = require('../db');
const { canonicalJson } = require('./aTeam/variants/variantExecutionHelpers');
const contracts = require('./versionedContractService');
const taskContract = require('./endogenousThoughtTaskContractService');
const runContract = require('./endogenousThoughtRunContractService');
const thoughtStore = require('./endogenousThoughtStoreService');
const { consumeAuthorization } = require('./shev/authorityService');
const taskMigration = require('../db/migrations/migrateEndogenousThoughtTasks');
const runMigration = require('../db/migrations/migrateEndogenousThoughtRuns');

const MODE = 'ett-read-only-simulation';

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
  const nowMs = Number(input?.nowMs ?? Date.now());
  if (!Number.isFinite(nowMs) || nowMs < 0) {
    throw coded('ENDOGENOUS_RUN_TIME_INVALID', 'Run time must be a positive epoch value.');
  }
  return { organizationId: required(input?.organizationId, 'ENDOGENOUS_ORGANIZATION_REQUIRED'),
    projectId: required(input?.projectId, 'ENDOGENOUS_PROJECT_REQUIRED'),
    episodeId: required(input?.episodeId, 'ENDOGENOUS_EPISODE_REQUIRED'),
    policyId: required(input?.policy?.id, 'ENDOGENOUS_RUN_POLICY_REQUIRED'),
    authorization: input.authorization, nowMs };
}

function parseReceipt(row, contract, code) {
  let receipt;
  try { receipt = JSON.parse(row.receipt_json); } catch (_) {
    throw coded(code, 'Stored receipt is not valid JSON.');
  }
  const validation = contract.readReceipt(receipt);
  if (row.content_hash !== digest(receipt) || !validation.valid) {
    throw coded(code, 'Stored receipt integrity validation failed.');
  }
  return receipt;
}

async function loadBinding(db, input) {
  const row = await db.get(`SELECT * FROM endogenous_thought_task_bindings
    WHERE organization_id=? AND project_id=? AND episode_id=?`,
  input.organizationId, input.projectId, input.episodeId);
  if (!row) throw coded('ENDOGENOUS_RUN_BINDING_NOT_FOUND', 'Queued task binding was not found.');
  const receipt = parseReceipt(row, taskContract, 'ENDOGENOUS_RUN_INTEGRITY_FAILED');
  return { row, receipt };
}

async function loadQuestion(db, input, questionRef) {
  const row = await db.get(`SELECT * FROM endogenous_thought_questions
    WHERE organization_id=? AND project_id=? AND receipt_id=?`,
  input.organizationId, input.projectId, questionRef);
  if (!row || row.episode_id !== input.episodeId) {
    throw coded('ENDOGENOUS_RUN_QUESTION_NOT_FOUND', 'Question is not attached to this episode.');
  }
  const receipt = parseReceipt(row, contracts, 'ENDOGENOUS_RUN_INTEGRITY_FAILED');
  if (receipt.contractType !== 'EndogenousQuestion') {
    throw coded('ENDOGENOUS_RUN_INTEGRITY_FAILED', 'Question contract type is invalid.');
  }
  return receipt;
}

function expectedAuthorization(input, context) {
  const grantedBy = required(input.authorization?.grantedBy, 'ENDOGENOUS_RUN_AUTHORITY_REQUIRED');
  return { operation: 'ett-run', projectId: input.projectId, subjectId: input.episodeId,
    expectedVersion: context.queuedVersion,
    details: { taskId: context.binding.receipt.payload.taskId,
      policyId: input.policyId, mode: MODE, grantedBy },
    nonce: input.authorization?.nonce, expiresAt: input.authorization?.expiresAt,
    signature: input.authorization?.signature };
}

function queuedVersion(receipts) {
  const queued = receipts.find((entry) => entry.receipt.payload.toState === 'QUEUED');
  if (!queued) throw coded('ENDOGENOUS_RUN_STATE_CONFLICT', 'Episode has no queued transition.');
  return queued.sequence + 1;
}

function assertAuthorization(input, expected) {
  const supplied = input.authorization;
  if (!supplied || supplied.operation !== expected.operation
    || supplied.projectId !== expected.projectId || supplied.subjectId !== expected.subjectId
    || supplied.expectedVersion !== expected.expectedVersion
    || canonicalJson(supplied.details) !== canonicalJson(expected.details)) {
    throw coded('ENDOGENOUS_RUN_AUTHORIZATION_INVALID', 'Execution authorization scope is invalid.');
  }
  return expected;
}

function runIdentity(input, context) {
  const basis = { organizationId: input.organizationId, projectId: input.projectId,
    episodeId: input.episodeId, taskId: context.binding.receipt.payload.taskId,
    bindingRef: context.binding.receipt.receiptId };
  return { runId: scopedId('ett_run', basis),
    requestHash: digest({ ...basis, policyId: input.policyId,
      authorization: context.authorization }) };
}

function proposalPayload(context) {
  const question = context.question.payload;
  return { proposalId: scopedId('ett_proposal', `${context.identity.runId}:${question.questionId}`),
    hypothesis: question.hypothesis, method: question.method, falsifier: question.falsifier,
    expectedEvidence: [...question.expectedEvidence],
    sourceRefs: [...new Set([context.question.receiptId, ...question.sourceRefs])] };
}

function runPayload(context) {
  const completedAt = new Date(context.input.nowMs).toISOString();
  const authorization = context.authorization;
  return { runId: context.identity.runId, episodeId: context.input.episodeId,
    projectId: context.input.projectId, taskId: context.binding.receipt.payload.taskId,
    bindingRef: context.binding.receipt.receiptId,
    authorization: { ref: `shev-authorization:${authorization.nonce}`,
      grantedBy: authorization.details.grantedBy, scope: MODE, expiresAt: authorization.expiresAt },
    policyId: context.input.policyId, status: 'completed_unverified',
    proposal: proposalPayload(context), usage: { tokens: 0, usd: 0, seconds: 0 },
    budget: context.episode.budget, boundaries: runContract.BOUNDARIES,
    evidenceRefs: [...new Set([context.binding.receipt.receiptId,
      context.question.receiptId, `shev-authorization:${authorization.nonce}`])],
    startedAt: completedAt, completedAt };
}

function identityMatches(row, payload) {
  return [payload.runId === row.run_id, payload.episodeId === row.episode_id,
    payload.taskId === row.task_id, payload.bindingRef === row.binding_ref,
    payload.authorization.ref === row.authorization_ref,
    payload.policyId === row.policy_id].every(Boolean);
}

function recordMatches(row, receipt) {
  return [receipt.receiptId === row.receipt_id, receipt.payload.status === row.status,
    receipt.payload.completedAt === row.completed_at].every(Boolean);
}

function readRun(row, requestHash) {
  if (!row) return null;
  if (row.request_hash !== requestHash) {
    throw coded('ENDOGENOUS_RUN_IDEMPOTENCY_CONFLICT', 'Episode is bound to another run request.');
  }
  const receipt = parseReceipt(row, runContract, 'ENDOGENOUS_RUN_INTEGRITY_FAILED');
  if (!identityMatches(row, receipt.payload) || !recordMatches(row, receipt)) {
    throw coded('ENDOGENOUS_RUN_INTEGRITY_FAILED', 'Run row does not match its receipt.');
  }
  return { receipt, replayed: true };
}

async function storedRun(db, input, identity) {
  const row = await db.get(`SELECT * FROM endogenous_thought_runs
    WHERE organization_id=? AND project_id=? AND episode_id=?`,
  input.organizationId, input.projectId, input.episodeId);
  return readRun(row, identity.requestHash);
}

async function insertRun(db, context) {
  const payload = context.receipt.payload;
  await db.run(`INSERT INTO endogenous_thought_runs
    (organization_id,project_id,run_id,episode_id,task_id,binding_ref,authorization_ref,
     policy_id,request_hash,receipt_id,content_hash,receipt_json,status,completed_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, context.input.organizationId,
  context.input.projectId, payload.runId, payload.episodeId, payload.taskId,
  payload.bindingRef, payload.authorization.ref, payload.policyId, context.identity.requestHash,
  context.receipt.receiptId, digest(context.receipt), canonicalJson(context.receipt),
  payload.status, payload.completedAt);
}

function taskMatchesBinding(task, binding) {
  const payload = binding.receipt.payload;
  const identityMatches = Boolean(task) && task.id === payload.taskId
    && task.project_id === payload.projectId;
  const contentMatches = Boolean(task) && task.title === payload.title
    && task.priority === payload.priority && task.depends_on_json === '[]'
    && task.acceptance_json === canonicalJson(payload.acceptance);
  return identityMatches && contentMatches;
}

async function assertHeldTask(db, binding) {
  const task = await db.get('SELECT * FROM ontogenesis_backlog WHERE id=?',
    binding.receipt.payload.taskId);
  if (!taskMatchesBinding(task, binding) || task.status !== 'blocked' || task.attempt !== 0) {
    throw coded('ENDOGENOUS_RUN_TASK_INTEGRITY_FAILED',
      'Held task does not match its immutable binding.');
  }
}

async function materializeRun(db, context) {
  const receipt = runContract.createReceipt(runPayload(context));
  return withTransaction(db, async () => {
    const replay = await storedRun(db, context.input, context.identity);
    if (replay) return replay;
    await assertHeldTask(db, context.binding);
    await consumeAuthorization(db, context.authorization);
    const taskId = context.binding.receipt.payload.taskId;
    const released = await db.run(`UPDATE ontogenesis_backlog
      SET status='verifying',attempt=attempt+1,updated_at=datetime('now')
      WHERE id=? AND project_id=? AND status='blocked' AND attempt=0`,
    taskId, context.input.projectId);
    if (released.changes !== 1) {
      throw coded('ENDOGENOUS_RUN_TASK_STATE_CONFLICT', 'Held task cannot be released for execution.');
    }
    await db.run(`INSERT INTO ontogenesis_runs
      (id,project_id,task_id,topology,variant,worker_json,budgets_json,status)
      VALUES (?,?,?,'ett-read-only','deterministic',?,?,'unverified')`,
    context.identity.runId, context.input.projectId, taskId,
    canonicalJson({ kind: 'in-process', spawned: false }), canonicalJson(context.episode.budget));
    await insertRun(db, { ...context, receipt });
    return storedRun(db, context.input, context.identity);
  });
}

function validRuntimeTask(task, binding) {
  return taskMatchesBinding(task, binding) && task.status === 'verifying' && task.attempt === 1;
}

function runtimeWorker(job) {
  if (!job) return null;
  try { return JSON.parse(job.worker_json); } catch (_) { return null; }
}

function validRuntimeJob(job, payload) {
  return Boolean(job) && job.project_id === payload.projectId && job.task_id === payload.taskId
    && job.topology === 'ett-read-only' && job.variant === 'deterministic'
    && job.status === 'unverified' && job.attempt === 1
    && job.budgets_json === canonicalJson(payload.budget);
}

function validRuntimeWorker(job) {
  const worker = runtimeWorker(job);
  return worker?.kind === 'in-process' && worker.spawned === false;
}

async function verifyRuntimeState(db, run, binding) {
  const payload = run.receipt.payload;
  const task = await db.get('SELECT * FROM ontogenesis_backlog WHERE id=?', payload.taskId);
  const job = await db.get('SELECT * FROM ontogenesis_runs WHERE id=?', payload.runId);
  if (!validRuntimeTask(task, binding) || !validRuntimeJob(job, payload)
    || !validRuntimeWorker(job)) {
    throw coded('ENDOGENOUS_RUN_RUNTIME_INTEGRITY_FAILED', 'Ontogenesis run state is invalid.');
  }
  return { task, job };
}

function transitionPayload(context) {
  const payload = context.run.receipt.payload;
  const head = context.head.receipt.payload;
  return { transitionId: scopedId('ett_transition_run', payload.runId),
    episodeId: context.input.episodeId, agentId: context.episode.agentId,
    projectId: context.input.projectId, mandateRef: context.episode.mandateRef,
    fromState: 'QUEUED', toState: 'RUNNING', triggerRef: context.episode.triggerRef,
    questionRef: head.questionRef, decisionRef: head.decisionRef,
    taskRef: payload.taskId, jobRef: payload.runId, budget: context.episode.budget,
    evidenceRefs: [...new Set([...head.evidenceRefs, context.run.receipt.receiptId])],
    stopReason: null, occurredAt: payload.completedAt,
    previousReceiptId: context.episode.currentReceiptId };
}

async function advanceEpisode(db, context) {
  const runId = context.run.receipt.payload.runId;
  if (context.episode.currentState === 'RUNNING') {
    if (context.head.receipt.payload.jobRef !== runId) {
      throw coded('ENDOGENOUS_RUN_STATE_CONFLICT', 'Running episode references another job.');
    }
    return { receipt: context.head.receipt, replayed: true, sequence: context.head.sequence };
  }
  if (context.episode.currentState !== 'QUEUED') {
    throw coded('ENDOGENOUS_RUN_STATE_CONFLICT', 'Episode is not queued for execution.');
  }
  return thoughtStore.transitionEpisode(db, { organizationId: context.input.organizationId,
    projectId: context.input.projectId, payload: transitionPayload(context) });
}

async function runQueuedThought(db, rawInput) {
  if (rawInput?.policy?.enabled !== true) return { status: 'skipped', reason: 'disabled' };
  const input = normalizeInput(rawInput);
  await thoughtStore.ensure(db);
  await taskMigration.migrateEndogenousThoughtTasks(db);
  await runMigration.migrateEndogenousThoughtRuns(db);
  const episode = await thoughtStore.getEpisode(db, input);
  const receipts = await thoughtStore.listReceipts(db, input);
  const head = receipts.at(-1);
  const binding = await loadBinding(db, input);
  const question = await loadQuestion(db, input, binding.receipt.payload.questionRef);
  const authorization = assertAuthorization(input, expectedAuthorization(input,
    { binding, queuedVersion: queuedVersion(receipts) }));
  const identity = runIdentity(input, { binding, authorization });
  let run = await storedRun(db, input, identity);
  if (!run) {
    if (episode.currentState !== 'QUEUED') {
      throw coded('ENDOGENOUS_RUN_STATE_CONFLICT', 'Episode is not queued for execution.');
    }
    run = await materializeRun(db, { input, episode, binding, question, authorization, identity });
    run.replayed = false;
  }
  const runtime = await verifyRuntimeState(db, run, binding);
  const advanced = await advanceEpisode(db, { input, episode, head, run });
  return { status: 'completed_unverified', run, runtime, episode: advanced };
}

module.exports = { MODE, normalizeInput, runQueuedThought };
