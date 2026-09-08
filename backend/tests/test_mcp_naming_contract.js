const assert = require('node:assert/strict');
const { validateToolArguments } = require('../src/services/mcpArgumentValidation');
const { getToolInputSchema } = require('../src/services/mcpContract');

assert.equal(validateToolArguments('genos_synaptic_stdp_update', { sourceId: 'camel' })?.code, 'INVALID_TOOL_ARGUMENTS');
assert.equal(validateToolArguments('genos_cell_division', { agentId: 'camel' })?.code, 'INVALID_TOOL_ARGUMENTS');
assert.equal(validateToolArguments('genos_cell_division', { agent_id: 'snake', mutation_rate: 0.2 }), null);

const stdpSchema = getToolInputSchema('genos_synaptic_stdp_update');
assert.equal(stdpSchema.additionalProperties, false);
assert.ok(stdpSchema.properties.source_id);
assert.equal(stdpSchema.properties.sourceId, undefined);

const divisionSchema = getToolInputSchema('genos_cell_division');
assert.equal(divisionSchema.additionalProperties, false);
assert.ok(divisionSchema.properties.mutation_rate);
assert.equal(divisionSchema.properties.mutationRate, undefined);

console.log('MCP naming contract: PASS');