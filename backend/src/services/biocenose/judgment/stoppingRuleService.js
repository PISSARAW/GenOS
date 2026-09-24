'use strict';

function evaluate(input) {
  const rule = input.constitution.stoppingRule || {};
  const roundLimitReached = input.round + 1 >= input.constitution.roundLimit;
  const stable = Number(input.stableRoundCount || 0) >= Number(rule.stableRounds || 1);
  const evidenceLow = rule.stopWhenEvidenceValueIsLow && input.evidenceValueLow === true;
  const stop = roundLimitReached || stable || evidenceLow;
  return {
    stop, reason: roundLimitReached ? 'ROUND_LIMIT' : stable ? 'STABILITY' : evidenceLow ? 'LOW_EVIDENCE_VALUE' : 'MORE_EVIDENCE_NEEDED',
    roundLimitReached
  };
}

module.exports = { evaluate };
