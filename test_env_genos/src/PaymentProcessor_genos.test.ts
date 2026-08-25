// PaymentProcessor_genos.test.ts - Perimeter tests, Worker GenOS (genome v2)
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { CurrencyMismatchError, PaymentProcessor } from './PaymentProcessor_genos';

import type { Money } from './PaymentProcessor_genos';

function eur(amount: number): Money { return { amount, currency: 'EUR' }; }

test('known account accepts a same-currency payment', () => {
  const proc = new PaymentProcessor();
  assert.equal(proc.processPayment('acct_eur_1', eur(100.0)), 1100.0);
});

test('unknown account throws', () => {
  const proc = new PaymentProcessor();
  assert.throws(() => proc.processPayment('acct_ghost', eur(1.0)), /unknown account/);
});

test('negative resulting balance throws insufficient funds', () => {
  const proc = new PaymentProcessor();
  assert.throws(() => proc.processPayment('acct_eur_1', eur(-9999.0)), /insufficient funds/);
});

test('currency mismatch is rejected, not silently added', () => {
  const proc = new PaymentProcessor();
  const usdOnEur: Money = { amount: 50.0, currency: 'USD' };
  assert.throws(() => proc.processPayment('acct_eur_1', usdOnEur), CurrencyMismatchError);
});

test('refund inverts a payment', () => {
  const proc = new PaymentProcessor();
  proc.processPayment('acct_usd_1', { amount: 100.0, currency: 'USD' });
  assert.equal(proc.refund('acct_usd_1', { amount: 100.0, currency: 'USD' }), 500.0);
});
