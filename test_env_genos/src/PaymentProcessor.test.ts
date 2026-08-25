// PaymentProcessor.test.ts - Written by "Worker GenOS" BEFORE any refactoring.
// Genome: risk_tolerance=0.10, verification_threshold=0.80, objectives: [tests_pass]
// => Perimeter secured first: these tests pin down current behavior AND the expected
//    currency-safety contract. They must pass after refactoring.
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { PaymentProcessor } from './PaymentProcessor';

test('known account accepts a same-currency payment', () => {
  const proc = new PaymentProcessor();
  const bal = proc.processPayment('acct_eur_1', 100.0, 'EUR');
  assert.equal(bal, 1100.0);
});

test('unknown account throws', () => {
  const proc = new PaymentProcessor();
  assert.throws(() => proc.processPayment('acct_ghost', 1.0, 'EUR'), /unknown account/);
});

test('negative resulting balance throws insufficient funds', () => {
  const proc = new PaymentProcessor();
  assert.throws(() => proc.processPayment('acct_eur_1', -9999.0, 'EUR'), /insufficient funds/);
});

// SECURITY CONTRACT TEST: mixing currencies MUST NOT silently corrupt balances.
// On the legacy implementation this test FAILS (EUR balance += USD amount).
test('currency mismatch is rejected, not silently added', () => {
  const proc = new PaymentProcessor();
  let rejected = false;
  try {
    proc.processPayment('acct_eur_1', 50.0, 'USD');
  } catch {
    rejected = true;
  }
  assert.ok(rejected, 'SECURITY HOLE: EUR account accepted USD amount without error');
});
