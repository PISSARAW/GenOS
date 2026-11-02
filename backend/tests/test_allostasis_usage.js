'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ledger = require('../src/services/metabolicLedgerService');
const { digest } = require('../src/services/evidenceProtocol/canonical');
const { AllostasisUsage } = require('../src/services/allostasisProtocol/usage');
const real = require('./helpers/allostasisAllocationFixture');
const f = require('./helpers/allostasisUsageFixture');

async function unknownPreemptionAndRestart(directory) {
  const dbPath = path.join(directory, 'usage.sqlite');
  let x = await f.setup({ dbPath });
  try {
    const intent = { query: x.query, operationId: 'provider-operation', maximumAmount: 60, purpose: 'work' };
    await x.usage.expose(intent);
    assert.deepEqual(await x.usage.expose(intent), await x.usage.expose(intent));
    const unknown = f.usageMessage(x);
    const receipt = await x.usage.apply(unknown);
    assert.equal(receipt.status, 'usage_unknown');
    assert.equal(receipt.unknownExposure, 60);
    const preempt = f.message('PREEMPT', { allocationId: x.query.allocationId,
      allocationDigest: x.query.allocationDigest, reason: 'stop-new-work' });
    const closed = await x.usage.apply(preempt);
    assert.equal(closed.released, 20);
    assert.equal(closed.held, 60);
    assert.equal(closed.protectedReserve, 10);
    await assert.rejects(x.usage.expose({ ...intent, operationId: 'another' }), /no longer admits/);
    x.allocator.close(); x = await f.setup({ dbPath });
    assert.deepEqual(await x.usage.apply(unknown), receipt);
    assert.equal((await x.usage.state(x.query)).allocation.unknownExposure, 60);
    const evidenceRef = await f.source(x, 40);
    const observed = f.usageMessage(x, { status: 'known', cumulativeAmount: 40, evidenceRef });
    const reconciled = await x.usage.reconcile(observed);
    assert.equal(reconciled.spent, 40);
    assert.equal(reconciled.unknownExposure, 0);
    assert.deepEqual(await x.usage.apply(observed), reconciled);
    const release = f.releaseMessage(x, 'complete');
    const released = await x.usage.apply(release);
    assert.equal(released.released, 20);
    assert.equal(released.spent, 40);
    const native = await x.allocator.db.get('SELECT * FROM model_budget_reservations');
    assert.equal(native.reserved_tokens, 40);
    assert.equal(native.status, 'uncertain', 'unknown complementary monetary dimension is retained conservatively');
    const pool = await x.allocator.pool(x.poolQuery);
    assert.equal(pool.consumed, 40); assert.equal(pool.held, 0); assert.equal(pool.protectedReserve, 10);
    const aggregate = await ledger.aggregateMetabolicUsage(x.allocator.db, { missionId: x.query.missionId });
    assert.equal(aggregate.metrics.billableTokens.value, null);
    assert.equal(aggregate.metrics.billableTokens.observedValue, 40);
    assert.equal(aggregate.metrics.billableTokens.complete, false);
  } finally { x.allocator.close(); }
}

async function cumulativeAndReceiptIdentity() {
  const x = await f.setup();
  try {
    await x.usage.expose({ query: x.query, operationId: 'provider-operation', maximumAmount: 70, purpose: 'work' });
    const ref1 = await f.source(x, 20, { final: false });
    const first = f.usageMessage(x, { status: 'known', cumulativeAmount: 20, evidenceRef: ref1 });
    await x.usage.apply(first);
    const duplicateReceipt = f.usageMessage(x, { ...first.payload });
    await x.usage.apply(duplicateReceipt);
    assert.equal((await x.usage.state(x.query)).history.length, 1);
    const conflicting = f.usageMessage(x, { ...first.payload, cumulativeAmount: 21 });
    await assert.rejects(x.usage.apply(conflicting), /receipt idempotency conflict/);
    const ref2 = await f.source(x, 45);
    await x.usage.apply(f.usageMessage(x, { status: 'known', cumulativeAmount: 45, evidenceRef: ref2 }));
    const aggregate = await ledger.aggregateMetabolicUsage(x.allocator.db, { missionId: x.query.missionId });
    assert.equal(aggregate.metrics.billableTokens.value, 45, 'native ledger records deltas, not sum of cumulative reports');
    assert.equal((await x.usage.state(x.query)).allocation.spent, 45);
  } finally { x.allocator.close(); }
}

async function actualWallTime() {
  const x = await f.setup({ unit: 'milliseconds' });
  try {
    await x.usage.expose({ query: x.query, operationId: 'provider-operation', maximumAmount: 70, purpose: 'work' });
    const start = process.hrtime.bigint();
    while (process.hrtime.bigint() - start < 4000000n) {}
    const measured = Math.ceil(Number(process.hrtime.bigint() - start) / 1000000);
    const evidenceRef = await f.source(x, measured, { metricId: 'wallTimeMs' });
    await x.usage.apply(f.usageMessage(x, { status: 'known', cumulativeAmount: measured, evidenceRef }));
    const aggregate = await ledger.aggregateMetabolicUsage(x.allocator.db, { missionId: x.query.missionId });
    assert.equal(aggregate.metrics.wallTimeMs.value, measured);
    assert.equal(aggregate.metrics.activeTimeMs.value, null);
    assert.equal((await x.allocator.db.all('SELECT * FROM model_budget_reservations')).length, 0);
  } finally { x.allocator.close(); }
}

async function nativeObservationIsNotCountedTwice() {
  const x = await f.setup();
  try {
    await x.usage.expose({ query: x.query, operationId: 'provider-operation', maximumAmount: 60, purpose: 'work' });
    const evidenceRef = await f.source(x, 25);
    await ledger.recordMetabolicObservation(x.allocator.db, { id: 'native-already-recorded', missionId: x.query.missionId,
      organizationId: x.query.scope.organizationId, projectId: x.query.scope.projectId, operationId: 'provider-operation',
      measurements: { billableTokens: { source: 'exact', value: 25 } } });
    const original = x.usage.verifyUsage;
    x.usage.verifyUsage = async request => ({ ...await original(request), nativeObservationId: 'native-already-recorded' });
    const result = await x.usage.apply(f.usageMessage(x, { status: 'known', cumulativeAmount: 25, evidenceRef }));
    assert.equal(result.nativeObservationId, 'native-already-recorded');
    const aggregate = await ledger.aggregateMetabolicUsage(x.allocator.db, { missionId: x.query.missionId });
    assert.equal(aggregate.metrics.billableTokens.value, 25);
    assert.equal(aggregate.metrics.billableTokens.samples, 1);
  } finally { x.allocator.close(); }
}

async function nativeQualifiedGrantAndMeasurement() {
  const x = await real.setup({ unit: 'milliseconds' });
  try {
    const grant = await x.allocator.apply(await real.request(x, { amount: 8 }));
    assert.equal(grant.status, 'granted');
    let measured;
    const usage = new AllostasisUsage({ allocator: x.allocator, authorize: async () => true, clock: () => real.NOW,
      verifyUsage: async request => ({ status: 'known', cumulativeAmount: measured, final: true, source: 'exact',
        metricId: 'wallTimeMs', evidenceRef: 'local:monotonic-wall-clock', requestDigest: digest(request),
        receiptDigest: digest({ query: grant.query, measured }) }) });
    await usage.ready;
    await usage.expose({ query: grant.query, operationId: 'measured-local-work', maximumAmount: 8, purpose: 'work' });
    const start = process.hrtime.bigint();
    while (process.hrtime.bigint() - start < 2000000n) {}
    measured = Math.ceil(Number(process.hrtime.bigint() - start) / 1000000);
    const response = await usage.apply(real.message('REPORT_USAGE', { allocationId: grant.query.allocationId,
      allocationDigest: grant.query.allocationDigest, operationId: 'measured-local-work', receiptId: 'measured-receipt',
      cumulativeAmount: measured, status: 'known', unit: 'milliseconds', evidenceRef: 'local:monotonic-wall-clock' },
    { conversationId: grant.query.conversationId }));
    assert.equal(response.spent, measured);
    assert.equal((await x.allocator.pool(x.poolQuery)).consumed, measured);
  } finally { real.cleanup(x); }
}

async function run() {
  const parent = path.resolve(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(parent, 'allostasis-usage-'));
  try {
    await unknownPreemptionAndRestart(directory);
    await cumulativeAndReceiptIdentity();
    await actualWallTime();
    await nativeObservationIsNotCountedTwice();
    await nativeQualifiedGrantAndMeasurement();
    console.log('ALLOSTASIS real native reservation, cumulative usage, unknown retention and measured wall time: PASS');
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), parent);
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
