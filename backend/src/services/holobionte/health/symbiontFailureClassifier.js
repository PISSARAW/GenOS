'use strict';

const FAILURE_CLASSES = Object.freeze([
  'INCOMPETENT', 'STALE', 'OVERCONFIDENT', 'RESOURCE_HUNGRY',
  'CONTRACT_VIOLATING', 'COMPROMISED', 'PATHOBIOTIC', 'REDUNDANT', 'DEPENDENCY_RISK'
]);

const RESPONSES = Object.freeze({
  INCOMPETENT: ['WARN', 'THROTTLE'],
  STALE: ['WARN', 'REDUCE_CONTEXT'],
  OVERCONFIDENT: ['WARN', 'RESTRICT_SCOPE'],
  RESOURCE_HUNGRY: ['THROTTLE', 'REDUCE_RESOURCES'],
  CONTRACT_VIOLATING: ['REVOKE_TOOL', 'RESTRICT_SCOPE'],
  COMPROMISED: ['QUARANTINE', 'DORMANT'],
  PATHOBIOTIC: ['QUARANTINE', 'EXPEL'],
  REDUNDANT: ['DORMANT', 'EXPEL'],
  DEPENDENCY_RISK: ['REDUCE_RESOURCES', 'RESTRICT_SCOPE']
});

const FAILURE_RULES = [
  ['COMPROMISED', (signals) => signals.integrityViolation],
  ['PATHOBIOTIC', (signals) => signals.pathobiotic],
  ['CONTRACT_VIOLATING', (signals) => signals.contractViolation],
  ['DEPENDENCY_RISK', (signals) => signals.dependencyScore >= 0.8],
  ['REDUNDANT', (signals) => signals.redundancyScore >= 0.8],
  ['RESOURCE_HUNGRY', (signals) => signals.resourcePressure >= 0.8],
  ['OVERCONFIDENT', (signals) => signals.falseAlertRate >= 0.7],
  ['STALE', (signals) => signals.staleScore >= 0.8],
  ['INCOMPETENT', (signals) => signals.contributionScore < 0.3 || signals.failureRate >= 0.7]
];

function failureError(message, code = 'HOLOBIONT_FAILURE_INVALID') {
  return Object.assign(new Error(message), { code });
}

function finiteScore(value, field, fallback = 0) {
  const score = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(score) || score < 0 || score > 1) {
    throw failureError(`${field} must be between 0 and 1.`);
  }
  return score;
}

function evidenceList(value) {
  const refs = Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : [];
  if (!refs.length) throw failureError('Failure classification requires evidence.', 'HOLOBIONT_EVIDENCE_REQUIRED');
  return [...new Set(refs)];
}

function normalizeSignals(input) {
  return {
    integrityViolation: input.integrityViolation === true,
    contractViolation: input.contractViolation === true,
    pathobiotic: input.pathobiotic === true,
    staleScore: finiteScore(input.staleScore, 'staleScore'),
    falseAlertRate: finiteScore(input.falseAlertRate, 'falseAlertRate'),
    resourcePressure: finiteScore(input.resourcePressure, 'resourcePressure'),
    dependencyScore: finiteScore(input.dependencyScore, 'dependencyScore'),
    redundancyScore: finiteScore(input.redundancyScore, 'redundancyScore'),
    contributionScore: finiteScore(input.contributionScore, 'contributionScore', 1),
    failureRate: finiteScore(input.failureRate, 'failureRate')
  };
}

function selectFailure(signals) {
  return FAILURE_RULES.find(([, matches]) => matches(signals))?.[0] || null;
}

function classifySymbiontFailure(input = {}) {
  const evidenceRefs = evidenceList(input.evidenceRefs);
  const failureClass = selectFailure(normalizeSignals(input));
  if (!failureClass) return { classified: false, failureClass: null, evidenceRefs, recommendedActions: [] };
  return {
    classified: true,
    symbiontId: String(input.symbiontId || '').trim() || null,
    failureClass,
    evidenceRefs,
    recommendedActions: [...RESPONSES[failureClass]]
  };
}

function responseForFailure(failureClass) {
  if (!FAILURE_CLASSES.includes(failureClass)) throw failureError('Unknown symbiont failure class.');
  return [...RESPONSES[failureClass]];
}

module.exports = { FAILURE_CLASSES, classifySymbiontFailure, responseForFailure };
