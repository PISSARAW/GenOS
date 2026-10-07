'use strict';

const assert = require('node:assert/strict');
const runtime = require('../src/services/conceptRuntimeService');
const { AdaptiveStateService } = require('../src/services/adaptiveStateService');

function memoryDb() {
  const rows = new Map();
  return {
    get: async (_sql, scope, key) => rows.has(scope + '|' + key)
      ? { payload_json: rows.get(scope + '|' + key) } : null,
    all: async () => [],
    run: async (...args) => {
      const [sql, scope, key, payload] = args;
      if (scope && !String(sql).includes('adaptive_state_events')) rows.set(scope + '|' + key, payload);
    }, rows
  };
}

async function main() {
  const measured = Object.fromEntries(runtime.CONCEPTS.map((concept) => [concept, 'observed']));
  assert.equal(runtime.promotion(measured, [
    'local_causal_ablation', 'external_task_campaign', 'reserved_replication'
  ]).allowed, false, 'strings are not evidence');
  assert.ok(Object.values(runtime.statuses()).every((status) => status === 'not_run'));
  const db = memoryDb();
  const store = new AdaptiveStateService(db);
  await store.persistObject('ignition', 'a', { charge: 0.9 }, 1);
  const before = db.rows.get('ignition|a');
  const receipt = await runtime.processEvent(db, { agentId: 'a',
    event: { eventType: 'EVIDENCE_REPORT', action: 'VERIFY', payload: {
      conceptEvidence: ['local_causal_ablation', 'external_task_campaign', 'reserved_replication']
    } } });
  assert.equal(receipt.schema, 'genos.concept-runtime-receipt/v2');
  assert.equal(receipt.causal.status, 'not_established');
  assert.equal(receipt.promotion.allowed, false);
  assert.equal(receipt.persistence.status, 'stored');
  assert.equal(db.rows.get('ignition|a'), before, 'observer must not charge ignition twice');
  assert.ok(Object.values(receipt.concepts).every((status) => status === 'not_run'));
  assert.equal(receipt.receiptHash.length, 64);
  assert.equal((await store.restoreObject('concept_runtime', 'a')).receipts.length, 1);
  const badDb = { get: async () => { throw Error('offline'); } };
  assert.equal((await runtime.processEvent(badDb, {
    agentId: 'a', event: { eventType: 'OBSERVED' }
  })).persistence.status, 'failed');
  console.log('Concept observation, no duplicate mutation and spoofed promotion checks passed.');
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { memoryDb };
