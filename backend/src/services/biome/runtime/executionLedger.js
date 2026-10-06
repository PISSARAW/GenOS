'use strict';

const crypto = require('node:crypto');
const { RESOURCE_KEYS } = require('../constants');
const { createResourceVector } = require('../contracts/resourceVector');
const { retain } = require('./ecologicalArchive');

function reserve(session, request) {
  const runtime = session.ecology.ecologicalState.runtime;
  if (!runtime) throw failure('BIOME_EXECUTION_NOT_READY', 'An ecological cycle must prepare the execution.');
  const signature = digest(request);
  const previous = runtime.executions?.[request.executionId];
  if (previous) {
    if (previous.signature !== signature) throw failure('BIOME_EXECUTION_ID_CONFLICT', 'Execution identity has already been used for another request.');
    return { reserved: false, execution: previous };
  }
  assertRunning(runtime);
  const population = session.ecology.populations.find(p => p.populationId === request.populationId);
  const individual = population?.individuals.find(i => i.individualId === request.individualId);
  if (!individual || individual.status !== 'active' || ['extinct', 'dormant'].includes(population.status)) throw failure('BIOME_INDIVIDUAL_UNKNOWN', 'An active individual is required for execution.');
  if (!individual.capabilities.includes(request.capability)) throw failure('BIOME_CAPABILITY_REQUIRED', 'The individual lacks the requested capability.');
  const resources = createResourceVector(request.resources);
  checkAvailable(population, resources);
  const nextUsed = reservedBudget(runtime, resources);
  for (const key of RESOURCE_KEYS) population.resourcePool[key] -= resources[key];
  runtime.budgetUsed = nextUsed;
  const execution = { executionId: request.executionId, populationId: request.populationId,
    individualId: request.individualId, providerId: request.providerId, capability: request.capability,
    signature, reserved: resources, status: 'running', tick: runtime.tick };
  runtime.executions = { ...runtime.executions, [request.executionId]: execution };
  updatePatchExecution(session, request.executionId, execution.status);
  return { reserved: true, execution, profile: { phenotype: individual.phenotype, cognitiveRecipe: individual.cognitiveRecipe, patchId: individual.patchId }, action: { type: 'BIOME_EXECUTION_RESERVED', status: 'applied', executionId: request.executionId } };
}

function assertRunning(runtime) {
  const stopped = ['goal_achieved', 'budget_exhausted', 'extinction_event', 'cancelled', 'deadline_reached', 'sterility_limit'].includes(runtime.stopCondition);
  if (stopped) throw failure('BIOME_RUNTIME_STOPPED', runtime.stopCondition);
}

function updatePatchExecution(session, executionId, status) {
  const state = session.ecology.ecologicalState;
  state.patchExecutions = (state.patchExecutions || []).map(item => item.actionId === executionId
    ? { ...item, executionId, status } : item);
}

function reservedBudget(runtime, resources) {
  const nextUsed = runtime.budgetUsed + resources.tokens;
  if (runtime.budgetTotal !== undefined && nextUsed > runtime.budgetTotal) throw failure('BIOME_BUDGET_EXCEEDED', 'Execution reservation exceeds the mission budget.');
  return nextUsed;
}

function complete(session, outcome) {
  const runtime = session.ecology.ecologicalState.runtime;
  const execution = runtime.executions?.[outcome.executionId];
  if (!execution || execution.status !== 'running') throw failure('BIOME_EXECUTION_STATE_INVALID', 'Completion requires a running execution.');
  const consumed = outcome.failed ? execution.reserved : createResourceVector(outcome.consumed ?? execution.reserved);
  const exceeded = RESOURCE_KEYS.some(key => consumed[key] > execution.reserved[key]);
  const failed = Boolean(outcome.failed || exceeded);
  const billed = consumed;
  refund(session, execution, billed);
  const verified = !failed && validVerification(session, execution, outcome);
  const completed = completionRecord(execution, outcome, { failed, verified, billed, exceeded });
  runtime.executions[outcome.executionId] = completed;
  updatePatchExecution(session, outcome.executionId, completed.status);
  if (verified) archiveResult(session, completed, outcome);
  if (runtime.budgetTotal !== undefined && runtime.budgetUsed >= runtime.budgetTotal) runtime.stopCondition = 'budget_exhausted';
  return { execution: completed, action: { type: 'BIOME_EXECUTION_COMPLETED',
    status: completed.status, executionId: execution.executionId } };
}

function completionRecord(execution, outcome, status) {
  return { ...execution, status: outcome.indeterminate ? 'indeterminate' : status.failed ? 'failed' : status.verified ? 'verified' : 'unverified',
    consumed: status.billed, output: outcome.output ?? null, outputDigest: outcome.outputDigest || null,
    evidenceRefs: status.verified ? outcome.verification.evidenceRefs : [],
    error: outcome.error || (status.exceeded ? 'Actual consumption exceeded its reservation.' : null) };
}

function checkAvailable(population, resources) {
  if (RESOURCE_KEYS.some(key => resources[key] > population.resourcePool[key])) {
    throw failure('BIOME_RESOURCE_INSUFFICIENT', 'The population cannot reserve the requested resources.');
  }
}

function refund(session, execution, consumed) {
  const population = session.ecology.populations.find(p => p.populationId === execution.populationId);
  const target = population?.resourcePool || session.ecology.resourcePool;
  const runtime = session.ecology.ecologicalState.runtime;
  for (const key of RESOURCE_KEYS) {
    const balance = target[key] + execution.reserved[key] - consumed[key];
    if (balance < 0) runtime.resourceDebt = { ...runtime.resourceDebt, [key]: (runtime.resourceDebt?.[key] || 0) - balance };
    target[key] = Math.max(0, balance);
  }
  session.ecology.ecologicalState.runtime.budgetUsed -= execution.reserved.tokens - consumed.tokens;
}

function validVerification(session, execution, outcome) {
  const proof = outcome.verification;
  if (proof?.verified !== true || !Array.isArray(proof.evidenceRefs)) return false;
  const bound = proof.sessionId === session.sessionId && proof.executionId === execution.executionId
    && proof.outputDigest === outcome.outputDigest;
  return bound && proof.evidenceRefs.some(ref => typeof ref === 'string' && ref.trim());
}

function archiveResult(session, execution, outcome) {
  const population = session.ecology.populations.find(p => p.populationId === execution.populationId);
  if (!population) return;
  const quality = Number.isFinite(outcome.quality) ? outcome.quality : 0;
  retain(session.ecology, { id: execution.executionId, nicheId: population.nicheId,
    populationId: population.populationId, quality, novelty: 0, robustness: 0,
    cost: execution.consumed.tokens, evidenceRefs: execution.evidenceRefs, artifact: execution.output });
}

function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function failure(code, message) { return Object.assign(new Error(message), { code }); }

module.exports = { reserve, complete, digest };
