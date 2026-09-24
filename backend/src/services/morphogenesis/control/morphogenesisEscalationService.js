'use strict';

const ESCALATION_SIGNALS = Object.freeze([
  'budgetBoundaryCrossed', 'globalInvariantAffected',
  'parentContractInvalidated', 'crossSubtreeStateRequired'
]);

function shouldEscalate(signals = {}) {
  return ESCALATION_SIGNALS.some((signal) => signals[signal] === true);
}

function escalationReasons(signals = {}) {
  return ESCALATION_SIGNALS.filter((signal) => signals[signal] === true);
}

module.exports = { ESCALATION_SIGNALS, escalationReasons, shouldEscalate };
