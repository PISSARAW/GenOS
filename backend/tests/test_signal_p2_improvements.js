const assert = require('assert');
const signalMetrics = require('../src/services/signalMetricsService');
const signalValidation = require('../src/services/signalValidationUtils');
const signaling = require('../src/services/signalingTransportService');

// ── Metrics ──────────────────────────────────────────────────────────────────

function testMetricsRecordPublish() {
  signalMetrics.resetMetrics();
  signalMetrics.recordPublish();
  signalMetrics.recordPublish();
  const metrics = signalMetrics.getMetrics();
  assert.strictEqual(metrics.signalsPublished, 2);
  assert.ok(metrics.lastSignalAt);
  console.log('[PASS] Metrics record publish correctly');
}

function testMetricsRecordSuppressed() {
  signalMetrics.resetMetrics();
  signalMetrics.recordSuppressed();
  const metrics = signalMetrics.getMetrics();
  assert.strictEqual(metrics.signalsSuppressed, 1);
  console.log('[PASS] Metrics record suppressed correctly');
}

function testMetricsRecordDispatch() {
  signalMetrics.resetMetrics();
  signalMetrics.recordDispatch();
  signalMetrics.recordTrigger();
  const metrics = signalMetrics.getMetrics();
  assert.strictEqual(metrics.receptorsDispatched, 1);
  assert.strictEqual(metrics.receptorsTriggered, 1);
  console.log('[PASS] Metrics record dispatch/trigger correctly');
}

function testMetricsRecordDbError() {
  signalMetrics.resetMetrics();
  signalMetrics.recordDbError(new Error('test'));
  const metrics = signalMetrics.getMetrics();
  assert.strictEqual(metrics.dbErrors, 1);
  assert.ok(metrics.lastErrorAt);
  assert.strictEqual(metrics.lastErrorMessage, 'test');
  console.log('[PASS] Metrics record DB error correctly');
}

function testMetricsReset() {
  signalMetrics.recordPublish();
  signalMetrics.resetMetrics();
  const metrics = signalMetrics.getMetrics();
  assert.strictEqual(metrics.signalsPublished, 0);
  assert.strictEqual(metrics.lastSignalAt, null);
  console.log('[PASS] Metrics reset works');
}

// ── Retry ────────────────────────────────────────────────────────────────────

async function testRetrySucceedsFirstTry() {
  let calls = 0;
  const result = await signalValidation.retryDbOperation(async () => {
    calls++;
    return 'ok';
  });
  assert.strictEqual(result, 'ok');
  assert.strictEqual(calls, 1);
  console.log('[PASS] Retry succeeds on first try');
}

async function testRetryRecoversFromFailure() {
  let calls = 0;
  const result = await signalValidation.retryDbOperation(async () => {
    calls++;
    if (calls < 3) throw new Error('transient');
    return 'recovered';
  });
  assert.strictEqual(result, 'recovered');
  assert.strictEqual(calls, 3);
  console.log('[PASS] Retry recovers after transient failures');
}

async function testRetryThrowsAfterMaxRetries() {
  let calls = 0;
  try {
    await signalValidation.retryDbOperation(async () => {
      calls++;
      throw new Error('persistent');
    }, 2);
    assert.fail('Should have thrown');
  } catch (e) {
    assert.strictEqual(e.message, 'persistent');
    assert.strictEqual(calls, 2);
    console.log('[PASS] Retry throws after max retries');
  }
}

// ── Args Validation ───────────────────────────────────────────────────────────

function testRejectsNonObjectSignalData() {
  try {
    signalValidation.validateArgs({ signalData: 'string' });
    assert.fail('Should have thrown');
  } catch (e) {
    assert.ok(e.message.includes('signalData must be an object'));
    console.log('[PASS] Rejects non-object signalData');
  }
}

function testRejectsOversizedTopic() {
  const bigTopic = 'x'.repeat(300);
  try {
    signalValidation.validateArgs({ signalData: {}, topic: bigTopic });
    assert.fail('Should have thrown');
  } catch (e) {
    assert.ok(e.message.includes('256'));
    console.log('[PASS] Rejects oversized topic');
  }
}

function testAcceptsValidArgs() {
  signalValidation.validateArgs({ signalData: { x: 1 }, topic: 'valid' });
  console.log('[PASS] Accepts valid args');
}

// ── Rate Limiting ────────────────────────────────────────────────────────────

function testRateLimitBlocksAfterLimit() {
  const sender = 'ratelimit-' + Date.now();
  for (let i = 0; i < signalValidation.RATE_LIMIT_PER_MINUTE; i++) {
    signalValidation.checkRateLimit(sender);
  }
  const blocked = signalValidation.checkRateLimit(sender);
  assert.strictEqual(blocked, false);
  console.log('[PASS] Rate limit blocks after threshold');
}

function testRateLimitAllowsDifferentSender() {
  const sender1 = 'rl-a-' + Date.now();
  const sender2 = 'rl-b-' + Date.now();
  for (let i = 0; i < signalValidation.RATE_LIMIT_PER_MINUTE; i++) {
    signalValidation.checkRateLimit(sender1);
  }
  const allowed = signalValidation.checkRateLimit(sender2);
  assert.strictEqual(allowed, true);
  console.log('[PASS] Rate limit allows different sender');
}

// ── Payload Size Validation ───────────────────────────────────────────────────

function testRejectsOversizedPayload() {
  const bigData = 'x'.repeat(100 * 1024); // 100KB > 64KB limit
  const result = signalValidation.validatePayloadSize({ data: bigData }, null);
  assert.strictEqual(result.valid, false);
  assert.ok(result.reason.includes('65536'));
  console.log('[PASS] Oversized signalData rejected');
}

function testAcceptsNormalPayload() {
  const normalData = { ligand: 'ATP', concentration: 10 };
  const result = signalValidation.validatePayloadSize(normalData, null);
  assert.strictEqual(result.valid, true);
  console.log('[PASS] Normal payload accepted');
}

async function run() {
  testMetricsRecordPublish();
  testMetricsRecordSuppressed();
  testMetricsRecordDispatch();
  testMetricsRecordDbError();
  testMetricsReset();
  
  await testRetrySucceedsFirstTry();
  await testRetryRecoversFromFailure();
  await testRetryThrowsAfterMaxRetries();
  
  testRejectsNonObjectSignalData();
  testRejectsOversizedTopic();
  testAcceptsValidArgs();
  
  testRateLimitBlocksAfterLimit();
  testRateLimitAllowsDifferentSender();
  testRejectsOversizedPayload();
  testAcceptsNormalPayload();
  
  console.log('\nAll P2 improvement tests passed.');
}

run().catch((err) => {
  console.error('[FAIL]', err.message);
  process.exit(1);
});
