'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrateMetabolicLedger } = require('../src/db/migrations/migrateMetabolicLedger');
const attemptLedger = require('../src/services/modelAttemptLedger');
const ledger = require('../src/services/metabolicLedgerService');
const bridge = require('../src/services/metabolicLedgerRuntimeBridge');
const runtimeEvents = require('../bin/agent-runtime-events.cjs');

async function createDatabase() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE usage_ledger (
      id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT, release_id TEXT,
      category TEXT, quantity REAL, cost_usd REAL, metadata_json TEXT
    );`);
  await migrateMetabolicLedger(db);
  return db;
}

function scope(missionId) {
  return { organizationId: 'org', projectId: 'project', executionRunId: missionId,
    agentId: 'agent' };
}

async function verifyProviderReceipt() {
  const db = await createDatabase();
  await attemptLedger.recordModelUsage(db, scope('mission-provider'), {
    routeAttemptId: 'attempt-zero', model: 'openai://test', servedModel: 'test',
    inputTokens: 0, outputTokens: 0, tokenUsageMeasured: true,
    usageReceipt: { responseId: 'response-zero', inputTokens: 0, outputTokens: 0,
      cacheReadTokens: 0 },
    costUsd: 0, catalogPricingKnown: true, providerCalled: true,
    latencyMs: 0, attemptStatus: 'completed'
  });
  const aggregate = await ledger.aggregateMetabolicUsage(db, { missionId: 'mission-provider' });
  assert.equal(aggregate.metrics.inputTokens.value, 0);
  assert.equal(aggregate.metrics.inputTokens.source, 'provider_receipt');
  assert.equal(aggregate.metrics.cacheReadTokens.value, 0);
  assert.equal(aggregate.metrics.billableTokens.value, 0);
  assert.equal(aggregate.metrics.catalogCostUsd.value, 0);
  assert.equal(aggregate.metrics.catalogCostUsd.source, 'estimated');
  assert.equal(aggregate.metrics.billedCostUsd.value, null);
  assert.equal(aggregate.metrics.wallTimeMs.value, 0);
  assert.equal((await db.get('SELECT COUNT(*) AS count FROM usage_ledger')).count, 1);
  await db.close();
}

async function verifyUnknownAndNoCall() {
  const db = await createDatabase();
  assert.equal(attemptLedger.catalogPricingKnown({ prepared: { registered: {
    cost_input: null, cost_output: null } } }), false);
  assert.equal(attemptLedger.catalogPricingKnown({ prepared: { registered: {
    cost_input: 0, cost_output: 0 } } }), true);
  await attemptLedger.recordModelUsage(db, scope('mission-unknown'), {
    routeAttemptId: 'attempt-unknown', model: 'openai://test',
    inputTokens: null, outputTokens: null, tokenUsageSource: 'unknown',
    costUsd: null, catalogPricingKnown: false, providerCalled: true,
    attemptStatus: 'failed', success: false
  });
  await attemptLedger.recordModelUsage(db, scope('mission-skipped'), {
    routeAttemptId: 'attempt-skipped', model: 'openai://test',
    inputTokens: 0, outputTokens: 0, tokenUsageSource: 'not_called',
    costUsd: 0, catalogPricingKnown: false, providerCalled: false,
    attemptStatus: 'skipped_budget', success: false
  });
  const unknown = await ledger.aggregateMetabolicUsage(db, { missionId: 'mission-unknown' });
  assert.equal(unknown.metrics.inputTokens.value, null);
  assert.equal(unknown.metrics.inputTokens.source, 'unavailable');
  assert.equal(unknown.metrics.catalogCostUsd.value, null);
  const skipped = await ledger.aggregateMetabolicUsage(db, { missionId: 'mission-skipped' });
  assert.equal(skipped.metrics.inputTokens.value, 0);
  assert.equal(skipped.metrics.inputTokens.source, 'exact');
  assert.equal(skipped.metrics.catalogCostUsd.value, 0);
  assert.equal((await db.get('SELECT COUNT(*) AS count FROM usage_ledger')).count, 0,
    'legacy usage accounting stays unchanged for unknown and uncalled attempts');
  await db.close();
}

function runtimeState(db, missionId) {
  return {
    db, mission: { missionId, agentId: 'worker', organizationId: 'org',
      projectId: 'project', runtimeStartedAt: Date.now() - 10 },
    executionBudget: { tokens: 1000, costUsd: 100, events: 100 },
    eventCount: 0, exactTokens: 0, estimatedTokens: 50, observedCostUsd: 0,
    tokenUsageObserved: false, tokenUsageUnknown: false,
    costUsageObserved: false, costUsageUnknown: false, budgetStopped: null,
    emitted: [], emit(event) { this.emitted.push(event); },
    child: { stdout: { pause() {} }, stderr: { pause() {} }, kill() {} },
    requiredTools: new Set(), observedTools: new Set(), recordedTurns: [],
    finalReportText: '', hasAgentInDb: false
  };
}

async function verifyRuntimeZeroAndMissingCost() {
  const db = await createDatabase();
  const measured = runtimeState(db, 'mission-runtime-zero');
  runtimeEvents.handleParsedEvent(measured, { type: 'turn.completed', usage: {
    input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, total_tokens: 0,
    cost_usd: 0
  } });
  await bridge.recordRuntimeUsage(db, { ...measured, code: 0 });
  const zero = await ledger.aggregateMetabolicUsage(db, { missionId: 'mission-runtime-zero' });
  assert.equal(zero.metrics.billableTokens.value, 0);
  assert.equal(zero.metrics.billableTokens.source, 'exact');
  assert.equal(zero.metrics.runtimeCostUsd.value, 0);
  assert.equal(zero.metrics.runtimeCostUsd.source, 'exact');

  const missing = runtimeState(db, 'mission-runtime-missing-cost');
  await bridge.recordRuntimeUsage(db, { ...missing, code: 0 });
  const unavailable = await ledger.aggregateMetabolicUsage(db,
    { missionId: 'mission-runtime-missing-cost' });
  assert.equal(unavailable.metrics.billableTokens.source, 'estimated');
  assert.equal(unavailable.metrics.runtimeCostUsd.value, null);
  assert.equal(unavailable.metrics.runtimeCostUsd.source, 'unavailable');
  await db.close();
}

async function main() {
  await verifyProviderReceipt();
  await verifyUnknownAndNoCall();
  await verifyRuntimeZeroAndMissingCost();
  console.log('Metabolic runtime bridge preserves provider, estimate and unavailable provenance: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
