const assert = require('node:assert/strict');
const mcpExecutor = require('../src/services/mcpExecutor');

mcpExecutor.listTools().then((tools) => {
  const snapshot = tools.find((tool) => tool.name === 'genos_snapshot');
  const replay = tools.find((tool) => tool.name === 'genos_replay');
  assert.ok(snapshot.inputSchema.required.includes('agent'));
  assert.ok(snapshot.inputSchema.required.includes('out'));
  assert.deepEqual(replay.inputSchema.anyOf, [{ required: ['snapshot'] }, { required: ['snapshot_id'] }]);
  console.log('MCP schema contract checks passed.');
}).catch((error) => { console.error(error); process.exitCode = 1; });