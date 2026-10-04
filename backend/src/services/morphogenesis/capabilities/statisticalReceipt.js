'use strict';

const crypto = require('crypto');

const METHOD = 'bernoulli-e-process-v1';
const MAX_OBSERVATIONS = 10000;

function canonical(value) {
  return JSON.stringify(value);
}

function secret() {
  const key = process.env.GENOS_STATISTICAL_RECEIPT_SECRET;
  if (!key || key.length < 32) throw new Error('STATISTICAL_RECEIPT_SECRET_REQUIRED');
  return key;
}

function evidence(value) {
  const observations = value?.observations;
  if (!Array.isArray(observations) || !observations.length || observations.length > MAX_OBSERVATIONS) {
    throw new Error('Binary observations required');
  }
  const refs = new Set();
  for (const item of observations) {
    if (![0, 1].includes(item.outcome) || !item.evidenceRef || refs.has(item.evidenceRef)) {
      throw new Error('Each binary observation needs unique evidence');
    }
    refs.add(item.evidenceRef);
  }
  return observations;
}

function anytimePValue(observations) {
  let logValue = 0;
  let maxLogValue = 0;
  for (const item of observations) {
    logValue += Math.log(item.outcome === 1 ? 1.5 : 0.5);
    maxLogValue = Math.max(maxLogValue, logValue);
  }
  return Math.exp(-maxLogValue);
}

function payload(input) {
  const observations = evidence(input);
  if (!input.testId || !input.protocolHash || !input.evaluationSetId
    || !input.verifierId || !input.assessmentRef) throw new Error('Statistical provenance required');
  return { testId: String(input.testId), status: 'VERIFIED', method: METHOD,
    protocolHash: String(input.protocolHash), evaluationSetId: String(input.evaluationSetId),
    verifierId: String(input.verifierId), assessmentRef: String(input.assessmentRef),
    observations, pValue: anytimePValue(observations) };
}

function signature(body) {
  return crypto.createHmac('sha256', secret()).update(canonical(body)).digest('hex');
}

function issue(input) {
  const body = payload(input);
  return { ...body, signature: signature(body) };
}

function verify(receipt) {
  if (!receipt || receipt.method !== METHOD || typeof receipt.signature !== 'string') return false;
  const { signature: supplied, ...body } = receipt;
  const expected = signature(payload(body));
  const left = Buffer.from(supplied, 'hex');
  const right = Buffer.from(expected, 'hex');
  return left.length === right.length && crypto.timingSafeEqual(left, right)
    && canonical(body) === canonical(payload(body));
}

module.exports = { METHOD, issue, verify, anytimePValue };
