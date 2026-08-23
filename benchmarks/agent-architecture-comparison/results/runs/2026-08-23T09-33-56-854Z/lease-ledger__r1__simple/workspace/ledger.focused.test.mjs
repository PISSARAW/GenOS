import test from 'node:test';
import assert from 'node:assert/strict';
import { createLedger } from './ledger.mjs';

test('commits out-of-order events in version order and replays exactly once', () => {
  const ledger = createLedger({ a: 10 });
  const first = { id: 'one', account: 'a', delta: -3, version: 1 };
  const second = { id: 'two', account: 'a', delta: 8, version: 2 };

  assert.deepEqual(ledger.applyBatch([second, first]), ['one', 'two']);
  assert.equal(ledger.balance('a'), 15);
  assert.deepEqual(ledger.applyBatch([second, first]), []);
  assert.equal(ledger.balance('a'), 15);
});

test('a rejected batch is atomic', () => {
  const ledger = createLedger({ a: 10 });
  assert.throws(() => ledger.applyBatch([
    { id: 'one', account: 'a', delta: 2, version: 1 },
    { id: 'three', account: 'a', delta: 2, version: 3 },
  ]), /version gap/);
  assert.equal(ledger.balance('a'), 10);
  assert.equal(ledger.version('a'), 0);
  assert.equal(ledger.event('one'), undefined);
});

test('conflicting event ids are rejected without altering committed state', () => {
  const ledger = createLedger({ a: 10 });
  ledger.applyBatch([{ id: 'one', account: 'a', delta: 2, version: 1 }]);
  assert.throws(() => ledger.applyBatch([
    { id: 'one', account: 'a', delta: 3, version: 1 },
  ]), /collision/);
  assert.equal(ledger.balance('a'), 12);
});
