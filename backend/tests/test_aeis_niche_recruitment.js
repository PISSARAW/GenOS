'use strict';

const assert = require('node:assert/strict');
const { recruitAndExecute } = require('../src/services/epistemic/epistemicNicheRecruitmentService');

async function main() {
  const reviewers = [{ type: 'testResult', niche: 'testResult', provider: 'same' }, { type: 'testResult', niche: 'testResult', provider: 'same' }];
  let called = 0;
  const recruited = await recruitAndExecute({ reviewers, execute: async (niche) => { called += 1; return { type: niche.type, status: 'verified' }; } });
  assert.equal(called, 1);
  assert.equal(recruited.result.status, 'verified');
  const diverse = await recruitAndExecute({ reviewers: [{ type: 'a' }, { type: 'b' }, { type: 'c' }], execute: async () => { called += 1; } });
  assert.equal(diverse.result, null);
  console.log('AEIS niche recruitment is conditional and executes the selected niche.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
