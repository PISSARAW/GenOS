const assert = require('node:assert/strict');
const executor = require('../src/services/mcpExecutor');

const previous = process.env.GENOS_MCP_LEASE;
process.env.GENOS_MCP_LEASE = 'genos_snapshot';
assert.equal(executor.directToolLeaseAllows('genos_snapshot'), true);
assert.equal(executor.directToolLeaseAllows('genos_replay'), false);
if (previous === undefined) delete process.env.GENOS_MCP_LEASE; else process.env.GENOS_MCP_LEASE = previous;
console.log('MCP transport lease policy is shared by HTTP and direct execution.');