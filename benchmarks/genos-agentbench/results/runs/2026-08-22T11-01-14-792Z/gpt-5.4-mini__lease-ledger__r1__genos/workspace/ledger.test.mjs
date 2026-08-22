import test from 'node:test';
import assert from 'node:assert/strict';
import { createLedger } from './ledger.mjs';

test('applyBatch is atomic when a later event is invalid', () => {
  const ledger = createLedger({ a: 10 });

  assert.throws(() => {
    ledger.applyBatch([
      { id: 'e1', account: 'a', delta: 5, version: 1 },
      { id: 'e2', account: 'missing', delta: 1, version: 1 },
    ]);
  }, /unknown account/);

  assert.equal(ledger.balance('a'), 10);
  assert.equal(ledger.version('a'), 0);
  assert.equal(ledger.event('e1'), undefined);
});

test('applyBatch is deterministic for out-of-order input and ignores stale replays', () => {
  const ledger = createLedger({ a: 10 });

  assert.deepEqual(ledger.applyBatch([
    { id: 'e2', account: 'a', delta: 5, version: 2 },
    { id: 'e1', account: 'a', delta: -3, version: 1 },
  ]), ['e1', 'e2']);

  assert.equal(ledger.balance('a'), 12);
  assert.equal(ledger.version('a'), 2);

  assert.deepEqual(ledger.applyBatch([
    { id: 'e1', account: 'a', delta: -3, version: 1 },
  ]), []);
  assert.equal(ledger.balance('a'), 12);
  assert.equal(ledger.version('a'), 2);
});

test('applyBatch rejects id collisions and version gaps without mutating state', () => {
  const ledger = createLedger({ a: 10 });

  assert.deepEqual(ledger.applyBatch([
    { id: 'e1', account: 'a', delta: 1, version: 1 },
  ]), ['e1']);

  assert.throws(() => {
    ledger.applyBatch([
      { id: 'e1', account: 'a', delta: 2, version: 1 },
    ]);
  }, /id collision/);

  assert.equal(ledger.balance('a'), 11);
  assert.equal(ledger.version('a'), 1);

  assert.throws(() => {
    ledger.applyBatch([
      { id: 'e2', account: 'a', delta: 1, version: 3 },
    ]);
  }, /version gap/);

  assert.equal(ledger.balance('a'), 11);
  assert.equal(ledger.version('a'), 1);
});

test('applyBatch rejects negative balances without mutating state', () => {
  const ledger = createLedger({ a: 10 });

  assert.throws(() => {
    ledger.applyBatch([
      { id: 'e1', account: 'a', delta: -11, version: 1 },
    ]);
  }, /negative balance/);

  assert.equal(ledger.balance('a'), 10);
  assert.equal(ledger.version('a'), 0);
  assert.equal(ledger.event('e1'), undefined);
});
