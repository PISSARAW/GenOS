'use strict';
const assert = require('node:assert/strict');
const events = [];
let execute;
require.cache[require.resolve('../src/services/mcpExecutor')] = { exports: { execute: (...args) => execute(...args) } };
require.cache[require.resolve('../src/services/telemetryObserver')] = { exports: { emitEvent: (event) => events.push(event) } };
const { compile } = require('../src/services/orchestrationMemoryCompilation');
const context = { orchestratorId: 'orchestrator', sourceEventId: 'event', decision: { reason: 'Preserve evidence' }, memoryTimeoutMs: 15 };
const args = { strategy: 'bounded_worker', outcome: 'tests verified', successful: true, evidence: ['test.js'] };
async function main() {
  let rejectLate;
  execute = () => new Promise((_, reject) => { rejectLate = reject; });
  assert.equal((await compile(context, args)).completed, false);
  assert.equal(events[0].eventType, 'ORCHESTRATION_MEMORY_DEFERRED');
  rejectLate(new Error('late transport failure'));
  await new Promise(setImmediate);
  assert.equal(events.length, 1);
  execute = async () => ({ success: false });
  assert.equal((await compile(context, args)).completed, false);
  execute = async () => ({ success: true, output: { success: false } });
  assert.equal((await compile(context, args)).completed, false);
  execute = async () => ({ success: true });
  assert.equal((await compile(context, args)).completed, true);
  assert.deepEqual(events.map((event) => event.eventType), ['ORCHESTRATION_MEMORY_DEFERRED', 'ORCHESTRATION_MEMORY_DEFERRED', 'ORCHESTRATION_MEMORY_DEFERRED', 'ORCHESTRATION_MEMORY_COMPILED']);
  console.log('Optional orchestration memory is bounded and late failures produce no duplicate or false success.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
