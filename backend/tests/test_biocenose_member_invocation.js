'use strict';

const assert = require('node:assert/strict');
const modelRouter = require('../src/services/modelRouter');
const invocation = require('../src/services/biocenose/runtime/memberInvocationService');

async function run() {
  const originalGenerate = modelRouter.generate;
  const prompts = [];
  const responses = [
    { text: JSON.stringify({ changedClaims: ['claim-1'], reasonCodes: ['NEW_EVIDENCE'], evidenceRefs: [] }) },
    { text: JSON.stringify({ previousPosition: 'Old', newPosition: 'New', changedClaims: ['claim-1'], reasonCodes: ['NEW_EVIDENCE'], evidenceRefs: [] }) }
  ];
  modelRouter.generate = async (options) => {
    prompts.push(options.prompt);
    return responses.shift();
  };
  try {
    const result = await invocation.invoke({
      phase: 'REVISION', task: 'Revise claims', session: {
        communityId: 'community-1', question: 'Question', questionType: 'FACTUAL', round: 0
      }, member: { memberId: 'member-1', role: 'reviewer', model: 'test-model' },
      details: { claims: [{ claimId: 'claim-1', statement: 'Claim' }] }
    });
    assert.equal(result.newPosition, 'New');
    assert.equal(prompts.length, 2);
    assert.match(prompts[1], /newPosition is required/);
    assert.match(prompts[1], /Do not invent facts, evidence references/);
  } finally {
    modelRouter.generate = originalGenerate;
  }

  let attempts = 0;
  modelRouter.generate = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('Provider returned invalid structured JSON.');
    return { text: JSON.stringify({ changedClaims: [] }) };
  };
  try {
    const result = await invocation.invoke({
      phase: 'REVISION', task: 'Revise claims', session: {
        communityId: 'community-1', question: 'Question', questionType: 'FACTUAL', round: 0
      }, member: { memberId: 'member-1', role: 'reviewer', model: 'test-model' }, details: { claims: [] }
    });
    assert.deepEqual(result.changedClaims, []);
    assert.equal(attempts, 2);
  } finally {
    modelRouter.generate = originalGenerate;
  }
}

run().then(() => process.stdout.write('Biocenose member invocation checks: PASS\n')).catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
