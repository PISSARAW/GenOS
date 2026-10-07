'use strict';
const assert = require('node:assert/strict');
const { handleRuntimeClose } = require('../bin/agent-runtime-close.cjs');

async function checkIdentityDoesNotSkipGate() {
  const events = [];
  let persisted = false;
  let cleaned = false;
  const originalExit = process.exit;
  const originalCode = process.exitCode;
  const stopped = new Error('test exit intercepted');
  process.exit = () => { throw stopped; };
  process.exitCode = undefined;
  try {
    await assert.rejects(handleRuntimeClose({ code: 0, signal: null, db: {}, hasAgentInDb: true,
      requiredTools: new Set(['required-tool']), observedTools: new Set(),
      pendingConscienceOp: Promise.resolve(), mission: { agentId: 'persisted-worker' }, conscienceState: {},
      agentConscience: { persistConscienceState: async () => { persisted = true; } },
      emit: event => events.push(event), cleanup: () => { cleaned = true; } }), error => error === stopped);
    assert.equal(persisted, true);
    assert.equal(cleaned, true);
    assert.equal(events[0].eventType, 'HARD_INVARIANT_FAILURE');
    assert.deepEqual(events[0].payload.missingTools, ['required-tool']);
    assert.equal(process.exitCode, 1);
  } finally { process.exit = originalExit; process.exitCode = originalCode; }
}
checkIdentityDoesNotSkipGate().then(() => console.log('Persisted runtime identity retains completion gates: PASS'))
  .catch(error => { console.error(error); process.exitCode = 1; });
