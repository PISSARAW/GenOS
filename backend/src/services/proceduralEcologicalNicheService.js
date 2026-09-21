'use strict';

const { scoreForNiche } = require('./nicheScoringService');

const identity = require('./proceduralIdentityService');

function clamp01(value, fallback = 0) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  return Math.max(0, Math.min(1, resolved));
}

function defineNiche(input = {}) {
  return {
    id: input.id || identity.createOccurrenceId('niche'),
    environment: input.environment || {},
    carryingCapacity: input.carryingCapacity || 10,
    resources: input.resources || {},
    createdAt: input.createdAt || new Date().toISOString(),
  };
}

function scoreInEnvironment(niche, procedure) {
  return clamp01(scoreForNiche(niche, procedure));
}

function nicheFitness(procedure, niche) {
  return scoreInEnvironment(niche, procedure);
}

function sortedByNicheFit(procedures, niche) {
  return [...procedures].sort((a, b) => scoreInEnvironment(niche, b) - scoreInEnvironment(niche, a));
}

module.exports = {
  defineNiche,
  scoreInEnvironment,
  nicheFitness,
  sortedByNicheFit,
};
