'use strict';

const bounded = require('./boundedOperationService');
const executionResults = require('./executionResultService');

async function execute(input) {
  if (typeof input.execute !== 'function') return { status: 'WAITING_FOR_EXECUTOR' };
  const start = performance.now();
  let captured;
  try { captured = executionResults.capture(await bounded.run(input.execute, operationContext(input), input.timeoutMs)); } catch (error) {
    return { status: 'EXECUTION_FAILED', reason: error.code || error.message };
  }
  const { result, executionDigest } = captured;
  const latencyMs = performance.now() - start;
  if (typeof input.verify !== 'function') return { status: 'WAITING_FOR_VERIFIER', result };
  const checked = await verify(input, { result: structuredClone(result), executionDigest });
  if (checked.failed) return { status: 'VERIFICATION_FAILED', result, reason: checked.reason };
  const receipt = checked.receipt;
  if (!receipt) return { status: 'VERIFICATION_REJECTED', result };
  if (!matchesExecution(input, { receipt, executionDigest })) return { status: 'VERIFICATION_REJECTED', result };
  return { status: 'VERIFIED', result, receipt, latencyMs };
}

function operationContext(input) {
  return { route: structuredClone(input.route.route), need: structuredClone(input.need), deadline: input.deadline };
}

function matchesExecution(input, checked) {
  return checked.receipt.routeId === input.route.route.routeId && checked.receipt.needId === input.need.needId
    && checked.receipt.capability === input.need.capability && checked.receipt.executionDigest === checked.executionDigest;
}

async function verify(input, captured) {
  try {
    const receipt = await bounded.run(input.verify, { ...operationContext(input), ...captured }, input.timeoutMs);
    return { receipt };
  } catch (error) { return { failed: true, reason: error.code || error.message }; }
}

module.exports = { execute };
