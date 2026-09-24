'use strict';

const assert = require('node:assert/strict');
const rhizome = require('../src/services/rhizomeCoordinationService');
const runtime = require('../src/services/rhizome/runtime/rhizomeRuntime');

async function run() {
  const available = await rhizome.composeRhizome('Route verified needs.', {
    nodes: [{ nodeId: 'local-tool', kind: 'TOOL', capabilities: ['verify'], state: 'ACTIVE' }]
  });
  const need = { needId: 'verify-1', capability: 'verify' };
  const waiting = await runtime.tick({ sessionId: available.sessionId, need });
  assert.equal(waiting.status, 'WAITING_FOR_EXECUTOR');
  const unverified = await runtime.tick({ sessionId: available.sessionId, need, execute: async () => ({ result: 'done' }) });
  assert.equal(unverified.status, 'WAITING_FOR_VERIFIER');

  const missing = await rhizome.composeRhizome('Find missing capability routes.');
  const gap = await runtime.tick({ sessionId: missing.sessionId, need: { needId: 'need-x', capability: 'formal_proof' } });
  assert.equal(gap.status, 'GAP_OPEN');
  assert.equal(gap.gap.gap.needId, 'need-x');

  const run = await runtime.run({ sessionId: available.sessionId, needs: [need, need], maxTicks: 1 });
  assert.equal(run.results.length, 1);
  assert.equal(run.stopReason, 'MAX_TICKS');
}

run().then(() => console.log('Rhizome runtime checks: PASS')).catch((error) => {
  console.error('Rhizome runtime test failed:', error);
  process.exit(1);
});
