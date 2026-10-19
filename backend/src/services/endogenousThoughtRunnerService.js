'use strict';

const crypto = require('node:crypto');
const { withTransaction } = require('../db');
const { canonicalJson } = require('./aTeam/variants/variantExecutionHelpers');
const contracts = require('./versionedContractService');
const taskContract = require('./endogenousThoughtTaskContractService');
const runContract = require('./endogenousThoughtRunContractService');
const execution = require('./endogenousThoughtRunExecutionService');
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
function executionInputs(input) {
  const policy = input?.policy || {};
  return { worker: input?.worker || policy.worker || input?.solver || null,
    sandbox: input?.sandbox || policy.sandbox || null,
    usageMeter: input?.usageMeter || policy.usageMeter || null,
    signal: input?.signal || null };
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
    authorization: input.authorization, nowMs,
    ...executionInputs(input) };
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
    WHERE organization_id=? AND project_id=? AND task_id=?`,
  input.organizationId, input.projectId, input.taskRef);
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
  const queued = receipts.findLast((entry) => entry.receipt.payload.toState === 'QUEUED');
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
  return { runId: scopedId('ett_run', basis), taskId: context.binding.receipt.payload.taskId,
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

function emptyUsage() {
  return { tokens: 0, usd: 0, seconds: 0 };
}
function validateUsage(usage, budget) {
  const candidate = usage || emptyUsage();
  const checks = [
    Number.isSafeInteger(candidate.tokens), candidate.tokens >= 0,
    Number.isFinite(candidate.usd), candidate.usd >= 0,
    Number.isSafeInteger(candidate.seconds), candidate.seconds >= 0,
    candidate.tokens <= budget.tokens, candidate.usd <= budget.usd,
    candidate.seconds <= budget.seconds
  ];
  return checks.every(Boolean) ? candidate : null;
}

function solverResult(context, result, usage) {
  const base = proposalPayload(context);
  const proposal = result?.proposal && typeof result.proposal === 'object' && !Array.isArray(result.proposal)
    ? { ...base, ...result.proposal } : base;
  if (!proposal.hypothesis || !proposal.method || !proposal.falsifier) {
    throw coded('ENDOGENOUS_RUN_PROPOSAL_INVALID', 'Worker returned an invalid proposal.');
  }
  const measured = validateUsage(usage, context.episode.budget);
  if (!measured) throw coded('ENDOGENOUS_RUN_BUDGET_EXCEEDED',
    'Externally measured consumption exceeds the held budget.');
  const evidenceRefs = Array.isArray(result?.evidenceRefs) ? result.evidenceRefs : [];
  return { proposal, usage: measured, evidenceRefs };
}

function runPayload(context) {
  const completedAt = new Date(context.input.nowMs).toISOString();
  const authorization = context.authorization;
  const solverResult = context.solverResult || { proposal: proposalPayload(context),
    usage: emptyUsage(), evidenceRefs: [] };
  const evidenceRefs = [...new Set([context.binding.receipt.receiptId,
    context.question.receiptId, `shev-authorization:${authorization.nonce}`,
    `ett-execution:${context.executionId}`,
    ...solverResult.evidenceRefs])];
  return { runId: context.identity.runId, episodeId: context.input.episodeId,
    projectId: context.input.projectId, taskId: context.binding.receipt.payload.taskId,
    bindingRef: context.binding.receipt.receiptId,
    authorization: { ref: `shev-authorization:${authorization.nonce}`,
      grantedBy: authorization.details.grantedBy, scope: MODE, expiresAt: authorization.expiresAt },
    policyId: context.input.policyId, status: 'completed_unverified',
    proposal: solverResult.proposal, usage: solverResult.usage,
    budget: context.episode.budget, boundaries: runContract.BOUNDARIES,
    evidenceRefs, startedAt: completedAt, completedAt };
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
    WHERE organization_id=? AND project_id=? AND task_id=?`,
  input.organizationId, input.projectId, identity.taskId);
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

function runtimeWorkerPayload(context) {
  const injected = Boolean(context.input.worker);
  return { kind: injected ? 'sandbox-adapter' : 'in-process', spawned: false,
    executionId: context.executionId, sandbox: injected
      ? execution.SANDBOX_POLICY : { kind: 'builtin-deterministic', readOnly: true } };
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

async function reserveRun(db, context) {
  return withTransaction(db, async () => {
    const existing = await execution.loadReservation(db, context);
    if (existing) return existing;
    await assertHeldTask(db, context.binding);
    await consumeAuthorization(db, context.authorization);
    const taskId = context.binding.receipt.payload.taskId;
    const held = await db.run(`UPDATE ontogenesis_backlog
      SET status='doing',attempt=attempt+1,updated_at=?
      WHERE id=? AND project_id=? AND status='blocked' AND attempt=0`,
    context.timestamp, taskId, context.input.projectId);
    if (held.changes !== 1) {
      throw coded('ENDOGENOUS_RUN_TASK_STATE_CONFLICT', 'Held task cannot be reserved.');
    }
    await db.run(`INSERT INTO ontogenesis_runs
      (id,project_id,task_id,topology,variant,worker_json,budgets_json,status)
      VALUES (?,?,?,'ett-read-only','deterministic',?,?,'running')`,
    context.identity.runId, context.input.projectId, taskId,
    canonicalJson(runtimeWorkerPayload(context)), canonicalJson(context.episode.budget));
    return execution.insertReservation(db, context);
  });
}

async function materializeRun(db, context) {
  const receipt = runContract.createReceipt(runPayload(context));
  return withTransaction(db, async () => {
    const replay = await storedRun(db, context.input, context.identity);
    if (replay) return replay;
    const taskId = context.binding.receipt.payload.taskId;
    const released = await db.run(`UPDATE ontogenesis_backlog
      SET status='verifying',updated_at=?
      WHERE id=? AND project_id=? AND status='doing' AND attempt=1`,
    context.timestamp, taskId, context.input.projectId);
    if (released.changes !== 1) {
      throw coded('ENDOGENOUS_RUN_TASK_STATE_CONFLICT', 'Reserved task cannot be completed.');
    }
    const finished = await db.run("UPDATE ontogenesis_runs SET status='unverified' WHERE id=? AND status='running'",
      context.identity.runId);
    if (finished.changes !== 1) {
      throw coded('ENDOGENOUS_RUN_RUNTIME_INTEGRITY_FAILED', 'Reserved runtime cannot be completed.');
    }
    await insertRun(db, { ...context, receipt });
    await execution.finishReservation(db, context);
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
  return ['in-process', 'sandbox-adapter'].includes(worker?.kind)
    && worker.spawned === false && typeof worker.executionId === 'string';
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
  execution.assertExecutionInput(input);
  await thoughtStore.ensure(db);
  await taskMigration.migrateEndogenousThoughtTasks(db);
  await runMigration.migrateEndogenousThoughtRuns(db);
  const episode = await thoughtStore.getEpisode(db, input);
  const receipts = await thoughtStore.listReceipts(db, input);
  const head = receipts.at(-1);
  input.taskRef = head.receipt.payload.taskRef;
  if (!input.taskRef) throw coded('ENDOGENOUS_RUN_BINDING_NOT_FOUND', 'Queued episode has no task reference.');
  const binding = await loadBinding(db, input);
  const question = await loadQuestion(db, input, binding.receipt.payload.questionRef);
  const authorization = assertAuthorization(input, expectedAuthorization(input,
    { binding, queuedVersion: queuedVersion(receipts) }));
  const identity = runIdentity(input, { binding, authorization });
  const executionId = execution.executionIdFor(identity);
  const timestamp = new Date(input.nowMs).toISOString();
  let run = await storedRun(db, input, identity);
  if (!run) {
    if (episode.currentState !== 'QUEUED') {
      throw coded('ENDOGENOUS_RUN_STATE_CONFLICT', 'Episode is not queued for execution.');
    }
    const context = { input, episode, binding, question, authorization, identity,
      executionId, timestamp, sandboxPolicy: input.worker
        ? execution.SANDBOX_POLICY : { kind: 'builtin-deterministic', readOnly: true } };
    await reserveRun(db, context);
    const executed = await execution.executeReservation(db, { ...context,
      defaultResult: { proposal: proposalPayload(context), evidenceRefs: [] },
      boundaries: runContract.BOUNDARIES });
    const result = solverResult(context, executed.result, executed.usage);
    run = await materializeRun(db, { ...context, solverResult: result,
      usage: result.usage });
    run.replayed = false;
  }
  const runtime = await verifyRuntimeState(db, run, binding);
  const advanced = await advanceEpisode(db, { input, episode, head, run });
  return { status: 'completed_unverified', run, runtime, episode: advanced,
    execution: { executionId, idempotent: true, replayed: run.replayed === true } };
}

module.exports = { MODE, normalizeInput, runQueuedThought };
