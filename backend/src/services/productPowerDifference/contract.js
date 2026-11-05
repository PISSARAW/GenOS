'use strict';

const DOMAIN = 'product_power_difference';
const KEYS = ['A', 'B', 'C', 'D', 'E'];

function premisesValid(value) {
  if (!value || !KEYS.every(key => Number.isSafeInteger(value[key]) && value[key] >= 0)) return false;
  return value.A <= 10000 && value.B <= 10000 && value.C <= 1000 && value.D <= 16
    && value.E <= 100000000 && Object.keys(value).length === KEYS.length;
}

function parse(report) {
  const claims = report?.claims;
  if (!Array.isArray(claims) || claims.length !== 1 || typeof claims[0].statement !== 'string') {
    throw new Error('EQUATION_CANDIDATE_REQUIRED');
  }
  const candidate = JSON.parse(claims[0].statement);
  if (!candidate || Array.isArray(candidate) || Object.keys(candidate).sort().join(',') !== 'A,B,C,D,E,N'
      || ![...KEYS, 'N'].every(key => Number.isSafeInteger(candidate[key]))) {
    throw new Error('EQUATION_CANDIDATE_INVALID');
  }
  return candidate;
}

function instruction(contract) {
  const method = contract.mission?.methodContract;
  if (method?.evaluator?.domain !== DOMAIN) return '';
  return ' For this sealed arithmetic evaluator, compute N=(A*B)+C^D-E from the declared premises. '
    + 'Return exactly one claim. Its statement must be a JSON-encoded string with exactly the integer fields A,B,C,D,E,N. '
    + 'Include genuine source references in evidence and preserve the required specialtyAssessment. '
    + 'The runtime independently checks the equation; do not self-certify verification.';
}

module.exports = { DOMAIN, KEYS, premisesValid, parse, instruction };
