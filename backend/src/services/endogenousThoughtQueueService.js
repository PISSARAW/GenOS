'use strict';

const crypto = require('node:crypto');
const { withTransaction } = require('../db');
const { canonicalJson } = require('./aTeam/variants/variantExecutionHelpers');
const contracts = require('./versionedContractService');
const admissionContract = require('./endogenousThoughtAdmissionContractService');
const taskContract = require('./endogenousThoughtTaskContractService');
const thoughtStore = require('./endogenousThoughtStoreService');
const projectStore = require('./ontogenesis/projectStore');
const admissionMigration = require('../db/migrations/migrateEndogenousThoughtAdmissions');
const taskMigration = require('../db/migrations/migrateEndogenousThoughtTasks');

const BOUNDARIES = Object.freeze({ executionAuthorized: false, workerStarted: false,
  externalActionAllowed: false, promotionEligible: false });

function coded(code, message) {
  return Object.assign(new Error(message), { code });
}

function required(value, code) {
  if (typeof value !== 'string' || !value.trim()) throw coded(code, 'A non-empty identifier is required.');
  return value.trim();
}

function digest(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function scopedId(prefix, material) {
  return `${prefix}_${digest(material).slice(0, 24)}`;
}

function normalizePolicy(policy) {
  const id = required(policy?.id, 'ENDOGENOUS_QUEUE_POLICY_REQUIRED');
  const requested = Number(policy.priority ?? 50);
  if (!Number.isInteger(requested) || requested < 0 || requested > 100) {
    throw coded('ENDOGENOUS_QUEUE_PRIORITY_INVALID', 'Queue priority must be an integer from zero to one hundred.');
  }
  return { enabled: true, id, priority: requested };
}

function normalizeInput(input) {
  const nowMs = Number(input?.nowMs ?? Date.now());
  if (!Number.isFinite(nowMs) || nowMs < 0) {
    throw coded('ENDOGENOUS_QUEUE_TIME_INVALID', 'Queue time must be a positive epoch value.');
  }
  return { organizationId: required(input?.organizationId, 'ENDOGENOUS_ORGANIZATION_REQUIRED'),
    projectId: required(input?.projectId, 'ENDOGENOUS_PROJECT_REQUIRED'),
    episodeId: required(input?.episodeId, 'ENDOGENOUS_EPISODE_REQUIRED'),
    policy: normalizePolicy(input.policy), nowMs };
}

function parseReceipt(row, contract) {
  let receipt;
  try { receipt = JSON.parse(row.receipt_json); } catch (_) {
    throw coded('ENDOGENOUS_QUEUE_INTEGRITY_FAILED', 'Stored receipt is not valid JSON.');
  }
  const validation = contract.readReceipt(receipt);
  if (row.content_hash !== digest(receipt) || !validation.valid) {
    throw coded('ENDOGENOUS_QUEUE_INTEGRITY_FAILED', 'Stored receipt integrity validation failed.');
  }
  return receipt;
}

async function loadQuestion(db, input) {
  const row = await db.get(`SELECT * FROM endogenous_thought_questions
    WHERE organization_id=? AND project_id=? AND receipt_id=?`,
  input.organizationId, input.projectId, input.questionRef);
  if (!row || row.episode_id !== input.episodeId) {
    throw coded('ENDOGENOUS_QUESTION_NOT_FOUND', 'Question receipt is not attached to this episode.');
  }
  const receipt = parseReceipt(row, contracts);
  if (receipt.contractType !== 'EndogenousQuestion') {
    throw coded('ENDOGENOUS_QUEUE_INTEGRITY_FAILED', 'Question contract type is invalid.');
  }
  return receipt;
}

async function loadAdmission(db, input) {
  const row = await db.get(`SELECT * FROM endogenous_thought_admission_decisions
    WHERE organization_id=? AND project_id=? AND receipt_id=?`,
  input.organizationId, input.projectId, input.decisionRef);
  if (!row || row.episode_id !== input.episodeId || row.question_ref !== input.questionRef) {
    throw coded('ENDOGENOUS_ADMISSION_NOT_FOUND', 'Admission receipt is not attached to this episode.');
  }
  const receipt = parseReceipt(row, admissionContract);
  if (receipt.payload.outcome !== 'admitted') {
    throw coded('ENDOGENOUS_ADMISSION_NOT_GRANTED', 'Only an admitted question can be queued.');
  }
  return receipt;
}

function bindingIdentity(input) {
  const basis = { organizationId: input.organizationId, projectId: input.projectId,
    episodeId: input.episodeId, questionRef: input.questionRef, decisionRef: input.decisionRef,
    policyId: input.policy.id };
  return { bindingId: scopedId('ett_binding', basis), taskId: scopedId('ett_task', basis),
    requestHash: digest({ ...basis, priority: input.policy.priority }) };
}

function taskMaterial(context) {
  const question = context.question.payload;
  const prefix = 'ETT — ';
  return { title: `${prefix}${question.text}`.slice(0, 500),
    acceptance: [...new Set(question.expectedEvidence)], priority: context.input.policy.priority };
}

function bindingPayload(context) {
  const task = taskMaterial(context);
  const evidenceRefs = [...new Set([context.input.questionRef, context.input.decisionRef,
    ...context.question.payload.sourceRefs])];
  return { bindingId: context.identity.bindingId, episodeId: context.input.episodeId,
    projectId: context.input.projectId, questionRef: context.input.questionRef,
    decisionRef: context.input.decisionRef, taskId: context.identity.taskId,
    policyId: context.input.policy.id, title: task.title, priority: task.priority,
    acceptance: task.acceptance, holdState: 'blocked', evidenceRefs,
    boundaries: BOUNDARIES, queuedAt: new Date(context.input.nowMs).toISOString() };
}

function readBinding(row, requestHash) {
  if (!row) return null;
  if (row.request_hash !== requestHash) {
    throw coded('ENDOGENOUS_QUEUE_IDEMPOTENCY_CONFLICT',
      'Episode is already bound to another queue request.');
  }
  const receipt = parseReceipt(row, taskContract);
  const payload = receipt.payload;
  const bound = payload.bindingId === row.binding_id && payload.episodeId === row.episode_id
    && payload.questionRef === row.question_ref && payload.decisionRef === row.decision_ref
    && payload.taskId === row.task_id && payload.policyId === row.policy_id;
  if (!bound) {
    throw coded('ENDOGENOUS_QUEUE_INTEGRITY_FAILED', 'Task binding row does not match its receipt.');
  }
  return { receipt, replayed: true };
}

async function storedBinding(db, input, identity) {
  const row = await db.get(`SELECT * FROM endogenous_thought_task_bindings
    WHERE organization_id=? AND project_id=? AND episode_id=?`,
  input.organizationId, input.projectId, input.episodeId);
  return readBinding(row, identity.requestHash);
}

async function assertProject(db, projectId) {
  if (!await projectStore.getProject(db, projectId)) {
    throw coded('ENDOGENOUS_QUEUE_PROJECT_NOT_FOUND', 'Ontogenesis project was not found.');
  }
}

async function insertHeldTask(db, context) {
  const payload = context.receipt.payload;
  const existing = await db.get('SELECT id FROM ontogenesis_backlog WHERE id=?', payload.taskId);
  if (existing) throw coded('ENDOGENOUS_QUEUE_TASK_CONFLICT', 'Deterministic task identifier already exists.');
  await db.run(`INSERT INTO ontogenesis_backlog
    (id,project_id,title,status,priority,depends_on_json,acceptance_json,attempt)
    VALUES (?,?,?,'blocked',?,'[]',?,0)`, payload.taskId, context.input.projectId,
  payload.title, payload.priority, canonicalJson(payload.acceptance));
}

async function insertBinding(db, context) {
  const payload = context.receipt.payload;
  await db.run(`INSERT INTO endogenous_thought_task_bindings
    (organization_id,project_id,binding_id,episode_id,question_ref,decision_ref,task_id,
     policy_id,request_hash,receipt_id,content_hash,receipt_json,queued_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, context.input.organizationId, context.input.projectId,
  payload.bindingId, payload.episodeId, payload.questionRef, payload.decisionRef, payload.taskId,
  payload.policyId, context.identity.requestHash, context.receipt.receiptId,
  context.contentHash, canonicalJson(context.receipt), payload.queuedAt);
}

async function persistBinding(db, context) {
  const payload = bindingPayload(context);
  const receipt = taskContract.createReceipt(payload);
  return withTransaction(db, async () => {
    const replay = await storedBinding(db, context.input, context.identity);
    if (replay) return replay;
    await insertHeldTask(db, { input: context.input, receipt });
    await insertBinding(db, { input: context.input, identity: context.identity,
      receipt, contentHash: digest(receipt) });
    return storedBinding(db, context.input, context.identity);
  });
}

async function verifyHeldTask(db, binding) {
  const payload = binding.receipt.payload;
  const task = await db.get('SELECT * FROM ontogenesis_backlog WHERE id=?', payload.taskId);
  const valid = task && task.project_id === payload.projectId && task.title === payload.title
    && task.status === 'blocked' && task.priority === payload.priority && task.attempt === 0
    && task.depends_on_json === '[]' && task.acceptance_json === canonicalJson(payload.acceptance);
  if (!valid) throw coded('ENDOGENOUS_QUEUE_TASK_INTEGRITY_FAILED', 'Held task does not match its binding.');
  return task;
}

function transitionPayload(context) {
  const head = context.head.receipt.payload;
  const taskRef = context.binding.receipt.payload.taskId;
  return { transitionId: scopedId('ett_transition_queue', context.identity.bindingId),
    episodeId: context.input.episodeId, agentId: context.episode.agentId,
    projectId: context.input.projectId, mandateRef: context.episode.mandateRef,
    fromState: 'ADMITTED', toState: 'QUEUED', triggerRef: context.episode.triggerRef,
    questionRef: context.input.questionRef, decisionRef: context.input.decisionRef,
    taskRef, jobRef: null, budget: context.episode.budget,
    evidenceRefs: [...new Set([...head.evidenceRefs, context.binding.receipt.receiptId])],
    stopReason: null, occurredAt: context.binding.receipt.payload.queuedAt,
    previousReceiptId: context.episode.currentReceiptId };
}

async function advanceEpisode(db, context) {
  if (context.episode.currentState === 'QUEUED') {
    if (context.head.receipt.payload.taskRef !== context.binding.receipt.payload.taskId) {
      throw coded('ENDOGENOUS_QUEUE_STATE_CONFLICT', 'Queued episode references another task.');
    }
    return { receipt: context.head.receipt, replayed: true, sequence: context.head.sequence };
  }
  if (context.episode.currentState !== 'ADMITTED') {
    throw coded('ENDOGENOUS_QUEUE_STATE_CONFLICT', 'Episode is not ready to be queued.');
  }
  return thoughtStore.transitionEpisode(db, { organizationId: context.input.organizationId,
    projectId: context.input.projectId, payload: transitionPayload(context) });
}

async function queueAdmittedThought(db, rawInput) {
  if (rawInput?.policy?.enabled !== true) return { status: 'skipped', reason: 'disabled' };
  const input = normalizeInput(rawInput);
  await thoughtStore.ensure(db);
  await admissionMigration.migrateEndogenousThoughtAdmissions(db);
  await taskMigration.migrateEndogenousThoughtTasks(db);
  await assertProject(db, input.projectId);
  const episode = await thoughtStore.getEpisode(db, input);
  const receipts = await thoughtStore.listReceipts(db, input);
  const head = receipts.at(-1);
  input.questionRef = head.receipt.payload.questionRef;
  input.decisionRef = head.receipt.payload.decisionRef;
  if (!input.questionRef || !input.decisionRef) {
    throw coded('ENDOGENOUS_QUEUE_REFERENCES_MISSING', 'Episode lacks question or admission references.');
  }
  const question = await loadQuestion(db, input);
  const decision = await loadAdmission(db, input);
  const identity = bindingIdentity(input);
  let binding = await storedBinding(db, input, identity);
  if (!binding) {
    if (episode.currentState !== 'ADMITTED') {
      throw coded('ENDOGENOUS_QUEUE_STATE_CONFLICT', 'Episode is not ready to be queued.');
    }
    binding = await persistBinding(db, { input, episode, question, decision, identity });
    binding.replayed = false;
  }
  const task = await verifyHeldTask(db, binding);
  const advanced = await advanceEpisode(db, { input, episode, head, identity, binding });
  return { status: 'queued', binding, task, episode: advanced };
}

module.exports = { BOUNDARIES, queueAdmittedThought, normalizePolicy };
