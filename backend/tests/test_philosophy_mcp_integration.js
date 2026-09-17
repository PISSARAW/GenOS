'use strict';

const assert = require('node:assert/strict');
const router = require('../src/services/philosophyRouter');

async function main() {
  const { createToolCallHandler } = await import('../../mcp/toolCallHandler.js');
  const calls = [];
  const handler = createToolCallHandler({
    runOrchestrator: async (request) => {
      calls.push(request);
      return JSON.stringify(await router.handlePhilosophyRequest({ request }));
    },
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
  assert.equal(calls[0].action, 'philosophy');
  assert.equal(calls[0].operation, 'applyRuntimeEffect');
  console.log('Philosophy MCP integration: PASS');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
