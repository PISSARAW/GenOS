'use strict';

const CHANGE_FACTORS = Object.freeze(['models', 'repository', 'provider', 'toolset', 'successRate']);

function assessPriorFreshness(prior = {}, current = {}, now = Date.now()) {
  const staleReasons = CHANGE_FACTORS.filter((key) => prior[key] !== undefined && current[key] !== undefined && prior[key] !== current[key]);
  const ageMs = Math.max(0, now - (prior.recordedAt || now));
  const decay = Math.exp(-ageMs / (prior.halfLifeMs || 30 * 86400000));
  const confidence = Math.max(0, Math.min(1, decay * (1 - staleReasons.length * 0.2)));
  return { confidence, staleReasons, reusable: confidence >= 0.35 };
}

module.exports = { CHANGE_FACTORS, assessPriorFreshness };
