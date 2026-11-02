'use strict';

const crypto = require('node:crypto');

const MAX_IDENTICAL_FAILURES = 2;

function normalizeString(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function defectSignature(defects) {
  if (!Array.isArray(defects) || defects.length === 0) return 'clean:0';
  const keys = defects.map((defect) => {
    const code = String(defect.code || 'unknown').toLowerCase();
    const section = String(defect.section || '').toLowerCase();
    const severity = String(defect.severity || 'defect').toLowerCase();
    return `${severity}:${code}:${section}`;
  }).sort();
  return crypto.createHash('sha256').update(keys.join('|')).digest('hex').slice(0, 16);
}

function contentDigest(content) {
  const text = typeof content === 'string' ? content : JSON.stringify(content || '');
  return crypto.createHash('sha256').update(text).digest('hex');
}

function consecutiveMatches(history, signature) {
  let count = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const itemSig = history[i].defectSignature || defectSignature(history[i].defects);
    if (itemSig === signature) count++;
    else break;
  }
  return count;
}

function evaluateDigestStagnation(last, prior) {
  if (last.digest && prior.digest && last.digest === prior.digest) {
    return {
      stagnant: true,
      stagnated: true,
      reason: 'CONTENT_UNMODIFIED',
      recommendedAction: 'mutate_strategy'
    };
  }
  return null;
}

function evaluateScoreStagnation(last, prior) {
  if (last.score !== undefined && prior.score !== undefined && last.score < prior.score) {
    return {
      stagnant: false,
      stagnated: false,
      regressed: true,
      reason: 'SCORE_REGRESSED',
      recommendedAction: 'restore_best_and_mutate'
    };
  }
  return null;
}

function resolveMaxIdentical(options) {
  if (typeof options === 'number') return options;
  return options?.maxIdenticalFailures || MAX_IDENTICAL_FAILURES;
}

function evaluateDefectMatchStagnation(history, last, maxIdentical) {
  const currentSig = last.defectSignature || defectSignature(last.defects);
  const matchCount = consecutiveMatches(history, currentSig);
  if (matchCount >= maxIdentical && currentSig !== 'clean:0') {
    return {
      stagnant: true,
      stagnated: true,
      regressed: false,
      reason: `DEFECT_SIGNATURE_PERSISTED_${matchCount}`,
      recommendedAction: matchCount >= 3 ? 'abort' : 'mutate_strategy'
    };
  }
  return null;
}

function detectStagnation(history, options = {}) {
  const maxIdentical = resolveMaxIdentical(options);
  if (!Array.isArray(history) || history.length < 2) {
    return { stagnant: false, stagnated: false, regressed: false, reason: null, recommendedAction: 'continue' };
  }
  const last = history[history.length - 1];
  const prior = history[history.length - 2];

  const digestCheck = evaluateDigestStagnation(last, prior);
  if (digestCheck) return digestCheck;

  const scoreCheck = evaluateScoreStagnation(last, prior);
  if (scoreCheck) return scoreCheck;

  return evaluateDefectMatchStagnation(history, last, maxIdentical)
    || { stagnant: false, stagnated: false, regressed: false, reason: null, recommendedAction: 'continue' };
}

module.exports = {
  defectSignature,
  contentDigest,
  detectStagnation,
  MAX_IDENTICAL_FAILURES
};
