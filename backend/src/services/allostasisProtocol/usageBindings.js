'use strict';

const { canonicalize, digest } = require('../evidenceProtocol/canonical');

const UNITS = Object.freeze(['tokens', 'bytes', 'milliseconds', 'model_calls', 'micro_EUR', 'micro_USD']);
const copy = value => JSON.parse(canonicalize(value));
const same = (left, right) => digest(left) === digest(right);

function exact(value, fields) {
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('ALLOSTASIS usage object required.');
  if (Object.keys(value).length !== fields.length || fields.some(field => !Object.hasOwn(value, field))) {
    throw new Error('ALLOSTASIS usage unexpected or missing fields.');
  }
}

function id(value) {
  if (typeof value !== 'string' || !value || value !== value.trim() || value.length > 512) throw new Error('ALLOSTASIS usage identifier invalid.');
}

function amount(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('ALLOSTASIS usage requires a nonnegative safe integer.');
  return value;
}

function unit(value) {
  if (!UNITS.includes(value)) throw new Error('ALLOSTASIS usage unit unsupported.');
  return value;
}

function hash(value) {
  if (!/^sha256:[a-f0-9]{64}$/.test(value || '')) throw new Error('ALLOSTASIS usage digest invalid.');
}

function query(input) {
  const result = copy(input);
  exact(result, ['scope', 'missionId', 'conversationId', 'allocationId', 'allocationDigest']);
  exact(result.scope, ['organizationId', 'projectId']); Object.values(result.scope).forEach(id);
  ['missionId', 'conversationId', 'allocationId'].forEach(field => id(result[field]));
  hash(result.allocationDigest);
  return result;
}

function exposure(input) {
  exact(input, ['query', 'operationId', 'maximumAmount', 'purpose']);
  id(input.operationId); amount(input.maximumAmount);
  if (!['work', 'recovery'].includes(input.purpose)) throw new Error('ALLOSTASIS exposure purpose invalid.');
  return { ...copy(input), query: query(input.query) };
}

function proof(input, request) {
  const value = copy(input);
  if (value.requestDigest !== digest(request)) throw new Error('ALLOSTASIS usage proof does not bind the exact request.');
  hash(value.receiptDigest); id(value.evidenceRef);
  if (!['known', 'unknown'].includes(value.status)) throw new Error('ALLOSTASIS usage outcome invalid.');
  if (typeof value.final !== 'boolean') throw new Error('ALLOSTASIS usage finality must be observed explicitly.');
  if (value.status === 'unknown') {
    if (value.final || value.cumulativeAmount !== null || value.source !== 'unavailable') throw new Error('ALLOSTASIS unknown usage is not zero or final.');
  } else {
    amount(value.cumulativeAmount);
    if (!['exact', 'provider_receipt'].includes(value.source)) throw new Error('ALLOSTASIS known usage requires a measured source.');
  }
  return value;
}

function frozen(value) {
  const result = copy(value);
  const freeze = item => {
    if (item && typeof item === 'object') { Object.values(item).forEach(freeze); Object.freeze(item); }
    return item;
  };
  return freeze(result);
}

module.exports = { UNITS, copy, same, exact, id, amount, unit, hash, query, exposure, proof, frozen };
