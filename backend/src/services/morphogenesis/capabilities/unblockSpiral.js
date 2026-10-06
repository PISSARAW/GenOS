'use strict';

const crypto = require('crypto');

const SCALES = Object.freeze(['parameter', 'function', 'module', 'dependency', 'architecture', 'problem']);

function signature(value) {
  if (!value || !value.initialState || !value.hypothesis || !value.family || !value.scale) {
    throw new Error('initialState, hypothesis, family and scale are required');
  }
  if (!SCALES.includes(value.scale)) throw new Error('Unknown intervention scale');
  const canonical = [value.initialState, value.hypothesis, value.family, value.scale,
    value.intervention || null,
    ...(value.evidenceRefs || []).map(String).sort()];
  return crypto.createHash('sha256').update(JSON.stringify(require('./runtimeArtifacts').canonical(canonical))).digest('hex');
}

function hasNewEvidence(item, last) {
  return (item.evidenceRefs || []).some((ref) => !(last.evidenceRefs || []).includes(ref));
}

function distinct(item, context) {
  if (item.replicationOf) return validReplica(item, context.attempts);
  if (context.prior.has(signature(item))) return false;
  const last = context.last;
  return !last || item.family !== last.family || item.scale !== last.scale || hasNewEvidence(item, last);
}

function planNext(input = {}) {
  const attempts = Array.isArray(input.attempts) ? input.attempts : [];
  const candidates = Array.isArray(input.candidates) ? input.candidates : [];
  const prior = new Set(attempts.map((item) => signature(item)));
  const last = attempts.at(-1) || null;
  const allowed = candidates.filter((item) => distinct(item, { prior, last, attempts }));
  const bounded = allowed.filter((item) => SCALES.indexOf(item.scale) <= Number(input.maxScaleIndex ?? SCALES.length - 1));
  const ordered = bounded.sort((a, b) => SCALES.indexOf(a.scale) - SCALES.indexOf(b.scale));
  if (!ordered.length) return { permitted: false, reason: 'NO_DISTINCT_AUTHORIZED_ATTEMPT' };
  const next = ordered[0];
  return { permitted: true, candidate: next, signature: signature(next),
    reason: next.replicationOf ? 'INDEPENDENT_REPLICATION' : last?.scale === next.scale
      ? 'CHANGED_INTERVENTION_OR_EVIDENCE' : 'JUSTIFIED_SCOPE_CHANGE' };
}

function scaleLimit(input = {}) {
  const attempts = Array.isArray(input.attempts) ? input.attempts : [];
  const maximum = requestedMaximum(input.maxScaleIndex);
  const last = attempts.at(-1);
  if (!last) return { maxScaleIndex: Math.min(maximum, 1), reason: 'INITIAL_LOCAL_SEARCH' };
  const failures = consecutiveFailures(attempts);
  if (last.outcomeStatus === 'VERIFIED_SUCCESS') {
    return { maxScaleIndex: Math.min(maximum, 1), reason: 'RECENTER_ON_EVIDENCE' };
  }
  const current = SCALES.indexOf(last.scale);
  const threshold = stagnationThreshold(input.stagnationThreshold);
  return { maxScaleIndex: Math.min(maximum, current + (failures >= threshold ? 1 : 0)),
    reason: failures >= threshold ? 'VERIFIED_STAGNATION' : 'LOCAL_SEARCH_CONTINUES' };
}

function requestedMaximum(value) {
  const requested = Number(value ?? SCALES.length - 1);
  if (!Number.isInteger(requested) || requested < 0) throw new Error('Invalid maximum scale');
  return Math.min(SCALES.length - 1, requested);
}

function stagnationThreshold(value) {
  const threshold = Number.isInteger(value) ? value : 2;
  if (threshold < 1) throw new Error('Invalid stagnation threshold');
  return threshold;
}

function consecutiveFailures(attempts) {
  let count = 0;
  const scale = attempts.at(-1)?.scale;
  for (let index = attempts.length - 1; index >= 0; index--) {
    if (attempts[index].outcomeStatus !== 'VERIFIED_FAILURE' || attempts[index].scale !== scale) break;
    count++;
  }
  return count;
}

module.exports = { SCALES, signature, planNext, scaleLimit };

function validReplica(item, attempts) {
  const original = attempts.find((attempt) => attempt.attemptId === item.replicationOf);
  return Boolean(original && item.independentVerifierId && item.verifierId === item.independentVerifierId
    && item.independentVerifierId !== original.verifierId
    && !attempts.some((attempt) => attempt.replicationOf === item.replicationOf
      && attempt.independentVerifierId === item.independentVerifierId));
}
