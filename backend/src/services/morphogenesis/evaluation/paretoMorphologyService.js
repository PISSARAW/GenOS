'use strict';

const { dominates } = require('./morphologyUtilityVector');

function dominanceRelations(candidates) {
  const relations = [];
  for (let left = 0; left < candidates.length; left += 1) {
    for (let right = 0; right < candidates.length; right += 1) {
      if (left !== right && dominates(candidates[left].utility, candidates[right].utility)) {
        relations.push({ dominates: candidates[left].id, dominated: candidates[right].id });
      }
    }
  }
  return relations;
}

function computeParetoRanks(candidates) {
  const pending = new Set(candidates.map((candidate) => candidate.id));
  const ranks = {};
  let rank = 0;
  while (pending.size) {
    const front = candidates.filter((candidate) => pending.has(candidate.id)
      && !candidates.some((other) => pending.has(other.id)
        && other.id !== candidate.id && dominates(other.utility, candidate.utility)));
    if (!front.length) break;
    for (const candidate of front) {
      ranks[candidate.id] = rank;
      pending.delete(candidate.id);
    }
    rank += 1;
  }
  return ranks;
}

function rankMorphologies(candidates) {
  const relations = dominanceRelations(candidates);
  return { ranks: computeParetoRanks(candidates), relations };
}

module.exports = { dominanceRelations, rankMorphologies };
