'use strict';
const assert = require('node:assert/strict');
const router = require('../src/services/philosophyRouter');
const { fixture } = require('../src/philosophy/contractExperiments');
const MAX_BYTES = 1024 * 1024;

async function main() {
  const { createToolCallHandler } = await import('../../mcp/toolCallHandler.js');
  const previousLease = process.env.GENOS_MCP_LEASE;
  process.env.GENOS_MCP_LEASE = 'genos_philosophy';
  const handler = createToolCallHandler({ runOrchestrator: async () => { throw new Error('unexpected dispatch'); },
    runGenosCli: async () => '', executeStrategyTool: async () => null });
  async function call(operation, args = {}) {
    const response = await handler({ params: { name: 'genos_philosophy', arguments: { operation, arguments: args } } });
    assert.equal(response.isError, undefined, JSON.stringify(response));
    assert.ok(Buffer.byteLength(JSON.stringify(response)) < MAX_BYTES);
    return JSON.parse(response.content[0].text);
  }
  try {
    const health = await call('implementationContractHealth');
    assert.equal(health.compiledConcepts, 375);
    assert.equal(Object.hasOwn(health, 'contracts'), false);
    const ids = [];
    let offset = 0;
    do {
      const page = await call('listImplementationContracts', { offset, limit: 100 });
      assert.equal(page.total, 375);
      assert.equal(page.offset, offset);
      assert.ok(page.contracts.length <= 100);
      ids.push(...page.contracts.map((contract) => contract.id));
      offset = page.nextOffset;
    } while (offset !== null);
    assert.equal(ids.length, 375);
    assert.equal(new Set(ids).size, 375);
    const filtered = await call('listImplementationContracts', { target: 'response', limit: 7 });
    assert.equal(filtered.contracts.length, 7);
    assert.ok(filtered.contracts.every((contract) => contract.targets.includes('response')));
    assert.ok(filtered.total > 7);
    for (const args of [{ limit: 101 }, { limit: 0 }, { offset: -1 }, { offset: 1.5 }, { limit: '100' }]) {
      await assert.rejects(() => router.handlePhilosophyRequest({ request: { operation: 'listImplementationContracts', arguments: args } }));
    }
    assert.deepEqual((await call('listImplementationContracts', { offset: 1000 })).contracts, []);
    const { contract } = await call('getImplementationContract', { conceptId: 'epistemology.certainty-doubt' });
    const active = await call('executeImplementationContract', { conceptId: contract.id });
    assert.equal(active.assessment.status, 'unobserved');
    assert.equal(active.after.verificationTasks.length, 1);
    const control = await call('executeImplementationContract', { conceptId: contract.id, enabled: false });
    assert.equal(control.behaviorChanged, false);
    const satisfied = await call('executeImplementationContract', { conceptId: contract.id, observations: fixture(contract, 'satisfying') });
    assert.equal(satisfied.assessment.status, 'satisfied');
    const receipt = await call('runImplementationExperiment', { conceptId: contract.id });
    assert.equal(receipt.passed, true);
    const assessment = await call('assessContractPromotion', { conceptId: contract.id, targetMaturity: 'tested', evidence: [receipt] });
    assert.equal(assessment.eligible, true);
    assert.equal(assessment.promotionEligible, false);
    const coverage = await call('implementationExperimentCoverage');
    assert.equal(coverage.tested, 375);
    assert.equal(coverage.validatedOnRealMissions, 0);
    process.env.GENOS_MCP_LEASE = 'genos_snapshot';
    const refused = await handler({ params: { name: 'genos_philosophy', arguments: { operation: 'executeImplementationContract', arguments: { conceptId: contract.id } } } });
    assert.equal(refused.isError, true);
    console.log('375 contracts accessible through leased MCP pages; bounded outputs, audits and lease refusal passed.');
  } finally {
    if (previousLease === undefined) delete process.env.GENOS_MCP_LEASE;
    else process.env.GENOS_MCP_LEASE = previousLease;
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
