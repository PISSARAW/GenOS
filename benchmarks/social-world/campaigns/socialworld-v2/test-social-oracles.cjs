'use strict';

const assert = require('node:assert/strict');
const { v201, v202 } = require('./social-oracles.cjs');

function run() {
  assert.equal(v201(null).status, 'inconclusive');
  const dialogue = {
    turns: [
      { speaker: 'a', receiptValid: true, referencesReceivedItem: false },
      { speaker: 'b', receiptValid: true, referencesReceivedItem: true },
      { speaker: 'a', receiptValid: true, referencesReceivedItem: false },
      { speaker: 'b', receiptValid: true, referencesReceivedItem: true }
    ],
    memoryMutations: [{ agentId: 'a' }, { agentId: 'b' }],
    unauthorizedMessages: 0, inventedReferences: 0, repetitionLoops: 0, guardrailViolations: 0
  };
  assert.equal(v201(dialogue).status, 'pass');
  assert.equal(v201({ ...dialogue, unauthorizedMessages: 1 }).status, 'fail');
  assert.equal(v202({}).status, 'inconclusive');
  const population = {
    initiatives: [{ admissible: true, recipientId: 'b' }, { admissible: true, recipientId: 'c' },
      { admissible: true, recipientId: 'b' }],
    reciprocities: [{}], mutations: [{ receiptVerified: true }],
    budgetWithinLimit: true, populationWithinLimit: true,
    unauthorizedMessages: 0, inventedReferences: 0, repetitionLoops: 0, guardrailViolations: 0
  };
  assert.equal(v202(population).status, 'pass');
  assert.equal(v202({ ...population, budgetWithinLimit: false }).status, 'fail');
}

run();
process.stdout.write('SocialWorld V2 social oracle tests passed\n');
