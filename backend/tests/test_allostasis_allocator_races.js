'use strict';

const assert = require('node:assert/strict');
const { digest } = require('../src/services/evidenceProtocol/canonical');
const fixture = require('./helpers/allostasisAllocationFixture');

async function rejectedDuringVerification() {
  const setup = await fixture.setup();
  try {
    const message = await fixture.request(setup);
    let granted = true;
    setup.allocator.authorize = async () => granted;
    setup.allocator.verifyRequest = async (request) => {
      assert.throws(() => { request.pool.capacity = 999; }, TypeError);
      granted = false;
      return { status: 'validated', requestDigest: digest(request), receiptDigest: digest('proof') };
    };
    await assert.rejects(setup.allocator.apply(message), /authority rejected or revoked/);
    granted = true;
    assert.equal((await setup.allocator.pool(setup.poolQuery)).held, 0);
    assert.equal((await setup.allocator.db.get('SELECT COUNT(*) AS count FROM model_budget_reservations')).count, 0);
    assert.deepEqual(await setup.allocator.outbox(setup.poolQuery), []);
  } finally { fixture.cleanup(setup); }
}

async function finalAuthorizationRollsBackNativeGrant() {
  const setup = await fixture.setup();
  try {
    const message = await fixture.request(setup);
    let checks = 0;
    setup.allocator.authorize = async ({ operation }) => operation !== 'REQUEST_BUDGET' || ++checks !== 4;
    await assert.rejects(setup.allocator.apply(message), /authority rejected or revoked/);
    assert.equal(checks, 4);
    assert.equal((await setup.allocator.pool(setup.poolQuery)).held, 0);
    assert.equal((await setup.allocator.db.get('SELECT COUNT(*) AS count FROM model_budget_reservations')).count, 0);
    assert.equal((await setup.allocator.db.get('SELECT COUNT(*) AS count FROM allostasis_allocations')).count, 0);
    assert.deepEqual(await setup.allocator.outbox(setup.poolQuery), []);
  } finally { fixture.cleanup(setup); }
}

async function expiryAfterNativeReservation() {
  const setup = await fixture.setup();
  try {
    const message = await fixture.request(setup);
    let checks = 0;
    setup.allocator.authorize = async ({ operation }) => {
      if (operation === 'REQUEST_BUDGET' && ++checks === 4) setup.allocator.clock = () => '2026-11-03T10:00:00.000Z';
      return true;
    };
    await assert.rejects(setup.allocator.apply(message), /expired/);
    assert.equal((await setup.allocator.pool(setup.poolQuery)).held, 0);
    assert.equal((await setup.allocator.db.get('SELECT COUNT(*) AS count FROM model_budget_reservations')).count, 0);
    assert.deepEqual(await setup.allocator.outbox(setup.poolQuery), []);
  } finally { fixture.cleanup(setup); }
}

async function observedSourceCannotChangeDuringRequest() {
  const setup = await fixture.setup();
  try {
    const message = await fixture.request(setup);
    setup.allocator.verifyRequest = async (request) => {
      await fixture.seedNative(setup.allocator.db, fixture.configuration(setup.allocator.db), { energy: 0.1 });
      return { status: 'validated', requestDigest: digest(request), receiptDigest: digest('proof') };
    };
    await assert.rejects(setup.allocator.apply(message), /native source|no longer matches|report/i);
    assert.equal((await setup.allocator.pool(setup.poolQuery)).held, 0);
    assert.deepEqual(await setup.allocator.outbox(setup.poolQuery), []);
  } finally { fixture.cleanup(setup); }
}

async function observationExpiryAfterNativeReservation() {
  const setup = await fixture.setup();
  try {
    const message = await fixture.request(setup);
    const forecast = await setup.allocator.forecast(message);
    const expiredAt = Date.parse(forecast.forecast.validUntil);
    assert.ok(expiredAt < Date.parse(message.expiresAt));
    let checks = 0;
    setup.allocator.authorize = async ({ operation }) => {
      if (operation === 'REQUEST_BUDGET' && ++checks === 4) setup.allocator.clock = () => expiredAt;
      return true;
    };
    await assert.rejects(setup.allocator.apply(message), /expired/);
    assert.equal((await setup.allocator.pool(setup.poolQuery)).held, 0);
    assert.equal((await setup.allocator.db.get('SELECT COUNT(*) AS count FROM model_budget_reservations')).count, 0);
    assert.deepEqual(await setup.allocator.outbox(setup.poolQuery), []);
  } finally { fixture.cleanup(setup); }
}

async function unknownNativeDimensionAndPartialRelease() {
  const setup = await fixture.setup();
  try {
    const result = await setup.allocator.apply(await fixture.request(setup));
    const state = await setup.allocator.allocation(result.query);
    const released = { ...state, spent: 3, held: 0, released: 5, status: 'released' };
    const pool = { ...(await setup.allocator.pool(setup.poolQuery)), consumed: 3, held: 0 };
    await setup.allocator.native.syncHeld(pool, released);
    const settled = await setup.allocator.native.settle(pool, released, { providerCalled: true });
    assert.equal(settled.status, 'uncertain');
    const row = await setup.allocator.db.get('SELECT * FROM model_budget_reservations');
    assert.equal(row.reserved_tokens, 3);
    assert.equal(row.actual_cost_usd, null);
    assert.equal(row.actual_tokens, null);
    assert.equal((await setup.allocator.native.settle(pool, released, { providerCalled: true, costUsd: 0 })).status, 'settled');
    const actual = await setup.allocator.db.get('SELECT * FROM model_budget_reservations');
    assert.equal(actual.actual_tokens, 3);
    assert.equal(actual.actual_cost_usd, 0);
    assert.equal(actual.reserved_tokens, 3);
  } finally { fixture.cleanup(setup); }
}

async function outOfRangeObservedChargeDoesNotDisappear() {
  const setup = await fixture.setup({ unit: 'micro_USD', pool: { capacity: 1000000000000, protectedReserve: 0, consumed: 0 } });
  try {
    const result = await setup.allocator.apply(await fixture.request(setup, { amount: 8 }));
    const state = await setup.allocator.allocation(result.query);
    const next = { ...state, spent: 1000000000001, held: 0, status: 'overdrawn', generation: state.generation + 1 };
    const pool = await setup.allocator.pool(setup.poolQuery);
    const nextPool = { ...pool, consumed: next.spent, held: 0, generation: pool.generation + 1 };
    await require('../src/db').withTransaction(setup.allocator.db, async () => {
      setup.allocator.store.writePool(nextPool, pool);
      setup.allocator.store.writeAllocation(next, state);
      const diagnostic = await setup.allocator.native.syncHeld(nextPool, next);
      assert.equal(diagnostic.status, 'bridge_unavailable');
    });
    assert.equal((await setup.allocator.pool(setup.poolQuery)).consumed, 1000000000001);
    const actual = await setup.allocator.db.get('SELECT * FROM model_budget_reservations');
    assert.equal(actual.reserved_cost_usd, 8 / 1000000);
    const rejected = await setup.allocator.apply(await fixture.request(setup, { client: 'client-b', amount: 1 }));
    assert.equal(rejected.status, 'rejected');
    assert.equal((await setup.allocator.pool(setup.poolQuery)).consumed, 1000000000001);
  } finally { fixture.cleanup(setup); }
}

async function orphanNativeReservationCannotBeAdopted() {
  const setup = await fixture.setup();
  try {
    const message = await fixture.request(setup);
    const allocationId = digest({ scope: message.scope, missionId: message.missionId, conversationId: message.conversationId,
      requestId: message.payload.requestId, client: message.sender, regulator: message.audience });
    const pool = await setup.allocator.pool(setup.poolQuery);
    await setup.allocator.native.reserve(pool, { allocation: { allocationId, amount: 8 }, spent: 0, held: 8 });
    await assert.rejects(setup.allocator.apply(message), /conflicting existing state/);
    assert.equal((await setup.allocator.pool(setup.poolQuery)).held, 0);
    assert.equal((await setup.allocator.db.get('SELECT COUNT(*) AS count FROM allostasis_allocations')).count, 0);
    assert.deepEqual(await setup.allocator.outbox(setup.poolQuery), []);
    assert.equal((await setup.allocator.db.get('SELECT reserved_tokens FROM model_budget_reservations')).reserved_tokens, 8);
  } finally { fixture.cleanup(setup); }
}

async function main() {
  await rejectedDuringVerification();
  await finalAuthorizationRollsBackNativeGrant();
  await expiryAfterNativeReservation();
  await observedSourceCannotChangeDuringRequest();
  await observationExpiryAfterNativeReservation();
  await unknownNativeDimensionAndPartialRelease();
  await outOfRangeObservedChargeDoesNotDisappear();
  await orphanNativeReservationCannotBeAdopted();
  console.log('ALLOSTASIS native transaction rollback, exact settlement, source drift and durable debt passed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
