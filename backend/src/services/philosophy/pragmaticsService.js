'use strict';

const MAXIMS = Object.freeze(['quantity', 'quality', 'relation', 'manner']);

function analyzeImplicature(input = {}) {
  const utterance = String(input.utterance || '').trim();
  if (!utterance) throw new Error('utterance must be a non-empty string.');
  const flouted = Array.isArray(input.floutedMaxims) ? input.floutedMaxims : [];
  const invalid = flouted.filter((maxim) => !MAXIMS.includes(maxim));
  if (invalid.length) throw new Error(`Unknown Grice maxim '${invalid[0]}'.`);
  return {
    utterance,
    cooperativePrinciple: true,
    maxims: MAXIMS,
    floutedMaxims: flouted,
    conversationalImplicature: input.implicature || null,
    conventionalImplicature: input.conventionalImplicature || null,
    status: input.implicature ? 'proposed' : 'underdetermined'
  };
}

module.exports = { MAXIMS, analyzeImplicature };
