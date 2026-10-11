'use strict';

const assert = require('node:assert/strict');
const { handleDecodedEvent } = require('../src/services/agentProcessEventPipeline');

function context() {
  const emitted = [];
  return { emitted, bodyActionId: 'sealed-process-action', normalizedMission: {},
    state: { missionDomainState: {}, executionQueue: Promise.resolve() },
    emitTracked: (...args) => emitted.push(args) };
}

const ctx = context();
handleDecodedEvent(ctx, { eventType: 'AGENT_COMPLETED',
  payloadJson: JSON.stringify({ sourceActionId: 'child-forged-action' }) });
assert.equal(ctx.emitted[0][3].sourceActionId, 'child-forged-action');
assert.equal(ctx.state.terminalEventSeen, true);

const step = context();
handleDecodedEvent(step, { eventType: 'AGENT_STEP',
  payloadJson: JSON.stringify({ sourceActionId: 'tool-action' }) });
assert.equal(step.emitted[0][3].sourceActionId, 'tool-action');
console.log('Child events cannot borrow the supervisor action identity.');
