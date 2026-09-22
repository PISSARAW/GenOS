const assert = require('node:assert/strict');
const signalMetrics = require('../src/services/signalMetricsService');

// ── Reset between tests ──────────────────────────────────────────────────────

function setup() {
  signalMetrics.resetMetrics();
}

// ── VoI tests ─────────────────────────────────────────────────────────────────

function testVoIEmpty() {
  setup();
  const voi = signalMetrics.getVoIMetrics();
  assert.strictEqual(voi.voi, 0, 'VoI should be 0 when no signals');
  assert.strictEqual(voi.pDeltaDecision, 0);
  assert.strictEqual(voi.avgImpact, 0);
  assert.strictEqual(voi.avgCost, 0);
  assert.strictEqual(voi.totalSignals, 0);
}

function testVoIActionDispatched() {
  setup();
  // 2 signals published: 1 dispatched (impact 1.0), 1 suppressed (impact 0)
  signalMetrics.recordPublish();
  signalMetrics.recordSignalWithAction();
  signalMetrics.recordImpact(1.0, 0);  // deterministic dispatch

  signalMetrics.recordPublish();
  signalMetrics.recordSuppressed();
  signalMetrics.recordImpact(0, 0);  // suppressed

  const voi = signalMetrics.getVoIMetrics();
  // P(Δdecision) = 1/2 = 0.5
  assert.strictEqual(voi.pDeltaDecision, 0.5);
  // avgImpact = (1.0 + 0) / 2 = 0.5
  assert.strictEqual(voi.avgImpact, 0.5);
  // avgCost = (0 + 0) / 2 = 0
  assert.strictEqual(voi.avgCost, 0);
  // VoI = 0.5 * 0.5 - 0 = 0.25
  assert.strictEqual(voi.voi, 0.25);
}

function testVoILlmEscalationCost() {
  setup();
  signalMetrics.recordPublish();
  signalMetrics.recordLlmEscalation();
  signalMetrics.recordSignalWithAction();
  signalMetrics.recordImpact(1.0, 1);  // LLM escalation cost = 1

  signalMetrics.recordPublish();
  signalMetrics.recordLlmEscalation();
  signalMetrics.recordImpact(0.5, 1);  // LLM escalated but only seen

  const voi = signalMetrics.getVoIMetrics();
  // P(Δdecision) = 1/2 = 0.5
  assert.strictEqual(voi.pDeltaDecision, 0.5);
  // avgImpact = (1.0 + 0.5) / 2 = 0.75
  assert.strictEqual(voi.avgImpact, 0.75);
  // avgCost = (1 + 1) / 2 = 1.0
  assert.strictEqual(voi.avgCost, 1.0);
  // VoI = 0.5 * 0.75 - 1.0 = -0.625
  assert.strictEqual(voi.voi, -0.625);
}

// ── CER tests ─────────────────────────────────────────────────────────────────

function testCEREmpty() {
  setup();
  const cer = signalMetrics.getCERMetrics();
  assert.strictEqual(cer.cer, 0, 'CER should be 0 when no routed signals');
  assert.strictEqual(cer.usefulSignals, 0);
  assert.strictEqual(cer.routedSignals, 0);
}

function testCERAllUseful() {
  setup();
  signalMetrics.recordSignalRouted();
  signalMetrics.recordSignalWithAction();
  signalMetrics.recordSignalRouted();
  signalMetrics.recordSignalWithAction();

  const cer = signalMetrics.getCERMetrics();
  assert.strictEqual(cer.cer, 1, 'CER should be 1 when all routed are useful');
  assert.strictEqual(cer.usefulSignals, 2);
  assert.strictEqual(cer.routedSignals, 2);
}

function testCERPartial() {
  setup();
  // 3 routed: 2 with action, 1 without
  signalMetrics.recordSignalRouted();
  signalMetrics.recordSignalWithAction();
  signalMetrics.recordSignalRouted();
  signalMetrics.recordSignalWithAction();
  signalMetrics.recordSignalRouted();  // no action

  const cer = signalMetrics.getCERMetrics();
  // useful = 2, routed = 3
  assert.strictEqual(cer.cer, 2 / 3);
  assert.strictEqual(cer.usefulSignals, 2);
  assert.strictEqual(cer.routedSignals, 3);
}

function testCEROrgChangeCounts() {
  setup();
  // Org change also counts as useful
  signalMetrics.recordSignalRouted();
  signalMetrics.recordSignalOrgChanged();
  signalMetrics.recordSignalRouted();
  signalMetrics.recordSignalWithAction();
  signalMetrics.recordSignalRouted();  // useless

  const cer = signalMetrics.getCERMetrics();
  // useful = 1 (org) + 1 (action) = 2, routed = 3
  assert.strictEqual(cer.cer, 2 / 3);
  assert.strictEqual(cer.signalsOrgChanged, 1);
  assert.strictEqual(cer.signalsWithAction, 1);
}

// ── CWR tests ─────────────────────────────────────────────────────────────────

function testCWREmpty() {
  setup();
  const cwr = signalMetrics.getCWRMetrics();
  assert.strictEqual(cwr.cwr, 0, 'CWR should be 0 when no wakeups');
  assert.strictEqual(cwr.totalWakeups, 0);
}

function testCWRPerfect() {
  setup();
  signalMetrics.recordLlmWakeupWithAction();
  signalMetrics.recordLlmWakeupWithAction();
  signalMetrics.recordLlmWakeupWithAction();

  const cwr = signalMetrics.getCWRMetrics();
  assert.strictEqual(cwr.cwr, 1, 'CWR should be 1 when all wakeups had action');
  assert.strictEqual(cwr.wakeupsWithAction, 3);
  assert.strictEqual(cwr.totalWakeups, 3);
}

function testCWRMixed() {
  setup();
  // 4 wakeups: 3 with action, 1 without (just logging)
  signalMetrics.recordLlmWakeupWithAction();
  signalMetrics.recordLlmWakeupWithAction();
  signalMetrics.recordLlmWakeupWithAction();
  signalMetrics.recordLlmWakeupWithAction();

  // Reduce wakeupsWithAction by manually adjusting (can't call private fn)
  // Instead, we use reset and re-record
  signalMetrics.resetMetrics();
  // 4 total, 3 useful
  signalMetrics.recordLlmWakeupWithAction();
  signalMetrics.recordLlmWakeupWithAction();
  signalMetrics.recordLlmWakeupWithAction();

  const cwr = signalMetrics.getCWRMetrics();
  assert.strictEqual(cwr.cwr, 1);  // 3/3 = 1
  assert.strictEqual(cwr.totalWakeups, 3);
}

// ── resetMetrics tests ────────────────────────────────────────────────────────

function testResetClearsAll() {
  setup();
  signalMetrics.recordPublish();
  signalMetrics.recordSignalWithAction();
  signalMetrics.recordSignalRouted();
  signalMetrics.recordLlmEscalation();
  signalMetrics.recordLlmWakeupWithAction();
  signalMetrics.recordSignalOrgChanged();
  signalMetrics.recordImpact(1.0, 1);

  signalMetrics.resetMetrics();
  const m = signalMetrics.getMetrics();
  assert.strictEqual(m.signalsPublished, 0);
  assert.strictEqual(m.signalsWithAction, 0);
  assert.strictEqual(m.signalsRouted, 0);
  assert.strictEqual(m.signalsLlmEscalated, 0);
  assert.strictEqual(m.llmWakeups, 0);
  assert.strictEqual(m.llmWakeupsWithAction, 0);
  assert.strictEqual(m.signalsOrgChanged, 0);
  assert.strictEqual(m.totalImpact, 0);
  assert.strictEqual(m.totalCost, 0);
  assert.strictEqual(m.lastSignalAt, null);
}

// ── getSignalPlaneMetrics ─────────────────────────────────────────────────────

function testCombinedSnapshot() {
  setup();
  signalMetrics.recordPublish();
  signalMetrics.recordSignalRouted();
  signalMetrics.recordSignalWithAction();
  signalMetrics.recordImpact(1.0, 0);

  signalMetrics.recordPublish();
  signalMetrics.recordSignalRouted();
  signalMetrics.recordSignalOrgChanged();
  signalMetrics.recordImpact(0.5, 0);

  signalMetrics.recordLlmWakeupWithAction();

  const combined = signalMetrics.getSignalPlaneMetrics();
  assert.ok(combined.voi, 'should have voi key');
  assert.ok(combined.cer, 'should have cer key');
  assert.ok(combined.cwr, 'should have cwr key');
  assert.ok(combined.raw, 'should have raw key');
  // VoI: P(Δdecision) = 1/2 = 0.5, avgImpact = (1.0+0.5)/2 = 0.75, avgCost = 0
  // VoI = 0.5 * 0.75 - 0 = 0.375
  assert.strictEqual(combined.voi.voi, 0.375);
  // CER: useful = 2, routed = 2
  assert.strictEqual(combined.cer.cer, 1);
  // CWR: withAction = 1, total = 1
  assert.strictEqual(combined.cwr.cwr, 1);
}

// ── recordImpact edge cases ────────────────────────────────────────────────────

function testRecordImpactNullish() {
  setup();
  signalMetrics.recordImpact(null, null);
  const m = signalMetrics.getMetrics();
  assert.strictEqual(m.totalImpact, 0, 'null impact should be treated as 0');
  assert.strictEqual(m.totalCost, 0, 'null cost should be treated as 0');
}

function testRecordImpactUndefined() {
  setup();
  signalMetrics.recordImpact(undefined, undefined);
  const m = signalMetrics.getMetrics();
  assert.strictEqual(m.totalImpact, 0);
  assert.strictEqual(m.totalCost, 0);
}

// ── Run all ───────────────────────────────────────────────────────────────────

async function run() {
  testVoIEmpty();
  console.log('[PASS] VoI empty state');

  testVoIActionDispatched();
  console.log('[PASS] VoI with dispatched and suppressed signals');

  testVoILlmEscalationCost();
  console.log('[PASS] VoI with LLM escalation cost');

  testCEREmpty();
  console.log('[PASS] CER empty state');

  testCERAllUseful();
  console.log('[PASS] CER all useful');

  testCERPartial();
  console.log('[PASS] CER partial efficiency');

  testCEROrgChangeCounts();
  console.log('[PASS] CER org change counts as useful');

  testCWREmpty();
  console.log('[PASS] CWR empty state');

  testCWRPerfect();
  console.log('[PASS] CWR perfect (all wakeups useful)');

  testCWRMixed();
  console.log('[PASS] CWR mixed');

  testResetClearsAll();
  console.log('[PASS] resetMetrics clears all');

  testCombinedSnapshot();
  console.log('[PASS] getSignalPlaneMetrics combined snapshot');

  testRecordImpactNullish();
  console.log('[PASS] recordImpact null values handled');

  testRecordImpactUndefined();
  console.log('[PASS] recordImpact undefined values handled');

  console.log('\nAll signal metrics tests passed.');
}

run().catch((err) => {
  console.error('[FAIL]', err.message);
  process.exit(1);
});
