'use strict';

const { createHash } = require('node:crypto');

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function locksMatch(challenge) {
  return digest(challenge.baseline.modelLock) === digest(challenge.treatment.modelLock)
    && digest(challenge.baseline.toolLock) === digest(challenge.treatment.toolLock)
    && digest(challenge.baseline.budget) === digest(challenge.treatment.budget);
}

function validate(challenge) {
  if (!locksMatch(challenge)) throw new Error('rival-challenge-controls-mismatched');
  if (challenge.seeds.some((seed) => seed == null || String(seed).length === 0)
    || new Set(challenge.seeds.map(String)).size !== challenge.seeds.length) {
    throw new Error('rival-challenge-seeds-invalid');
  }
  return { matched: true, modelHash: digest(challenge.baseline.modelLock),
    toolHash: digest(challenge.baseline.toolLock), budgetHash: digest(challenge.baseline.budget) };
}

module.exports = { digest, locksMatch, validate };
