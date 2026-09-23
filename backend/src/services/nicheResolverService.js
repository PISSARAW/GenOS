'use strict';

const nicheScoring = require('./nicheScoringService');

function clamp01(input) {
  const value = Number(input);
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function defineNiche(input) {
  return {
    id: String(input.id || 'niche_default'),
    environment: String(input.environment || 'env_default'),
    function: String(input.function || 'generic'),
    resources: input.resources || {},
    pressures: input.pressures || {},
    requiredEvidence: Array.isArray(input.requiredEvidence) ? input.requiredEvidence : [],
    competition: Array.isArray(input.competition) ? input.competition : [],
    successCriteria: Array.isArray(input.successCriteria) ? input.successCriteria : []
  };
}

function fitInNiche(input) {
  const niche = (input || {}).niche || {};
  const candidate = (input || {}).candidate || {};
  let base = 0.5;
  try {
    const scored = nicheScoring.scoreForNiche(niche, candidate);
    if (Number.isFinite(Number(scored))) base = clamp01(scored);
  } catch (_) {
    base = 0.5;
  }
  const evidence = Array.isArray(niche.requiredEvidence) ? niche.requiredEvidence.length : 0;
  const penalty = evidence > 0 ? 0 : 0.05;
  return clamp01(base - penalty);
}

function resolveBestNiche(input) {
  const niches = Array.isArray((input || {}).niches) ? input.niches : [];
  const candidate = (input || {}).candidate || {};
  let best = null;
  let bestScore = -1;
  for (const niche of niches) {
    const score = fitInNiche({ niche, candidate });
    if (score > bestScore) {
      bestScore = score;
      best = niche;
    }
  }
  return { niche: best, fit: bestScore < 0 ? 0 : bestScore };
}

function rankCandidates(input) {
  const niche = (input || {}).niche || {};
  const candidates = Array.isArray((input || {}).candidates) ? input.candidates : [];
  return candidates
    .map((candidate) => ({ candidate, fit: fitInNiche({ niche, candidate }) }))
    .sort((left, right) => right.fit - left.fit);
}

module.exports = {
  defineNiche,
  fitInNiche,
  resolveBestNiche,
  rankCandidates
};
