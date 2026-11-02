'use strict';

const assert = require('node:assert/strict');
const t = require('../src/services/allostasisProtocol/usageTransitions');

const allocation = () => ({ status: 'active', spent: 0, held: 80, released: 0,
  unknownExposure: 0, generation: 0, allocation: { amount: 80 } });
const pool = () => ({ capacity: 100, protectedReserve: 10, consumed: 0, held: 80, generation: 0 });
const operation = (operationId, maximumAmount) => ({ operationId, maximumAmount, cumulativeAmount: 0,
  status: 'pending', final: false, purpose: 'work' });

function unknownIsNotFree() {
  const initial = allocation();
  const pending = operation('operation-a', 60);
  const partial = t.observed(pending, { status: 'known', cumulativeAmount: 20, final: false });
  const charged = t.charge({ allocation: initial, pool: pool(), previous: pending, operation: partial, operations: [partial] });
  assert.equal(charged.allocation.spent, 20);
  assert.equal(charged.allocation.held, 60);
  assert.equal(charged.allocation.unknownExposure, 40);
  const closed = t.release(charged.allocation, charged.pool, 'preempt');
  assert.equal(closed.released, 20);
  assert.equal(closed.allocation.held, 40);
  assert.equal(closed.pool.consumed, 20);
  assert.equal(closed.pool.protectedReserve, 10);
  assert.throws(() => t.begin(closed.allocation, [partial], { operationId: 'new', maximumAmount: 1, purpose: 'work' }), /no longer admits/);
  const final = t.observed(partial, { status: 'known', cumulativeAmount: 40, final: true });
  const reconciled = t.charge({ allocation: closed.allocation, pool: closed.pool,
    previous: partial, operation: final, operations: [final] });
  const released = t.release(reconciled.allocation, reconciled.pool, 'complete');
  assert.equal(released.pool.consumed, 40);
  assert.equal(released.allocation.released, 40);
  assert.equal(released.allocation.held, 0);
}

function realOverrunKeepsOtherExposure() {
  const first = operation('first', 60);
  const second = operation('second', 20);
  const final = t.observed(first, { status: 'known', cumulativeAmount: 90, final: true });
  const charged = t.charge({ allocation: allocation(), pool: pool(), previous: first,
    operation: final, operations: [final, second] });
  assert.equal(charged.allocation.spent, 90);
  assert.equal(charged.pool.consumed, 90);
  assert.equal(charged.allocation.held, 20);
  assert.equal(charged.allocation.unknownExposure, 20);
  assert.equal(charged.pool.held, 20);
  assert.equal(charged.overBudget, true);
  assert.equal(charged.allocation.status, 'overdrawn');
  assert.equal(t.release(charged.allocation, charged.pool, 'cancel').released, 0);
}

function noInferredZeroOrRecoveryGrant() {
  const pending = operation('one', 60);
  const unknown = t.observed(pending, { status: 'unknown' });
  assert.equal(t.exposed(unknown), 60);
  const prior = { ...pending, cumulativeAmount: 20 };
  assert.throws(() => t.observed(prior, { status: 'known', cumulativeAmount: 0, final: true }), /cannot decrease/);
  assert.throws(() => t.begin(allocation(), [], { operationId: 'recover', maximumAmount: 10, purpose: 'recovery' }), /dedicated allocation/);
  assert.throws(() => t.begin(allocation(), [pending], { operationId: 'two', maximumAmount: 21, purpose: 'work' }), /exceeds/);
  assert.equal(t.begin(allocation(), [pending], pending).duplicate, true);
}

unknownIsNotFree();
realOverrunKeepsOtherExposure();
noInferredZeroOrRecoveryGrant();
console.log('ALLOSTASIS cumulative consumption, protected reserve and retained unknown exposure: PASS');
