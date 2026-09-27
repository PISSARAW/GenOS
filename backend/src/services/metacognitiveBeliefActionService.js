'use strict';

function monitor(input) {
  const data = input || {};
  const expected = Number(data.expectedConfidence);
  const observed = Number(data.observedAccuracy);
  const error = Number.isFinite(expected) && Number.isFinite(observed) ? Math.abs(expected - observed) : 1;
  return { error, reliable: error <= 0.2, noisy: error > 0.2, abstain: error > 0.5 };
}

function reviseBelief(belief, feedback) {
  const current = Number(belief?.confidence) || 0;
  const target = Number(feedback?.accuracy) || 0;
  const rate = Math.max(0.05, Math.min(0.5, Number(feedback?.learningRate) || 0.2));
  return { ...belief, confidence: Number((current + (target - current) * rate).toFixed(4)), revised: true };
}

function chooseAction(input) {
  const meta = monitor(input);
  if (meta.abstain) return { action: 'abstain', meta };
  const options = Array.isArray(input?.actions) ? input.actions : [];
  return { action: options.sort((a, b) => (Number(b.utility) || 0) - (Number(a.utility) || 0))[0]?.id || 'abstain', meta };
}

module.exports = { monitor, reviseBelief, chooseAction };
