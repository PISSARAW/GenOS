'use strict';

function recordMorphologyFailure(memory = [], failure = {}) {
  if (!failure.signature || !failure.reason) throw new Error('failure signature and reason are required');
  return [...memory, { signature: failure.signature, reason: failure.reason, morphology: failure.morphology || null, evidence: failure.evidence || [], recordedAt: failure.recordedAt || Date.now() }];
}

function knownFailure(memory = [], signature) {
  return memory.filter((item) => item.signature === signature);
}

module.exports = { knownFailure, recordMorphologyFailure };
