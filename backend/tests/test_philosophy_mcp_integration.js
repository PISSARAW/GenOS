'use strict';

const assert = require('node:assert/strict');
const router = require('../src/services/philosophyRouter');

async function main() {
  const { createToolCallHandler } = await import('../../mcp/toolCallHandler.js');
  const previousLease = process.env.GENOS_MCP_LEASE;
  process.env.GENOS_MCP_LEASE = 'genos_philosophy';
  const handler = createToolCallHandler({
    runOrchestrator: async () => { throw new Error('philosophy must not route through generic orchestration'); },
    runGenosCli: async () => '',
    executeStrategyTool: async () => null,
  });
  try {
    const response = await handler({
    params: {
      name: 'genos_philosophy',
      arguments: { operation: 'applyRuntimeEffect', arguments: { concept: 'school.kantianism', agentId: 'worker-1', effect: 'require_evidence' } },
    },
    });
    assert.equal(response.isError, undefined);
    const result = JSON.parse(response.content[0].text);
    assert.equal(result.applied, false);
    assert.equal(result.requiresApply, true);
    const writeAttempt = await handler({
      params: { name: 'genos_philosophy', arguments: { operation: 'applyRuntimeEffect', arguments: { concept: 'school.kantianism', agentId: 'worker-1', effect: 'require_evidence', apply: true } } },
    });
    assert.equal(writeAttempt.isError, true);
    assert.match(writeAttempt.content[0].text, /only allows runtime effect previews/);
    console.log('Philosophy MCP integration: PASS');
  } finally {
    if (previousLease === undefined) delete process.env.GENOS_MCP_LEASE;
    else process.env.GENOS_MCP_LEASE = previousLease;
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
