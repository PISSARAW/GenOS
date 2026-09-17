'use strict';

/** Pure evaluators for rights, contract and distributive justice. */

function requireObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`justiceEthicsService.${name} requires an object`);
  }
}

function number(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function evaluateRawlsianJustice({ distribution, veilOfIgnorance = true, maximin = true }) {
  requireObject(distribution, 'evaluateRawlsianJustice');
  const values = Object.values(distribution).map((value) => Math.max(0, number(value)));
  if (!values.length) throw new Error('distribution must contain at least one party');
  const worstOff = Math.min(...values);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    framework: 'rawlsian-justice', distribution, originalPosition: veilOfIgnorance === true,
    maximinPrinciple: maximin === true, worstOff, average,
    verdict: veilOfIgnorance && maximin ? 'evaluated-from-worst-off-position' : 'incomplete-rawlsian-test',
    executable: false,
  };
}

function evaluateDistributiveJustice({ allocations, principle = 'equality', sufficientLevel = 0 }) {
  requireObject(allocations, 'evaluateDistributiveJustice');
  const values = Object.values(allocations).map((value) => Math.max(0, number(value)));
  if (!values.length) throw new Error('allocations must contain at least one party');
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const sufficient = minimum >= number(sufficientLevel);
  return {
    framework: 'distributive-justice', principle, allocations,
    equalityScore: maximum === 0 ? 1 : 1 - (maximum - minimum) / maximum,
    sufficient, prioritarianConcern: minimum,
    verdict: principle === 'sufficientarianism' ? (sufficient ? 'sufficient' : 'insufficient') : 'requires-principle-judgment',
    mean, executable: false,
  };
}

function evaluateRights({ action, rights = [], infringements = [] }) {
  if (!action) throw new Error('justiceEthicsService.evaluateRights requires an action');
  if (!Array.isArray(rights) || !Array.isArray(infringements)) throw new Error('rights and infringements must be arrays');
  return {
    framework: 'natural-and-human-rights', action, rights, infringements,
    rightsRespected: infringements.length === 0,
    verdict: infringements.length === 0 ? 'rights-compatible' : 'rights-infringing', executable: false,
  };
}

function evaluateSocialContract({ theorist = 'rawls', consent = true, mutualBenefit = true, coercion = false, protections = [] }) {
  const legitimate = consent && mutualBenefit && !coercion;
  return {
    framework: 'social-contract', theorist, consent, mutualBenefit, coercion, protections,
    legitimacy: legitimate ? 'legitimate-by-contract' : 'contractually-contested',
    executable: false,
  };
}

function evaluateLibertarianEntitlement({ acquisition = true, transfer = true, rectification = true, coercion = false, fraud = false }) {
  const valid = acquisition && transfer && rectification && !coercion && !fraud;
  return {
    framework: 'libertarian-entitlement', sideConstraints: true,
    acquisition, transfer, rectification, coercion, fraud,
    verdict: valid ? 'entitled' : 'entitlement-violation', executable: false,
  };
}

module.exports = { evaluateRawlsianJustice, evaluateDistributiveJustice, evaluateRights, evaluateSocialContract, evaluateLibertarianEntitlement };
