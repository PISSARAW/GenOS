'use strict';

const WEIGHTS = Object.freeze({
  capabilityFit: 0.3,
  reliability: 0.15,
  evidenceQuality: 0.15,
  historicalCompatibility: 0.1,
  replaceability: 0.1,
  cost: 0.05,
  risk: 0.05,
  dependencyRisk: 0.1
});

const RISK_LIMITS = Object.freeze({ LOW: 0.3, MEDIUM: 0.6, HIGH: 1 });

function bounded(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) {
    throw Object.assign(new Error(`${field} must be between 0 and 1.`), { code: 'HOLOBIONT_PARTNER_SCORE_INVALID' });
  }
  return number;
}

function capabilitySet(value) {
  if (!Array.isArray(value)) throw Object.assign(new Error('capabilities must be an array.'), { code: 'HOLOBIONT_PARTNER_INPUT_INVALID' });
  return new Set(value.map((item) => String(item).trim()).filter(Boolean));
}

function capabilityFit(gap, candidate) {
  const needed = capabilitySet(gap.requiredCapabilities);
  if (needed.size === 0) throw Object.assign(new Error('At least one capability gap is required.'), { code: 'HOLOBIONT_PARTNER_GAP_REQUIRED' });
  const offered = capabilitySet(candidate.capabilities);
  const matched = [...needed].filter((capability) => offered.has(capability));
  return { score: matched.length / needed.size, matched, missing: [...needed].filter((item) => !offered.has(item)) };
}

function metric(candidate, name, fallback = 0.5) {
  return bounded(candidate[name] === undefined ? fallback : candidate[name], name);
}

function candidateVector(gap, candidate) {
  const fit = capabilityFit(gap, candidate);
  return {
    capabilityFit: fit.score,
    reliability: metric(candidate, 'reliability'),
    evidenceQuality: metric(candidate, 'evidenceQuality'),
    historicalCompatibility: metric(candidate, 'historicalCompatibility'),
    replaceability: metric(candidate, 'replaceability'),
    cost: metric(candidate, 'cost'),
    risk: metric(candidate, 'risk'),
    dependencyRisk: metric(candidate, 'dependencyRisk'),
    matchedCapabilities: fit.matched,
    missingCapabilities: fit.missing
  };
}

function totalScore(vector) {
  const benefits = vector.capabilityFit * WEIGHTS.capabilityFit
    + vector.reliability * WEIGHTS.reliability
    + vector.evidenceQuality * WEIGHTS.evidenceQuality
    + vector.historicalCompatibility * WEIGHTS.historicalCompatibility
    + vector.replaceability * WEIGHTS.replaceability;
  const penalties = vector.cost * WEIGHTS.cost
    + vector.risk * WEIGHTS.risk
    + vector.dependencyRisk * WEIGHTS.dependencyRisk;
  return Math.round((benefits - penalties) * 10000) / 10000;
}

function ineligibilityReasons(candidate, vector, constitution) {
  const reasons = [];
  const riskLimit = RISK_LIMITS[constitution.riskTolerance] || RISK_LIMITS.MEDIUM;
  if (candidate.status === 'QUARANTINED' || candidate.status === 'REJECTED') reasons.push('CANDIDATE_UNAVAILABLE');
  if (vector.capabilityFit === 0) reasons.push('NO_CAPABILITY_MATCH');
  if (vector.risk > riskLimit) reasons.push('RISK_TOLERANCE_EXCEEDED');
  if (vector.dependencyRisk > constitution.maxDependencyPerSymbiont) reasons.push('DEPENDENCY_CEILING_EXCEEDED');
  return reasons;
}

function rankCandidates(input = {}) {
  const { constitution, gap } = input;
  if (!constitution || !Array.isArray(input.candidates)) {
    throw Object.assign(new Error('constitution and candidates are required.'), { code: 'HOLOBIONT_PARTNER_INPUT_INVALID' });
  }
  const ranked = input.candidates.map((candidate) => {
    const vector = candidateVector(gap, candidate);
    const reasons = ineligibilityReasons(candidate, vector, constitution);
    return {
      symbiontId: String(candidate.id || ''), eligible: reasons.length === 0,
      reasons, vector, score: totalScore(vector)
    };
  });
  return ranked.sort((left, right) => Number(right.eligible) - Number(left.eligible)
    || right.score - left.score || left.symbiontId.localeCompare(right.symbiontId));
}

module.exports = { rankCandidates, WEIGHTS, RISK_LIMITS };
