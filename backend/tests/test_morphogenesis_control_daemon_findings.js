'use strict';

const assert = require('node:assert/strict');
const { ControlLoopOrchestrator } = require('../src/services/morphogenesis/control/orchestrator');

async function main() {
  const orchestrator = new ControlLoopOrchestrator();
  let applied = 0;
  orchestrator.registerFastHandler('parametric_patch', async (context) => {
    applied += 1;
    return { evidence: context.latestEvent.evidence };
  });

  const unverified = await orchestrator.consumeEvent({
    type: 'DAEMON_FINDING', evidence: ['finding:f-1']
  });
  assert.equal(unverified.status, 'BLOCKED');
  assert.equal(unverified.fastLoop.executed, false);
  assert.equal(applied, 0);

  const verified = await orchestrator.consumeEvent({
    type: 'DAEMON_FINDING', evidence: ['finding:f-1']
  }, { evidenceValidated: true });
  assert.equal(verified.status, 'PROPOSED');
  assert.equal(verified.fastLoop.executed, true);
  assert.equal(verified.fastLoop.action, 'PARAMETRIC_PATCH');
  assert.equal(applied, 1);

  const unhandled = new ControlLoopOrchestrator();
  const noHandler = await unhandled.consumeEvent({
    type: 'DAEMON_FINDING', evidence: ['finding:f-2']
  }, { evidenceValidated: true });
  assert.equal(noHandler.fastLoop.executed, false);
  assert.equal(noHandler.fastLoop.reason, 'handler-unavailable');

  console.log('morphogenesis daemon finding gate: passed');
}

main().catch((error) => { console.error(error); process.exit(1); });
