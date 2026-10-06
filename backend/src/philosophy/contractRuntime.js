'use strict';

const { evaluatePredicate } = require('./operationalPredicates');
const { executionErrors } = require('./contractOperationalization');
const { digest, contractFingerprint } = require('./contractFingerprint');

function assertInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('observation object required');
  if (Buffer.byteLength(JSON.stringify(input)) > 128 * 1024) throw new Error('observation budget exceeded');
}

function assess(contract, input) {
  assertInput(input);
  const errors = executionErrors(contract);
  if (errors.length) throw new Error(errors.join('; '));
  const { field, predicate } = contract.execution;
  const value = Object.hasOwn(input, field) ? input[field] : undefined;
  const verdict = evaluatePredicate(predicate, value);
  return { contractId: contract.id, field, predicate, ...verdict, externalFactsVerified: false };
}

function boundedState(state) {
  const value = state === undefined ? {} : state;
  assertInput(value);
  return structuredClone(value);
}

function applyAssessment(state, assessment, contract) {
  const { contractId, status, field } = assessment;
  state.assessments = { ...state.assessments, [contractId]: assessment };
  const tasks = (state.verificationTasks || []).filter((task) => task.contractId !== contractId);
  const caveats = (state.responseCaveats || []).filter((item) => item.contractId !== contractId);
  if (status !== 'satisfied') {
    tasks.push({ contractId, field, operation: 'verify-declared-observation', reason: status });
    caveats.push({ contractId, text: contract.interpretation, observationStatus: status });
  }
  state.verificationTasks = tasks;
  state.responseCaveats = caveats;
  state.activeUncertainties = tasks.map((task) => ({ contractId: task.contractId, field: task.field }));
  // This barrier can only restrict; it never grants permission. Descriptive
  // lenses stay advisory even when their declared criterion is not satisfied.
  if (contract.id.startsWith('core.') && status !== 'satisfied') state.promotionHeld = true;
  return state;
}

function execute(contract, request = {}) {
  const input = request.observations === undefined ? {} : request.observations;
  const before = boundedState(request.state);
  const assessment = assess(contract, input);
  const enabled = request.enabled !== false;
  const after = enabled ? applyAssessment(structuredClone(before), assessment, contract) : structuredClone(before);
  assertInput(after);
  return {
    contractId: contract.id, contractHash: contractFingerprint(contract), enabled,
    inputHash: digest(input), before, after, assessment,
    behaviorChanged: digest(before) !== digest(after), runtimeAuthority: false,
    promotionEligible: false, sourceFactsVerified: false,
  };
}

function executeSelection(contracts, request = {}) {
  if (!Array.isArray(contracts) || contracts.length > 375) throw new Error('bounded contract selection required');
  let state = boundedState(request.state);
  const executions = [];
  for (const contract of contracts) {
    const result = execute(contract, { ...request, state });
    state = result.after;
    executions.push(result);
  }
  return { state, executions, promotionEligible: false, sourceFactsVerified: false };
}

module.exports = { assess, execute, executeSelection };
