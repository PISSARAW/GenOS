'use strict';

const assert = require('node:assert/strict');
const { directToolLeaseAllows } = require('../src/services/mcpExecutor/config');
const { executeConfiguredTransport } = require('../src/services/mcpExecutor/dispatch');

const names = ['GENOS_MCP_LEASE', 'GENOS_MCP_LEASE_EXPIRES_AT', 'GENOS_MCP_DISABLED_TOOLS',
  'GENOS_MCP_URL', 'GENOS_MCP_ENDPOINT', 'GENOS_MCP_COMMAND'];
const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));

(async () => {
  try {
    for (const name of names) delete process.env[name];
    assert.equal(directToolLeaseAllows('genos_replay'), false,
      'the test must exercise an authority-envelope-only tool lease');
    const result = await executeConfiguredTransport({
      toolName: 'genos_replay',
      args: { snapshot: 'snapshot.json' },
      authorityLease: ['genos_replay'],
      runLocal: async (command) => ({ configured: true, success: true, status: 'completed', output: command })
    });
    assert.equal(result.success, true);
    assert.equal(result.output, 'genos replay basic --snapshot "snapshot.json"');
    console.log('Execution authority leases reach nested local MCP validation.');
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
