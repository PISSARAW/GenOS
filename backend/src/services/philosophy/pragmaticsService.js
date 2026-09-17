'use strict';

const MAXIMS = Object.freeze(['quantity', 'quality', 'relation', 'manner']);

function analyzeImplicature(input = {}) {
  const utterance = String(input.utterance || '').trim();
  if (!utterance) throw new Error('utterance must be a non-empty string.');
  const flouted = Array.isArray(input.floutedMaxims) ? input.floutedMaxims : [];
  const invalid = flouted.filter((maxim) => !MAXIMS.includes(maxim));
  if (invalid.length) throw new Error(`Unknown Grice maxim '${invalid[0]}'.`);
  const conventional = input.conventionalImplicature || detectConventionalMarker(utterance);
  return {
    utterance,
    cooperativePrinciple: true,
    maxims: MAXIMS,
    floutedMaxims: flouted,
    conversationalImplicature: input.implicature || null,
    conventionalImplicature: conventional,
    inference: input.implicature || null,
    status: input.implicature || conventional ? 'proposed' : 'underdetermined',
    evidence: flouted.length ? ['maxim_flouting'] : []
  };
}

function assessMaxims(input = {}) {
  const utterance = String(input.utterance || '').trim();
  if (!utterance) throw new Error('utterance must be a non-empty string.');
  const violated = Array.isArray(input.violatedMaxims) ? input.violatedMaxims : [];
  const invalid = violated.find((maxim) => !MAXIMS.includes(maxim));
  if (invalid) throw new Error(`Unknown Grice maxim '${invalid}'.`);
  return { utterance, maxims: MAXIMS, observed: MAXIMS.filter((maxim) => !violated.includes(maxim)), violated, status: 'assessed' };
}

function detectConventionalMarker(utterance) {
  const match = utterance.match(/\b(mais|pourtant|donc|cependant)\b/i);
  return match ? { marker: match[1].toLowerCase(), status: 'candidate' } : null;
}

module.exports = { MAXIMS, analyzeImplicature, assessMaxims, detectConventionalMarker };
