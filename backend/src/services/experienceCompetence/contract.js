'use strict';

const { digest } = require('../biologicalIntegrity');
const receipts = require('../epistemicVerifierReceiptService');

const SCHEMA = 'genos.verified-affine-observation/v1';
const validInteger = value => Number.isSafeInteger(value) && Math.abs(value) <= 1e12;
const validOperator = value => typeof value === 'string' && /^op_[a-f0-9]{8}$/.test(value);

function ruleValid(rule) {
  return Boolean(rule) && Number.isSafeInteger(rule.a) && Number.isSafeInteger(rule.b)
    && Math.abs(rule.a) <= 1000000 && Math.abs(rule.b) <= 1000000;
}

function observationPayload(input) {
  return { schema: SCHEMA, agentId: input.agentId, runId: input.runId,
    op: input.op, x: input.x, y: input.y, forecast: input.forecast, correct: input.correct };
}

function validateDomain(input) {
  if (!validOperator(input.op) || !validInteger(input.x) || !validInteger(input.y)) throw Error('Invalid affine observation');
  if (!Number.isFinite(input.forecast) || input.forecast < 0 || input.forecast > 1
    || typeof input.correct !== 'boolean') throw Error('Invalid observed forecast outcome');
}

function validateObservation(input, trustedVerifier) {
  validateDomain(input);
  const payload = observationPayload(input);
  if (!input.agentId || !input.runId || input.receipt?.resultId !== input.runId) throw Error('Observation binding missing');
  if (input.receipt.evidenceDigest !== digest(payload) || input.receipt.status !== 'verified'
    || input.receipt.independent !== true || !receipts.validateReceipt(input.receipt, [trustedVerifier])) {
    throw Error('Independent signed observation required');
  }
  return { ...payload, receipt: input.receipt };
}

module.exports = { SCHEMA, validInteger, validOperator, ruleValid, observationPayload, validateObservation, digest };
