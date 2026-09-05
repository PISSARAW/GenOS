const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const mcpExecutor = require('../src/services/mcpExecutor');

function sendJsonRpc(child, request, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for JSON-RPC response for id ${request.id}`));
    }, timeoutMs);

    function onData(chunk) {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const payload = JSON.parse(line);
          if (payload.id === request.id) {
            cleanup();
            resolve(payload);
            return;
          }
        } catch (_) {}
      }
    }

    function onError(err) {
      cleanup();
      reject(err);
    }

    function cleanup() {
      clearTimeout(timer);
      child.stdout.removeListener('data', onData);
      child.removeListener('error', onError);
    }

    child.stdout.on('data', onData);
    child.on('error', onError);
    child.stdin.write(JSON.stringify(request) + '\n');
  });
}

async function testRustMcpServer() {
  const repoRoot = path.resolve(__dirname, '../..');
  const isWin = process.platform === 'win32';
  const binName = isWin ? 'genos-mcp.exe' : 'genos-mcp';
  const binPath = path.join(repoRoot, 'target/debug', binName);

  assert(fs.existsSync(binPath), `Compiled Rust binary ${binPath} must exist`);

  const child = spawn(binPath, [], {
    cwd: repoRoot,
    env: { ...process.env, GENOS_MCP_EXPOSE_ALL: 'true' },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  try {
    // 1. initialize
    const initRes = await sendJsonRpc(child, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {}
    });
    assert.strictEqual(initRes.id, 1);
    assert.strictEqual(initRes.result.serverInfo.name, 'genos-mcp');
    assert(initRes.result.capabilities.tools);

    // 2. tools/list (all tools)
    const listRes = await sendJsonRpc(child, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    });
    assert.strictEqual(listRes.id, 2);
    const tools = listRes.result.tools;
    assert(Array.isArray(tools));
    const toolNames = tools.map((t) => t.name);
    assert(toolNames.includes('genos_orchestrate'), 'must have genos_orchestrate');
    assert(toolNames.includes('genos_delegate_worker'), 'must have genos_delegate_worker');
    assert(toolNames.includes('genos_snapshot'), 'must have genos_snapshot');
    assert(toolNames.includes('genos_capsule_create'), 'must have genos_capsule_create');

    // 3. tools/call
    const callRes = await sendJsonRpc(child, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'genos_v2_init',
        arguments: {}
      }
    });
    assert.strictEqual(callRes.id, 3);
    assert(callRes.result.content);
    assert(Array.isArray(callRes.result.content));
  } finally {
    child.stdin.end();
    child.kill();
  }
}

async function testNodeMcpServer() {
  const repoRoot = path.resolve(__dirname, '../..');
  const mcpIndex = path.join(repoRoot, 'mcp/index.js');
  assert(fs.existsSync(mcpIndex), `Node MCP server ${mcpIndex} must exist`);

  const child = spawn(process.execPath, [mcpIndex], {
    cwd: repoRoot,
    env: { ...process.env, GENOS_MCP_EXPOSE_ALL: 'true' },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  try {
    const initRes = await sendJsonRpc(child, {
      jsonrpc: '2.0',
      id: 10,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } }
    });
    assert.strictEqual(initRes.id, 10);
    assert.strictEqual(initRes.result.serverInfo.name, 'genos-mcp');

    const listRes = await sendJsonRpc(child, {
      jsonrpc: '2.0',
      id: 11,
      method: 'tools/list',
      params: {}
    });
    assert.strictEqual(listRes.id, 11);
    const toolNames = listRes.result.tools.map((t) => t.name);
    assert(toolNames.includes('genos_orchestrate'));
    assert(toolNames.includes('genos_snapshot'));
  } finally {
    child.stdin.end();
    child.kill();
  }
}

async function testMcpExecutorConfiguredTransport() {
  const transport = mcpExecutor.configuredTransport();
  assert(transport, 'configuredTransport() must return a transport');
  assert.strictEqual(transport.type, 'stdio');
  assert.strictEqual(transport.bundled, true);
  assert(fs.existsSync(transport.command), `transport.command (${transport.command}) must exist on disk`);
}

async function main() {
  console.log('--- Testing MCP Rust Server (crates/genos-mcp) ---');
  await testRustMcpServer();
  console.log('✅ PASS: Rust genos-mcp stdio server responds to initialize, tools/list, and tools/call');

  console.log('--- Testing MCP Node.js Server (mcp/index.js) ---');
  await testNodeMcpServer();
  console.log('✅ PASS: Node mcp/index.js responds to initialize and tools/list');

  console.log('--- Testing mcpExecutor configuredTransport ---');
  await testMcpExecutorConfiguredTransport();
  console.log('✅ PASS: mcpExecutor auto-discovers bundled MCP binary or fallback');

  console.log('\n========================================');
  console.log('ALL MCP & CODEX BRIDGE TESTS PASSED');
  console.log('========================================');
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
