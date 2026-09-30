'use strict';

const assert = require('node:assert/strict');
const { updateFromEvent, loadTraceBlock } = require('../src/services/reverberationService');

function memoryDb() {
  const rows = new Map();
  return {
    get: async (sql, scope, key) => rows.has(`${scope}|${key}`)
      ? { payload_json: rows.get(`${scope}|${key}`) } : null,
    all: async () => [],
    run: async (...args) => {
      const [sql, scope, key, payload] = args;
      if (scope && !String(sql).includes('adaptive_state_events')) rows.set(`${scope}|${key}`, payload);
    }
  };
}

async function observeContext(db, agentId) {
  return require('../src/services/agentSelfBlocks').loadTraceBlock(db, agentId);
}

async function main() {
  const fullDb = memoryDb();
  const ablatedDb = memoryDb();
  await updateFromEvent(fullDb, 'agent-full', {
    eventType: 'EVIDENCE_REPORT',
    detail: 'retain the delayed constraint until the next planning cycle',
    payload: { task: 'causal recurrence probe' }
  });
  await updateFromEvent(ablatedDb, 'agent-ablated', {
    eventType: 'EVIDENCE_REPORT',
    detail: 'retain the delayed constraint until the next planning cycle',
    payload: { task: 'causal recurrence probe' }
  });
  // Ablation removes the maintained recurrent state after equal input processing.
  const ablatedStore = require('../src/services/adaptiveStateService').AdaptiveStateService;
  await new ablatedStore(ablatedDb).persistObject('reverberation', 'agent-ablated', {
    clauses: [], activation: 0, passes: 0, settled: true, updatedAt: Date.now()
  }, 0);

  const fullTrace = await loadTraceBlock(fullDb, 'agent-full');
  const ablatedTrace = await loadTraceBlock(ablatedDb, 'agent-ablated');
  const fullContext = await observeContext(fullDb, 'agent-full');
  const ablatedContext = await observeContext(ablatedDb, 'agent-ablated');
  assert.match(fullTrace, /delayed constraint/);
  assert.equal(ablatedTrace, '');
  assert.match(fullContext, /delayed constraint/);
  assert.doesNotMatch(ablatedContext, /delayed constraint/);
  assert.notEqual(fullContext, ablatedContext, 'the maintained state must change downstream context');
  console.log('✅ reverberation causal context probe passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
