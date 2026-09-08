const assert = require('node:assert/strict');
const { getToolInputSchema } = require('../src/services/mcpContract');
const { validateToolArguments } = require('../src/services/mcpArgumentValidation');
const mcpExecutor = require('../src/services/mcpExecutor');

const replay = getToolInputSchema('genos_replay');
assert.deepEqual(replay.anyOf, [{ required: ['snapshot'] }, { required: ['snapshot_id'] }]);
assert.equal(validateToolArguments('genos_replay', {}).code, 'INVALID_TOOL_ARGUMENTS');
assert.equal(validateToolArguments('genos_replay', { snapshot: 'snap.json' }), null);
assert.equal(getToolInputSchema('genos_snapshot').required.includes('agent'), true);
assert.equal(getToolInputSchema('genos_snapshot').required.includes('out'), true);

mcpExecutor.listTools().then((tools) => {
  const replayTool = tools.find((tool) => tool.name === 'genos_replay');
  assert.ok(replayTool);
  assert.deepEqual(replayTool.inputSchema.anyOf, replay.anyOf);
  assert.equal(tools.every((tool) => tool.inputSchema?.type === 'object'), true);
  console.log('MCP API schema contract checks passed.');
}).catch((error) => { console.error(error); process.exitCode = 1; });
