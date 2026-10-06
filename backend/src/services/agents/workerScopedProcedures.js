'use strict';

const { runProcedure, SUPPORTED } = require('./deterministicWorkerProcedures');
const { methodInput, error, text, list, resultReport } = require('./workerNativeEvidence');

function assertProcedure(procedure) {
  if (procedure?.version !== 1 || !SUPPORTED.has(procedure.methodId)) {
    throw error('WORKER_EXECUTOR_UNAVAILABLE', 'A registered deterministic procedure is required.');
  }
  if (!procedure.parameters || typeof procedure.parameters !== 'object') {
    throw error('WORKER_PROCEDURE_INPUT_INVALID', 'Procedure parameters are required.');
  }
  return true;
}

function assertScopedInput(method) {
  const input = methodInput(method, 'scoped_procedure');
  assertProcedure(input.procedure);
  return true;
}

function assignedScope(mission) {
  const scope = mission.workerContract?.mission?.scope;
  if (!text(scope, 32768)) throw error('WORKER_SCOPE_REQUIRED', 'Execution requires a persisted scope.');
  return scope;
}

function runScoped(method, context) {
  assertScopedInput(method);
  const scopeRef = assignedScope(context.mission);
  const result = runProcedure(method.parameters.procedure);
  const output = { procedureReceipt: result.receipt, result: result.output,
    scopeCompletion: { scopeRef, completedRefs: [result.receipt.id] } };
  return resultReport(method, output, { type: 'dossier',
    statement: `Scoped procedure '${result.methodId}' completed in '${scopeRef}'.`, sourceRefs: [result.receipt.id] });
}

function assertNicheInput(method) {
  const input = methodInput(method, 'niche_procedure');
  if (!text(input.niche, 128)) throw error('SPECIALIST_NICHE_REQUIRED', 'A declared niche is required.');
  assertProcedure(input.procedure);
  return true;
}

function runNiche(method, context) {
  assertNicheInput(method);
  const { niche, procedure } = method.parameters;
  const expected = context.mission.workerContract?.mission?.specialtyNiche;
  if (niche !== expected) throw error('SPECIALIST_NICHE_MISMATCH', 'Procedure is outside the assigned niche.');
  assignedScope(context.mission);
  const result = runProcedure(procedure);
  return resultReport(method, { result: result.output, procedureReceipt: result.receipt,
    specialtyAssessment: { niche, inScope: true, evidence: [result.receipt.id] } },
  { type: 'dossier', statement: `Procedure executed within declared niche '${niche}'.`, sourceRefs: [result.receipt.id] });
}

function assertHostInput(method) {
  const input = methodInput(method, 'host_procedure');
  if (input.capability !== 'deterministic_procedure') {
    throw error('SYMBIOTIC_HOST_CONTRACT_INVALID', 'This executor requires deterministic_procedure.');
  }
  assertProcedure(input.procedure);
  return true;
}

function runHost(method, context) {
  assertHostInput(method);
  const host = context.mission.workerContract?.mission;
  if (!text(host?.hostContractId) || !host.hostCapabilities?.includes('deterministic_procedure')) {
    throw error('SYMBIOTIC_HOST_CONTRACT_INVALID', 'The host has not granted this procedure capability.');
  }
  const result = runProcedure(method.parameters.procedure);
  return resultReport(method, { result: result.output, procedureReceipt: result.receipt,
    hostContribution: { hostContractId: host.hostContractId, capability: 'deterministic_procedure',
      contractCompliant: true, evidence: [result.receipt.id] } },
  { type: 'dossier', statement: 'Host-authorized deterministic procedure completed.', sourceRefs: [result.receipt.id] });
}

function validTrial(trial) {
  return ['controlled_probe', 'causal_bisection'].includes(trial?.strategy)
    && trial.procedure?.methodId === 'lpt';
}

function assertAdaptiveInput(method) {
  const input = methodInput(method, 'adapt_procedure');
  if (!list(input.trials, validTrial, 20)) {
    throw error('WORKER_ADAPTATION_INVALID', 'Use 1-20 LPT trials with allowed strategies.');
  }
  input.trials.forEach((trial) => assertProcedure(trial.procedure));
  const baseline = JSON.stringify(input.trials[0].procedure.parameters);
  if (input.trials.some((trial) => JSON.stringify(trial.procedure.parameters) !== baseline)) {
    throw error('WORKER_ADAPTATION_INVALID', 'Trials must preserve the same assigned problem.');
  }
  return true;
}

function assertTrialBudget(trials, limits) {
  if (trials.length > limits.maxIterations) throw error('WORKER_ITERATION_LIMIT', 'Trial budget exceeded.');
  const changes = trials.slice(1).filter((trial, i) => trial.strategy !== trials[i].strategy).length;
  if (changes > limits.maxStrategyChanges) throw error('WORKER_STRATEGY_LIMIT', 'Strategy-change budget exceeded.');
}

function runAdaptive(method, context) {
  assertAdaptiveInput(method);
  assignedScope(context.mission);
  const trials = method.parameters.trials;
  assertTrialBudget(trials, context.mission.workerContract.limits);
  const executions = trials.map((trial) => ({ strategy: trial.strategy, ...runProcedure(trial.procedure) }));
  const strategyTrace = executions.map((execution, index) => ({ strategy: execution.strategy,
    decision: index > 0 && execution.strategy !== executions[index - 1].strategy ? 'changed' : 'retained',
    reason: `Controlled trial ${index + 1}; observed makespan ${execution.output.makespan}.`,
    evidence: [execution.receipt.id] }));
  const selected = executions.reduce((best, item) => item.output.makespan < best.output.makespan ? item : best);
  return resultReport(method, { strategyTrace, result: selected.output,
    trialReceipts: executions.map((item) => item.receipt) }, { type: 'dossier',
    statement: `${executions.length} bounded strategy trials executed; best observed makespan ${selected.output.makespan}.`,
    sourceRefs: executions.map((item) => item.receipt.id) });
}

module.exports = { assertScopedInput, runScoped, assertNicheInput, runNiche,
  assertHostInput, runHost, assertAdaptiveInput, runAdaptive };
