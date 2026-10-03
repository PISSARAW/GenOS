'use strict';

const assert = require('node:assert/strict');
const { MorphogenesisRuntime } = require('../src/services/morphogenesis/morphogenesisRuntime');

async function main() {
  const runtime = new MorphogenesisRuntime();
  let transitionCalled = false;
  runtime._transitionEngine = { executeTransition: async () => { transitionCalled = true; return { committed: true }; } };
  const result = await runtime.executeMorphology({ topology: 'trinity', agents: [{ role: 'critic' }] });
  assert.equal(result.applied, false, 'the proposal path cannot claim an applied mutation');
  assert.equal(result.proposed, true);
  assert.equal(result.commitId, undefined, 'proposal has no commit receipt');
  assert.equal(transitionCalled, false, 'legacy execution must not bypass the governed transition pipeline');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
