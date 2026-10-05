'use strict';

const assert = require('node:assert/strict');
const { createPlaySession, runPlaySession } = require('../src/services/playService');

async function main() {
  for (const budget of [-1, 1.5, Infinity, '5']) assert.throws(() => createPlaySession('a', { budget }), /budget/);
  const zero = await runPlaySession('a', { options: { budget: 0 }, inputs: [{ command: 'npm test' }] });
  assert.equal(zero.iterations.length, 0);
  assert.equal(zero.status, 'completed');
  const noCalls = await runPlaySession('a', { options: { maxToolInvocations: 0 }, inputs: [{ command: 'npm test' }] });
  assert.equal(noCalls.iterations.length, 0);
  console.log('Play zero budgets and invocation limits: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
