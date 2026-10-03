'use strict';

const assert = require('node:assert/strict');
const { MorphogenesisRuntime } = require('../src/services/morphogenesis/morphogenesisRuntime');

async function main() {
  const runtime = new MorphogenesisRuntime();
  const result = await runtime.executeMorphology({ topology: 'trinity', agents: [{ role: 'critic' }] });
  assert.equal(result.applied, false, 'missing transition engine cannot claim an applied mutation');
  assert.equal(result.proposed, true);
  assert.equal(result.commitId, undefined, 'proposal has no commit receipt');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
