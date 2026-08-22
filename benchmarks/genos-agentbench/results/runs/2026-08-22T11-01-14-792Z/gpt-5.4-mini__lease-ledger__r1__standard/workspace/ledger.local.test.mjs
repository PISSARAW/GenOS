import test from 'node:test';
import assert from 'node:assert/strict';
import { createLedger } from './ledger.mjs';

test('applies out-of-order events deterministically per account', () => {
  const ledger = createLedger({ a: 10 });
  const batch = [
    { id: 'e2', account: 'a', delta: 3, version: 2 },
    { id: 'e1', account: 'a', delta: -2, version: 1 },
  ];

  assert.deepEqual(ledger.applyBatch(batch), ['e1', 'e2']);
  assert.equal(ledger.balance('a'), 11);
  assert.equal(ledger.version('a'), 2);
});

test('rejects a version gap without mutating state', () => {
  const ledger = createLedger({ a: 10 });

  assert.throws(() => {
    ledger.applyBatch([{ id: 'e2', account: 'a', delta: 3, version: 2 }]);
  }, /skips version/);

  assert.equal(ledger.balance('a'), 10);
  assert.equal(ledger.version('a'), 0);
  assert.equal(ledger.event('e2'), undefined);
});

test('rolls back if a later event would make the balance negative', () => {
  const ledger = createLedger({ a: 10 });

  assert.throws(() => {
    ledger.applyBatch([
      { id: 'e1', account: 'a', delta: -3, version: 1 },
      { id: 'e2', account: 'a', delta: -8, version: 2 },
    ]);
  }, /negative balance/);

  assert.equal(ledger.balance('a'), 10);
  assert.equal(ledger.version('a'), 0);
  assert.equal(ledger.event('e1'), undefined);
  assert.equal(ledger.event('e2'), undefined);
});

test('ignores replayed identical committed events and rejects payload collisions', () => {
  const ledger = createLedger({ a: 10 });

  assert.deepEqual(ledger.applyBatch([{ id: 'e1', account: 'a', delta: 5, version: 1 }]), ['e1']);
  assert.deepEqual(ledger.applyBatch([{ id: 'e1', account: 'a', delta: 5, version: 1 }]), []);

  assert.throws(() => {
    ledger.applyBatch([{ id: 'e1', account: 'a', delta: 4, version: 1 }]);
  }, /id collision/);
});
