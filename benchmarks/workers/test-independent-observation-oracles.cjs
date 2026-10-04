'use strict';

const assert = require('node:assert/strict');
const { CASES, score } = require('./campaign.cjs');
const { runCase } = require('./genos-adapter.cjs');

async function checkCase(id, corrupt) {
  const testCase = CASES.find((item) => item.id === id);
  const execution = await runCase(testCase);
  assert.equal(await score(testCase, execution), 'passed');
  const altered = structuredClone(execution);
  corrupt(altered.result);
  assert.equal(await score(testCase, altered), 'failed');
}

async function main() {
  await checkCase('scout-source', (result) => { result.observations[0].offset = 0; });
  await checkCase('forensic-chain', (result) => { result.causalChain[0].relation = 'temporal_guess'; });
  await checkCase('teaching-transfer', (result) => { result.transferCheck.learnerSum = 8; });
  process.stdout.write('Independent observation oracles: PASS\n');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
