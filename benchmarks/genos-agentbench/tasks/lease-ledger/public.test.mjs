import test from 'node:test';
import assert from 'node:assert/strict';
import { createLedger } from './ledger.mjs';

test('applies a basic event', () => {
  const ledger = createLedger({ a: 10 });
  assert.deepEqual(ledger.applyBatch([{ id: 'e1', account: 'a', delta: 5, version: 1 }]), ['e1']);
  assert.equal(ledger.balance('a'), 15);
  assert.equal(ledger.version('a'), 1);
});
