const assert = require('node:assert/strict');
const { isStrategyTool } = require('../src/services/mcpStrategyTools');

assert.equal(isStrategyTool('genos_strat_verify'), true);
assert.equal(isStrategyTool('genos_strat_not_registered'), false);
console.log('MCP strategy dispatch rejects unregistered strategy names.');