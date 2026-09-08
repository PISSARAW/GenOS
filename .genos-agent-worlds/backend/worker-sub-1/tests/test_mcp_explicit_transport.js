const assert = require('assert');
const http = require('http');
const mcpExecutor = require('../src/services/mcpExecutor');

async function main() {
  let calledTool = null;
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const message = JSON.parse(body || '{}');
      if (message.method === 'tools/call') calledTool = message.params.name;
      response.writeHead(message.method === 'notifications/initialized' ? 202 : 200, { 'content-type': 'application/json' });
      if (message.method !== 'notifications/initialized') {
        response.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: 'remote' }] } }));
      } else response.end();
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const previousUrl = process.env.GENOS_MCP_URL;
  try {
    process.env.GENOS_MCP_URL = `http://127.0.0.1:${server.address().port}`;
    const result = await mcpExecutor.executeConfiguredTransport({ toolName: 'genos_strat_verify', args: {}, timeoutMs: 1000 });
    assert.strictEqual(result.transport, 'http');
    assert.strictEqual(calledTool, 'genos_strat_verify');
  } finally {
    if (previousUrl === undefined) delete process.env.GENOS_MCP_URL;
    else process.env.GENOS_MCP_URL = previousUrl;
    await new Promise((resolve) => server.close(resolve));
  }
  console.log('Explicit MCP transport routing checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });