'use strict';

const assert = require('node:assert/strict');
const runtime = require('../src/services/conceptRuntimeService');
const { AdaptiveStateService } = require('../src/services/adaptiveStateService');

function memoryDb() {
  const rows = new Map();
  return {
    get: async (_sql, scope, key) => rows.has(`${scope}|${key}`)
      ? { payload_json: rows.get(`${scope}|${key}`) } : null,
    all: async () => [],
    run: async (...args) => {
      const [sql, scope, key, payload] = args;
      if (scope && !String(sql).includes('adaptive_state_events')) rows.set(`${scope}|${key}`, payload);
    },
    rows
  };
}

function testPromotionGate() {
  const statuses = Object.fromEntries(runtime.CONCEPTS.map((concept) => [concept, 'measured']));
  const blocked = runtime.promotion(statuses, ['local_causal_ablation']);
  assert.equal(blocked.allowed, false);
  assert.deepEqual(blocked.missing, ['external_task_campaign', 'reserved_replication']);
  const passed = runtime.promotion(statuses, [
    'local_causal_ablation', 'external_task_campaign', 'reserved_replication'
  ]);
  assert.equal(passed.allowed, true);
}

async function testProductionReceipt() {
  const db = memoryDb();
  const receipt = await runtime.processEvent(db, {
    agentId: 'concept-agent',
    event: {
      eventType: 'EVIDENCE_REPORT',
      action: 'VERIFY',
      detail: 'verified bounded action',
      payload: { task: 'causal concept probe', intensity: 1 }
    }
  });
  assert.equal(receipt.schema, 'genos.concept-runtime-receipt/v1');
  assert.equal(receipt.causal.status, 'not_established');
  assert.equal(receipt.promotion.allowed, false);
  assert.equal(receipt.receiptHash.length, 64);
  const stored = await new AdaptiveStateService(db).restoreObject('concept_runtime', 'concept-agent');
  assert.equal(stored.receipts.length, 1);
  assert.ok(receipt.concepts.global_workspace);
  assert.ok(receipt.concepts.report_access);
}

async function main() {
  testPromotionGate();
  await testProductionReceipt();
  console.log('Concept runtime bridge and fail-closed promotion checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
