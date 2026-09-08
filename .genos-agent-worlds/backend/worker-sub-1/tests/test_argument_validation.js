const assert = require('node:assert/strict');
const { validateToolArguments } = require('../src/services/mcpArgumentValidation');
const { resolveMcpOutputPath } = require('../src/services/mcpExecutor');
const { boundedInteger } = require('../src/controllers/argumentBounds');

assert.equal(validateToolArguments('genos_merge', { branch_id: 'feature', conditions: 'safe condition' }), null);
assert.equal(validateToolArguments('genos_merge', { branch_id: 'feature --output injected' }).code, 'INVALID_TOOL_ARGUMENTS');
assert.equal(validateToolArguments('genos_rebase_compute_plan', { graph_file: 'graph.json', injected_keys: 'not-an-array' }).code, 'INVALID_TOOL_ARGUMENTS');
assert.equal(validateToolArguments('genos_replay', {}).code, 'INVALID_TOOL_ARGUMENTS');
assert.equal(boundedInteger('-1', 50, 1, 500), 50);
assert.equal(boundedInteger('25', 50, 1, 500), 25);
assert.throws(() => resolveMcpOutputPath('../outside.json'), { code: 'INVALID_OUTPUT_PATH' });
assert.throws(() => resolveMcpOutputPath('C:/outside.json'), { code: 'INVALID_OUTPUT_PATH' });
console.log('Argument validation checks passed.');
