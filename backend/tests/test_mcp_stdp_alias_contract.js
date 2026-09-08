const assert = require('node:assert/strict');
const { validateToolArguments } = require('../src/services/mcpArgumentValidation');

const conflicting = validateToolArguments('genos_synaptic_stdp_update', {
  source_id: 'snake-source',
  sourceId: 'camel-source'
});
assert.equal(conflicting?.code, 'INVALID_TOOL_ARGUMENTS');
assert.match(conflicting.message, /conflicting aliases/);

assert.equal(validateToolArguments('genos_synaptic_stdp_update', {
  source_id: 'same-source',
  target_id: 'target',
  learning_rate: 0.5
}), null);

console.log('MCP STDP alias contract: PASS');