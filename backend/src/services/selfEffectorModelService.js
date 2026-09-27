'use strict';

function registerEffectors(effectors) {
  const list = Array.isArray(effectors) ? effectors : [];
  return list.map((effector) => ({ id: effector.id, delayMs: Math.max(0, Number(effector.delayMs) || 0), gain: Number(effector.gain) || 1, baseline: effector.baseline || null }));
}

function predictEffect(input) {
  const effectors = registerEffectors(input?.effectors);
  const target = effectors.find((item) => item.id === input?.effectorId);
  if (!target) throw Object.assign(new Error('Unknown effector'), { code: 'UNKNOWN_EFFECTOR' });
  return { effectorId: target.id, expected: Number(input.value || 0) * target.gain, delayMs: target.delayMs, selfGenerated: true };
}

function attributeObservation(prediction, observation) {
  const actual = Number(observation?.value);
  const expected = Number(prediction?.expected);
  return { effectorId: prediction?.effectorId || null, error: Number.isFinite(actual) && Number.isFinite(expected) ? actual - expected : null, attribution: prediction?.selfGenerated ? 'self' : 'world', delayObservedMs: Number(observation?.delayMs) || 0 };
}

module.exports = { registerEffectors, predictEffect, attributeObservation };
