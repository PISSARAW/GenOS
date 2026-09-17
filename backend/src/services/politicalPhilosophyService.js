'use strict';

/**
 * Political philosophy evaluators.
 *
 * These functions expose analytical frames only. They never authorize an
 * action, promote a decision or replace the runtime's evidence gates.
 */

const clamp = (value, fallback = 0) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
};

function requireObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`politicalPhilosophyService.${name} requires an object`);
  }
}

function mean(values) {
  const scores = values.map((value) => clamp(value));
  return scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : 0;
}

function analyticalResult(framework, observations, limitations = []) {
  return {
    framework,
    observations,
    limitations,
    executable: false,
    evidenceRequired: true,
  };
}

function classifyRegime({ participation = {}, coercion = {}, pluralism = {}, accountability = {} } = {}) {
  const features = {
    participation: clamp(participation.score),
    coercion: clamp(coercion.score),
    pluralism: clamp(pluralism.score),
    accountability: clamp(accountability.score),
  };
  const democratic = mean([features.participation, features.pluralism, features.accountability]);
  const coercive = features.coercion >= 0.7;
  const classification = coercive && democratic < 0.4
    ? 'authoritarian-or-dictatorial'
    : democratic >= 0.7 ? 'democratic' : 'hybrid-or-contested';
  return analyticalResult('regime-classification', { features, democraticScore: democratic, classification });
}

function assessLegitimacy({ consent = 0, legality = 0, rightsProtection = 0, publicJustification = 0 } = {}) {
  const dimensions = { consent: clamp(consent), legality: clamp(legality), rightsProtection: clamp(rightsProtection), publicJustification: clamp(publicJustification) };
  return analyticalResult('political-legitimacy', { dimensions, legitimacyScore: mean(Object.values(dimensions)) });
}

function analyzeSocialContract({ framework = 'general', consent = 0, obligations = [], protections = [] } = {}) {
  return analyticalResult('social-contract', {
    framework,
    consent: clamp(consent),
    reciprocalObligations: obligations,
    protections,
    reciprocity: obligations.length > 0 && protections.length > 0,
  });
}

function compareLibertyAuthority({ libertyRisks = [], authorityClaims = [], safeguards = [] } = {}) {
  return analyticalResult('liberty-authority', {
    libertyRisks,
    authorityClaims,
    safeguards,
    safeguarded: safeguards.length > 0,
    balance: safeguards.length >= authorityClaims.length ? 'constrained-authority' : 'authority-dominant',
  });
}

function assessPowerSeparation({ branches = [], checks = [], independence = [] } = {}) {
  return analyticalResult('separation-of-powers', {
    branches,
    checks,
    independence,
    checksAndBalances: checks.length > 0,
    functionalDifferentiation: branches.length >= 2,
  });
}

function analyzeDemocraticParticipation({ mode = 'representative', participationRate = 0, deliberation = 0, inclusion = 0 } = {}) {
  const dimensions = { participationRate: clamp(participationRate), deliberation: clamp(deliberation), inclusion: clamp(inclusion) };
  return analyticalResult('democratic-participation', { mode, dimensions, participationQuality: mean(Object.values(dimensions)) });
}

function assessPluralism({ groups = [], concentration = 0, contestability = 0 } = {}) {
  return analyticalResult('political-pluralism', {
    groups,
    concentration: clamp(concentration),
    contestability: clamp(contestability),
    pluralismScore: mean([1 - clamp(concentration), clamp(contestability), groups.length ? 1 : 0]),
  });
}

function assessCivilDisobedience({ injustice = 0, publicity = 0, nonviolence = 0, lastResort = 0, legalRisk = 0 } = {}) {
  const conditions = { injustice: clamp(injustice), publicity: clamp(publicity), nonviolence: clamp(nonviolence), lastResort: clamp(lastResort) };
  return analyticalResult('civil-disobedience', {
    conditions,
    justificationStrength: mean(Object.values(conditions)),
    legalRisk: clamp(legalRisk),
  }, ['This analysis does not provide legal advice or authorization.']);
}

function assessSurveillanceLiberty({ collection = 0, necessity = 0, proportionality = 0, oversight = 0, transparency = 0 } = {}) {
  const safeguards = { necessity: clamp(necessity), proportionality: clamp(proportionality), oversight: clamp(oversight), transparency: clamp(transparency) };
  return analyticalResult('security-liberty-surveillance', {
    collection: clamp(collection),
    safeguards,
    libertyRisk: clamp(collection) * (1 - mean(Object.values(safeguards))),
  });
}

module.exports = {
  classifyRegime,
  assessLegitimacy,
  analyzeSocialContract,
  compareLibertyAuthority,
  assessPowerSeparation,
  analyzeDemocraticParticipation,
  assessPluralism,
  assessCivilDisobedience,
  assessSurveillanceLiberty,
};
