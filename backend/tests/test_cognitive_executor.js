const assert = require('assert');
const {
  normalizeExecutor, resolveExecutor, assertCallerMcpConfiguration, generateProposals
} = require('../src/services/cognitiveExecutor');

assert.equal(normalizeExecutor(' CALLER_MCP '), 'caller_mcp');
assert.equal(resolveExecutor({ executor: 'codex' }, {}), 'codex');
assert.equal(resolveExecutor({ executor: 'hermes' }, {}), 'solar-direct');
assert.equal(resolveExecutor({ executor: 'antigravity' }, {}), 'caller_mcp');
assert.throws(
  () => resolveExecutor({ executor: 'unknown' }, {}),
  (error) => error.code === 'UNSUPPORTED_EXECUTOR'
);
assert.throws(
  () => assertCallerMcpConfiguration({ executor: 'caller_mcp' }, {}),
  (error) => error.code === 'MCP_SAMPLING_UNAVAILABLE'
);
assert.doesNotThrow(() => assertCallerMcpConfiguration(
  { executor: 'caller_mcp' }, { GENOS_MCP_SAMPLING_URL: 'http://127.0.0.1:1/sample' }
));

async function runGenerateProposalsCheck() {
  const result = await generateProposals({ mission: { prompt: 'test mission', executionBudget: { costUsd: 1 } } });
  assert.strictEqual(result.verification, 'unverified');
  assert.ok(Array.isArray(result.proposals));
  for (const proposal of result.proposals) {
    assert.strictEqual(proposal.verification, 'unverified');
  }
  console.log('Cognitive executor contract tests passed.');
}

runGenerateProposalsCheck().catch((error) => {
  console.error(error);
  process.exit(1);
});