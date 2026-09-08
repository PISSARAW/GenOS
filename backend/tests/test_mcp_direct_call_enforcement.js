const assert = require('node:assert/strict');
const executor = require('../src/services/mcpExecutor');

const previousLease = process.env.GENOS_MCP_LEASE;
const previousDisabled = process.env.GENOS_MCP_DISABLED_TOOLS;
process.env.GENOS_MCP_LEASE = 'genos_snapshot';
delete process.env.GENOS_MCP_DISABLED_TOOLS;
assert.equal(executor.directToolLeaseAllows('genos_snapshot'), true);
assert.equal(executor.directToolLeaseAllows('genos_run'), false);
process.env.GENOS_MCP_DISABLED_TOOLS = 'genos_snapshot';
assert.equal(executor.directToolLeaseAllows('genos_snapshot'), false);
if (previousLease === undefined) delete process.env.GENOS_MCP_LEASE; else process.env.GENOS_MCP_LEASE = previousLease;
if (previousDisabled === undefined) delete process.env.GENOS_MCP_DISABLED_TOOLS; else process.env.GENOS_MCP_DISABLED_TOOLS = previousDisabled;
console.log('Direct MCP calls honor lease and disabled-tool policy.');