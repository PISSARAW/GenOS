'use strict';

function summarize(cases) {
  const rows = Array.isArray(cases) ? cases : [];
  const evaluated = rows.filter((item) => item.evaluated === true);
  const falseConsensus = evaluated.filter((item) => item.consensusReached && item.correct === false).length;
  const minorityCorrect = evaluated.filter((item) => item.correctMinority && item.preserved === true).length;
  return {
    evaluatedCases: evaluated.length,
    falseConsensusRate: ratio(falseConsensus, evaluated.length),
    correctMinorityPreservationRate: ratio(minorityCorrect, evaluated.filter((item) => item.correctMinority).length),
    tokenCount: evaluated.reduce((sum, item) => sum + (Number(item.tokenCount) || 0), 0)
  };
}

function ratio(numerator, denominator) {
  return denominator ? numerator / denominator : null;
}

module.exports = { summarize };
