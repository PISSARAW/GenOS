'use strict';

function score(candidate, gap) {
  return candidate.expectedUtility * gap.severity * gap.confidence
    - candidate.creationCost - candidate.coordinationCost - candidate.duplicationRisk;
}

module.exports = { score };
