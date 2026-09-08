const assert = require('node:assert/strict');
const { validateMcpInputPaths } = require('../src/services/mcpExecutor');

assert.throws(() => validateMcpInputPaths({ graph_file: '../outside.json' }), { code: 'INVALID_INPUT_PATH' });
assert.throws(() => validateMcpInputPaths({ manifest: 'C:/outside.json' }), { code: 'INVALID_INPUT_PATH' });
console.log('MCP input paths are confined to the workspace.');