'use strict';

const assert = require('node:assert/strict');
const grpc = require('@grpc/grpc-js');
const mcp = require('../src/grpc_services/mcpService');
const mcpExecutor = require('../src/services/mcpExecutor');
const { guardService } = require('../src/grpc_services/grpcAuth');

async function main() {
  const previousAgent = process.env.GENOS_AGENT_ID;
  const previousSecret = process.env.GENOS_GRPC_SHARED_SECRET;
  const previousCallTool = mcpExecutor.callTool;
  let calls = 0;
  process.env.GENOS_AGENT_ID = 'ambient-worker';
  process.env.GENOS_GRPC_SHARED_SECRET = 'grpc-test-secret';
  mcpExecutor.callTool = async () => {
    calls += 1;
    return { success: true, status: 'completed' };
  };
  const service = guardService(mcp);
  try {
    await invoke(service.CallTool, 'genos_topology_session');
    assert.equal(calls, 0, 'topology operation must not inherit the server agent identity');
    await invoke(service.CallTool, 'genos_inspect');
    assert.equal(calls, 1, 'non-topology MCP tools remain available through authenticated gRPC');
  } finally {
    mcpExecutor.callTool = previousCallTool;
    restore('GENOS_AGENT_ID', previousAgent);
    restore('GENOS_GRPC_SHARED_SECRET', previousSecret);
  }
}

function invoke(handler, toolName) {
  return new Promise((resolve, reject) => {
    const call = {
      request: { tool_name: toolName, arguments_json: '{}' },
      metadata: { get: (name) => name === 'x-genos-grpc-key' ? ['grpc-test-secret'] : [] }
    };
    handler(call, (error, response) => {
      try {
        if (toolName === 'genos_topology_session') {
          assert.equal(error.code, grpc.status.PERMISSION_DENIED);
          assert.match(error.message, /per-call agent identity/);
          assert.equal(response, undefined);
        } else {
          assert.equal(error, null);
          assert.equal(response.success, true);
        }
        resolve();
      } catch (assertionError) {
        reject(assertionError);
      }
    });
  });
}

function restore(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
