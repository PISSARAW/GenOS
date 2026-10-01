'use strict';

const BASELINE_ID = 'ctm_style_scoring';

function validCandidate(candidate) {
  return typeof candidate?.candidateId === 'string' && Number.isFinite(Number(candidate.selfRatedScore));
}

function temperature(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 10) : 1;
}

function softmax(candidates, scale) {
  const scores = candidates.map((candidate) => Number(candidate.selfRatedScore) / scale);
  const maximum = Math.max(...scores);
  const exponentials = scores.map((score) => Math.exp(score - maximum));
  const denominator = exponentials.reduce((sum, value) => sum + value, 0);
  return exponentials.map((value) => value / denominator);
}

function compete(options) {
  const candidates = (Array.isArray(options.candidates) ? options.candidates : []).filter(validCandidate);
  if (!candidates.length) throw new TypeError('CTM-style baseline requires self-rated candidate scores.');
  const activations = softmax(candidates, temperature(options.temperature));
  const ranked = candidates.map((candidate, index) => ({ candidateId: candidate.candidateId,
    selfRatedScore: Number(candidate.selfRatedScore), activation: activations[index] }))
    .sort((left, right) => right.activation - left.activation);
  return { baselineId: BASELINE_ID, winner: ranked[0], competitors: ranked,
    rounds: 1, scoreSource: 'processor_self_rating' };
}

module.exports = { BASELINE_ID, compete, validCandidate, temperature };
