const assert = require('node:assert/strict');
const strategyTools = require('../src/services/mcpStrategyTools');
const registry = require('../src/services/mcpToolRegistry');

(async () => {
  const primitive = await strategyTools.executeStrategyTool('genos_execute_primitive', {});
  assert.equal(primitive.status, 'invalid_args');
  const pipeline = await registry.dispatchTool('genos_execute_strategy_pipeline', { pipeline: 'not-an-array' });
  assert.equal(pipeline.result.status, 'invalid_args');
  console.log('MCP strategy dispatch contract checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
