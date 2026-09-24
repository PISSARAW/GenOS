'use strict';

function selectIndividuals(individuals, count) {
  const ranked = (Array.isArray(individuals) ? individuals : []).map((individual) => ({
    individual,
    score: fitnessScore(individual)
  })).sort((left, right) => right.score - left.score || left.individual.individualId.localeCompare(right.individual.individualId));
  const limit = Math.max(0, Math.min(ranked.length, Number.isSafeInteger(count) ? count : ranked.length));
  return { selected: ranked.slice(0, limit).map((item) => item.individual), ranked };
}

function fitnessScore(individual) {
  const receipts = Array.isArray(individual.fitnessReceipts) ? individual.fitnessReceipts : [];
  const latest = receipts.at(-1) || {};
  const score = Number(latest.score ?? latest.fitness);
  return Number.isFinite(score) ? score : 0;
}

module.exports = { selectIndividuals };
