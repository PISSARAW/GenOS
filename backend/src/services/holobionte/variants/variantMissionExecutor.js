'use strict';

const { randomUUID } = require('crypto');
const store = require('../holobiontStore');
const constitutionService = require('../host/hostConstitutionService');
const persistentHost = require('../persistentHostService');
const controller = require('./variantRuntimeController');

function invalid(message, code = 'HOLOBIONT_MISSION_INVALID') {
  return Object.assign(new Error(message), { code });
}

function requiredText(value, field) {
  const text = String(value || '').trim();
  if (!text) throw invalid(`${field} is required.`);
  return text;
}

function evidenceRefs(value) {
  const found = new Set();
  const queue = [value];
  const visited = new Set();
  while (queue.length) {
    const item = queue.pop();
    if (!item || typeof item !== 'object' || visited.has(item)) continue;
    visited.add(item);
    if (Array.isArray(item.evidenceRefs)) item.evidenceRefs.forEach((ref) => found.add(String(ref).trim()));
    queue.push(...(Array.isArray(item) ? item : Object.values(item)));
  }
  return [...found].filter(Boolean);
}

async function openMissionHost(db, input) {
  const hostId = requiredText(input.hostId, 'hostId');
  const missionId = requiredText(input.missionId, 'missionId');
  const constitution = hostConstitution(input, hostId, missionId);
  if (input.persistentHost === true) {
    return persistentHost.openPersistentHost(db, { hostId, missionId, constitution,
      capabilities: input.hostCapabilities ?? [], requiredCapabilities: input.requiredCapabilities ?? [] });
  }
  const session = await store.createSession(db, { hostId, missionId, constitution,
    scope: 'MISSION', workspaceId: input.workspaceId ?? null, projectId: input.projectId ?? null });
  return { session, reused: false, capabilityGap: { available: [], required: [], missing: [] } };
}

function hostConstitution(input, hostId, missionId) {
  return constitutionService.createHostConstitution({
    hostId, identity: input.hostIdentity ?? hostId,
    objectives: input.objectives ?? [missionId],
    nonNegotiableInvariants: input.invariants ?? [],
    essentialCapabilities: input.essentialCapabilities ?? [],
    privacyPolicy: input.privacyPolicy ?? {}, evidencePolicy: input.evidencePolicy ?? {}
  });
}

async function migrate(db) {
  await require('../../../db/migrations/migrateHolobiontSessions').migrateHolobiontSessions(db);
  await require('../../../db/migrations/migrateHolobiontContracts').migrateHolobiontContracts(db);
  await require('../../../db/migrations/migrateHolobiontMemory').migrateHolobiontMemory(db);
  await require('../../../db/migrations/migrateHolobiontLedger').migrateHolobiontLedger(db);
  await require('../../../db/migrations/migrateHolobiontImmunePlane').migrateHolobiontImmunePlane(db);
  await require('../../../db/migrations/migrateHolobiontVariantEvents').migrateHolobiontVariantEvents(db);
}

function createDeadline(input, budget) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(invalid('Mission latency budget exhausted.', 'BUDGET_EXHAUSTED')),
    budget.latencyMs);
  const external = input.signal;
  if (external) {
    if (external.aborted) controller.abort(external.reason);
    else external.addEventListener('abort', () => controller.abort(external.reason), { once: true });
  }
  return { signal: controller.signal, clear: () => clearTimeout(timeout), startedAt: Date.now() };
}

function awaitBeforeDeadline(promise, signal) {
  if (signal.aborted) return Promise.reject(signal.reason || invalid('Mission deadline elapsed.', 'BUDGET_EXHAUSTED'));
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason || invalid('Mission deadline elapsed.', 'BUDGET_EXHAUSTED'));
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then((result) => {
      signal.removeEventListener('abort', abort);
      resolve(result);
    }, (error) => {
      signal.removeEventListener('abort', abort);
      reject(error);
    });
  });
}

function budgetResult(input) {
  const service = require('../../budgetCoherenceService');
  const raw = input.executionBudget || input.budget || {};
  const normalized = service.normalizeMissionBudget(raw);
  const shares = [normalized.workerShare, normalized.orchestratorReserve];
  const shareError = service.validateShareSum(shares);
  if (shareError) throw invalid(shareError, 'BUDGET_INVALID');
  return normalized;
}

function summarizeUsage(workflow) {
  return workflow.completed.reduce((usage, receipt) => {
    const value = receipt.result?.usage || receipt.result?.output?.usage || {};
    usage.tokens += Number(value.tokens) || 0;
    usage.costUsd += Number(value.costUsd) || 0;
    usage.events += 1;
    return usage;
  }, { tokens: 0, costUsd: 0, events: 0 });
}

function assertWithinBudget(usage, budget, elapsed) {
  if (usage.tokens > budget.tokens || usage.costUsd > budget.costUsd
    || usage.events > budget.events || elapsed > budget.latencyMs) {
    throw invalid('Mission execution exceeded its configured budget.', 'BUDGET_EXHAUSTED');
  }
}

async function runWorkflow(db, context) {
  const { session, input, deadline } = context;
  const selected = await controller.selectPersistentVariant(db, {
    holobiontId: session.holobiontId, expectedSessionRevision: session.revision,
    variantId: input.variantId, fitContext: input.fitContext || {}, actorId: input.actorId,
    approveChange: input.approveVariantChange
  });
  const workflowPromise = controller.runPersistentVariantWorkflow(db, {
    holobiontId: session.holobiontId, expectedSessionRevision: selected.sessionRevision,
    actorId: input.actorId, signal: deadline.signal,
    evidenceRefs: input.evidenceRefs, verifyEvaluationEvidence: input.verifyEvaluationEvidence,
    steps: input.variantOperations
  });
  const workflow = await awaitBeforeDeadline(workflowPromise, deadline.signal);
  if (workflow.status !== 'COMPLETED') throw invalid('Variant workflow stopped before all steps completed.', 'HOLOBIONT_WORKFLOW_FAILED');
  return { selected, workflow };
}

async function independentVerdict(context) {
  const { input, workflow, refs, signal } = context;
  const verifierIds = distinctVerifierIds(input.verifierIds);
  if (verifierIds.length < 2 || typeof input.verifyMission !== 'function') {
    return { verdict: 'INCONCLUSIVE', verifierIds,
      reason: 'Two independent verifier IDs and an executable mission verifier are required.' };
  }
  const verdict = await awaitBeforeDeadline(input.verifyMission({ missionId: input.missionId,
    variantId: input.variantId, workflow, evidenceRefs: refs, verifierIds, signal }), signal);
  const independent = distinctVerifierIds(verdict?.verifierIds);
  const assertions = Array.isArray(verdict?.assertions) ? verdict.assertions : [];
  const valid = verdict?.verdict === 'PASS' && independentVerifiers(independent, verifierIds)
    && assertionsPass(assertions, refs);
  return { verdict: valid ? 'PASS' : verdict?.verdict === 'FAIL' ? 'FAIL' : 'INCONCLUSIVE',
    verifierIds: independent, assertions, reason: valid ? null : verdict?.reason || 'Independent verification did not satisfy every assertion.' };
}

function distinctVerifierIds(values) {
  return [...new Set((values || []).map((item) => String(item).trim()).filter(Boolean))];
}

function assertionsPass(assertions, refs) {
  return assertions.length > 0 && assertions.every((item) => item.status === 'PASS'
    && Array.isArray(item.evidenceRefs) && item.evidenceRefs.length > 0
    && item.evidenceRefs.every((ref) => refs.includes(ref)));
}

function independentVerifiers(actual, declared) {
  return actual.length >= 2 && actual.every((id) => declared.includes(id));
}

function prepareMission(input) {
  const runId = input.runId || randomUUID();
  const budget = budgetResult(input);
  if (!Array.isArray(input.variantOperations) || !input.variantOperations.length) {
    throw invalid('At least one variant operation is required.');
  }
  if (input.variantOperations.length + 4 > budget.events) throw invalid('Workflow and telemetry exceed the event budget.', 'BUDGET_EXHAUSTED');
  const deadline = createDeadline(input, budget);
  const telemetry = input.telemetry || require('../../telemetryObserver');
  return { input, runId, budget, deadline, telemetry };
}

function preflightVariantMission(input = {}) {
  const blockers = [];
  const budget = preflightBudget(input, blockers);
  validateMissionIdentity(input, blockers);
  if (!Array.isArray(input.variantOperations) || input.variantOperations.length === 0) {
    blockers.push('At least one variant operation is required.');
  } else {
    validatePreflightOperations(input, budget, blockers);
  }
  validateProofAdapters(input, blockers);
  validateVariantFit(input, blockers);
  return { ready: blockers.length === 0, blockers,
    missionId: input.missionId || null, hostId: input.hostId || null,
    variantId: input.variantId || null,
    operations: (Array.isArray(input.variantOperations) ? input.variantOperations : []).map((step) => step?.operation || null),
    verifierCount: distinctVerifierIds(input.verifierIds).length };
}

function preflightBudget(input, blockers) {
  try { return budgetResult(input); } catch (error) { blockers.push(error.message); return null; }
}

function validateMissionIdentity(input, blockers) {
  for (const field of ['missionId', 'hostId']) {
    try { requiredText(input[field], field); } catch (error) { blockers.push(error.message); }
  }
}

function validateProofAdapters(input, blockers) {
  if (typeof input.verifyEvaluationEvidence !== 'function') blockers.push('verifyEvaluationEvidence adapter is required.');
  if (typeof input.verifyMission !== 'function') blockers.push('verifyMission adapter is required for a PASS verdict.');
  if (distinctVerifierIds(input.verifierIds).length < 2) blockers.push('Two distinct verifier IDs are required for a PASS verdict.');
}

function validateVariantFit(input, blockers) {
  try {
    const fit = require('./index').getVariant(input.variantId).analyzeFit(input.fitContext || {});
    if (!fit.compatible) blockers.push(`Variant is incompatible: ${fit.reasons.join(', ')}.`);
  } catch (error) { blockers.push(error.message); }
}

function validatePreflightOperations(input, budget, blockers) {
  validateWorkflowLimits(input, budget, blockers);
  const allowed = allowedOperations(input.variantId);
  input.variantOperations.forEach((step, index) => validateOperation({ step, index,
    variantId: input.variantId, allowed, blockers }));
}

function validateWorkflowLimits(input, budget, blockers) {
  if (input.variantOperations.length > 32) blockers.push('Workflow cannot exceed 32 operations.');
  if (budget && input.variantOperations.length + 4 > budget.events) blockers.push('Workflow and telemetry exceed the event budget.');
}

function allowedOperations(variantId) {
  try { return require('./variantRuntimeController').OPERATIONS[variantId] || []; } catch { return []; }
}

function validateOperation(context) {
  const { step, index, variantId, allowed, blockers } = context;
  if (!step || typeof step !== 'object' || Array.isArray(step) || typeof step.operation !== 'string') {
    blockers.push(`Operation ${index + 1} must declare an operation name.`);
    return;
  }
  const procedural = variantId === 'procedural'
    && ['createSymbiosisContract', 'startSymbiontAdmission', 'evaluateSymbiontTrial'].includes(step.operation);
  if (!allowed.includes(step.operation) && !procedural) {
    blockers.push(`Operation '${step.operation}' is not available for variant '${variantId}'.`);
  }
}

function assertPreflightReady(input) {
  const report = preflightVariantMission(input);
  if (!report.ready) throw Object.assign(new Error(`Mission preflight blocked: ${report.blockers.join(' ')}`), {
    code: 'HOLOBIONT_PREFLIGHT_BLOCKED', blockers: report.blockers
  });
  return report;
}

async function runVariantMission(db, input = {}) {
  return executeWithCleanup(db, prepareMission(input));
}

async function executeWithCleanup(db, context) {
  try {
    return await executeMission(db, context);
  } finally {
    context.deadline.clear();
  }
}

async function executeMission(db, context) {
  const { input, runId, budget, deadline, telemetry } = context;
  emitRunEvent(telemetry, input, { eventType: 'HOLO_RUN_CREATED', runId, action: 'RUN_CREATED' });
  try {
    await migrate(db);
    const opened = await openMissionHost(db, input);
    const { selected, workflow } = await runWorkflow(db, { session: opened.session, input, deadline });
    emitRunEvent(telemetry, input, { eventType: 'HOLO_VARIANT_SELECTED', runId,
      action: 'VARIANT_SELECTED', hostId: opened.session.hostId, variantId: selected.variantId });
    const result = await verifiedMissionResult({ input, runId, budget, deadline, opened, selected, workflow });
    emitRunEvent(telemetry, input, { eventType: 'HOLO_VERIFICATION_COMPLETED', runId,
      action: 'MISSION_VERIFIED', verdict: result.verdict, verifierIds: result.verifierIds });
    emitRunEvent(telemetry, input, { eventType: 'HOLO_RUN_TERMINAL', runId,
      action: result.verdict, verdict: result.verdict, evidenceCount: result.evidenceRefs.length });
    return result;
  } catch (error) {
    emitRunEvent(telemetry, input, { eventType: 'HOLO_RUN_TERMINAL', runId,
      action: error.code === 'BUDGET_EXHAUSTED' ? 'BUDGET_EXHAUSTED' : 'BLOCKED', code: error.code || null });
    throw error;
  }
}

async function verifiedMissionResult(context) {
  const { input, runId, budget, deadline, opened, selected, workflow } = context;
  const usage = summarizeUsage(workflow);
  usage.events += 4;
  const refs = [...new Set([...evidenceRefs(workflow), ...(input.evidenceRefs || [])])];
  const verification = await independentVerdict({ input, workflow, refs, signal: deadline.signal });
  const elapsed = Date.now() - deadline.startedAt;
  assertWithinBudget(usage, budget, elapsed);
  return { schema: 'genos.holobiont-mission-run/v1', runId, missionId: input.missionId,
    holobiontId: opened.session.holobiontId, hostId: opened.session.hostId,
    persistentHost: input.persistentHost === true, hostReused: opened.reused,
    topology: { id: 'holobionte', variant: selected.variantId },
    usage: { ...usage, latencyMs: elapsed }, budget, workflow, evidenceRefs: refs, ...verification };
}

function emitRunEvent(telemetry, input, event) {
  telemetry.emitEvent({ eventType: event.eventType, agentId: input.actorId || 'holobionte-runtime',
    action: event.action, detail: event.verdict || event.code || event.variantId || event.action,
    severity: event.code ? 'warning' : 'info', payload: event });
}

module.exports = { runVariantMission, preflightVariantMission, assertPreflightReady };
