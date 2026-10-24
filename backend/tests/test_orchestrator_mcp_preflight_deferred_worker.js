'use strict';

const assert = require('node:assert/strict');
const { parseWorkerEvidence, baselineTools } = require('../bin/orchestratorMcpPreflight.cjs');

async function main() {
  assert.deepEqual(baselineTools({ phases: [
    { requiredTools: ['genos_search_failures'] },
    { requiredTools: ['genos_snapshot', 'genos_diagnose', 'genos_snapshot'] }
  ] }), ['genos_search_failures', 'genos_snapshot', 'genos_diagnose']);
  const db = { all: async () => [
    { event_type: 'LOCAL_WORKER_COMPLETED', payload_json: JSON.stringify({
      executionRunId: 'run-1', deferredTerminalEventType: 'AGENT_COMPLETED' }) }
  ] };
  const result = await parseWorkerEvidence(db, 'orchestrator-1', 'run-1');
  assert.equal(result.eventType, 'AGENT_COMPLETED');
  assert.equal(result.payload.executionRunId, 'run-1');

  const failedDb = { all: async () => [
    { event_type: 'LOCAL_WORKER_FAILED', payload_json: JSON.stringify({
      executionRunId: 'run-2', deferredTerminalEventType: 'AGENT_FAILED' }) }
  ] };
  const failed = await parseWorkerEvidence(failedDb, 'orchestrator-2', 'run-2');
  assert.equal(failed.eventType, 'AGENT_FAILED');
  console.log('deferred local worker postflight evidence: PASS');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
