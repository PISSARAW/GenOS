'use strict';

function selectChampion(candidates = []) {
  const eligible = candidates.filter((item) => item && item.verified === true && item.freshness && item.freshness.reusable === true);
  eligible.sort((left, right) => (right.quality || 0) - (left.quality || 0));
  return eligible[0] ? { champion: eligible[0], usedAsPrior: true, treatedAsTruth: false } : { champion: null, usedAsPrior: false, treatedAsTruth: false };
}

module.exports = { selectChampion };
