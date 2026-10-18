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

async function qualifyExternalAdapter(name, adapter, probeInput = {}) {
  if (typeof adapter !== 'function') {
    return { name, qualified: false, reason: 'ADAPTER_NOT_FUNCTION' };
  }
  if (name === 'evaluateColonization') {
    return qualifyColonizationEvaluator(adapter, probeInput);
  }
  return { name, qualified: true, reason: null };
}

async function qualifyColonizationEvaluator(evaluator, probeInput) {
  let evidence;
  try {
    evidence = await evaluator(probeInput);
  } catch (error) {
    return { name: 'evaluateColonization', qualified: false, reason: error.code || error.message || 'ADAPTER_ERROR' };
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

module.exports = { qualifyExternalAdapter, qualifyColonizationEvaluator };