'use strict';

const crypto = require('crypto');

const SCALES = Object.freeze(['parameter', 'function', 'module', 'dependency', 'architecture', 'problem']);

function signature(value) {
  if (!value || !value.initialState || !value.hypothesis || !value.family || !value.scale) {
    throw new Error('initialState, hypothesis, family and scale are required');
  }
  if (!SCALES.includes(value.scale)) throw new Error('Unknown intervention scale');
  const canonical = [value.initialState, value.hypothesis, value.family, value.scale,
    ...(value.evidenceRefs || []).map(String).sort()];
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function hasNewEvidence(item, last) {
  return (item.evidenceRefs || []).some((ref) => !(last.evidenceRefs || []).includes(ref));
}

function distinct(item, context) {
  if (item.replicationOf) return Boolean(item.independentVerifierId);
  if (context.prior.has(signature(item))) return false;
  const last = context.last;
  return !last || item.family !== last.family || item.scale !== last.scale || hasNewEvidence(item, last);
}

function planNext(input = {}) {
  const attempts = Array.isArray(input.attempts) ? input.attempts : [];
  const candidates = Array.isArray(input.candidates) ? input.candidates : [];
  const prior = new Set(attempts.map((item) => signature(item)));
  const last = attempts.at(-1) || null;
  const allowed = candidates.filter((item) => distinct(item, { prior, last }));
  const bounded = allowed.filter((item) => SCALES.indexOf(item.scale) <= Number(input.maxScaleIndex ?? SCALES.length - 1));
  const ordered = bounded.sort((a, b) => SCALES.indexOf(a.scale) - SCALES.indexOf(b.scale));
  if (!ordered.length) return { permitted: false, reason: 'NO_DISTINCT_AUTHORIZED_ATTEMPT' };
  const next = ordered[0];
  return { permitted: true, candidate: next, signature: signature(next),
    reason: next.replicationOf ? 'INDEPENDENT_REPLICATION' : last?.scale === next.scale
      ? 'CHANGED_INTERVENTION_OR_EVIDENCE' : 'JUSTIFIED_SCOPE_CHANGE' };
}

module.exports = { SCALES, signature, planNext };
