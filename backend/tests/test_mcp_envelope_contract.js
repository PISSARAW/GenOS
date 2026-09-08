const assert = require('node:assert/strict');
const { normalizeMcpEnvelope, getToolInputSchema, MCP_CONTRACT_VERSION } = require('../src/services/mcpContract');

assert.deepEqual(normalizeMcpEnvelope({ toolName: 'genos_inspect', timeoutMs: 10, args: { x: 1 } }), { toolName: 'genos_inspect', timeoutMs: 10, args: { x: 1 } });
assert.deepEqual(normalizeMcpEnvelope({ tool_name: 'genos_inspect', timeout_ms: 10, args: { x: 1 } }), { toolName: 'genos_inspect', timeoutMs: 10, args: { x: 1 } });
assert.equal(getToolInputSchema('genos_synaptic_stdp_update').additionalProperties, false);
assert.equal(MCP_CONTRACT_VERSION, 'genos.mcp/v1');
console.log('MCP REST envelope compatibility is explicit and versioned.');