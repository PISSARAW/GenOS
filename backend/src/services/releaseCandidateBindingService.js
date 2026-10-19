'use strict';

const SAFE_REFERENCE = /^[A-Za-z0-9._:/-]{1,256}$/;

function validate(value) {
  if (value == null) return { candidateRef: null };
  if (typeof value !== 'string' || !SAFE_REFERENCE.test(value.trim())) {
    return { error: { code: 'INVALID_CANDIDATE_REFERENCE',
      message: 'candidateRef must be a bounded opaque reference.' } };
  }
  return { candidateRef: value.trim() };
}

module.exports = { validate };
