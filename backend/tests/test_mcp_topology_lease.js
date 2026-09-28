'use strict';

const assert = require('node:assert/strict');
const { detectExecutionKind, dispatchTool } = require('../src/services/mcpToolRegistry');

async function main() {
  const previous = {
    lease: process.env.GENOS_MCP_LEASE,
    exposeAll: process.env.GENOS_MCP_EXPOSE_ALL,
    unsafeExposeAll: process.env.GENOS_MCP_ALLOW_UNSAFE_EXPOSE_ALL,
  };
  process.env.GENOS_MCP_LEASE = '';
  delete process.env.GENOS_MCP_EXPOSE_ALL;
  delete process.env.GENOS_MCP_ALLOW_UNSAFE_EXPOSE_ALL;
  try {
    assert.equal(detectExecutionKind('genos_topology_session'), 'topology');
    const outcome = await dispatchTool('genos_topology_session', {
      session_id: 'lease-test', operation: 'inspect'
    });
    assert.equal(outcome.result.status, 'lease_denied');
    assert.equal(outcome.result.code, 'MCP_TOOL_LEASE_DENIED');
  } finally {
    restore('GENOS_MCP_LEASE', previous.lease);
    restore('GENOS_MCP_EXPOSE_ALL', previous.exposeAll);
    restore('GENOS_MCP_ALLOW_UNSAFE_EXPOSE_ALL', previous.unsafeExposeAll);
  }
}

function restore(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
