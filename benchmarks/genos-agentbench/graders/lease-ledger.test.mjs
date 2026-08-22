import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const target = process.env.TARGET_DIR;
if (!target) throw new Error('TARGET_DIR is required');
const { createLedger } = await import(pathToFileURL(path.join(target, 'ledger.mjs')));
const event = (id, account, delta, version) => ({ id, account, delta, version });

test('orders unseen events by version', () => {
  const ledger = createLedger({ a: 20 });
  assert.deepEqual(ledger.applyBatch([event('e2', 'a', 3, 2), event('e1', 'a', -2, 1)]), ['e1', 'e2']);
  assert.equal(ledger.balance('a'), 21); assert.equal(ledger.version('a'), 2);
});
test('identical replay is a no-op', () => {
  const ledger = createLedger({ a: 5 }); const e = event('e1', 'a', 1, 1);
  ledger.applyBatch([e]); assert.deepEqual(ledger.applyBatch([{ ...e }]), []); assert.equal(ledger.balance('a'), 6);
});
test('id collision rolls back the whole batch', () => {
  const ledger = createLedger({ a: 10 }); ledger.applyBatch([event('e1', 'a', 1, 1)]);
  assert.throws(() => ledger.applyBatch([event('e2', 'a', 1, 2), event('e1', 'a', 9, 1)]));
  assert.equal(ledger.balance('a'), 11); assert.equal(ledger.version('a'), 1); assert.equal(ledger.event('e2'), undefined);
});
test('unknown account is atomic', () => {
  const ledger = createLedger({ a: 10 });
  assert.throws(() => ledger.applyBatch([event('e1', 'a', 1, 1), event('e2', 'missing', 1, 1)]));
  assert.equal(ledger.balance('a'), 10); assert.equal(ledger.event('e1'), undefined);
});
test('version gap is rejected', () => {
  const ledger = createLedger({ a: 10 }); assert.throws(() => ledger.applyBatch([event('e2', 'a', 1, 2)]));
  assert.equal(ledger.version('a'), 0);
});
test('overdraft is atomic after sorting', () => {
  const ledger = createLedger({ a: 5 });
  assert.throws(() => ledger.applyBatch([event('e2', 'a', 10, 2), event('e1', 'a', -6, 1)]));
  assert.equal(ledger.balance('a'), 5); assert.equal(ledger.event('e2'), undefined);
});
test('unseen stale event is ignored', () => {
  const ledger = createLedger({ a: 5 }); ledger.applyBatch([event('e1', 'a', 1, 1), event('e2', 'a', 1, 2)]);
  assert.deepEqual(ledger.applyBatch([event('late', 'a', 100, 1)]), []); assert.equal(ledger.balance('a'), 7);
});
test('validates finite deltas and positive versions', () => {
  const ledger = createLedger({ a: 5 });
  assert.throws(() => ledger.applyBatch([event('bad', 'a', Number.NaN, 1)]));
  assert.throws(() => ledger.applyBatch([event('bad2', 'a', 1, 0)]));
  assert.equal(ledger.balance('a'), 5);
});
