const assert = require('node:assert/strict');
const { validateMcpInputPaths, resolveMcpOutputPath } = require('../src/services/mcpExecutor');

assert.throws(() => validateMcpInputPaths({ graph_file: '../outside.json' }), { code: 'INVALID_INPUT_PATH' });
assert.throws(() => validateMcpInputPaths({ manifest: 'C:/outside.json' }), { code: 'INVALID_INPUT_PATH' });
assert.throws(() => resolveMcpOutputPath('../outside.json'), { code: 'INVALID_OUTPUT_PATH' });
assert.throws(() => resolveMcpOutputPath('nested/../outside.json'), { code: 'INVALID_OUTPUT_PATH' });
assert.match(resolveMcpOutputPath('reports/result.json'), /reports[\\/]result\.json$/);
console.log('MCP input and output paths are confined to the workspace.');
