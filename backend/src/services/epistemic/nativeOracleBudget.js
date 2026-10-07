'use strict';

const values = require('../trinityProvenanceValues');
const MAXIMUM = Object.freeze({ executions: 2, latencyMs: 10000 });

function bounded(value, maximum) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw values.failure('ORACLE_BUDGET_INVALID');
  return value;
}

function compile(contract, input, total) {
  const policy = contract.promotion?.native_verification;
  if (!policy) return null;
  const grant = { executions: bounded(policy.executions, MAXIMUM.executions),
    latencyMs: Math.min(bounded(policy.latencyMs, MAXIMUM.latencyMs), Math.floor(total.latencyMs)) };
  if (!input) return grant;
  return { executions: bounded(input.executions, grant.executions), latencyMs: bounded(input.latencyMs, grant.latencyMs) };
}

module.exports = { MAXIMUM, compile };
