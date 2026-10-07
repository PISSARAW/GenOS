'use strict';

function invalid(message, code = 'HOLOBIONT_VARIANT_RUNTIME_INVALID') {
  return Object.assign(new Error(message), { code });
}

function record(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(`${field} must be an object.`);
  return value;
}

function text(value, field) {
  const result = String(value || '').trim();
  if (!result) throw invalid(`${field} is required.`);
  return result;
}

function evidence(value, field = 'evidenceRefs') {
  const refs = Array.isArray(value) ? [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))] : [];
  if (!refs.length) throw invalid(`${field} must contain evidence references.`, 'HOLOBIONT_EVIDENCE_REQUIRED');
  return refs;
}

function score(value, field) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0 || result > 1) throw invalid(`${field} must be between 0 and 1.`);
  return result;
}

function sameBudget(left, right) {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) =>
    key === rightKeys[index] && Number(left[key]) === Number(right[key]));
}


module.exports = { invalid, record, text, evidence, score, sameBudget };
