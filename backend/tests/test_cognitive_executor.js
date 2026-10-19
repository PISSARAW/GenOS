'use strict';
const assert = require('assert');
const modelRouter = require('../src/services/modelRouter');
const {
  normalizeExecutor, resolveExecutor, assertCallerMcpConfiguration, generateProposals
} = require('../src/services/cognitiveExecutor');

assert.equal(normalizeExecutor(' CALLER_MCP '), 'caller_mcp');
assert.equal(resolveExecutor({ executor: 'codex' }), 'codex');

assert.throws(
  () => assertCallerMcpConfiguration({ executor: 'caller_mcp' }, {}),
  (error) => error.code === 'MCP_SAMPLING_UNAVAILABLE'
);
assert.doesNotThrow(() => assertCallerMcpConfiguration(
  { executor: 'caller_mcp' }, { GENOS_MCP_SAMPLING_URL: 'http://127.0.0.1:1/sample' }
));

async function runMockedGenerateProposalsCheck() {
  const original = modelRouter.generate;
  const mockProposals = [
    { id: 'h1', hypothesis: 'Hypothesis one about X and Y', predictions: ['p1'],
      falsificationCriteria: ['f1'], experiment: { protocol: 'Shared protocol for discriminating', expectedOutcome: 'outcome one' } },
    { id: 'h2', hypothesis: 'Hypothesis two about X and Z', predictions: ['p2'],
      falsificationCriteria: ['f2'], experiment: { protocol: 'Shared protocol for discriminating', expectedOutcome: 'outcome two' } },
    { id: 'h3', hypothesis: 'Hypothesis three about X and W', predictions: ['p3'],
      falsificationCriteria: ['f3'], experiment: { protocol: 'Shared protocol for discriminating', expectedOutcome: 'outcome three' } },
  ];
  modelRouter.generate = async () => ({ text: JSON.stringify(mockProposals), model: 'mock', provider: 'mock' });
  try {
    const result = await generateProposals({ mission: { prompt: 'test mission', executionBudget: { costUsd: 1 } } });
    assert.strictEqual(result.verification, 'unverified');
    assert.ok(Array.isArray(result.proposals));
    assert.strictEqual(result.proposals.length, 3);
    assert.ok(result.selectedTriplet && result.selectedTriplet.length === 3);
    assert.ok(result.verificationPlan && result.verificationPlan.experimentId);
    for (const proposal of result.proposals) {
      assert.strictEqual(proposal.verification, 'unverified');
    }
  } finally {
    modelRouter.generate = original;
  }
  console.log('Cognitive executor mocked generation tests passed.');
}

async function runRealGenerateProposalsCheck() {
  const result = await generateProposals({ mission: { prompt: 'test mission', executionBudget: { costUsd: 1 } } });
  assert.strictEqual(result.verification, 'unverified');
  assert.ok(Array.isArray(result.proposals));
  for (const proposal of result.proposals) {
    assert.strictEqual(proposal.verification, 'unverified');
  }
  console.log('Cognitive executor contract tests passed.');
}

runMockedGenerateProposalsCheck()
  .then(runRealGenerateProposalsCheck)
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });