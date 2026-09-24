'use strict';

const { evaluateImmuneCalibration } = require('./immuneCalibrationService');

function thresholdValue(value) {
  const threshold = Number(value === undefined ? 3 : value);
  if (!Number.isInteger(threshold) || threshold < 2 || threshold > 100) {
    throw Object.assign(new Error('repeatedSafeBlocks must be an integer from 2 to 100.'), { code: 'HOLOBIONT_AUTOIMMUNITY_INVALID' });
  }
  return threshold;
}

function blockedSafeTrusted(outcome) {
  return String(outcome.immuneDecision || '').toUpperCase() === 'BLOCK'
    && String(outcome.verifiedOutcome || '').toUpperCase() === 'SAFE'
    && String(outcome.symbiontTrust || '').toUpperCase() === 'TRUSTED';
}

function aggregateSuspects(outcomes, threshold) {
  const counts = new Map();
  for (const outcome of outcomes.filter(blockedSafeTrusted)) {
    const symbiontId = String(outcome.symbiontId || '').trim();
    if (!symbiontId) throw Object.assign(new Error('Autoimmunity evidence requires symbiontId.'), { code: 'HOLOBIONT_AUTOIMMUNITY_INVALID' });
    const item = counts.get(symbiontId) || { symbiontId, repeatedSafeBlocks: 0, evidenceRefs: [] };
    item.repeatedSafeBlocks += 1;
    item.evidenceRefs.push(...outcome.evidenceRefs.map((ref) => String(ref).trim()).filter(Boolean));
    counts.set(symbiontId, item);
  }
  return [...counts.values()].filter((item) => item.repeatedSafeBlocks >= threshold);
}

function detectAutoimmunity(input = {}) {
  const outcomes = Array.isArray(input.outcomes) ? input.outcomes : [];
  const calibration = evaluateImmuneCalibration({ outcomes });
  const threshold = thresholdValue(input.repeatedSafeBlocks);
  const suspects = aggregateSuspects(outcomes, threshold);
  return {
    suspected: suspects.length > 0, suspects, threshold,
    trustDoesNotExemptFromReview: true, calibration
  };
}

module.exports = { detectAutoimmunity };
