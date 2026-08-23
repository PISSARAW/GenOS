import test from 'node:test';
import assert from 'node:assert/strict';
import { createLedger } from './ledger.mjs';

test('sorts a batch by account version before committing it', () => {
  const ledger = createLedger({ a: 10 });

  assert.deepEqual(ledger.applyBatch([
    { id: 'second', account: 'a', delta: -3, version: 2 },
    { id: 'first', account: 'a', delta: 5, version: 1 },
  ]), ['first', 'second']);
  assert.equal(ledger.balance('a'), 12);
  assert.equal(ledger.version('a'), 2);
});

test('leaves the ledger unchanged when any event in a batch fails', () => {
  const ledger = createLedger({ a: 10 });

  assert.throws(() => ledger.applyBatch([
    { id: 'first', account: 'a', delta: 1, version: 1 },
    { id: 'gap', account: 'a', delta: 1, version: 3 },
  ]));
  assert.equal(ledger.balance('a'), 10);
  assert.equal(ledger.version('a'), 0);
  assert.equal(ledger.event('first'), undefined);
});

test('replays matching events and rejects id collisions', () => {
  const ledger = createLedger({ a: 10 });
  const event = { id: 'e1', account: 'a', delta: 2, version: 1 };

  assert.deepEqual(ledger.applyBatch([event]), ['e1']);
  assert.deepEqual(ledger.applyBatch([event]), []);
  assert.throws(() => ledger.applyBatch([{ ...event, delta: 3 }]));
  assert.equal(ledger.balance('a'), 12);
  assert.equal(ledger.version('a'), 1);
});

test('ignores unseen stale events but rejects a negative staged balance', () => {
  const ledger = createLedger({ a: 2 });
  ledger.applyBatch([{ id: 'e1', account: 'a', delta: 1, version: 1 }]);

  assert.deepEqual(ledger.applyBatch([{ id: 'stale', account: 'a', delta: 100, version: 1 }]), []);
  assert.throws(() => ledger.applyBatch([{ id: 'e2', account: 'a', delta: -4, version: 2 }]));
  assert.equal(ledger.balance('a'), 3);
  assert.equal(ledger.version('a'), 1);
  assert.equal(ledger.event('e2'), undefined);
});
