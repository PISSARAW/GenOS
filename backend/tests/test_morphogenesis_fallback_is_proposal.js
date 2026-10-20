'use strict';

const assert = require('node:assert/strict');
const { MorphogenesisRuntime } = require('../src/services/morphogenesis/morphogenesisRuntime');

async function main() {
  const runtime = new MorphogenesisRuntime();
  let transitionCalled = false;
  runtime._transitionEngine = { executeTransition: async () => { transitionCalled = true; return { committed: true }; } };
  const result = await runtime.executeMorphology({ topology: 'trinity', agents: [{ role: 'critic' }] });
  assert.equal(result.applied, true, 'the governed transition pipeline must be called and applied');
  assert.equal(result.proposed, false);
  assert.equal(result.committed, true, 'transition must return committed: true');
  assert.equal(result.decision, 'APPLIED', 'transition must return decision: ' + 'APPLIED');
  assert.equal(transitionCalled, true, 'legacy execution must call the governed transition pipeline');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
