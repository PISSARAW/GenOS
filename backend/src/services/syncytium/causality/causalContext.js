'use strict';

function normalize(context = {}) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    throw causalError('Causal context must be a version vector.');
  }
  const result = {};
  for (const [actor, sequence] of Object.entries(context)) {
    if (!actor || !Number.isSafeInteger(sequence) || sequence < 0) {
      throw causalError('Causal context entries require actor names and non-negative integer versions.');
    }
    if (sequence > 0) result[actor] = sequence;
  }
  return result;
}

function causalError(message) {
  return Object.assign(new Error(message), { code: 'SYNCYTIUM_CAUSAL_CONTEXT_INVALID' });
}

module.exports = { normalize };
