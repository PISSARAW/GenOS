'use strict';

const assert = require('node:assert/strict');
const { fixture, closeFixture } = require('./helpers/daemonCompletionFixture');
const runtime = require('../src/services/daemon/residentDaemonRuntime');
const cycle = require('../src/services/daemon/residentDaemonCycleService');
const bridge = require('../src/services/daemon/daemonEventBridgeService');
const consumer = require('../src/services/daemon/daemonEventConsumerService');

async function main() {
  const value = await fixture();
  const context = value.context;
  try {
    await cycle.runCycle(context);
    context.bridge = bridge.createBridge({ db: value.db, runtime: context.runtime,
      daemonId: context.daemonId, deferInvestigation: true });
    await consumer.initializeCursor(context);
    await bridge.ingestEvent(bridge.createBridge({ db: value.db }), {
      type: 'TEST_FAILED', territoryId: context.territoryId, payload: { file: 'probe.js' } });
    const delivery = await consumer.pollDaemonEvents(context);
    assert.ok(delivery.lastEventId > 0);
    await runtime.releaseDaemon(context.runtime, context.daemonId);
    const replacement = runtime.createRuntime(value.db);
    await runtime.registerDaemon(replacement, { daemonId: context.daemonId, territoryId: context.territoryId });
    const resumed = { db: value.db, runtime: replacement, daemonId: context.daemonId,
      territoryId: context.territoryId };
    const result = await cycle.runCycle(resumed);
    assert.equal(result.investigation.investigated, true);
    assert.equal(resumed.retryInvestigation, false);
    await runtime.releaseDaemon(replacement, context.daemonId);
  } finally {
    await closeFixture(value);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
