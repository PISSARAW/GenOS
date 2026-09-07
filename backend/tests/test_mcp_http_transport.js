const assert = require('assert');
const http = require('http');
const mcpExecutor = require('../src/services/mcpExecutor');

async function main() {
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const message = JSON.parse(body || '{}');
      if (message.method === 'initialize') {
        response.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': 'test-session' });
        response.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2025-06-18', capabilities: {}, serverInfo: { name: 'test', version: '1' } } }));
        return;
      }
      if (message.method === 'notifications/initialized') {
        assert.strictEqual(request.headers['mcp-session-id'], 'test-session');
        assert.strictEqual(request.headers['mcp-protocol-version'], '2025-06-18');
        response.writeHead(202);
        response.end();
        return;
      }
      if (message.method === 'tools/call') {
        assert.strictEqual(request.headers['mcp-session-id'], 'test-session');
        assert.strictEqual(request.headers['mcp-protocol-version'], '2025-06-18');
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: 'ok' }] } }));
        return;
      }
      response.writeHead(404);
      response.end();
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const previousUrl = process.env.GENOS_MCP_URL;
  const previousEndpoint = process.env.GENOS_MCP_ENDPOINT;
  try {
    process.env.GENOS_MCP_URL = `http://127.0.0.1:${server.address().port}`;
    delete process.env.GENOS_MCP_ENDPOINT;
    const result = await mcpExecutor.executeConfiguredTransport({ toolName: 'genos_snapshot', timeoutMs: 1000 });
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.output, [{ type: 'text', text: 'ok' }]);
  } finally {
    if (previousUrl === undefined) delete process.env.GENOS_MCP_URL;
    else process.env.GENOS_MCP_URL = previousUrl;
    if (previousEndpoint === undefined) delete process.env.GENOS_MCP_ENDPOINT;
    else process.env.GENOS_MCP_ENDPOINT = previousEndpoint;
    await new Promise((resolve) => server.close(resolve));
  }
  console.log('MCP HTTP transport checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});