const assert = require('assert');
const {
  detectExecutionKind,
  isRegisteredTool,
  isSupportedTool
} = require('../src/services/mcpToolRegistry');

assert.strictEqual(isRegisteredTool('genos_snapshot'), true);
assert.strictEqual(isSupportedTool('genos_snapshot'), true);
assert.strictEqual(detectExecutionKind('genos_snapshot'), 'cli');

assert.strictEqual(isRegisteredTool('genos_nonexistent'), false);
assert.strictEqual(isSupportedTool('genos_nonexistent'), false);
assert.strictEqual(detectExecutionKind('genos_nonexistent'), 'unsupported');

console.log('MCP catalog registry checks passed.');