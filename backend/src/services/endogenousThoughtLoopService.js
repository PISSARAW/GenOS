'use strict';

const crypto = require('node:crypto');
const { canonicalJson } = require('./aTeam/variants/variantExecutionHelpers');
const admission = require('./endogenousThoughtAdmissionService');
const queue = require('./endogenousThoughtQueueService');
const runner = require('./endogenousThoughtRunnerService');
const runContract = require('./endogenousThoughtRunContractService');
const verifier = require('./endogenousThoughtVerificationService');
const verificationContract = require('./endogenousThoughtVerificationContractService');
const learner = require('./endogenousThoughtLearningService');
const continuation = require('./endogenousThoughtContinuationService');
const followUp = require('./endogenousThoughtFollowUpQuestionService');
const thoughtStore = require('./endogenousThoughtStoreService');
const runMigration = require('../db/migrations/migrateEndogenousThoughtRuns');
const verificationMigration = require('../db/migrations/migrateEndogenousThoughtVerifications');

const TERMINAL = new Set(['STOPPED', 'ABSTAINED', 'FAILED']);

function coded(code, message) {
  return Object.assign(new Error(message), { code });
}

function required(value, code) {
  if (typeof value !== 'string' || !value.trim()) throw coded(code, 'A non-empty value is required.');
  return value.trim();
}

function policies(input) {
  const condition = input.condition || 'full';
  return {
    condition,
    admission: { enabled: true, id: 'ett-admission-v1',
      condition: condition === 'agow_arbitration_ablated' ? condition : 'full', ttlMs: 60000,
      ...(input.policies?.admission || {}) },
    queue: { enabled: true, id: 'ett-queue-v1', priority: 50,
      ...(input.policies?.queue || {}) },
    run: { enabled: true, id: 'ett-run-v1', ...(input.policies?.run || {}) },
    verification: { enabled: true, id: 'ett-verification-v1',
      ...(input.policies?.verification || {}) },
    learning: { enabled: true, id: 'ett-learning-v1', condition,
      ...(input.policies?.learning || {}) },
    continuation: { enabled: true, id: 'ett-continuation-v1', condition,
      ...(input.policies?.continuation || {}) }
  };
}

function initialCumulativeUsage(usage) {
  if (!usage) return { tokens: 0, usd: 0, seconds: 0 };
  return {
    tokens: Math.max(0, Number(usage.tokens) || 0),
    usd: Math.max(0, Number(usage.usd) || 0),
    seconds: Math.max(0, Number(usage.seconds) || 0)
  };
}

function assertGates(input) {
  if (typeof input?.authorize !== 'function' || typeof input?.verify !== 'function') {
    throw coded('ENDOGENOUS_LOOP_GATES_REQUIRED', 'Authorization and independent verification callbacks are required.');
  }
}

function normalizeInput(input) {
  const maxCycles = Number(input?.maxCycles ?? 1);
  if (!Number.isSafeInteger(maxCycles) || maxCycles < 1 || maxCycles > 10) {
    throw coded('ENDOGENOUS_LOOP_LIMIT_INVALID', 'maxCycles must be between one and ten.');
  }
  assertGates(input);
  return { organizationId: required(input.organizationId, 'ENDOGENOUS_ORGANIZATION_REQUIRED'),
    projectId: required(input.projectId, 'ENDOGENOUS_PROJECT_REQUIRED'),
    episodeId: required(input.episodeId, 'ENDOGENOUS_EPISODE_REQUIRED'),
    maxCycles, authorize: input.authorize, verify: input.verify,
    questionGenerator: input.questionGenerator, worker: input.worker,
    sandbox: input.sandbox, usageMeter: input.usageMeter,
    grantedBy: input.grantedBy || 'ett-autonomous-loop',
    baseTime: Number(input.nowMs ?? Date.now()), policies: policies(input),
    cumulativeUsage: initialCumulativeUsage(input?.cumulativeUsage) };
}

function timestamp(context) {
  context.tick += 1;
  return context.input.baseTime + context.tick;
}

async function authorize(context, stage, material) {
  const result = await context.input.authorize({ stage, ...material });
  if (!result || typeof result.signature !== 'string') {
    throw coded('ENDOGENOUS_LOOP_AUTHORIZATION_INVALID', `Authorization callback did not sign ${stage}.`);
  }
  return result;
}

async function continueEpisode(context) {
  const learning = await context.db.get(`SELECT learning_id,receipt_id FROM endogenous_thought_learnings
    WHERE organization_id=? AND project_id=? AND episode_id=? ORDER BY learned_at DESC LIMIT 1`,
  context.input.organizationId, context.input.projectId, context.input.episodeId);
  if (!learning) throw coded('ENDOGENOUS_LOOP_LEARNING_NOT_FOUND', 'Continuation has no learned result.');
  const episode = await thoughtStore.getEpisode(context.db, context.input);
  const policy = context.input.policies.continuation;
  const material = { operation: 'ett-continue', projectId: context.input.projectId,
    subjectId: learning.learning_id, expectedVersion: episode.version,
    details: { episodeId: context.input.episodeId, learningRef: learning.receipt_id,
      policyId: policy.id, target: 'ett-continuation' } };
  const authorization = await authorize(context, 'continue', material);
  return continuation.continueLearnedThought(context.db, { ...context.input,
    nowMs: timestamp(context), policy, authorization,
    cumulativeUsage: context.input.cumulativeUsage });
}

async function askFollowUp(context) {
  return followUp.questionFollowUp(context.db, { ...context.input,
    nowMs: timestamp(context), questionGenerator: context.input.questionGenerator });
}

async function admit(context) {
  return admission.admitQuestion(context.db, { ...context.input,
    nowMs: timestamp(context), policy: context.input.policies.admission });
}

async function enqueue(context) {
  return queue.queueAdmittedThought(context.db, { ...context.input,
    nowMs: timestamp(context), policy: context.input.policies.queue });
}

function usageIntegrityError() {
  return coded('ENDOGENOUS_LOOP_USAGE_INTEGRITY_FAILED',
    'Persisted run usage cannot be trusted; autonomous execution is blocked.');
}

function extractRowUsage(row, input) {
  let receipt;
  try {
    receipt = JSON.parse(row.receipt_json);
  } catch (_) {
    throw usageIntegrityError();
  }
  const payload = receipt?.payload;
  const contentHash = crypto.createHash('sha256').update(canonicalJson(receipt)).digest('hex');
  const matchesScope = row.organization_id === input.organizationId
    && row.project_id === input.projectId && row.episode_id === input.episodeId
    && payload?.runId === row.run_id && payload?.episodeId === row.episode_id
    && payload?.projectId === row.project_id;
  if (!runContract.readReceipt(receipt).valid || row.content_hash !== contentHash || !matchesScope) {
    throw usageIntegrityError();
  }
  return payload.usage;
}

function sumRowUsages(rows, input) {
  const sum = { tokens: 0, usd: 0, seconds: 0 };
  for (const row of rows) {
    const usage = extractRowUsage(row, input);
    sum.tokens += usage.tokens;
    sum.usd += usage.usd;
    sum.seconds += usage.seconds;
    if (!Number.isSafeInteger(sum.tokens) || !Number.isFinite(sum.usd)
      || !Number.isSafeInteger(sum.seconds)) throw usageIntegrityError();
  }
  return sum;
}

async function loadPriorUsage(db, input) {
  const initial = initialCumulativeUsage(input?.cumulativeUsage);
  const rows = await db.all(
    `SELECT organization_id, project_id, run_id, episode_id, content_hash, receipt_json
     FROM endogenous_thought_runs WHERE organization_id=? AND project_id=? AND episode_id=?`,
    input.organizationId, input.projectId, input.episodeId
  );
  const stored = sumRowUsages(rows, input);
  return {
    tokens: Math.max(initial.tokens, stored.tokens),
    usd: Math.max(initial.usd, stored.usd),
    seconds: Math.max(initial.seconds, stored.seconds)
  };
}

async function run(context) {
  const episode = await thoughtStore.getEpisode(context.db, context.input);
  const receipts = await thoughtStore.listReceipts(context.db, context.input);
  const head = receipts.at(-1).receipt.payload;
  const policy = context.input.policies.run;
  const material = { operation: 'ett-run', projectId: context.input.projectId,
    subjectId: context.input.episodeId, expectedVersion: episode.version,
    details: { taskId: head.taskRef, policyId: policy.id, mode: runner.MODE,
      grantedBy: context.input.grantedBy } };
  const signed = await authorize(context, 'run', material);
  const authorization = { ...signed, grantedBy: context.input.grantedBy };
  const result = await runner.runQueuedThought(context.db, { ...context.input,
    nowMs: timestamp(context), policy, authorization,
    worker: context.input.worker,
    sandbox: context.input.sandbox, usageMeter: context.input.usageMeter });
  if (result.run?.replayed !== true) {
    const usage = result.run.receipt.payload.usage;
    for (const key of ['tokens', 'usd', 'seconds']) context.input.cumulativeUsage[key] += usage[key];
  }
  return result;
}

async function resolveRunReceipt(context, receipts) {
  if (context.cycle?.run?.run?.receipt) {
    return context.cycle.run.run.receipt;
  }
  const head = receipts.at(-1);
  const runId = head?.receipt?.payload?.jobRef;
  if (!runId) throw coded('ENDOGENOUS_LOOP_RUN_RECEIPT_NOT_FOUND', 'Episode has no run reference.');
  const row = await context.db.get(
    `SELECT receipt_json FROM endogenous_thought_runs
     WHERE organization_id=? AND project_id=? AND run_id=?`,
    context.input.organizationId, context.input.projectId, runId
  );
  if (!row) throw coded('ENDOGENOUS_LOOP_RUN_NOT_FOUND', 'Run was not found for verification.');
  const receipt = JSON.parse(row.receipt_json);
  context.cycle.run = { run: { receipt, replayed: true } };
  return receipt;
}

async function verify(context) {
  const episode = await thoughtStore.getEpisode(context.db, context.input);
  const receipts = await thoughtStore.listReceipts(context.db, context.input);
  const runReceipt = await resolveRunReceipt(context, receipts);
  const gated = await context.input.verify({ episode, runReceipt,
    expectedVersion: episode.version, policy: context.input.policies.verification,
    organizationId: context.input.organizationId, projectId: context.input.projectId,
    buildPayload: verifier.buildPayload, verificationContract });
  if (!gated?.authorization || !gated?.verification) {
    throw coded('ENDOGENOUS_LOOP_VERIFICATION_INVALID', 'Independent verifier did not return authorization and attestation.');
  }
  return verifier.verifyRunningThought(context.db, { ...context.input,
    policy: context.input.policies.verification, authorization: gated.authorization,
    verification: gated.verification, receipts, nowMs: timestamp(context) });
}

async function resolveVerificationReceipt(context, receipts) {
  if (context.cycle?.verification?.verification?.receipt) {
    return context.cycle.verification.verification.receipt;
  }
  const head = receipts.at(-1);
  const runId = head?.receipt?.payload?.jobRef;
  if (!runId) throw coded('ENDOGENOUS_LOOP_VERIFICATION_RECEIPT_NOT_FOUND', 'Episode has no job reference.');
  const row = await context.db.get(
    `SELECT receipt_json FROM endogenous_thought_verifications
     WHERE organization_id=? AND project_id=? AND run_id=?`,
    context.input.organizationId, context.input.projectId, runId
  );
  if (!row) throw coded('ENDOGENOUS_LOOP_VERIFICATION_NOT_FOUND', 'Verification was not found for learning.');
  const receipt = JSON.parse(row.receipt_json);
  context.cycle.verification = { verification: { receipt, replayed: true } };
  return receipt;
}

async function learn(context) {
  const episode = await thoughtStore.getEpisode(context.db, context.input);
  const receipts = await thoughtStore.listReceipts(context.db, context.input);
  const verification = await resolveVerificationReceipt(context, receipts);
  const policy = context.input.policies.learning;
  const material = { operation: 'ett-learn', projectId: context.input.projectId,
    subjectId: verification.payload.verificationId, expectedVersion: episode.version,
    details: { episodeId: context.input.episodeId, verificationRef: verification.receiptId,
      verdict: verification.payload.verdict, policyId: policy.id, target: 'ett-episode-belief' } };
  const authorization = await authorize(context, 'learn', material);
  return learner.learnVerifiedThought(context.db, { ...context.input,
    nowMs: timestamp(context), policy, authorization });
}

async function executeCycle(context) {
  let episode = await thoughtStore.getEpisode(context.db, context.input);
  if (episode.currentState === 'LEARNED') context.cycle.continuation = await continueEpisode(context);
  episode = await thoughtStore.getEpisode(context.db, context.input);
  if (episode.currentState === 'FOLLOW_UP') context.cycle.question = await askFollowUp(context);
  episode = await thoughtStore.getEpisode(context.db, context.input);
  if (episode.currentState === 'QUESTIONED') context.cycle.admission = await admit(context);
  episode = await thoughtStore.getEpisode(context.db, context.input);
  if (TERMINAL.has(episode.currentState)) return;
  if (episode.currentState === 'ADMITTED') context.cycle.queue = await enqueue(context);
  episode = await thoughtStore.getEpisode(context.db, context.input);
  if (episode.currentState === 'QUEUED') context.cycle.run = await run(context);
  episode = await thoughtStore.getEpisode(context.db, context.input);
  if (episode.currentState === 'RUNNING') context.cycle.verification = await verify(context);
  episode = await thoughtStore.getEpisode(context.db, context.input);
  if (episode.currentState === 'VERIFIED') context.cycle.learning = await learn(context);
}

async function stopAtLimit(context) {
  const episode = await thoughtStore.getEpisode(context.db, context.input);
  if (episode.currentState !== 'LEARNED') return episode;
  await continuation.stopContinuation(context.db, { ...context.input,
    nowMs: timestamp(context), policy: context.input.policies.continuation,
    reason: 'cycle-limit' });
  return thoughtStore.getEpisode(context.db, context.input);
}

async function runAutonomousLoop(db, rawInput) {
  const input = normalizeInput(rawInput);
  await thoughtStore.ensure(db);
  await runMigration.migrateEndogenousThoughtRuns(db);
  await verificationMigration.migrateEndogenousThoughtVerifications(db);
  input.cumulativeUsage = await loadPriorUsage(db, input);
  const context = { db, input, tick: 0, cycle: null };
  const cycles = [];
  for (let index = 0; index < input.maxCycles; index += 1) {
    context.cycle = { index: index + 1 };
    await executeCycle(context);
    cycles.push(context.cycle);
    const episode = await thoughtStore.getEpisode(db, input);
    if (TERMINAL.has(episode.currentState)) break;
    if (episode.currentState !== 'LEARNED') {
      throw coded('ENDOGENOUS_LOOP_STATE_CONFLICT', `Cycle ended in ${episode.currentState}.`);
    }
  }
  const episode = await stopAtLimit(context);
  return { status: episode.currentState.toLowerCase(), episode, cycles,
    cumulativeUsage: input.cumulativeUsage };
}

module.exports = { runAutonomousLoop, normalizeInput };
