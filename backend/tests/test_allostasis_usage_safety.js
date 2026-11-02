'use strict';

const assert = require('node:assert/strict');
const { withTransaction } = require('../src/db');
const { digest } = require('../src/services/evidenceProtocol/canonical');
const ledger = require('../src/services/metabolicLedgerService');
const usageLedger = require('../src/services/allostasisProtocol/usageLedger');
const f = require('./helpers/allostasisUsageFixture');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function prepared(options = {}) {
  const x = await f.setup(options);
  await x.usage.expose({ query: x.query, operationId: 'provider-operation', maximumAmount: 60, purpose: 'work' });
  return x;
}

async function revokedDuringObservation() {
  const x = await prepared();
  let granted = true;
  const original = x.usage.verifyUsage;
  x.usage.authorize = async ({ operation }) => operation !== 'REPORT_USAGE' || granted;
  x.usage.verifyUsage = async request => { const receipt = await original(request); granted = false; return receipt; };
  try {
    const evidenceRef = await f.source(x, 25);
    await assert.rejects(x.usage.apply(f.usageMessage(x, { status: 'known', cumulativeAmount: 25, evidenceRef })), /authority rejected/);
    const state = await x.usage.state(x.query);
    assert.equal(state.allocation.spent, 0); assert.equal(state.history.length, 0);
    assert.equal((await x.allocator.db.get('SELECT reserved_tokens FROM model_budget_reservations')).reserved_tokens, 80);
  } finally { x.allocator.close(); }
}

async function atomicReceiptFailure() {
  const x = await prepared();
  try {
    const evidenceRef = await f.source(x, 25);
    await x.allocator.db.exec(`CREATE TEMP TRIGGER reject_usage BEFORE INSERT ON allostasis_usage_messages
      BEGIN SELECT RAISE(ABORT,'injected usage receipt failure'); END;`);
    await assert.rejects(x.usage.apply(f.usageMessage(x, { status: 'known', cumulativeAmount: 25, evidenceRef })), /injected usage receipt failure/);
    const state = await x.usage.state(x.query);
    assert.equal(state.allocation.spent, 0); assert.equal(state.operations[0].cumulativeAmount, 0);
    assert.equal((await x.allocator.pool(x.poolQuery)).consumed, 0);
    assert.equal((await x.allocator.db.all('SELECT * FROM metabolic_ledger_observations')).length, 0);
    assert.equal((await x.allocator.db.get('SELECT reserved_tokens FROM model_budget_reservations')).reserved_tokens, 80);
  } finally { x.allocator.close(); }
}

async function noCrossBindingOrFakeZero() {
  const x = await prepared();
  try {
    const unknown = f.usageMessage(x);
    await assert.rejects(x.usage.apply({ ...unknown, sender: f.REGULATOR, audience: f.CLIENT }), /actor or audience mismatch/);
    await assert.rejects(x.usage.apply({ ...unknown, missionId: 'another-mission' }), /scope or digest mismatch/);
    await assert.rejects(x.usage.apply(f.usageMessage(x, { unit: 'bytes' })), /unit differs/);
    await assert.rejects(x.usage.expose({ query: x.query, operationId: 'recover', maximumAmount: 1, purpose: 'recovery' }), /dedicated allocation/);
    assert.throws(() => f.usageMessage(x, { cumulativeAmount: 0 }), /must be null/);
    const evidenceRef = await f.source(x, 25, { operationId: 'different-operation' });
    await assert.rejects(x.usage.apply(f.usageMessage(x, { status: 'known', cumulativeAmount: 25, evidenceRef })), /another allocation, operation or unit/);
    assert.equal((await x.usage.state(x.query)).allocation.spent, 0);
  } finally { x.allocator.close(); }
}

async function timeMetricDoesNotChange() {
  const x = await prepared({ unit: 'milliseconds' });
  try {
    const first = await f.source(x, 10, { final: false, metricId: 'wallTimeMs' });
    await x.usage.apply(f.usageMessage(x, { status: 'known', cumulativeAmount: 10, evidenceRef: first }));
    const changed = await f.source(x, 20, { metricId: 'activeTimeMs' });
    await assert.rejects(x.usage.apply(f.usageMessage(x, { status: 'known', cumulativeAmount: 20, evidenceRef: changed })), /time metric cannot change/);
    assert.equal((await x.usage.state(x.query)).allocation.spent, 10);
  } finally { x.allocator.close(); }
}

async function realOverrunIsDurable(unit, amount) {
  const x = await prepared({ unit });
  try {
    if (unit === 'tokens') await x.usage.expose({ query: x.query, operationId: 'other-operation', maximumAmount: 20, purpose: 'work' });
    const evidenceRef = await f.source(x, amount);
    const recorded = await x.usage.apply(f.usageMessage(x, { status: 'known', cumulativeAmount: amount, evidenceRef }));
    assert.equal(recorded.spent, amount); assert.equal(recorded.overBudget, true);
    const state = await x.usage.state(x.query);
    assert.equal(state.allocation.status, 'overdrawn');
    assert.equal((await x.allocator.pool(x.poolQuery)).consumed, amount);
    if (unit === 'tokens') {
      assert.equal(recorded.unknownExposure, 20); assert.equal(recorded.held, 20);
      assert.equal((await x.usage.apply(f.releaseMessage(x))).released, 0);
    } else {
      assert.equal(recorded.nativeBridge.status, 'bridge_unavailable');
      assert.equal(state.allocation.nativeBridge.status, 'bridge_unavailable');
      await x.usage.apply(f.releaseMessage(x));
      const row = await x.allocator.db.get('SELECT * FROM model_budget_reservations');
      assert.equal(row.reserved_cost_usd, 80 / 1000000); assert.equal(row.status, 'active');
    }
  } finally { x.allocator.close(); }
}

async function sameMutexAuthorityAndExpiry() {
  const x = await prepared();
  const entered = deferred(); const release = deferred();
  let granted = true;
  x.usage.authorize = async ({ operation }) => operation !== 'REPORT_USAGE' || granted;
  try {
    const blocker = withTransaction(x.allocator.db, async () => { entered.resolve(); await release.promise; });
    await entered.promise;
    const pending = x.usage.apply(f.usageMessage(x)).then(value => ({ value }), error => ({ error }));
    granted = false; release.resolve(); await blocker;
    assert.match((await pending).error.message, /authority rejected/);
    x.usage.authorize = async () => true;
    x.usage.clock = () => '2026-11-04T10:00:00Z';
    await assert.rejects(x.usage.expose({ query: x.query, operationId: 'expired', maximumAmount: 1, purpose: 'work' }), /expired/);
    const evidenceRef = await f.source(x, 25);
    const report = f.usageMessage(x, { status: 'known', cumulativeAmount: 25, evidenceRef });
    const result = await x.usage.apply({ ...report, expiresAt: '2099-01-01T00:00:00Z' });
    assert.equal(result.spent, 25, 'fresh envelope can account for an old expired allocation');
  } finally { release.resolve(); x.allocator.close(); }
}

async function releaseIdentityDoesNotReleaseAgain() {
  const x = await prepared();
  try {
    const release = f.releaseMessage(x, 'cancel', { releaseId: 'stable-release' });
    const prior = await x.usage.apply(release);
    const evidenceRef = await f.source(x, 25);
    await x.usage.apply(f.usageMessage(x, { status: 'known', cumulativeAmount: 25, evidenceRef }));
    const replay = f.releaseMessage(x, 'cancel', { releaseId: 'stable-release' });
    assert.deepEqual(await x.usage.apply(replay), prior);
    assert.equal((await x.usage.state(x.query)).allocation.held, 35);
    const conflict = f.releaseMessage(x, 'complete', { releaseId: 'stable-release' });
    await assert.rejects(x.usage.apply(conflict), /release identity idempotency conflict/);
    const pressure = f.message('PRESSURE', { budgetId: x.poolQuery.budgetId, unit: x.unit, reason: 'need-more' });
    await assert.rejects(x.usage.apply(pressure), /message unsupported/);
    assert.equal(prior.morphogenesisAuthorized, false);
  } finally { x.allocator.close(); }
}

async function nativeSampleHasOneAllocation() {
  const x = await prepared();
  try {
    await ledger.recordMetabolicObservation(x.allocator.db, { id: 'native-shared-sample', missionId: x.query.missionId,
      organizationId: x.query.scope.organizationId, projectId: x.query.scope.projectId, operationId: 'provider-operation',
      measurements: { billableTokens: { source: 'exact', value: 3 } } });
    const original = x.usage.verifyUsage;
    x.usage.verifyUsage = async request => ({ ...await original(request), nativeObservationId: 'native-shared-sample' });
    const first = await f.source(x, 3);
    await x.usage.apply(f.usageMessage(x, { status: 'known', cumulativeAmount: 3, evidenceRef: first }));
    const granted = await x.allocator.apply(f.message('REQUEST_BUDGET', { requestId: 'second-request', budgetId: x.poolQuery.budgetId,
      unit: x.unit, amount: 4, forecastId: 'fixture-forecast', forecastDigest: digest('fixture-forecast') }, { causalRefs: ['fixture-forecast'] }));
    const second = { ...x, query: granted.query };
    await x.usage.expose({ query: second.query, operationId: 'provider-operation', maximumAmount: 4, purpose: 'work' });
    const reference = await f.source(second, 3, { evidenceRef: 'duplicate-native-source' });
    await assert.rejects(x.usage.apply(f.usageMessage(second, { status: 'known', cumulativeAmount: 3, evidenceRef: reference })), /already belongs to another allocation/);
    assert.equal((await x.usage.state(second.query)).allocation.spent, 0);
    const aggregate = await ledger.aggregateMetabolicUsage(x.allocator.db, { missionId: x.query.missionId });
    assert.equal(aggregate.metrics.billableTokens.value, 3);
  } finally { x.allocator.close(); }
}

async function nativeSampleHasOneIncrement() {
  const x = await prepared();
  try {
    await ledger.recordMetabolicObservation(x.allocator.db, { id: 'native-single-increment', missionId: x.query.missionId,
      organizationId: x.query.scope.organizationId, projectId: x.query.scope.projectId, operationId: 'provider-operation',
      measurements: { billableTokens: { source: 'exact', value: 2 } } });
    const original = x.usage.verifyUsage;
    x.usage.verifyUsage = async request => ({ ...await original(request), nativeObservationId: 'native-single-increment' });
    const partial = await f.source(x, 2, { final: false });
    await x.usage.apply(f.usageMessage(x, { status: 'known', cumulativeAmount: 2, evidenceRef: partial }));
    const repeated = await f.source(x, 4);
    await assert.rejects(x.usage.apply(f.usageMessage(x, { status: 'known', cumulativeAmount: 4, evidenceRef: repeated })), /already accounted by another receipt/);
    assert.equal((await x.usage.state(x.query)).allocation.spent, 2);
    assert.equal((await x.allocator.pool(x.poolQuery)).consumed, 2);
    const aggregate = await ledger.aggregateMetabolicUsage(x.allocator.db, { missionId: x.query.missionId });
    assert.equal(aggregate.metrics.billableTokens.value, 2);
  } finally { x.allocator.close(); }
}

async function legacyAttributionDoesNotInventReceiptIdentity() {
  const x = await prepared();
  try {
    await ledger.recordMetabolicObservation(x.allocator.db, { id: 'legacy-native-attribution', missionId: x.query.missionId,
      organizationId: x.query.scope.organizationId, projectId: x.query.scope.projectId, operationId: 'provider-operation',
      measurements: { billableTokens: { source: 'exact', value: 2 } } });
    await x.allocator.db.exec(`DROP TABLE allostasis_native_usage_attribution;
      CREATE TABLE allostasis_native_usage_attribution (observation_id TEXT,metric TEXT,allocation_key TEXT,operation_id TEXT,
      PRIMARY KEY(observation_id,metric));`);
    await x.allocator.db.run('INSERT INTO allostasis_native_usage_attribution VALUES (?,?,?,?)',
      'legacy-native-attribution', 'billableTokens', digest(x.query), 'provider-operation');
    await withTransaction(x.allocator.db, () => usageLedger.initialize(x.allocator.db));
    const original = x.usage.verifyUsage;
    x.usage.verifyUsage = async request => ({ ...await original(request), nativeObservationId: 'legacy-native-attribution' });
    const evidenceRef = await f.source(x, 2);
    await assert.rejects(x.usage.apply(f.usageMessage(x, { status: 'known', cumulativeAmount: 2, evidenceRef })), /already accounted by another receipt/);
    assert.equal((await x.usage.state(x.query)).allocation.spent, 0);
  } finally { x.allocator.close(); }
}

async function main() {
  await revokedDuringObservation(); await atomicReceiptFailure();
  await noCrossBindingOrFakeZero(); await timeMetricDoesNotChange();
  await realOverrunIsDurable('tokens', 90);
  await realOverrunIsDurable('micro_USD', 1000000000001);
  await sameMutexAuthorityAndExpiry(); await releaseIdentityDoesNotReleaseAgain();
  await nativeSampleHasOneAllocation();
  await nativeSampleHasOneIncrement();
  await legacyAttributionDoesNotInventReceiptIdentity();
  console.log('ALLOSTASIS usage authority races, no fictitious refund, native overrun and transactional safety: PASS');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
