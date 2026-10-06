'use strict';

function evaluate(input) {
  const rule = input.constitution.stoppingRule || {};
  const roundLimitReached = input.round + 1 >= input.constitution.roundLimit;
  const stable = Number(input.stableRoundCount || 0) >= Number(rule.stableRounds || 1);
  const evidenceLow = rule.stopWhenEvidenceValueIsLow && input.evidenceValueLow === true;
  const review = input.terminalReviewRequired === true;
  const stop = roundLimitReached || review || stable || evidenceLow;
  return {
    stop, reason: reasonFor({ roundLimitReached, review, stable, evidenceLow }),
    roundLimitReached
  };
}

function reasonFor(input) {
  const reasons = [['ROUND_LIMIT', input.roundLimitReached], ['REVIEW_REQUIRED', input.review],
    ['STABILITY', input.stable], ['LOW_EVIDENCE_VALUE', input.evidenceLow]];
  return reasons.find((item) => item[1])?.[0] || 'MORE_EVIDENCE_NEEDED';
}

module.exports = { evaluate };
