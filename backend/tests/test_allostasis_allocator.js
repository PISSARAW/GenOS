'use strict';

const assert = require('node:assert/strict');
const { digest } = require('../src/services/evidenceProtocol/canonical');
const fixture = require('./helpers/allostasisAllocationFixture');

async function simultaneousLastCapacityAndRestart() {
  const setup = await fixture.setup();
  try {
    const first = await fixture.request(setup, { client: 'client-a' });
    const second = await fixture.request(setup, { client: 'client-b' });
    const results = await Promise.all([setup.allocator.apply(first), setup.allocator.apply(second)]);
    assert.deepEqual(results.map((result) => result.status).sort(), ['granted', 'rejected']);
    const pool = await setup.allocator.pool(setup.poolQuery);
    assert.equal(pool.held, 8); assert.equal(pool.consumed, 0); assert.equal(pool.protectedReserve, 2);
    assert.equal(pool.held + pool.consumed + pool.protectedReserve, pool.capacity);
    const rows = await setup.allocator.db.all('SELECT * FROM model_budget_reservations');
    assert.equal(rows.length, 1); assert.equal(rows[0].reserved_tokens, 8); assert.equal(rows[0].token_ceiling, 8);
    const granted = results.find((result) => result.status === 'granted');
    assert.equal(granted.allocationDigest, digest(granted.allocation));
    const outbox = await setup.allocator.outbox(setup.poolQuery);
    assert.equal(outbox.length, 2);
    assert.deepEqual(outbox.map((frame) => frame.type).sort(), ['GRANT', 'REJECT']);
    for (const frame of outbox) assert.deepEqual(frame.sender, fixture.actor('regulator'));
    setup.allocator.close();
    Object.assign(setup, await fixture.instance(setup.filename));
    assert.deepEqual(await setup.allocator.apply(first), results[0]);
    assert.deepEqual(await setup.allocator.apply(second), results[1]);
    assert.equal((await setup.allocator.pool(setup.poolQuery)).held, 8);
    assert.equal((await setup.allocator.outbox(setup.poolQuery)).length, 2);
    assert.equal((await setup.allocator.db.get('SELECT COUNT(*) AS count FROM model_budget_reservations')).count, 1);
    await assert.rejects(setup.allocator.apply({ ...first, operationId: 'conflict' }), /idempotency conflict/);
  } finally { fixture.cleanup(setup); }
}

async function typedPoolsAndNativeUsd() {
  const setup = await fixture.setup({ unit: 'micro_USD', pool: { capacity: 10, protectedReserve: 2, consumed: 0 } });
  try {
    const granted = await setup.allocator.apply(await fixture.request(setup));
    assert.equal(granted.status, 'granted');
    const row = await setup.allocator.db.get('SELECT * FROM model_budget_reservations');
    assert.equal(row.cost_ceiling_usd, 8 / 1000000);
    assert.equal(row.reserved_cost_usd, 8 / 1000000);
    assert.equal(row.reserved_tokens, 0);
    assert.equal(row.token_ceiling, null);
    const euro = { ...setup.poolQuery, unit: 'micro_EUR' };
    await setup.allocator.initializePool(euro, { capacity: 10, protectedReserve: 2, consumed: 0 });
    const euroFixture = { ...setup, poolQuery: euro, unit: 'micro_EUR' };
    assert.equal((await setup.allocator.apply(await fixture.request(euroFixture))).status, 'granted');
    assert.equal((await setup.allocator.pool(euro)).held, 8);
    assert.equal((await setup.allocator.pool(setup.poolQuery)).held, 8);
    assert.equal((await setup.allocator.db.get('SELECT COUNT(*) AS count FROM model_budget_reservations')).count, 1);
    await assert.rejects(setup.allocator.initializePool({ ...setup.poolQuery, budgetId: 'too-large' },
      { capacity: 1000000000001, protectedReserve: 0, consumed: 0 }), /exact bounded range/);
  } finally { fixture.cleanup(setup); }
}

async function noSelfGrantAndScopedForecasts() {
  const setup = await fixture.setup();
  try {
    const request = await fixture.request(setup);
    const bad = { ...request, sender: fixture.actor('regulator') };
    await assert.rejects(setup.allocator.apply(bad), /distinct client/);
    const actual = await setup.allocator.apply(request);
    const forged = fixture.message('GRANT', actual.outbound[0].payload);
    await assert.rejects(setup.allocator.apply(forged), /cannot install their own GRANT/);
    const other = await fixture.request(setup, { client: 'client-b', amount: 1 });
    const foreign = { ...other, scope: { ...other.scope, projectId: 'foreign' } };
    await assert.rejects(setup.allocator.apply(foreign), /pool unavailable/);
    const stale = { ...other, generations: { ...other.generations, workspace: 2 } };
    await assert.rejects(setup.allocator.apply(stale), /authority or generations differ/);
    assert.equal((await setup.allocator.pool(setup.poolQuery)).held, 8);
  } finally { fixture.cleanup(setup); }
}

async function main() {
  await simultaneousLastCapacityAndRestart();
  await typedPoolsAndNativeUsd();
  await noSelfGrantAndScopedForecasts();
  console.log('ALLOSTASIS atomic typed quota, protected reserve, native reservations and replay passed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
