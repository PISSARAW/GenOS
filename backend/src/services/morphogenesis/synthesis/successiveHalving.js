'use strict';

const { nicheFor } = require('./qualityDiversityArchive');

function whole(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : fallback;
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function createEvaluationBudget(input = {}) {
  const defaultLimit = positive(input.defaultLimit, 1);
  const maxEvaluations = whole(input.maxEvaluations, defaultLimit);
  return {
    unit: 'candidate_evaluations',
    maxEvaluations,
    consumed: 0,
    remaining: maxEvaluations,
    eta: Math.max(2, positive(input.eta, 2)),
    minSurvivors: positive(input.minSurvivors, 1)
  };
}

function reserveEvaluations(budget, requested) {
  const granted = Math.min(budget.remaining, positive(requested, 1));
  budget.consumed += granted;
  budget.remaining -= granted;
  return granted;
}

function rankCandidates(candidates) {
  return [...candidates].sort((left, right) =>
    Number(right.score?.total || 0) - Number(left.score?.total || 0)
      || String(left.candidateId).localeCompare(String(right.candidateId)));
}

function desiredSurvivors(count, budget) {
  if (!count) return 0;
  return Math.min(count, Math.max(budget.minSurvivors, Math.ceil(count / budget.eta)));
}

function diverseFirst(ranked, count, options) {
  const selected = [];
  const seenNiches = new Set();
  for (const candidate of ranked) {
    const niche = nicheFor(candidate, options);
    if (seenNiches.has(niche)) continue;
    selected.push(candidate);
    seenNiches.add(niche);
    if (selected.length === count) return selected;
  }
  for (const candidate of ranked) {
    if (selected.includes(candidate)) continue;
    selected.push(candidate);
    if (selected.length === count) break;
  }
  return selected;
}

function selectSurvivors(candidates, input = {}) {
  const eligible = rankCandidates((Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => candidate?.status === 'evaluated'
      && Number.isFinite(Number(candidate.score?.total))));
  const count = desiredSurvivors(eligible.length, input.budget);
  const survivors = diverseFirst(eligible, count, input.archiveOptions || {});
  const ids = new Set(survivors.map((candidate) => candidate.candidateId));
  return {
    method: 'successive_halving_with_structural_niche_preservation',
    eta: input.budget.eta,
    evaluatedCandidateIds: eligible.map((candidate) => candidate.candidateId),
    survivorCandidateIds: survivors.map((candidate) => candidate.candidateId),
    eliminatedCandidateIds: eligible.filter((candidate) => !ids.has(candidate.candidateId))
      .map((candidate) => candidate.candidateId),
    survivors
  };
}

function budgetSnapshot(budget) {
  return { unit: budget.unit, maxEvaluations: budget.maxEvaluations,
    consumed: budget.consumed, remaining: budget.remaining,
    exhausted: budget.remaining === 0, eta: budget.eta,
    minSurvivors: budget.minSurvivors };
}

module.exports = { createEvaluationBudget, reserveEvaluations, selectSurvivors,
  budgetSnapshot };
