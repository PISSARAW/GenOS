'use strict';

const v = require('./usageBindings');

function exposed(operation) {
  return operation.final ? 0 : Math.max(0, operation.maximumAmount - operation.cumulativeAmount);
}

function exposureTotal(operations) {
  return operations.reduce((total, operation) => v.amount(total + exposed(operation)), 0);
}

function begin(allocation, operations, request) {
  if (allocation.status !== 'active') throw new Error('ALLOSTASIS allocation no longer admits work.');
  if (request.purpose !== 'work') throw new Error('ALLOSTASIS protected recovery reserve requires a dedicated allocation policy.');
  const prior = operations.find(operation => operation.operationId === request.operationId);
  if (prior) {
    if (prior.maximumAmount !== request.maximumAmount || prior.purpose !== request.purpose) throw new Error('ALLOSTASIS operation exposure idempotency conflict.');
    return { operation: prior, duplicate: true };
  }
  if (exposureTotal(operations) + request.maximumAmount > allocation.held) throw new Error('ALLOSTASIS exposure exceeds unexposed held quota.');
  return { operation: { ...request, cumulativeAmount: 0, status: 'pending', final: false }, duplicate: false };
}

function observed(operation, proof) {
  if (operation.final) throw new Error('ALLOSTASIS completed operation cannot receive another usage receipt.');
  if (proof.status === 'unknown') return { ...operation, status: 'unknown' };
  if (proof.cumulativeAmount < operation.cumulativeAmount) throw new Error('ALLOSTASIS cumulative consumption cannot decrease.');
  return { ...operation, cumulativeAmount: proof.cumulativeAmount, status: proof.final ? 'completed' : 'partial', final: proof.final };
}

function charge(input) {
  const { allocation, pool, previous, operation, operations } = input;
  const delta = operation.cumulativeAmount - previous.cumulativeAmount;
  const unknownExposure = exposureTotal(operations);
  const held = Math.max(0, allocation.held - delta, unknownExposure);
  const next = { ...allocation, spent: v.amount(allocation.spent + delta), held,
    unknownExposure, generation: v.amount(allocation.generation + 1) };
  const nextPool = { ...pool, consumed: v.amount(pool.consumed + delta), held: v.amount(pool.held - allocation.held + held),
    generation: v.amount(pool.generation + 1) };
  v.amount(nextPool.held);
  const overBudget = operation.cumulativeAmount > operation.maximumAmount || next.spent > allocation.allocation.amount ||
    nextPool.consumed + nextPool.held + nextPool.protectedReserve > nextPool.capacity;
  if (overBudget) next.status = 'overdrawn';
  return { allocation: next, pool: nextPool, delta, overBudget };
}

function release(allocation, pool, reason) {
  const released = Math.max(0, allocation.held - allocation.unknownExposure);
  const next = { ...allocation, held: allocation.held - released, released: v.amount(allocation.released + released),
    status: reason === 'preempt' ? 'preempted' : 'released', generation: v.amount(allocation.generation + 1) };
  const nextPool = { ...pool, held: pool.held - released, generation: v.amount(pool.generation + 1) };
  v.amount(nextPool.held);
  return { allocation: next, pool: nextPool, released, blockedExposure: next.unknownExposure };
}

module.exports = { exposed, exposureTotal, begin, observed, charge, release };
