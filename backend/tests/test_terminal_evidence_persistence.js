'use strict';

const assert = require('node:assert/strict');
const terminalStatus = require('../src/services/agentTerminalStatusService');

async function run() {
  const order = [];
  const ctx = {
    agentId: 'worker-terminal-order',
    state: { pendingTerminalStatuses: new Map(), executionQueue: Promise.resolve() },
    flushTelemetry: async () => { order.push('flush'); return { flushed: true, pending: 0 }; },
    updateAgent: async () => { order.push('status'); }
  };
  terminalStatus.queue(ctx, { eventType: 'AGENT_COMPLETED', status: 'completed',
    currentTask: 'done', trackedEventId: 'terminal-event' }, 'completed');
  assert.deepEqual(order, []);
  await terminalStatus.settle({ ctx, event: { id: 'terminal-event' } });
  assert.deepEqual(order, ['flush', 'status']);
  assert.equal(ctx.state.pendingTerminalStatuses.size, 0);
  assert.equal(terminalStatus.isTerminalEvent('AGENT_COMPLETED'), true);
  assert.equal(terminalStatus.isTerminalEvent('EVIDENCE_REPORT'), false);
}

run().then(() => console.log('Terminal worker status waits for durable telemetry.'))
  .catch((error) => { console.error(error); process.exit(1); });
