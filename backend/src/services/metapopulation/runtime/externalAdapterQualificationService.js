'use strict';

function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }

function validViable(evidence) { return typeof evidence?.viable === 'boolean'; }

function validFitness(evidence) {
  const fitness = evidence?.fitness;
  return typeof fitness === 'number' && Number.isFinite(fitness) && fitness >= 0 && fitness <= 1;
}

function validProvenance(evidence) {
  const provenance = evidence?.provenance;
  return isObject(provenance) && Object.keys(provenance).length > 0;
}

function isInvalidShape(result) {
  return !result || typeof result !== 'object' || Array.isArray(result);
}

function hasInvalidFitness(result) {
  const fitness = result?.fitness;
  return typeof fitness !== 'number' || !Number.isFinite(fitness) || fitness < 0 || fitness > 1;
}

function hasInvalidEvidenceRef(result) {
  return typeof result?.evidenceRef !== 'string' || !String(result.evidenceRef).trim();
}

function hasInvalidProvenance(result) {
  const provenance = result?.provenance;
  return !provenance || typeof provenance !== 'object' || Array.isArray(provenance);
}

async function qualifyExternalAdapter(name, adapter, probeInput) {
  probeInput = probeInput || {};
  if (typeof adapter !== 'function') {
    return { name, qualified: false, reason: 'ADAPTER_NOT_FUNCTION' };
  }
  if (name === 'evaluateColonization') {
    return qualifyColonizationEvaluator(adapter, probeInput);
  }
  return { name, qualified: true, reason: null };
}

async function qualifyColonizationEvaluator(evaluator, probeInput) {
  probeInput = probeInput || {};
  let evidence;
  try {
    evidence = await evaluator(probeInput);
  } catch (error) {
    return colonizationFailure(error);
  }
  if (!isObject(evidence)) {
    return { name: 'evaluateColonization', qualified: false, reason: 'INVALID_RESULT' };
  }
  if (!validViable(evidence)) {
    return { name: 'evaluateColonization', qualified: false, reason: 'MISSING_VIABLE' };
  }
  if (!validFitness(evidence)) {
    return { name: 'evaluateColonization', qualified: false, reason: 'INVALID_FITNESS' };
  }
  if (!validProvenance(evidence)) {
    return { name: 'evaluateColonization', qualified: false, reason: 'MISSING_PROVENANCE' };
  }
  return { name: 'evaluateColonization', qualified: true, reason: null };
}

function colonizationFailure(error) {
  return { name: 'evaluateColonization', qualified: false, reason: error.code || error.message || 'ADAPTER_ERROR' };
}

async function qualifyAdapterReceiptReplay(input) {
  input = input || {};
  const adapterName = input.adapterName || 'adapter';
  const invoke = input.invoke;
  const context = input.context || {};
  const idempotencyKey = input.idempotencyKey || 'qualification-replay-key';
  if (typeof invoke !== 'function') {
    return { name: adapterName, qualified: false, reason: 'INVOKER_NOT_FUNCTION' };
  }
  const replay = await invokeTwice(invoke, context, idempotencyKey);
  if (replay.error) {
    return { name: adapterName, qualified: false, reason: replay.error };
  }
  if (!replay.first || !replay.second) {
    return { name: adapterName, qualified: false, reason: 'MISSING_RECEIPT' };
  }
  const replayed = JSON.stringify(replay.first) === JSON.stringify(replay.second);
  return { name: adapterName, qualified: replayed, reason: replayed ? null : 'RECEIPT_NOT_REPLAYED', first: replay.first, second: replay.second };
}

async function invokeTwice(invoke, context, idempotencyKey) {
  try {
    const first = await invoke({ ...context, idempotencyKey });
    const second = await invoke({ ...context, idempotencyKey });
    return { first, second, error: null };
  } catch (error) {
    return { first: null, second: null, error: error.code || error.message || 'ADAPTER_ERROR' };
  }
}

async function qualifySolverAdapter(adapter, probeInput) {
  probeInput = probeInput || {};
  if (typeof adapter !== 'function') return { name: 'solverSearch', qualified: false, reason: 'ADAPTER_NOT_FUNCTION' };
  let result;
  try { result = await adapter(probeInput); } catch (error) {
    return solverFailure(error);
  }
  return validateSolverResult(result);
}

function solverFailure(error) {
  return { name: 'solverSearch', qualified: false, reason: error.code || error.message || 'ADAPTER_ERROR' };
}

function validateSolverResult(result) {
  const required = ['demeId', 'solverId', 'problemRef', 'seed', 'objective', 'incumbentRef', 'evidenceRef', 'provenance'];
  const missing = required.find((field) => result?.[field] === undefined || result?.[field] === null);
  if (missing) {
    return { name: 'solverSearch', qualified: false, reason: 'MISSING_' + missing.toUpperCase() };
  }
  if (typeof result.provenance !== 'object' || Array.isArray(result.provenance)) {
    return { name: 'solverSearch', qualified: false, reason: 'INVALID_PROVENANCE' };
  }
  return { name: 'solverSearch', qualified: true, reason: null };
}

async function qualifyFitnessEvaluator(evaluator, probeInput) {
  probeInput = probeInput || {};
  if (typeof evaluator !== 'function') return { name: 'fitnessEvaluator', qualified: false, reason: 'ADAPTER_NOT_FUNCTION' };
  let result;
  try { result = await evaluator(probeInput); } catch (error) {
    return fitnessFailure(error);
  }
  return validateFitnessResult(result);
}

function fitnessFailure(error) {
  return { name: 'fitnessEvaluator', qualified: false, reason: error.code || error.message || 'ADAPTER_ERROR' };
}

function validateFitnessResult(result) {
  if (isInvalidShape(result)) {
    return { name: 'fitnessEvaluator', qualified: false, reason: 'INVALID_RESULT' };
  }
  if (hasInvalidFitness(result)) {
    return { name: 'fitnessEvaluator', qualified: false, reason: 'INVALID_FITNESS' };
  }
  if (hasInvalidEvidenceRef(result)) {
    return { name: 'fitnessEvaluator', qualified: false, reason: 'MISSING_EVIDENCE_REF' };
  }
  if (hasInvalidProvenance(result)) {
    return { name: 'fitnessEvaluator', qualified: false, reason: 'MISSING_PROVENANCE' };
  }
  return { name: 'fitnessEvaluator', qualified: true, reason: null };
}

module.exports = { qualifyExternalAdapter, qualifyColonizationEvaluator, qualifyAdapterReceiptReplay, qualifySolverAdapter, qualifyFitnessEvaluator };
