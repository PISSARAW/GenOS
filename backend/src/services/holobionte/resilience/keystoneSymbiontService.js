'use strict';

function requiredText(value, field) {
  const text = String(value || '').trim();
  if (!text) throw Object.assign(new Error(`${field} is required.`), { code: 'HOLOBIONT_KEYSTONE_INVALID' });
  return text;
}

function normalizedScore(value, field) {
  const score = Number(value);
  if (!Number.isFinite(score) || score < 0 || score > 1) {
    throw Object.assign(new Error(`${field} must be between 0 and 1.`), { code: 'HOLOBIONT_KEYSTONE_INVALID' });
  }
  return score;
}

function performanceSample(value, field) {
  const sample = value || {};
  const evidenceRefs = Array.isArray(sample.evidenceRefs) ? sample.evidenceRefs.map((item) => String(item).trim()).filter(Boolean) : [];
  if (!evidenceRefs.length) throw Object.assign(new Error(`${field} requires evidenceRefs.`), { code: 'HOLOBIONT_EVIDENCE_REQUIRED' });
  return { score: normalizedScore(sample.score, `${field}.score`), evidenceRefs };
}

function evaluateKeystoneImpact(input = {}) {
  const symbiontId = requiredText(input.symbiontId, 'symbiontId');
  const benchmarkId = requiredText(input.benchmarkId, 'benchmarkId');
  const withSymbiont = performanceSample(input.withSymbiont, 'withSymbiont');
  const withoutSymbiont = performanceSample(input.withoutSymbiont, 'withoutSymbiont');
  const threshold = normalizedScore(input.keystoneThreshold === undefined ? 0.2 : input.keystoneThreshold, 'keystoneThreshold');
  const impact = withSymbiont.score - withoutSymbiont.score;
  const usageFrequency = input.usageFrequency === undefined ? null : normalizedScore(input.usageFrequency, 'usageFrequency');
  return {
    symbiontId, benchmarkId, impact, keystoneThreshold: threshold,
    isKeystone: impact >= threshold, usageFrequency,
    evidenceRefs: [...new Set([...withSymbiont.evidenceRefs, ...withoutSymbiont.evidenceRefs])],
    comparison: { withSymbiont: withSymbiont.score, withoutSymbiont: withoutSymbiont.score }
  };
}

module.exports = { evaluateKeystoneImpact };
