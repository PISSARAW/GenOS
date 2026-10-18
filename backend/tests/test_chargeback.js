'use strict';

const assert = require('assert');
const svc = require('../src/services/chargebackService');

const cb = svc.buildChargeback({
  chargebackId: 'cb1',
  missionId: 'm1',
  runId: 'r1',
  workerId: 'w1',
  budgetScope: 'mission',
  currency: 'USD'
});

assert.strictEqual(cb.schema, 'genos.chargeback/v1');
assert.strictEqual(cb.status, 'open');
assert.strictEqual(cb.total_amount_usd, 0);

const withItem = svc.addLineItem(cb, {
  id: 'li1',
  description: 'inference tokens',
  amountUsd: 12.50,
  category: 'inference',
  referenceId: 'r1',
  referenceType: 'run'
});
assert.strictEqual(withItem.lineItems.length, 1);
assert.strictEqual(withItem.total_amount_usd, 12.50);

const withItem2 = svc.addLineItem(withItem, {
  id: 'li2',
  description: 'worker time',
  amountUsd: 7.25,
  category: 'worker'
});
assert.strictEqual(withItem2.total_amount_usd, 19.75);

const settled = svc.settleChargeback(withItem2);
assert.strictEqual(settled.status, 'settled');
assert.ok(settled.settled_at);

const receipt = svc.buildReceipt(settled);
assert.strictEqual(receipt.valid, true);
assert.strictEqual(receipt.total_amount_usd, 19.75);

const aggregated = svc.aggregateChargebacks([settled]);
assert.strictEqual(aggregated.total_amount_usd, 19.75);
assert.strictEqual(aggregated.chargeback_count, 1);
assert.ok(aggregated.by_category.inference);

try {
  svc.addLineItem(cb, { amountUsd: -1 });
  assert.fail('should have thrown for negative amount');
} catch (err) {
  assert.ok(err.message.includes('non-negative'));
}

console.log('✓ chargebackService tests passed');
