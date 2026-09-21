'use strict';

const SCORING_RULES = [
  { type: 'match', envKey: 'language', procKey: 'language', matchScore: 0.3, mismatchScore: -0.2 },
  { type: 'match', envKey: 'taskType', procKey: 'taskType', matchScore: 0.2, mismatchScore: -0.1 },
  { type: 'diff', envKey: 'repositorySize', procKey: 'repositorySize', maxScore: 0.2, divisor: 100000 },
  { type: 'ratio', envKey: 'frameworks', procKey: 'frameworks', maxScore: 0.1 },
  { type: 'diff', envKey: 'complexity', procKey: 'complexity', maxScore: 0.1, multiplier: 0.1 },
];

const identity = require('./proceduralIdentityService');

function scoreForNiche(niche, procedure) {
  if (!niche || !niche.environment || !procedure) return 0;
  const env = niche.environment;
  let score = 0.5;

  for (const rule of SCORING_RULES) {
    score += applyRule(rule, env, procedure);
  }

  return Math.max(0, Math.min(1, score));
}

function applyRule(rule, env, procedure) {
  const envVal = env[rule.envKey];
  const procVal = procedure[rule.procKey];
  if (!envVal || !procVal) return 0;

  if (rule.type === 'match') {
    return envVal === procVal ? rule.matchScore : rule.mismatchScore;
  }
  if (rule.type === 'diff') {
    const diff = Math.abs(envVal - procVal);
    if (rule.divisor) return Math.max(0, rule.maxScore - diff / rule.divisor);
    if (rule.multiplier) return Math.max(0, rule.maxScore - diff * rule.multiplier);
  }
  if (rule.type === 'ratio') {
    const overlap = envVal.filter((f) => procVal.includes(f)).length;
    return (overlap / Math.max(1, envVal.length)) * rule.maxScore;
  }
  return 0;
}

function createNiche(environment, options = {}) {
  return {
    id: options.id || identity.createOccurrenceId('niche'),
    environment,
    carryingCapacity: options.carryingCapacity || 10,
    resources: options.resources || {},
    createdAt: new Date().toISOString(),
  };
}

function findBestNiche(niches, procedure) {
  let best = null;
  let bestScore = -1;
  for (const niche of niches) {
    const score = scoreForNiche(niche, procedure);
    if (score > bestScore) {
      bestScore = score;
      best = niche;
    }
  }
  return best ? { niche: best, score: bestScore } : null;
}

function nichesByFitness(niches, procedure) {
  return niches
    .map((niche) => ({ niche, score: scoreForNiche(niche, procedure) }))
    .sort((a, b) => b.score - a.score);
}

module.exports = {
  scoreForNiche,
  createNiche,
  findBestNiche,
  nichesByFitness,
};
