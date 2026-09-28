'use strict';

const assert = require('node:assert/strict');
const router = require('../src/services/philosophyRouter');

async function main() {
  const { createToolCallHandler } = await import('../../mcp/toolCallHandler.js');
  const handler = createToolCallHandler({
    runOrchestrator: async () => { throw new Error('philosophy must not route through generic orchestration'); },
    runGenosCli: async () => '',
    executeStrategyTool: async () => null,
  });
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
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
