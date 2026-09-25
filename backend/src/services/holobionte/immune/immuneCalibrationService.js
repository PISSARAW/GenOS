'use strict';

const DECISIONS = new Set(['ALLOW', 'BLOCK']);
const OUTCOMES = new Set(['SAFE', 'UNSAFE']);
const COUNTS = ['falsePositive', 'falseNegative', 'truePositive', 'trueNegative'];

function requiredText(value, field) {
  const text = String(value || '').trim();
  if (!text) throw Object.assign(new Error(`${field} is required.`), { code: 'HOLOBIONT_CALIBRATION_INVALID' });
  return text;
}

function validatedOutcome(outcome) {
  const decision = String(outcome.immuneDecision || '').toUpperCase();
  const groundTruth = String(outcome.verifiedOutcome || '').toUpperCase();
  const evidenceRefs = Array.isArray(outcome.evidenceRefs) ? outcome.evidenceRefs.map((item) => String(item).trim()).filter(Boolean) : [];
  if (!DECISIONS.has(decision) || !OUTCOMES.has(groundTruth)) {
    throw Object.assign(new Error('Calibration requires ALLOW/BLOCK and SAFE/UNSAFE labels.'), { code: 'HOLOBIONT_CALIBRATION_INVALID' });
  }
  if (outcome.verified !== true || !evidenceRefs.length) {
    throw Object.assign(new Error('Calibration requires verified outcomes with evidence references.'), { code: 'HOLOBIONT_ORACLE_EVIDENCE_REQUIRED' });
  }
  return { decision, groundTruth, evidenceRefs, verifierId: requiredText(outcome.verifierId, 'verifierId') };
}

function countOutcome(counts, sample) {
  const category = sample.decision === 'BLOCK'
    ? sample.groundTruth === 'UNSAFE' ? 'truePositive' : 'falsePositive'
    : sample.groundTruth === 'UNSAFE' ? 'falseNegative' : 'trueNegative';
  counts[category] += 1;
}

function rate(numerator, denominator) {
  return denominator ? numerator / denominator : null;
}

function evaluateImmuneCalibration(input = {}) {
  const outcomes = Array.isArray(input.outcomes) ? input.outcomes : [];
  if (outcomes.length > 5000) throw Object.assign(new Error('At most 5000 outcomes may be evaluated.'), { code: 'HOLOBIONT_CALIBRATION_LIMIT' });
  const counts = Object.fromEntries(COUNTS.map((key) => [key, 0]));
  for (const outcome of outcomes) countOutcome(counts, validatedOutcome(outcome));
  const safe = counts.falsePositive + counts.trueNegative;
  const unsafe = counts.falseNegative + counts.truePositive;
  return {
    counts, sampleCount: outcomes.length,
    falsePositiveRate: rate(counts.falsePositive, safe),
    falseNegativeRate: rate(counts.falseNegative, unsafe),
    oracleBacked: outcomes.length > 0,
    automaticGateChange: false
  };
}

module.exports = { evaluateImmuneCalibration };
