'use strict';

function recordState(input) {
  const data = input || {};
  if (!validState(data.state)) throw Object.assign(new Error('World state is required'), { code: 'INVALID_WORLD_STATE' });
  const evidenceRefs = cleanRefs(data.evidenceRefs);
  return { stateId: data.stateId || `state_${Date.now()}`, state: { ...data.state }, evidenceRefs, status: evidenceRefs.length ? 'supported' : 'uncertain' };
}

function validState(state) {
  if (!state || typeof state !== 'object') return false;
  return !Array.isArray(state);
}

function cleanRefs(refs) {
  if (!Array.isArray(refs)) return [];
  return refs.filter((ref) => typeof ref === 'string' && ref);
}

function stateView(value) {
  if (value && value.state) return value.state;
  return value || {};
}

function changedDelta(left, right) {
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])];
  const delta = {};
  for (const key of keys) {
    if (JSON.stringify(left[key]) !== JSON.stringify(right[key])) delta[key] = { before: left[key], after: right[key] };
  }
  return { keys, delta };
}

function compareStates(before, after, options = {}) {
  const { keys, delta } = changedDelta(stateView(before), stateView(after));
  const expected = options.expectedDelta || {};
  const expectedKeys = Object.keys(expected);
  const matched = expectedKeys.filter((key) => JSON.stringify(delta[key] && delta[key].after) === JSON.stringify(expected[key])).length;
  const uncertainty = expectedKeys.length ? 1 - matched / expectedKeys.length : (keys.length ? 0 : 1);
  return { delta, changedKeys: Object.keys(delta).length, support: expectedKeys.length ? matched / expectedKeys.length : 0, uncertainty, outOfDistribution: Boolean(options.outOfDistribution), decisionReady: uncertainty <= 0.5 && !options.outOfDistribution };
}

function conditionalChoice(input) {
  const data = input || {};
  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  if (candidates.length < 2) throw Object.assign(new Error('At least two conditional candidates are required'), { code: 'INSUFFICIENT_CANDIDATES' });
  const ranked = candidates.map((candidate) => ({ ...candidate, utility: Number(candidate.expectedUtility) || 0, uncertainty: Number(candidate.uncertainty) || 0 })).sort((a, b) => b.utility - b.uncertainty - (a.utility - a.uncertainty));
  return { selected: ranked[0], alternatives: ranked.slice(1), distinct: ranked[0].action !== ranked[1].action };
}

module.exports = { recordState, compareStates, conditionalChoice };
