'use strict';

const mathematics = require('./mathematics');
const DOMAIN = 'bounded_function_induction';
const identity = value => value && /^op_[a-f0-9]{8}$/.test(value.op) && [0, 1].includes(value.epoch);
const key = value => `${value.op}:${value.epoch}`;

function rowValid(row) {
  return identity(row) && Number.isSafeInteger(row.x) && Math.abs(row.x) <= 32
    && Number.isSafeInteger(row.y) && Math.abs(row.y) <= 10000;
}

function contextValid(context) {
  if (!context || !Array.isArray(context.observations) || !Array.isArray(context.requested)) return false;
  if (context.observations.length > 100 || context.requested.length < 1 || context.requested.length > 8) return false;
  return context.observations.every(rowValid) && context.requested.every(identity)
    && new Set(context.requested.map(key)).size === context.requested.length;
}

function declarationValid(rule) {
  if (!identity(rule) || !Number.isFinite(rule.confidence) || rule.confidence < 0 || rule.confidence > 1) return false;
  if (rule.reason === 'answerable') return mathematics.programValid(rule);
  if (!['missing', 'ambiguous'].includes(rule.reason) || rule.confidence !== 0) return false;
  return rule.kind === 'unknown' && ['a', 'b', 'c'].every(field => rule[field] === 0);
}

function declarationsValid(rules, requested) {
  if (!Array.isArray(rules) || rules.length !== requested.length) return false;
  if (!rules.every(declarationValid)) return false;
  const wanted = new Set(requested.map(key));
  return new Set(rules.map(key)).size === wanted.size && rules.every(rule => wanted.has(key(rule)));
}

function parse(report) {
  if (report?.fullTextTruncated) throw Error('FUNCTION_INDUCTION_TRUNCATED_OUTPUT');
  const raw = JSON.parse(report?.fullText || '{}');
  if (!Array.isArray(raw.functionPrograms?.rules)) throw Error('FUNCTION_INDUCTION_ARTIFACT_REQUIRED');
  return raw.functionPrograms.rules;
}

module.exports = {DOMAIN, identity, key, rowValid, contextValid, declarationValid, declarationsValid, parse};
