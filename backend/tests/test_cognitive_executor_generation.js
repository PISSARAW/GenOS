'use strict';
const assert = require('node:assert/strict');

const modelRouter = require('../src/services/modelRouter');
const { generateProposals } = require('../src/services/cognitiveExecutor');

async function main() {
  const originalGenerate = modelRouter.generate;
  modelRouter.generate = async () => ({
    text: JSON.stringify([
      {
        id: 'hyp_a',
        hypothesis: 'The failure comes from a stale cache invalidation.',
        assumptions: ['cache is shared'],
        predictions: ['stale read after update'],
        falsificationCriteria: ['fresh read returns updated value'],
        experiment: { protocol: 'read-after-write', expectedOutcome: 'stale' }
      },
      {
        id: 'hyp_b',
        hypothesis: 'The failure comes from a missing authorization check.',
        assumptions: ['route bypasses middleware'],
        predictions: ['unauthorized access succeeds'],
        falsificationCriteria: ['request is rejected'],
        experiment: { protocol: 'read-after-write', expectedOutcome: 'rejected' }
      },
      {
        id: 'hyp_c',
        hypothesis: 'The failure comes from a network timeout.',
        assumptions: ['upstream is slow'],
        predictions: ['timeout error'],
        falsificationCriteria: ['no timeout under load'],
        experiment: { protocol: 'read-after-write', expectedOutcome: 'timeout' }
      }
    ]),
    model: 'mock-model',
    provider: 'mock-provider'
  });

  try {
    const result = await generateProposals({
      mission: { prompt: 'diagnose auth failure', executionBudget: { costUsd: 1 } },
      db: { all: async () => [] },
      agentId: 'agent-test'
    });

    assert.strictEqual(result.status, 'generated');
    assert.strictEqual(result.verification, 'unverified');
    assert.strictEqual(result.model, 'mock-model');
    assert.strictEqual(result.provider, 'mock-provider');
    assert.ok(Array.isArray(result.proposals));
    assert.strictEqual(result.proposals.length, 3);
    for (const proposal of result.proposals) {
      assert.strictEqual(proposal.verification, 'unverified');
      assert.strictEqual(proposal.origin, 'model_generated');
    }
    assert.ok(result.selectedTriplet && result.selectedTriplet.length === 3);
    assert.ok(result.verificationPlan && result.verificationPlan.status === 'proposed');

    // Aucune proposition ne doit être promue automatiquement.
    assert.ok(result.proposals.every((proposal) => proposal.verification !== 'verified'));

    console.log('Cognitive executor generation path: PASS');
  } finally {
    modelRouter.generate = originalGenerate;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
