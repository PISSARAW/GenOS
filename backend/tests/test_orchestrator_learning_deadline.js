'use strict';
const assert = require('node:assert/strict');
const { run } = require('../bin/runtimeLearningDeadline.cjs');
async function main() {
  const events = [];
  const ctx = { mission: { agentId: 'worker' }, emit: (event) => events.push(event) };
  const bounded = await run({ ctx, operation: () => new Promise(() => {}), timeoutMs: 15 });
  assert.equal(bounded.completed, false);
  assert.equal(events[0].eventType, 'RUNTIME_LEARNING_DEFERRED');
  assert.equal(events[0].payload.agentId, 'worker');
  const failed = await run({ ctx, operation: () => Promise.reject(new Error('memory unavailable')), timeoutMs: 100 });
  assert.equal(failed.completed, false);
  assert.equal(failed.reason, 'memory unavailable');
  const completed = await run({ ctx, operation: async () => {}, timeoutMs: 100 });
  assert.equal(completed.completed, true);
  assert.equal(events.length, 2);
  console.log('Optional runtime learning cannot retain terminal process closure or fabricate a memory receipt.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
