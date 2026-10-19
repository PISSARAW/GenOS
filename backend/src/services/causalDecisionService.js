'use strict';

const DEFAULT_THRESHOLD = 0.5;

function clamp(value, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return minimum;
  return Math.max(minimum, Math.min(maximum, number));
}

function chooseAction(input = {}) {
  const policy = input.policy || {};
  const riskTolerance = clamp(policy.riskTolerance, 0, 1);
  const evidenceStrictness = clamp(policy.evidenceStrictness, 0, 1);
  const threshold = Number.isFinite(input.threshold) ? input.threshold : DEFAULT_THRESHOLD;
  const actions = Array.isArray(input.actions) && input.actions.length
    ? input.actions
    : [
        { id: 'verify_first', risk: 0, label: 'Verify before acting' },
        { id: 'proceed', risk: 1, label: 'Proceed with recalled tolerance' }
      ];
  const sorted = actions
    .map((action, index) => ({ ...action, index, risk: clamp(action.risk, 0, 1) }))
    .sort((left, right) => left.risk - right.risk);
  const safeAction = sorted[0];
  const riskyAction = sorted[sorted.length - 1];
  const chooseRisky = riskTolerance >= threshold && evidenceStrictness < 0.95;
  const chosen = chooseRisky ? riskyAction : safeAction;
  return {
    chosenAction: chosen.id,
    chosenLabel: chosen.label,
    rule: 'riskTolerance_threshold',
    threshold,
    riskTolerance,
    evidenceStrictness,
    consideredActions: sorted.map((action) => ({ id: action.id, risk: action.risk })),
    reason: chooseRisky
      ? 'Recalled risk tolerance reached the threshold; the riskier admissible action was selected.'
      : 'Recalled risk tolerance stayed below the threshold (or evidence is strict); the safer action was selected.'
  };
}

function decisionChanged(baseline, recalled) {
  return Boolean(baseline && recalled && baseline.chosenAction !== recalled.chosenAction);
}

module.exports = { chooseAction, decisionChanged, DEFAULT_THRESHOLD };