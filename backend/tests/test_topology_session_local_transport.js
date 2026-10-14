'use strict';

const assert = require('node:assert/strict');

async function main() {
  const previous = {
    lease: process.env.GENOS_MCP_LEASE,
    url: process.env.GENOS_MCP_URL,
    endpoint: process.env.GENOS_MCP_ENDPOINT,
    command: process.env.GENOS_MCP_COMMAND
  };
  const logicPath = require.resolve('../src/services/mcpExecutor/transports/toolLogic');
  const dispatchPath = require.resolve('../src/services/mcpExecutor/dispatch');
  const originalLogic = require.cache[logicPath];
  let captured = null;
  process.env.GENOS_MCP_LEASE = 'genos_topology_session';
  process.env.GENOS_MCP_URL = 'http://127.0.0.1:9/mcp';
  delete process.env.GENOS_MCP_ENDPOINT;
  delete process.env.GENOS_MCP_COMMAND;
  require.cache[logicPath] = {
    id: logicPath,
    filename: logicPath,
    loaded: true,
    exports: {
      executeToolLogic: async (toolName, args, context) => {
        captured = { toolName, args, agentId: context.agentId };
        return { configured: true, success: true, status: 'completed', output: { local: true } };
      }
    }
  };
  delete require.cache[dispatchPath];
  try {
    const { executeConfiguredTransport } = require(dispatchPath);
    const result = await executeConfiguredTransport({
      toolName: 'genos_topology_session',
      args: { session_id: 'session-1', operation: 'snapshot' },
      agentId: 'worker-A',
      timeoutMs: 1000
    });
    assert.equal(result.success, true);
    assert.deepEqual(result.output, { local: true });
    assert.deepEqual(captured, {
      toolName: 'genos_topology_session',
      args: { session_id: 'session-1', operation: 'snapshot' },
      agentId: 'worker-A'
    });
  } finally {
    delete require.cache[dispatchPath];
    if (originalLogic) require.cache[logicPath] = originalLogic;
    else delete require.cache[logicPath];
    restore('GENOS_MCP_LEASE', previous.lease);
    restore('GENOS_MCP_URL', previous.url);
    restore('GENOS_MCP_ENDPOINT', previous.endpoint);
    restore('GENOS_MCP_COMMAND', previous.command);
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
